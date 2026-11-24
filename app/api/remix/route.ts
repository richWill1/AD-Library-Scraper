import {NextRequest,NextResponse} from 'next/server';
import {cachedRemix,remixAd,remixEnabled,remixKey,type RemixAd} from '@/lib/ad-remix';
import {cachedDataset} from '@/lib/compare-dataset';
import {clerkEnabled,sessionUser} from '@/lib/clerk-auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Signed-in users only. The server looks up the ad's text and image itself
// (never ad text sent by the browser), so this can't be used to run arbitrary prompts.
const ORIGIN=process.env.ADS_ORIGIN||'https://ad-library-scraper-94t0.onrender.com';
const ID=/^\d{1,30}$/;
const USER_DAILY=Number(process.env.REMIX_USER_DAILY_LIMIT||30);
const users=new Map<string,{day:string;n:number;at:number;minute:number}>();
const clean=(v:unknown,n:number)=>typeof v==='string'?v.replace(/[\u0000-\u001f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,n):'';
const blank=(s:string)=>!s||s==='Ad creative'||s==='No ad copy provided by Meta.'||s==='No copy provided by Meta.';

async function findText(page:string,id:string){
 for(const cov of ['GB','EU_UK']){const a=cachedDataset(page,cov)?.ads.find(x=>x.id===id);if(a)return {title:a.t||'',copy:a.b||''}}
 let after='';
 for(let i=0;i<4;i++){
  const p=new URLSearchParams({page,coverage:'GB'});if(after)p.set('after',after);
  const res=await fetch(`${ORIGIN}/api/ads?${p}`,{signal:AbortSignal.timeout(25000),cache:'no-store',headers:{'x-adsnoop-internal':'remix'}}).catch(()=>null);
  if(!res||!res.ok)break;
  const body=await res.json().catch(()=>null);if(!Array.isArray(body?.ads))break;
  const a=body.ads.find((x:any)=>String(x.id)===id);if(a)return {title:String(a.title||''),copy:String(a.copy||'')};
  after=body.nextCursor||'';if(!after)break;
 }
 return null;
}
async function findImage(id:string){
 const res=await fetch(`${ORIGIN}/api/media?id=${id}`,{signal:AbortSignal.timeout(30000),cache:'no-store',headers:{'x-adsnoop-internal':'remix'}}).catch(()=>null);
 const body=res&&res.ok?await res.json().catch(()=>null):null;
 const items=Array.isArray(body?.items)?body.items:[];
 const cta=typeof body?.cta?.text==='string'?body.cta.text:'';
 const src=items.map((i:any)=>i.kind==='image'?i.url:i.poster).find((u:unknown)=>{try{const h=new URL(String(u));return h.protocol==='https:'&&(h.hostname.endsWith('.fbcdn.net')||h.hostname==='media.adsnoop.co.uk')}catch{return false}});
 if(!src)return {image:null,cta};
 try{
  const r=await fetch(src,{signal:AbortSignal.timeout(15000),redirect:'error'});
  const type=(r.headers.get('content-type')||'').split(';')[0].trim();
  if(!r.ok||!['image/jpeg','image/png','image/webp','image/gif'].includes(type))return {image:null,cta};
  const buf=Buffer.from(await r.arrayBuffer());if(buf.length>3.5e6||buf.length<500)return {image:null,cta};
  return {image:{data:buf.toString('base64'),type:type as 'image/jpeg'},cta};
 }catch{return {image:null,cta}}
}

export async function POST(req:NextRequest){
 if(!remixEnabled())return NextResponse.json({error:'Remix isn’t switched on yet.',code:'OFF'},{status:503});
 if(!clerkEnabled())return NextResponse.json({error:'Accounts are not switched on yet.',code:'AUTH_OFF'},{status:503});
 const user=await sessionUser(req);
 if(!user)return NextResponse.json({error:'Create a free account or sign in to remix ads.',code:'SIGNED_OUT'},{status:401});
 let body:any;try{const t=await req.text();if(t.length>2000)throw Error();body=JSON.parse(t)}catch{return NextResponse.json({error:'Invalid request.'},{status:400})}
 const id=String(body?.id||''),page=String(body?.page||''),advertiser=clean(body?.name,100)||'A competitor',brand=clean(body?.brand,80);
 if(!ID.test(id)||!ID.test(page))return NextResponse.json({error:'Invalid ad.'},{status:400});
 const key=remixKey(id,brand);
 const hit=await cachedRemix(key);if(hit)return NextResponse.json({remix:hit,cached:true},{headers:{'Cache-Control':'no-store'}});
 // Limits only count new model calls; cached remixes are free.
 const now=Date.now(),today=new Date().toISOString().slice(0,10);
 if(users.size>5000)users.clear();
 const u=users.get(user)||{day:today,n:0,at:now,minute:0};if(u.day!==today){u.day=today;u.n=0}
 if(now-u.at>60000){u.at=now;u.minute=0}
 if(u.minute>=5)return NextResponse.json({error:'Please wait a minute before remixing another ad.',code:'RATE_LIMITED'},{status:429});
 if(u.n>=USER_DAILY)return NextResponse.json({error:'You’ve used today’s '+USER_DAILY+' remixes. Come back tomorrow.',code:'DAILY_LIMIT'},{status:429});
 u.minute++;u.n++;users.set(user,u);
 const result=await remixAd(key,brand,async():Promise<RemixAd|null>=>{
  const [text,media]=await Promise.all([findText(page,id),findImage(id)]);
  if(!text&&!media.image)return null;
  return {id,advertiser,title:blank(text?.title||'')?'':text!.title,copy:blank(text?.copy||'')?'':text!.copy,cta:media.cta,image:media.image};
 });
 if(result==='missing'){u.n--;return NextResponse.json({error:'We couldn’t load this ad. It may have stopped running.',code:'MISSING'},{status:404})}
 if(!result){u.n--;return NextResponse.json({error:'The remix couldn’t be written just now. Please try again in a minute.',code:'FAILED'},{status:502})}
 return NextResponse.json({remix:result,cached:false,left:Math.max(0,USER_DAILY-u.n)},{headers:{'Cache-Control':'no-store'}});
}
