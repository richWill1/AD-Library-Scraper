import {directorySearch, observePage} from '@/lib/advertiser-directory';
import {discoverTradingName, exactIdentity, safeAlias, type DiscoveryResult} from '@/lib/advertiser-discovery';
import {getMetaCredential} from '@/lib/meta-token-store';
import {metaFetch} from '@/lib/meta-api';
import {facebookIdentity, brandQuery, knownAdvertisers} from '@/lib/brand-search';
import {NextRequest, NextResponse} from 'next/server';
export const runtime = 'nodejs';

// Trading-name search uses the public Ad Library and the brand site's own
// Facebook link. The in-browser collector is not used: it needs more than
// this instance's 512 MB for a routine lookup.
const rates = new Map<string, {at: number; count: number}>();
const found = new Map<string, {at: number; fail: boolean; body: DiscoveryResult}>();
const inflight = new Map<string, Promise<DiscoveryResult>>();
const TTL = 24 * 3600 * 1000;
const clean = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max && !/[\x00-\x1f<>]/.test(v) ? v.trim() || undefined : undefined);

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  if (q.length < 2 || q.length > 250) return NextResponse.json({advertisers: [], error: 'Enter a brand name.'}, {status: 400});
  const now = Date.now();
  const reply = (body: object, status = 200) => NextResponse.json(body, {status, headers: {'Cache-Control': 'no-store'}});
  const identity = facebookIdentity(q);
  if (identity?.invalid) return reply({advertisers: [], status: 'not_found', message: 'Paste a Facebook Page profile link, @handle or numeric Page ID.'});
  if (identity?.id) return reply({advertisers: [{id: identity.id, name: 'Facebook Page ' + identity.id, evidence: 'Numeric Page ID from the link you pasted.', confidence: 'verified', activeAds: null}], resolved: true, status: 'resolved'});
  if (identity?.handle) {
    const handle = identity.handle;
    const verified = knownAdvertisers.find(p => p.handle?.toLowerCase() === handle.toLowerCase());
    if (verified) return reply({advertisers: [{id: verified.pageId, name: verified.pageName, handle, evidence: 'Matched a verified Page handle already on file.', confidence: 'verified', activeAds: null}], resolved: true, status: 'resolved', source: 'verified-page'});
    const saved = await directorySearch(handle, true);
    if (saved.length === 1) return reply({advertisers: saved.map(a => ({...a, confidence: 'verified', evidence: 'This handle is already in the advertiser directory.', activeAds: null})), resolved: true, status: 'resolved'});
    try {
      const {token} = await getMetaCredential();
      if (!token) return reply({advertisers: [], status: 'lookup_failed', code: 'NO_PAGE_TOKEN', message: 'This service has no Meta token for new Facebook handles. Paste the numeric Page ID or a Page-specific Ad Library link.'});
      const response = await metaFetch('https://graph.facebook.com/v26.0/' + encodeURIComponent(handle) + '?fields=id,name,category', {
        headers: {Authorization: 'Bearer ' + token}, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000)});
      const body = await response.json();
      if (response.ok && /^\d{1,30}$/.test(body.id) && clean(body.name, 120)) {
        observePage(body.id, body.name, [], handle, body.category);
        return reply({advertisers: [{id: body.id, name: body.name, handle, category: clean(body.category, 60), evidence: 'Meta resolved this Facebook handle.', confidence: 'verified', activeAds: null}], resolved: true, status: 'resolved'});
      }
      const permission = [10, 200].includes(body.error?.code) || /Page Public (Metadata|Content) Access/i.test(body.error?.message || '');
      const message = permission ? 'Meta denied access to public Page metadata. AdSnoop needs Page Public Metadata Access or Page Public Content Access. Paste the numeric Page ID or a Page-specific Ad Library link.' : body.error?.code === 100 ? 'Meta could not find or access that Page. Check the handle or paste a Page-specific Ad Library link containing view_all_page_id.' : 'Meta could not resolve this Page right now. Try again or paste its numeric Page ID.';
      return reply({advertisers: [], status: 'lookup_failed', code: permission ? 'PAGE_METADATA_PERMISSION' : 'HANDLE_UNRESOLVED', message});
    } catch { return reply({advertisers: [], status: 'lookup_failed', message: 'Page lookup is unavailable. Try again or paste the numeric Facebook Page ID.'}); }
  }
  let term: string;
  try { term = brandQuery(q).term; } catch { return reply({advertisers: [], status: 'not_found', message: 'Check the advertiser name or Page link.'}); }
  const key = term.toLowerCase();
  const suggest = req.nextUrl.searchParams.get('suggest') === '1';
  const hit = found.get(key);
  if (hit && now - hit.at < (hit.fail ? 20000 : TTL)) return reply(hit.body, hit.fail ? 503 : 200);
  let indexed: {id: string; name: string; alias?: string; category?: string; score?: number}[] = [];
  try { indexed = await directorySearch(term); } catch { indexed = []; }
  if (suggest) return reply({advertisers: indexed, source: 'directory', status: indexed.length ? 'choose' : 'not_found', resolved: false});
  const exact = exactIdentity(q, indexed);
  if (exact) {
    const body: DiscoveryResult = {advertisers: [exact], resolved: true, status: 'resolved', message: '', source: 'verified-name'};
    found.set(key, {at: now, fail: false, body});
    return reply(body);
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'shared';
  const bucket = rates.get(ip);
  if (bucket && now - bucket.at < 60000) { if (bucket.count >= 15) return reply({advertisers: [], status: 'lookup_failed', code: 'RATE_LIMITED', message: 'Please wait a minute before searching again.'}, 429); bucket.count++; }
  else rates.set(ip, {at: now, count: 1});
  if (rates.size > 1000) for (const [k, v] of rates) if (now - v.at > 60000) rates.delete(k);
  let token = '';
  try { token = (await getMetaCredential()).token || ''; } catch { token = ''; }
  let work = inflight.get(key);
  if (!work) {
    work = discoverTradingName(q, {token, directory: indexed}).finally(() => inflight.delete(key));
    inflight.set(key, work);
  }
  let result: DiscoveryResult;
  try { result = await work; } catch { result = {status: 'lookup_failed', resolved: false, advertisers: [], message: 'The lookup failed before a Page could be identified. This does not mean the advertiser has no ads.', code: 'LOOKUP_FAILED', source: 'none'}; }
  if (result.status !== 'lookup_failed') {
    for (const advertiser of result.advertisers) {
      if (advertiser.confidence === 'verified' && /^\d{3,30}$/.test(advertiser.id)) observePage(advertiser.id, advertiser.name, [], safeAlias(q, advertiser), advertiser.category);
    }
  }
  if (found.size > 2000) found.delete(found.keys().next().value!);
  found.set(key, {at: Date.now(), fail: result.status === 'lookup_failed', body: result});
  return reply(result, result.status === 'lookup_failed' ? 503 : 200);
}
