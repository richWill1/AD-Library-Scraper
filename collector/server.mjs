import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {chromium} from 'playwright';
const cache=new Map();let running=false;
const safe=input=>{try{const u=new URL(input);return u.protocol==='https:'&&u.hostname.endsWith('.fbcdn.net')&&!u.username&&!u.password&&!u.searchParams.has('access_token')?u.href:null;}catch{return null;}};
async function collect(id,pageId){
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.route('**/*',route=>{const req=route.request();let host;try{host=new URL(req.url()).hostname;}catch{return route.abort();}if(!/\.(facebook\.com|fbcdn\.net|fbsbx\.com)$/.test('.'+host)||['media','font'].includes(req.resourceType()))return route.abort();return route.continue();});
  const url=new URL('https://www.facebook.com/ads/library/');Object.entries({active_status:'active',ad_type:'all',country:'GB',media_type:'all',search_type:'page',view_all_page_id:pageId,id}).forEach(([k,v])=>url.searchParams.set(k,v));
  const response=await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:25000});
  if(!response?.ok())throw Error('META_BLOCKED');
  await page.getByText(`Library ID: ${id}`,{exact:true}).first().waitFor({state:'visible',timeout:20000});
  const records=await page.locator('video,img').evaluateAll(elements=>elements.map(el=>{
   if(el.tagName==='IMG'&&(el.naturalWidth<250||el.naturalHeight<200))return null;
   let p=el.parentElement;while(p){const ids=[...new Set((p.innerText||'').match(/Library ID:\s*\d+/g)||[])];if(ids.length===1)return {id:ids[0].replace(/\D/g,''),kind:el.tagName==='VIDEO'?'video':'image',url:el.currentSrc||el.src,poster:el.tagName==='VIDEO'?el.poster:undefined};if(ids.length>1)return null;p=p.parentElement;}return null;
  }).filter(Boolean));
  const items=[];for(const r of records.filter(r=>r.id===id)){const u=safe(r.url);if(u&&!items.some(v=>v.url===u))items.push({kind:r.kind,url:u,poster:safe(r.poster)||undefined});}
  return {items,collectedAt:new Date().toISOString(),code:items.length?'COLLECTED':'NO_MEDIA'};
 }finally{await browser?.close();}
}
const server=http.createServer(async(req,res)=>{
 const reply=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 const url=new URL(req.url,'http://localhost');if(url.pathname==='/health')return reply(200,{status:'ok',collector:'owned-meta-browser',running});
 const expected=process.env.COLLECTOR_SECRET||'';const supplied=req.headers['x-collector-key']||'';if(typeof supplied!=='string'||!expected||Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return reply(401,{code:'UNAUTHORIZED'});
 const id=url.searchParams.get('id')||'',pageId=url.searchParams.get('page')||'';if(req.method!=='GET'||url.pathname!=='/collect'||!/^\d{1,30}$/.test(id)||!/^\d{1,30}$/.test(pageId))return reply(400,{code:'INVALID_REQUEST'});
 const key=`${pageId}:${id}`,hit=cache.get(key);if(hit&&Date.now()-hit.at<300000)return reply(hit.status,hit.result);
 if(running)return reply(429,{code:'BUSY',retryAfter:5});running=true;
 try{const result=await collect(id,pageId);if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(key,{at:Date.now(),status:200,result});reply(200,result);}
 catch(error){const code=error.message==='META_BLOCKED'?'META_BLOCKED':error.name==='TimeoutError'?'META_PREVIEW_UNAVAILABLE':'COLLECTOR_ERROR';console.log(JSON.stringify({event:'collection_failed',ad:id,code,error:code==='COLLECTOR_ERROR'?String(error.message).slice(0,1000):undefined}));const result={code,items:[]};cache.set(key,{at:Date.now(),status:502,result});reply(502,result);}
 finally{running=false;}
});server.listen(Number(process.env.PORT||10000),'0.0.0.0');
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
