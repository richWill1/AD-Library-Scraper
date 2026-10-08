import {safeMediaUrl,type CreativeMedia} from './media';
const cache=new Map<string,{at:number;items:CreativeMedia[]}>();
function exchange(type:string,expected:string,payload:Record<string,string>,timeout:number):Promise<any>{return new Promise((resolve)=>{const requestId=crypto.randomUUID();const done=(data:any)=>{clearTimeout(timer);window.removeEventListener('message',receive);resolve(data);};const receive=(event:MessageEvent)=>{if(event.source===window&&event.origin===location.origin&&event.data?.type===expected&&event.data.requestId===requestId)done(event.data);};const timer=setTimeout(()=>done(null),timeout);window.addEventListener('message',receive);window.postMessage({type,requestId,...payload},location.origin);});}
export async function companionMedia(id:string,page:string):Promise<{items:CreativeMedia[];collectedAt?:string;code:string}>{
 if(!/^\d{1,30}$/.test(id)||!/^\d{1,30}$/.test(page))return {items:[],code:'NOT_AVAILABLE'};
 const hit=cache.get(id);if(hit&&Date.now()-hit.at<900000)return {items:hit.items,code:'COLLECTED'};
 if(!await exchange('AD_LIBRARY_COMPANION_PING','AD_LIBRARY_COMPANION_READY',{},1000))return {items:[],code:'COMPANION_MISSING'};
 for(let attempt=0;attempt<5;attempt++){
  const reply=await exchange('AD_LIBRARY_REQUEST_CREATIVE','AD_LIBRARY_CREATIVE_RESULT',{id,page},25000);const result=reply?.result;
  if(result?.code==='BUSY'){await new Promise(resolve=>setTimeout(resolve,5000));continue;}
  const items:CreativeMedia[]=(Array.isArray(result?.items)?result.items:[]).flatMap((item:any)=>{const url=safeMediaUrl(item.url);return url&&['video','image'].includes(item.kind)?[{kind:item.kind,url,poster:safeMediaUrl(item.poster)||undefined}]:[];});
  if(items.length){if(cache.size>=200)cache.delete(cache.keys().next().value!);cache.set(id,{at:Date.now(),items});}
  return {items,collectedAt:result?.collectedAt,code:result?.code||'COMPANION_TIMEOUT'};
 }
 return {items:[],code:'BUSY'};
}
