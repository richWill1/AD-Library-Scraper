// Comparison dataset: every accessible active ad for one advertiser, reduced to
// the few fields the Compare dashboard needs. No creative media is downloaded.
//
// Two sources share one output shape:
//  - direct: Meta's Ad Library API with this service's own token (production).
//  - relay:  the credential-free preview pages through the production /api/ads
//            and /api/formats endpoints, paced to stay inside their rate limits.
// Results are cached per advertiser so repeat visits and other users are instant.
import {createHash} from 'node:crypto';
import {metaFetch} from '@/lib/meta-api';
import {observeAds} from '@/lib/advertiser-directory';
import {readStored,storeReady} from '@/lib/creative-store';

export type FormatCode='v'|'s'|'c'|'d'|'u'; // video, static image, carousel, catalogue/dynamic, unknown
export type CompareAd={id:string;s:string;e:string|null;f:FormatCode;t:string;b:string;r:number|null};
export type CompareDataset={
 page:string;coverage:string;generatedAt:string;source:'direct'|'relay';
 ads:CompareAd[];
 complete:boolean;            // every accessible active ad was retrieved
 limitReason:string|null;     // why not, in plain English
 cap:number;
 formats:{complete:boolean;basis:{mediaType:number;template:number;cards:number;none:number;inferred?:number;stored?:number};note:string};
};
type Job={status:'running';fetched:number;phase:string;started:number;promise:Promise<void>};

const COUNTRIES:Record<string,string[]>={GB:['GB'],EU_UK:['GB','AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE']};
const DIRECT_CAP=2500,RELAY_CAP=1000;
const TTL_COMPLETE=6*3600e3,TTL_PARTIAL=3600e3,FAIL_TTL=5*60e3;
const MAIN='https://ad-library-scraper-94t0.onrender.com';
const cache=new Map<string,{at:number;data:CompareDataset}>();
const failures=new Map<string,{at:number;error:string}>();
const jobs=new Map<string,Job>();
let active=0;const queue:(()=>void)[]=[];
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const TEMPLATE=/\{\{\s*product\.[a-z_]+\s*\}\}/i;
const clip=(s:string,n:number)=>s.length>n?s.slice(0,n):s;

async function slot<T>(limit:number,fn:()=>Promise<T>):Promise<T>{
 if(active>=limit)await new Promise<void>(r=>queue.push(r));
 active++;try{return await fn();}finally{active--;queue.shift()?.();}
}

export function datasetKey(page:string,coverage:string){return page+'|'+coverage;}
export function cachedDataset(page:string,coverage:string){
 const hit=cache.get(datasetKey(page,coverage));if(!hit)return null;
 const ttl=hit.data.complete?TTL_COMPLETE:TTL_PARTIAL;
 return Date.now()-hit.at<ttl?hit.data:null;
}
export function jobStatus(page:string,coverage:string){const j=jobs.get(datasetKey(page,coverage));return j?{fetched:j.fetched,phase:j.phase,seconds:Math.round((Date.now()-j.started)/1000)}:null;}
export function recentFailure(page:string,coverage:string){const f=failures.get(datasetKey(page,coverage));return f&&Date.now()-f.at<FAIL_TTL?f.error:null;}
export function runningJobs(){return jobs.size;}

// Classify a format from the evidence available without downloading media.
// Meta's IMAGE media-type filter misses most image ads, while its VIDEO list is
// reliable. So when the video list is complete, a non-video ad is image-led: we
// count it as a static image and record that it was inferred.
function classify(id:string,text:string,titles:number,bodies:number,video:Set<string>,image:Set<string>,basis:CompareDataset['formats']['basis'],inferStatic:boolean):FormatCode{
 if(TEMPLATE.test(text)){basis.template++;return 'd';}
 const v=video.has(id),i=image.has(id);
 // One shared body with several distinct headlines is how carousel cards appear in the Ad Library.
 if((v||i)&&titles>=2&&bodies<=1){basis.cards++;return 'c';}
 if(v){basis.mediaType++;return 'v';}
 if(i){basis.mediaType++;return 's';}
 if(inferStatic){basis.inferred=(basis.inferred||0)+1;return 's';}
 basis.none++;return 'u';
}

// ---- direct source (production token) ----
async function directPages(token:string,base:Record<string,string>,cap:number,onPage:(rows:any[])=>void){
 let after='',limit=250,count=0,complete=false,reason:string|null=null;
 for(let guard=0;guard<40;guard++){
  const p=new URLSearchParams({...base,limit:String(limit)});if(after)p.set('after',after);
  let body:any;
  try{const res=await metaFetch(`https://graph.facebook.com/v26.0/ads_archive?${p}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(25000),cache:'no-store'});body=await res.json();}
  catch{reason='Meta stopped responding part-way through.';break;}
  if(body?.error){
   if(limit>100&&(body.error.code===1||/reduce the amount/i.test(body.error.message||''))){limit=100;guard--;continue;}
   reason=[4,17,32,613].includes(body.error.code)?'Meta’s rate limit was reached part-way through.':'Meta returned an error part-way through.';break;
  }
  const rows=Array.isArray(body?.data)?body.data:[];onPage(rows);count+=rows.length;
  if(!body?.paging?.next||!body?.paging?.cursors?.after){complete=true;break;}
  if(count>=cap){reason=`Collection stops at ${cap.toLocaleString('en-GB')} ads per advertiser.`;break;}
  after=body.paging.cursors.after;
 }
 return {complete,reason};
}
async function idSet(token:string,page:string,countries:string[],type:'VIDEO'|'IMAGE',cap:number){
 const found=new Set<string>();
 const r=await directPages(token,{ad_reached_countries:JSON.stringify(countries),ad_type:'ALL',ad_active_status:'ACTIVE',search_page_ids:JSON.stringify([page]),media_type:type,fields:'id'},cap,rows=>{for(const x of rows)if(/^\d{1,30}$/.test(String(x.id)))found.add(String(x.id));});
 return {found,complete:r.complete};
}
async function buildDirect(token:string,page:string,coverage:string,job:Job):Promise<CompareDataset>{
 const countries=COUNTRIES[coverage];const raw:any[]=[];const seen=new Set<string>();
 job.phase='ads';
 const main=await directPages(token,{ad_reached_countries:JSON.stringify(countries),ad_type:'ALL',ad_active_status:'ACTIVE',search_page_ids:JSON.stringify([page]),fields:'id,page_id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_delivery_start_time,ad_delivery_stop_time,total_reach_by_location'},DIRECT_CAP,rows=>{for(const a of rows){const id=String(a.id);if(!/^\d{1,30}$/.test(id)||seen.has(id))continue;seen.add(id);raw.push(a);}job.fetched=raw.length;});
 try{observeAds(raw.slice(0,50));}catch{}
 job.phase='formats';
 const [video,image]=await Promise.all([idSet(token,page,countries,'VIDEO',DIRECT_CAP),idSet(token,page,countries,'IMAGE',DIRECT_CAP)]);
 const basis:CompareDataset['formats']['basis']={mediaType:0,template:0,cards:0,none:0};
 const ads=raw.map(a=>{
  const bodies=[...new Set<string>((a.ad_creative_bodies||[]).map((s:string)=>String(s).trim()).filter(Boolean))];
  const titles=[...new Set<string>((a.ad_creative_link_titles||[]).map((s:string)=>String(s).trim()).filter(Boolean))];
  const text=bodies.join('\n\n')+'\n'+titles.join('\n');
  const reach=a.total_reach_by_location?.find((r:any)=>(r.key??r.location)==='GB')?.value??null;
  return {id:String(a.id),s:String(a.ad_delivery_start_time||'').slice(0,10),e:a.ad_delivery_stop_time?String(a.ad_delivery_stop_time).slice(0,10):null,f:classify(String(a.id),text,titles.length,bodies.length,video.found,image.found,basis,video.complete),t:clip(titles[0]||'',160),b:clip(bodies.join('\n\n'),900),r:typeof reach==='number'?reach:null} as CompareAd;
 });
 // Meta's own display format, for ads AdSnoop has already collected. Reads small stored
 // records only; nothing new is downloaded. Fills unknowns and confirms carousels.
 if(storeReady){
  job.phase='refining';
  const todo=ads.filter(a=>a.f==='u'||a.f==='s').slice(0,800);let i=0;basis.stored=0;
  const map:Record<string,FormatCode>={VIDEO:'v',IMAGE:'s',CAROUSEL:'c',MULTI_IMAGES:'c',MULTI_VIDEOS:'c',DPA:'d',DCO:'d'};
  await Promise.all(Array.from({length:12},async()=>{while(i<todo.length){const a=todo[i++];try{const st=await readStored(a.id);const f=st?.displayFormat&&map[String(st.displayFormat).toUpperCase()];if(f&&f!==a.f){a.f=f;basis.stored!++;}}catch{}}}));
 }
 const fmtComplete=video.complete;
 return {page,coverage,generatedAt:new Date().toISOString(),source:'direct',ads,complete:main.complete,limitReason:main.reason,cap:DIRECT_CAP,
  formats:{complete:fmtComplete,basis,note:fmtNote(basis,fmtComplete,true)}};
}

// ---- relay source (credential-free preview) ----
async function relayJSON(url:string,init?:RequestInit){
 for(let attempt=0;attempt<5;attempt++){
  let res:Response;try{res=await fetch(url,{...init,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});}catch{await sleep(4000);continue;}
  if(res.status===429){await sleep(25000);continue;}
  let body:any=null;try{body=await res.json();}catch{}
  if(res.ok&&body&&!body.error)return body;
  if(res.status>=500){await sleep(5000);continue;}
  return null;
 }
 return null;
}
async function buildRelay(page:string,coverage:string,job:Job):Promise<CompareDataset>{
 const raw:any[]=[];const seen=new Set<string>();let after='',complete=false,reason:string|null=null;
 job.phase='ads';
 for(let guard=0;guard<40;guard++){
  const u=new URL('/api/ads',MAIN);u.searchParams.set('page',page);u.searchParams.set('coverage',coverage);if(after)u.searchParams.set('after',after);
  const body=await relayJSON(u.href);
  if(!body||!Array.isArray(body.ads)){reason='The live data connection stopped part-way through.';break;}
  for(const a of body.ads){const id=String(a.id);if(!/^\d{1,30}$/.test(id)||seen.has(id))continue;seen.add(id);raw.push(a);}
  job.fetched=raw.length;
  if(!body.nextCursor){complete=true;break;}
  if(raw.length>=RELAY_CAP){reason=`The preview collects up to ${RELAY_CAP.toLocaleString('en-GB')} ads per advertiser.`;break;}
  after=body.nextCursor;await sleep(3500); // stay well inside the shared 20-per-minute limit
 }
 try{observeAds(raw.slice(0,50).map(a=>({id:a.id,page_id:a.pageId,page_name:a.pageName})));}catch{}
 job.phase='formats';
 const video=new Set<string>(),image=new Set<string>();let fmtComplete=true;
 for(let i=0;i<raw.length;i+=200){
  const ids=raw.slice(i,i+200).map(a=>String(a.id));
  const body=await relayJSON(new URL('/api/formats',MAIN).href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({page,coverage,ids})});
  if(!body||!body.formats){fmtComplete=false;continue;}
  for(const [id,f] of Object.entries(body.formats as Record<string,string>)){if(f==='Video'||f==='Mixed')video.add(id);if(f==='Image'||f==='Mixed')image.add(id);}
  await sleep(1500);
 }
 // The production lookup reads at most 200 video ads per advertiser; beyond that the list may be incomplete.
 const videoComplete=fmtComplete&&video.size<200;
 const basis={mediaType:0,template:0,cards:0,none:0};
 const ads=raw.map(a=>{
  const copy=a.copy==='No ad copy provided by Meta.'?'':String(a.copy||'');const title=a.title==='Ad creative'?'':String(a.title||'');
  const bodies=copy?copy.split(/\n\n+/).length:0;
  return {id:String(a.id),s:String(a.start||''),e:a.stop||null,f:classify(String(a.id),copy+'\n'+title,1,bodies,video,image,basis,videoComplete),t:clip(title,160),b:clip(copy,900),r:typeof a.reach==='number'?a.reach:null} as CompareAd;
 });
 return {page,coverage,generatedAt:new Date().toISOString(),source:'relay',ads,complete,limitReason:reason,cap:RELAY_CAP,
  formats:{complete:videoComplete,basis,note:fmtNote(basis,videoComplete,false)}};
}

function fmtNote(b:CompareDataset['formats']['basis'],videoComplete:boolean,direct:boolean){
 const parts=['Video from Meta’s video media-type list.'];
 if(b.inferred)parts.push(`${b.inferred} ad${b.inferred===1?'':'s'} Meta doesn’t list as video counted as static image${direct?'; some may be carousels not yet confirmed':'; carousels can’t be separated from images in preview data'}.`);
 if(b.stored)parts.push(`${b.stored} refined with Meta’s own display format.`);
 if(b.cards)parts.push(`${b.cards} carousel${b.cards===1?'':'s'} identified from multiple card headlines.`);
 if(b.template)parts.push(`${b.template} catalogue ad${b.template===1?'':'s'} identified from product templates.`);
 if(!videoComplete)parts.push('The video list was cut short, so ads outside it are left as Unknown.');
 return parts.join(' ');
}
export function startDataset(page:string,coverage:string,token:string){
 const key=datasetKey(page,coverage);if(jobs.has(key))return;
 if(!COUNTRIES[coverage])throw Error('coverage');
 const job:Job={status:'running',fetched:0,phase:'queued',started:Date.now(),promise:Promise.resolve()};
 job.promise=slot(token?2:1,async()=>{
  try{
   const data=token?await buildDirect(token,page,coverage,job):await buildRelay(page,coverage,job);
   if(!data.ads.length&&!data.complete)throw Error(data.limitReason||'No data');
   if(cache.size>=80){const oldest=[...cache.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(oldest)cache.delete(oldest[0]);}
   cache.set(key,{at:Date.now(),data});failures.delete(key);
  }catch(e){failures.set(key,{at:Date.now(),error:e instanceof Error&&e.message!=='No data'?e.message:'Couldn’t collect this advertiser’s ads right now.'});}
  finally{jobs.delete(key);}
 });
 jobs.set(key,job);
}
export const tokenFingerprint=(token:string)=>token?createHash('sha256').update(token).digest('hex').slice(0,8):'relay';
