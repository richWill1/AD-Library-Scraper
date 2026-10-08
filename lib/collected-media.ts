import {safeMediaUrl,type CreativeMedia} from './media';
export type MediaCollection={collectedAt:string;source:string;records:{id:string;url:string;poster?:string;kind?:string}[]};
// Only a short-lived batch collected from the rendered Meta Library; not a live crawl.
export function collectionItems(collection:MediaCollection,id:string,now=Date.now()):CreativeMedia[]{
 const at=Date.parse(collection.collectedAt);
 if(!Number.isFinite(at)||at>now+60000||now-at>6*3600000)return [];
 const items:CreativeMedia[]=[];
 for(const record of collection.records){
  if(record.id!==id)continue;
  const url=safeMediaUrl(record.url);if(!url)continue;
  const expiry=new URL(url).searchParams.get('oe');
  if(expiry&&/^[a-f\d]+$/i.test(expiry)&&parseInt(expiry,16)*1000<=now+60000)continue;
  const poster=safeMediaUrl(record.poster)||undefined;
  if(!items.some(v=>v.url===url))items.push({kind:record.kind==='image'?'image':'video',url,poster});
 }
 return items;
}
