import {NextRequest,NextResponse} from 'next/server';
import {brandSummary,summaryEnabled,type SummaryAd} from '@/lib/brand-summary';
export const runtime='nodejs';
// Reads the brand's ads itself (never ad text sent by the browser), so the
// summary can't be steered or used to run arbitrary prompts.
const ORIGIN=process.env.ADS_ORIGIN||'https://ad-library-scraper-94t0.onrender.com';
const buckets=new Map<string,{at:number;count:number}>();

async function loadAds(page:string):Promise<SummaryAd[]>{
 const out:SummaryAd[]=[];let after='';
 for(let i=0;i<2;i++){
  const p=new URLSearchParams({page,coverage:'GB'});if(after)p.set('after',after);
  const res=await fetch(`${ORIGIN}/api/ads?${p}`,{signal:AbortSignal.timeout(25000),cache:'no-store',headers:{'x-adsnoop-internal':'summary'}}).catch(()=>null);
  if(!res||!res.ok)break;
  const body=await res.json().catch(()=>null);if(!Array.isArray(body?.ads))break;
  for(const a of body.ads)out.push({id:String(a.id),title:a.title&&a.title!=='Ad creative'?a.title:'',copy:a.copy&&a.copy!=='No ad copy provided by Meta.'?a.copy:'',start:a.start||null});
  after=body.nextCursor||'';if(!after)break;
 }
 return out;
}

export async function GET(req:NextRequest){
 if(!summaryEnabled())return new NextResponse(null,{status:204});
 const page=req.nextUrl.searchParams.get('page')||'',name=(req.nextUrl.searchParams.get('name')||'').trim().slice(0,120);
 if(!/^\d{1,30}$/.test(page))return NextResponse.json({error:'Invalid Page ID.'},{status:400});
 const key=req.headers.get('x-forwarded-for')?.split(',')[0]||'shared',now=Date.now();
 if(buckets.size>1000)for(const [k,v]of buckets)if(now-v.at>60000)buckets.delete(k);
 const b=buckets.get(key);if(b&&now-b.at<60000){if(b.count>=6)return NextResponse.json({code:'RATE_LIMITED'},{status:429});b.count++}else buckets.set(key,{at:now,count:1});
 const summary=await brandSummary(page,name||'This advertiser',()=>loadAds(page));
 if(!summary)return new NextResponse(null,{status:204,headers:{'Cache-Control':'no-store'}});
 return NextResponse.json({summary},{headers:{'Cache-Control':'private, max-age=3600'}});
}
