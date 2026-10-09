import {createHash} from 'node:crypto';
import {safeMediaUrl,type CreativeMedia} from '@/lib/media';
import {getMetaCredential} from '@/lib/meta-token-store';
type Result={items:CreativeMedia[];code:string;collectedAt?:string;source?:string;retryAfter?:number};
const cache=new Map<string,{until:number;result:Result}>();const inflight=new Map<string,Promise<Result>>();
export function collectorConfiguration(){const url=process.env.META_MEDIA_COLLECTOR_URL||'';const secret=process.env.META_MEDIA_COLLECTOR_SECRET||'';return {ready:url==='https://ad-library-owned-collector.onrender.com'&&secret.length>=32,url,secret};}
export function creativeCacheStatus(){return {configured:collectorConfiguration().ready,cachedAds:[...cache.values()].filter(v=>v.until>Date.now()).length};}
export function mediaExpiresAt(items:CreativeMedia[],now=Date.now()){return Math.min(now+300000,...items.flatMap(i=>[i.url,i.poster].filter(Boolean).map(u=>{const oe=new URL(u!).searchParams.get('oe');return oe&&/^[a-f\d]+$/i.test(oe)?parseInt(oe,16)*1000-60000:Infinity;})));}
export function validatedCreativeItems(input:unknown,now=Date.now()):CreativeMedia[]{if(!Array.isArray(input))return [];const items:CreativeMedia[]=[];for(const item of input.slice(0,20)){const url=safeMediaUrl(item?.url);if(!url||!['video','image'].includes(item?.kind))continue;const value={kind:item.kind as 'video'|'image',url,poster:safeMediaUrl(item.poster)||undefined};if(mediaExpiresAt([value],now)<=now||items.some(i=>i.url===url))continue;items.push(value);}return items;}
export async function fetchCreative(id:string,refresh=false,request=fetch):Promise<Result>{
 if(!/^\d{1,30}$/.test(id))return {items:[],code:'INVALID_ID'};const config=collectorConfiguration();if(!config.ready)return {items:[],code:'NOT_COLLECTED'};
 let token:string;try{token=(await getMetaCredential()).token;}catch{return {items:[],code:'META_STORAGE_UNAVAILABLE'};}if(!token)return {items:[],code:'NOT_CONFIGURED'};
 const key=createHash('sha256').update(token).digest('hex')+':'+id;const hit=cache.get(key);if(!refresh&&hit&&hit.until>Date.now())return hit.result;
 if(inflight.has(key))return inflight.get(key)!;
 if(inflight.size>=60)return {items:[],code:'BUSY',retryAfter:4};
 const work=(async()=>{try{
  const response=await request(`${config.url}/creative?id=${encodeURIComponent(id)}${refresh?'&refresh=1':''}`,{headers:{'X-Collector-Key':config.secret,'X-Meta-Token':token},redirect:'error',signal:AbortSignal.timeout(120000),cache:'no-store'});const body=await response.json();
  if(!response.ok)return {items:[],code:['BUSY','META_BLOCKED','META_PREVIEW_UNAVAILABLE'].includes(body.code)?body.code:'COLLECTOR_UNAVAILABLE',retryAfter:4};
  const items=validatedCreativeItems(body.items).filter(i=>!JSON.stringify(i).includes(token));const at=typeof body.collectedAt==='string'&&Number.isFinite(Date.parse(body.collectedAt))?body.collectedAt:new Date().toISOString();const result:Result={items,collectedAt:at,source:'meta-official-snapshot',code:items.length?'COLLECTED':'NO_MEDIA'};
  if(items.length){if(cache.size>=300)cache.delete(cache.keys().next().value!);cache.set(key,{until:mediaExpiresAt(items),result});}return result;
 }catch{return {items:[],code:'COLLECTOR_UNAVAILABLE',retryAfter:4};}finally{inflight.delete(key);}})();inflight.set(key,work);return work;
}
