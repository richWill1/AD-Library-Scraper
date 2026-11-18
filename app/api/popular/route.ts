import {NextResponse} from 'next/server';
import {getMetaCredential} from '@/lib/meta-token-store';
import {metaFetch} from '@/lib/meta-api';
import {advertiserScore} from '@/lib/brand-search';
export const runtime='nodejs';

// Popular UK advertisers shown before anyone searches. Results are shared by
// every visitor and cached, so this costs a few dozen Meta calls every 6 hours.
const BRANDS=['Dunelm','Next','IKEA','boohoo','Gymshark','Currys','Wren Kitchens','Sharps Fitted Furniture','John Lewis'];
const TTL=6*3600*1000;
type Brand={name:string;pageId:string;pageName:string;count:number;more:boolean};
let cached:{at:number;brands:Brand[]}|null=null;let inflight:Promise<{at:number;brands:Brand[]}>|null=null;

async function archive(token:string,params:Record<string,string>,after=''){
 const p=new URLSearchParams({ad_reached_countries:JSON.stringify(['GB']),ad_type:'ALL',ad_active_status:'ACTIVE',...params});if(after)p.set('after',after);
 const res=await metaFetch(`https://graph.facebook.com/v26.0/ads_archive?${p}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000),cache:'no-store'});
 const body=await res.json();if(!res.ok||body.error||!Array.isArray(body.data))throw Error('META');
 return {data:body.data as any[],next:body.paging?.next&&body.paging?.cursors?.after?String(body.paging.cursors.after):''};
}
async function lookup(token:string,name:string):Promise<Brand|null>{
 const found=await archive(token,{search_terms:name,fields:'page_id,page_name',limit:'100'});
 const pages=new Map<string,{name:string;n:number}>();
 for(const row of found.data){const id=String(row.page_id||'');if(!/^\d{1,30}$/.test(id)||typeof row.page_name!=='string')continue;const e=pages.get(id)||{name:row.page_name,n:0};e.n++;pages.set(id,e);}
 const best=[...pages.entries()].map(([id,p])=>({id,...p,score:advertiserScore(p.name,name)})).filter(p=>p.score>=2).sort((a,b)=>b.score-a.score||b.n-a.n)[0];
 if(!best)return null;
 let count=0,after='',more=false;
 for(let i=0;i<3;i++){const page=await archive(token,{search_page_ids:JSON.stringify([best.id]),fields:'id',limit:'100'},after);count+=page.data.length;after=page.next;if(!after)break;if(i===2)more=true;}
 return count?{name,pageId:best.id,pageName:best.name,count,more}:null;
}
async function load(){
 const {token}=await getMetaCredential();if(!token)throw Error('NOT_CONFIGURED');
 const brands:Brand[]=[];
 // One brand at a time to stay well inside Meta's rate limits.
 for(const name of BRANDS){if(brands.length>=8)break;try{const b=await lookup(token,name);if(b)brands.push(b);}catch{}}
 return {at:Date.now(),brands};
}
export async function GET(){
 if(!cached||Date.now()-cached.at>TTL){
  if(!inflight)inflight=load().then(v=>{if(v.brands.length)cached=v;return v;}).finally(()=>{inflight=null;});
  try{const v=await (cached?Promise.race([inflight,Promise.resolve(cached)]):inflight);if(!cached&&!v.brands.length)return NextResponse.json({brands:[],code:'UNAVAILABLE'},{status:503});}
  catch{if(!cached)return NextResponse.json({brands:[],code:'UNAVAILABLE'},{status:503});}
 }
 const v=cached!;
 return NextResponse.json({brands:v.brands,updatedAt:new Date(v.at).toISOString()},{headers:{'Cache-Control':'public, max-age=600'}});
}
