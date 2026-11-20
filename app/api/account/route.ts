import {NextRequest,NextResponse} from 'next/server';
import {clerkEnabled,readPrivate,sessionUser,writePrivate} from '@/lib/clerk-auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';

// The signed-in user's tracked brands: {v, active, brands:[{id,name,competitors:[{id,name}]}]}.
// Stored as one JSON string in Clerk private metadata (8 KB limit, plenty for this).
const KEY='adsnoop_tracker';
const MAX_BRANDS=10,MAX_COMP=5;
const ID=/^\d{1,30}$/;
const name=(v:unknown)=>typeof v==='string'?v.replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,80):'';
function clean(input:any){
 if(!input||typeof input!=='object'||!Array.isArray(input.brands))return null;
 const brands=input.brands.filter((b:any)=>b&&ID.test(String(b.id))&&name(b.name)).slice(0,MAX_BRANDS).map((b:any)=>({
  id:String(b.id),name:name(b.name),
  competitors:(Array.isArray(b.competitors)?b.competitors:[]).filter((c:any)=>c&&ID.test(String(c.id))&&String(c.id)!==String(b.id)&&name(c.name)).slice(0,MAX_COMP).map((c:any)=>({id:String(c.id),name:name(c.name)}))
 }));
 const active=brands.some((b:any)=>b.id===String(input.active))?String(input.active):brands[0]?.id||'';
 return {v:1,active,brands,updatedAt:new Date().toISOString()};
}
const rates=new Map<string,{at:number;n:number}>();
function limited(user:string){const now=Date.now(),r=rates.get(user);if(rates.size>5000)rates.clear();if(r&&now-r.at<60000){if(r.n>=60)return true;r.n++;}else rates.set(user,{at:now,n:1});return false;}

async function who(req:NextRequest){
 if(!clerkEnabled())return {error:NextResponse.json({error:'Accounts are not switched on yet.',code:'AUTH_OFF'},{status:503})};
 const user=await sessionUser(req);
 if(!user)return {error:NextResponse.json({error:'Please sign in again.',code:'SIGNED_OUT'},{status:401})};
 if(limited(user))return {error:NextResponse.json({error:'Please wait a moment.',code:'RATE_LIMITED'},{status:429})};
 return {user};
}
export async function GET(req:NextRequest){
 const w=await who(req);if(w.error)return w.error;
 try{
  const meta=await readPrivate(w.user!);let tracker=null;
  try{tracker=typeof meta[KEY]==='string'?clean(JSON.parse(meta[KEY] as string)):null;}catch{}
  return NextResponse.json({tracker,plan:meta.adsnoop_plan==='pro'?'pro':'free'},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Your account couldn’t be loaded. Please try again.'},{status:502});}
}
export async function PUT(req:NextRequest){
 const w=await who(req);if(w.error)return w.error;
 let body:any;try{const t=await req.text();if(t.length>12000)throw Error();body=JSON.parse(t);}catch{return NextResponse.json({error:'Invalid request.'},{status:400});}
 const tracker=clean(body&&body.tracker);if(!tracker)return NextResponse.json({error:'Invalid request.'},{status:400});
 const json=JSON.stringify(tracker);if(json.length>7000)return NextResponse.json({error:'Too much data.'},{status:413});
 try{await writePrivate(w.user!,{[KEY]:json});return NextResponse.json({ok:true,tracker},{headers:{'Cache-Control':'no-store'}});}
 catch{return NextResponse.json({error:'Your changes couldn’t be saved. Please try again.'},{status:502});}
}
