// Permanent creative storage in Cloudflare R2 (S3-compatible API).
// A Meta ad's creative never changes under the same ad ID, so each ad is
// collected once, saved here, and served from Cloudflare from then on.
// Requests are signed with AWS Signature V4 using node:crypto only.
import {createHash,createHmac} from 'node:crypto';

const env=(k)=>(process.env[k]||'').trim();
const ACCOUNT=env('R2_ACCOUNT_ID'),BUCKET=env('R2_BUCKET'),KEY_ID=env('R2_ACCESS_KEY_ID'),SECRET=env('R2_SECRET_ACCESS_KEY');
const PUBLIC=env('R2_PUBLIC_URL').replace(/\/+$/,'');
const PREFIX='creatives/v1';
const MAX_IMAGE=8*1024*1024,MAX_VIDEO=25*1024*1024;

export const storeReady=/^[a-f\d]{32}$/i.test(ACCOUNT)&&/^[a-z\d][a-z\d-]{1,61}[a-z\d]$/.test(BUCKET)&&KEY_ID.length>=16&&SECRET.length>=16&&/^https:\/\/[a-z\d.-]+$/i.test(PUBLIC);
export function storeStatus(){return {configured:storeReady,publicHost:storeReady?new URL(PUBLIC).hostname:null};}

const sha256=(data)=>createHash('sha256').update(data).digest('hex');
const hmac=(key,data)=>createHmac('sha256',key).update(data).digest();
const encodeKey=(key)=>key.split('/').map(encodeURIComponent).join('/');

async function r2(method,key,body=null,contentType=''){
 const host=`${ACCOUNT}.r2.cloudflarestorage.com`,path=`/${BUCKET}/${encodeKey(key)}`;
 const now=new Date(),amzDate=now.toISOString().replace(/[:-]|\.\d{3}/g,''),day=amzDate.slice(0,8);
 const payload=body?sha256(body):sha256('');
 const headers={host,'x-amz-content-sha256':payload,'x-amz-date':amzDate};
 if(contentType)headers['content-type']=contentType;
 if(body)headers['cache-control']='public, max-age=31536000, immutable';
 const names=Object.keys(headers).sort();
 const canonical=[method,path,'',names.map(n=>`${n}:${headers[n]}`).join('\n')+'\n',names.join(';'),payload].join('\n');
 const scope=`${day}/auto/s3/aws4_request`;
 const toSign=['AWS4-HMAC-SHA256',amzDate,scope,sha256(canonical)].join('\n');
 const signingKey=hmac(hmac(hmac(hmac('AWS4'+SECRET,day),'auto'),'s3'),'aws4_request');
 const signature=createHmac('sha256',signingKey).update(toSign).digest('hex');
 const {host:_h,...send}=headers;
 return fetch(`https://${host}${path}`,{method,body:body||undefined,headers:{...send,authorization:`AWS4-HMAC-SHA256 Credential=${KEY_ID}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`},signal:AbortSignal.timeout(60000)});
}

const publicUrl=(key)=>`${PUBLIC}/${encodeKey(key)}`;
const isPublic=(u)=>typeof u==='string'&&u.startsWith(PUBLIC+'/');

// Returns a stored collection result, or null when this ad isn't stored yet.
export async function readStored(id){
 if(!storeReady)return null;
 try{
  const res=await r2('GET',`${PREFIX}/${id}/meta.json`);
  if(res.status===404)return null;if(!res.ok)return null;
  const meta=await res.json();
  const items=Array.isArray(meta.items)?meta.items.filter(i=>i&&['image','video'].includes(i.kind)&&isPublic(i.url)&&(!i.poster||isPublic(i.poster))).slice(0,20):[];
  if(!items.length)return null;
  return {items,displayFormat:meta.displayFormat||undefined,cards:meta.cards||undefined,cta:meta.cta||undefined,collectedAt:meta.collectedAt,storedAt:meta.storedAt,code:'COLLECTED',source:'adsnoop-storage'};
 }catch{return null;}
}

const EXT={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'};
async function copy(url,key,kind){
 const res=await fetch(url,{signal:AbortSignal.timeout(60000),redirect:'follow'});
 if(!res.ok)throw Error('DOWNLOAD');
 const type=(res.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
 if(!EXT[type]||!type.startsWith(kind==='video'?'video/':'image/'))throw Error('TYPE');
 const limit=kind==='video'?MAX_VIDEO:MAX_IMAGE,declared=Number(res.headers.get('content-length')||0);
 if(declared>limit)throw Error('TOO_LARGE');
 const body=Buffer.from(await res.arrayBuffer());if(!body.length||body.length>limit)throw Error('TOO_LARGE');
 const full=`${key}.${EXT[type]}`;const put=await r2('PUT',full,body,type);if(!put.ok)throw Error('UPLOAD_'+put.status);
 return {url:publicUrl(full),bytes:body.length};
}

// Saves a freshly collected creative. Only complete sets are recorded, so a
// stored ad never mixes permanent files with Meta links that will expire.
let active=0;const waiting=[];
export function storeCreative(id,result){
 if(!storeReady||!result?.items?.length)return;
 const job=async()=>{
  const started=Date.now();let bytes=0;
  try{
   const items=[];
   for(const [n,item] of result.items.entries()){
    const file=await copy(item.url,`${PREFIX}/${id}/${n}`,item.kind);bytes+=file.bytes;
    let poster;if(item.poster){const p=await copy(item.poster,`${PREFIX}/${id}/${n}-poster`,'image');poster=p.url;bytes+=p.bytes;}
    items.push({kind:item.kind,url:file.url,...(poster?{poster}:{})});
   }
   const meta={items,displayFormat:result.displayFormat,cards:result.cards,cta:result.cta,collectedAt:result.collectedAt,storedAt:new Date().toISOString()};
   const put=await r2('PUT',`${PREFIX}/${id}/meta.json`,Buffer.from(JSON.stringify(meta)),'application/json');
   if(!put.ok)throw Error('UPLOAD_'+put.status);
   console.log(JSON.stringify({event:'creative_stored',ad:id,files:items.length,bytes,ms:Date.now()-started}));
  }catch(error){console.log(JSON.stringify({event:'creative_store_failed',ad:id,reason:String(error.message||'ERROR').slice(0,40)}));}
 };
 const run=()=>{active++;job().finally(()=>{active--;const next=waiting.shift();if(next)next();});};
 if(active<2)run();else if(waiting.length<200)waiting.push(run);
}
