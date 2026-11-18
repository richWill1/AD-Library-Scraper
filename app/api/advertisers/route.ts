import {directorySearch,observePage} from '@/lib/advertiser-directory';
import {getMetaCredential} from '@/lib/meta-token-store';
import {metaFetch} from '@/lib/meta-api';
import {facebookIdentity,brandQuery,knownAdvertisers} from '@/lib/brand-search';
import {NextRequest, NextResponse} from 'next/server';
import {collectorConfiguration} from '@/lib/meta-creative';
export const runtime = 'nodejs';

// Find advertiser Pages by name via the collector, which uses the public Meta Ad
// Library advertiser search. The Ad Library API only matches words inside ads.
type Advertiser = {id: string; name: string; alias?: string; followers: number | null; verified: boolean; category?: string; instagram?: string};
const cache = new Map<string, {at: number; data: Advertiser[]}>();
const inflight = new Map<string, Promise<Advertiser[] | null>>();
const rates = new Map<string, {at: number; count: number}>();
const TTL = 24 * 3600 * 1000;
const clean = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max && !/[\x00-\x1f<>]/.test(v) ? v.trim() || undefined : undefined);

function valid(input: unknown): Advertiser[] {
  if (!Array.isArray(input)) return [];
  const out: Advertiser[] = [];
  for (const a of input.slice(0, 12)) {
    const id = String(a?.id ?? ''), name = clean(a?.name, 120);
    if (!/^\d{3,30}$/.test(id) || !name) continue;
    const followers = Number.isFinite(Number(a?.followers)) && Number(a.followers) >= 0 ? Math.round(Number(a.followers)) : null;
    out.push({id, name, alias: clean(a?.alias, 80), followers, verified: a?.verified === true, category: clean(a?.category, 60), instagram: clean(a?.instagram, 60)});
  }
  return out;
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  if (q.length < 2 || q.length > 250) return NextResponse.json({advertisers: [], error: 'Enter a brand name.'}, {status: 400});
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'shared', now = Date.now(), r = rates.get(ip);
  if (r && now - r.at < 60000) { if (r.count >= 15) return NextResponse.json({advertisers: [], code: 'RATE_LIMITED'}, {status: 429}); r.count++; } else rates.set(ip, {at: now, count: 1});
  if (rates.size > 1000) for (const [k, v] of rates) if (now - v.at > 60000) rates.delete(k);
  const identity=facebookIdentity(q);
  const reply=(body:object)=>NextResponse.json(body,{headers:{'Cache-Control':'no-store'}});
  if(identity?.invalid)return reply({advertisers:[],message:'Paste a Facebook Page profile link, @handle or numeric Page ID.'});
  if(identity?.id)return reply({advertisers:[{id:identity.id,name:'Facebook Page '+identity.id}],resolved:true});
  if(identity?.handle){
    const handle=identity.handle;
    const verified=knownAdvertisers.find(p=>p.handle?.toLowerCase()===handle.toLowerCase());
    if(verified)return reply({advertisers:[{id:verified.pageId,name:verified.pageName,alias:handle}],resolved:true,source:'verified-page'});
    const saved=await directorySearch(handle,true);
    if(saved.length===1)return reply({advertisers:saved,resolved:true});
    try{
      const {token}=await getMetaCredential();
      if(!token)return reply({advertisers:[],code:'NO_PAGE_TOKEN',message:'This service has no Meta token for new Facebook handles. Paste the numeric Page ID or a Page-specific Ad Library link.'});
      const response=await metaFetch('https://graph.facebook.com/v26.0/'+encodeURIComponent(handle)+'?fields=id,name,category',{
        headers:{Authorization:'Bearer '+token},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
      const body=await response.json();
      if(response.ok&&/^\d{1,30}$/.test(body.id)&&clean(body.name,120)){
        observePage(body.id,body.name,[],handle,body.category);
        return reply({advertisers:[{id:body.id,name:body.name,alias:handle,category:body.category}],resolved:true});
      }
      const permission=[10,200].includes(body.error?.code)||/Page Public (Metadata|Content) Access/i.test(body.error?.message||'');
      const message=permission?'Meta denied access to public Page metadata. AdSnoop needs Page Public Metadata Access or Page Public Content Access. Paste the numeric Page ID or a Page-specific Ad Library link.':body.error?.code===100?'Meta could not find or access that Page. Check the handle or paste a Page-specific Ad Library link containing view_all_page_id.':'Meta could not resolve this Page right now. Try again or paste its numeric Page ID.';
      return reply({advertisers:[],code:permission?'PAGE_METADATA_PERMISSION':'HANDLE_UNRESOLVED',message});
    }catch{return reply({advertisers:[],message:'Page lookup is unavailable. Try again or paste the numeric Facebook Page ID.'});}
  }
  let term:string;try{term=brandQuery(q).term;}catch{return reply({advertisers:[],message:'Check the advertiser name or Page link.'});}
  const indexed=await directorySearch(term);
  if(indexed.length||req.nextUrl.searchParams.get('suggest')==='1')return reply({advertisers:indexed,source:'directory'});
  const key = q.toLowerCase(), hit = cache.get(key);
  if (hit && now - hit.at < TTL) return NextResponse.json({advertisers: hit.data, source: 'meta-ad-library-search'});
  const config = collectorConfiguration();
  if (!config.ready) return NextResponse.json({advertisers: [], code: 'NOT_CONFIGURED'});
  let work = inflight.get(key);
  if (!work) {
    work = (async () => {
      try {
        const res = await fetch(`${config.url}/advertisers?q=${encodeURIComponent(q)}`, {headers: {'X-Collector-Key': config.secret}, redirect: 'error', signal: AbortSignal.timeout(45000), cache: 'no-store'});
        if (!res.ok) return null;
        const data = valid((await res.json())?.advertisers);
        if (data.length) { if (cache.size > 2000) cache.delete(cache.keys().next().value!); cache.set(key, {at: Date.now(), data}); }
        return data;
      } catch { return null; }
      finally { inflight.delete(key); }
    })();
    inflight.set(key, work);
  }
  const data = await work;
  if (!data) return NextResponse.json({advertisers: [], code: 'LOOKUP_UNAVAILABLE'});
  return NextResponse.json({advertisers: data, source: 'meta-ad-library-search'}, {headers: {'Cache-Control': 'no-store'}});
}
