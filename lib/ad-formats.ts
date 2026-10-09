import {createHash} from 'node:crypto';
export type AdFormat='Video'|'Image'|'Mixed'|'Unknown';
const cache=new Map<string,{at:number;video:Set<string>;image:Set<string>}>();
export async function adFormats(token:string,page:string,countries:string[],ids:string[],request=fetch):Promise<Map<string,AdFormat>>{
 const key=createHash('sha256').update(token).digest('hex')+page+JSON.stringify(countries);let data=cache.get(key);
 if(!data||Date.now()-data.at>300000){
  const signal=AbortSignal.timeout(15000);
  const read=async(type:'VIDEO'|'IMAGE')=>{const found=new Set<string>();let after='';try{for(let i=0;i<2;i++){const p=new URLSearchParams({ad_reached_countries:JSON.stringify(countries),ad_type:'ALL',ad_active_status:'ACTIVE',search_page_ids:JSON.stringify([page]),media_type:type,fields:'id',limit:'100'});if(after)p.set('after',after);const response=await request(`https://graph.facebook.com/v26.0/ads_archive?${p}`,{headers:{Authorization:`Bearer ${token}`},signal,cache:'no-store'});const body=await response.json();if(!response.ok||body.error||!Array.isArray(body.data))break;for(const row of body.data)if(/^\d{1,30}$/.test(String(row.id)))found.add(String(row.id));if(!body.paging?.next||!body.paging?.cursors?.after)break;after=body.paging.cursors.after;if(found.size>=200)break;}}catch{}return found;};
  const [video,image]=await Promise.all([read('VIDEO'),read('IMAGE')]);data={at:Date.now(),video,image};if(cache.size>=50)cache.clear();cache.set(key,data);
 }
 return new Map(ids.map(id=>[id,data!.video.has(id)?data!.image.has(id)?'Mixed':'Video':data!.image.has(id)?'Image':'Unknown']));
}
