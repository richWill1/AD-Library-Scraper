import {NextRequest,NextResponse} from 'next/server';
import {getMetaCredential} from '@/lib/meta-token-store';
import {cachedDataset,jobStatus,recentFailure,runningJobs,startDataset} from '@/lib/compare-dataset';
export const runtime='nodejs';

// GET ?pages=1,2,3&coverage=GB   -> collection status for up to 6 advertisers (starts collection)
// GET ?page=1&coverage=GB        -> the full comparison dataset once it is ready
const rates=new Map<string,{at:number;count:number}>();
const ID=/^\d{1,30}$/;
function limited(req:NextRequest,kind:string,max:number){
 const ip=(req.headers.get('x-forwarded-for')?.split(',')[0]||'shared')+':'+kind,now=Date.now(),r=rates.get(ip);
 if(rates.size>2000)for(const [k,v]of rates)if(now-v.at>60000)rates.delete(k);
 if(r&&now-r.at<60000){if(r.count>=max)return true;r.count++;}else rates.set(ip,{at:now,count:1});
 return false;
}
async function token(){
 // Production uses its own Meta connection; the credential-free preview relays through production.
 if(process.env.RENDER_SERVICE_ID==='srv-db3ufoad0e5s73f5dudg'||process.env.META_ACCESS_TOKEN?.trim()||process.env.META_DATABASE_URL){
  const main=process.env.RENDER_SERVICE_ID==='srv-db3ufoad0e5s73f5dudg';
  try{return (await getMetaCredential()).token||(main?null:'');}catch{return main?null:'';}
 }
 return '';
}
function status(page:string,coverage:string){
 const data=cachedDataset(page,coverage);
 if(data)return {status:'ready',ads:data.ads.length,complete:data.complete,generatedAt:data.generatedAt};
 const job=jobStatus(page,coverage);if(job)return {status:'running',...job};
 const failed=recentFailure(page,coverage);if(failed)return {status:'error',error:failed};
 return null;
}
export async function GET(req:NextRequest){
 const sp=req.nextUrl.searchParams,coverage=sp.get('coverage')||'GB';
 if(!['GB','EU_UK'].includes(coverage))return NextResponse.json({error:'Choose United Kingdom or UK + EU coverage.'},{status:400});
 const one=sp.get('page');
 if(one){
  if(!ID.test(one))return NextResponse.json({error:'Invalid advertiser.'},{status:400});
  if(limited(req,'data',40))return NextResponse.json({error:'Please wait a moment.',code:'RATE_LIMITED'},{status:429});
  const data=cachedDataset(one,coverage);
  if(data)return NextResponse.json(data,{headers:{'Cache-Control':'private, max-age=300'}});
  return NextResponse.json(status(one,coverage)||{status:'missing'},{status:202});
 }
 const pages=[...new Set((sp.get('pages')||'').split(',').filter(Boolean))];
 if(!pages.length||pages.length>6||!pages.every(p=>ID.test(p)))return NextResponse.json({error:'Choose between one and six advertisers.'},{status:400});
 if(limited(req,'status',90))return NextResponse.json({error:'Please wait a moment.',code:'RATE_LIMITED'},{status:429});
 const t=await token();
 if(t===null)return NextResponse.json({error:'The research connection is temporarily unavailable.',code:'META_UNAVAILABLE'},{status:503});
 const items:Record<string,unknown>={};
 for(const p of pages){
  let s=status(p,coverage);
  if(!s&&runningJobs()<24){startDataset(p,coverage,t);s=status(p,coverage);}
  items[p]=s||{status:'queued'};
 }
 return NextResponse.json({items,source:t?'direct':'relay'},{headers:{'Cache-Control':'no-store'}});
}
