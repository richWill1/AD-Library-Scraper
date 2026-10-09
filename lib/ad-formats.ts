import {createHash} from 'node:crypto';
import {metaFetch} from '@/lib/meta-api';
export type AdFormat='Video'|'Image'|'Mixed'|'Unknown';
const cache=new Map<string,{at:number;video:Set<string>;image:Set<string>}>();
const inflight=new Map<string,Promise<{at:number;video:Set<string>;image:Set<string>}>>();
export async function adFormats(token:string,page:string,countries:string[],ids:string[],request=fetch):Promise<Map<string,AdFormat>>{
 const key=createHash('sha256').update(token).digest('hex')+page+JSON.stringify(countries);let data=cache.get(key);
 if(!data||Date.now()-data.at>300000){
  let work=inflight.get(key);
  if(!work){
  if(inflight.size>=20)return new Map(ids.map(id=>[id,'Unknown' as AdFormat]));
  work=(async()=>{
  const signal=AbortSignal.timeout(15000);
  const read=async(type:'VIDEO'|'IMAGE')=>{const found=new Set<string>();let after='';try{for(let i=0;i<2;i++){const p=new URLSearchParams({ad_reached_countries:JSON.stringify(countries),ad_type:'ALL',ad_active_status:'ACTIVE',search_page_ids:JSON.stringify([page]),media_type:type,fields:'id',limit:'100'});if(after)p.set('after',after);const response=await metaFetch(`https://graph.facebook.com/v26.0/ads_archive?${p}`,{headers:{Authorization:`Bearer ${token}`},signal,cache:'no-store'},request);const body=await response.json();if(!response.ok||body.error||!Array.isArray(body.data))break;for(const row of body.data)if(/^\d{1,30}$/.test(String(row.id)))found.add(String(row.id));if(!body.paging?.next||!body.paging?.cursors?.after)break;after=body.paging.cursors.after;if(found.size>=200)break;}}catch{}return found;};
  const [video,image]=await Promise.all([read('VIDEO'),read('IMAGE')]);const value={at:Date.now(),video,image};if(cache.size>=50)cache.clear();cache.set(key,value);return value;
  })();inflight.set(key,work);work.finally(()=>inflight.delete(key)).catch(()=>{});
  }data=await work;
 }
 return new Map(ids.map(id=>[id,data!.video.has(id)?data!.image.has(id)?'Mixed':'Video':data!.image.has(id)?'Image':'Unknown']));
}
