import {NextRequest,NextResponse} from 'next/server';
import {extractMedia,type CreativeMedia} from '@/lib/media';
export const runtime='nodejs';
const cache=new Map<string,{at:number,items:CreativeMedia[]}>();const pending=new Map<string,Promise<CreativeMedia[]>>();const buckets=new Map<string,{at:number,count:number}>();
export async function GET(req:NextRequest){
 const id=req.nextUrl.searchParams.get('id')||'';if(!/^\d{1,30}$/.test(id))return NextResponse.json({error:'Invalid ad ID.'},{status:400});
 const key=process.env.SCRAPECREATORS_API_KEY;if(!key)return NextResponse.json({error:'Creative previews are awaiting a media connection.',code:'NOT_CONFIGURED'},{status:503});
 const now=Date.now();const hit=cache.get(id);if(hit&&now-hit.at<3600000)return NextResponse.json({items:hit.items});
 const ip=req.headers.get('x-forwarded-for')?.split(',')[0]||'shared';const bucket=buckets.get(ip);if(bucket&&now-bucket.at<60000){if(bucket.count>=30)return NextResponse.json({error:'Please wait before loading more previews.'},{status:429});bucket.count++;}else buckets.set(ip,{at:now,count:1});if(buckets.size>1000)for(const [k,v]of buckets)if(now-v.at>60000)buckets.delete(k);
 try{let job=pending.get(id);if(!job){job=(async()=>{const res=await fetch(`https://api.scrapecreators.com/v1/facebook/adLibrary/ad?id=${id}`,{headers:{'x-api-key':key},signal:AbortSignal.timeout(20000),cache:'no-store'});const data=await res.json();if(!res.ok||data.success===false)throw Error('Unavailable');const items=extractMedia(data);if(cache.size>=200)cache.delete(cache.keys().next().value!);cache.set(id,{at:Date.now(),items});return items;})();pending.set(id,job);job.finally(()=>pending.delete(id)).catch(()=>{});}return NextResponse.json({items:await job});}catch{return NextResponse.json({error:'This creative preview could not be loaded. You can still view it on Meta.'},{status:502});}
}
