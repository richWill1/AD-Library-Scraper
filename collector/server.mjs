import http from 'node:http';
import {timingSafeEqual,createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {safe,videoCandidate} from './media.mjs';
const cache=new Map();let browserPromise=null;let active=0;const waiting=[];const maximum=2;

function expiry(items){return Math.min(Date.now()+900000,...items.flatMap(i=>[i.url,i.poster].filter(Boolean).map(u=>{const oe=new URL(u).searchParams.get('oe');return oe&&/^[a-f\d]+$/i.test(oe)?parseInt(oe,16)*1000-60000:Infinity;})));}
function acquire(){if(active<maximum){active++;return Promise.resolve();}if(waiting.length>=20)return Promise.reject(Error('BUSY'));return new Promise((resolve,reject)=>{const ticket={resolve:null,timer:null};ticket.resolve=()=>{clearTimeout(ticket.timer);resolve();};ticket.timer=setTimeout(()=>{const at=waiting.indexOf(ticket);if(at>=0)waiting.splice(at,1);reject(Error('BUSY'));},75000);waiting.push(ticket);});}
function release(){const next=waiting.shift();if(next)next.resolve();else active--;}
async function browser(){if(!browserPromise)browserPromise=chromium.launch({headless:true}).then(b=>{b.on('disconnected',()=>browserPromise=null);return b;}).catch(()=>{browserPromise=null;throw Error('COLLECTOR_UNAVAILABLE');});return browserPromise;}
async function collect(id,token){
 let context;
 try{
  const b=await browser();context=await b.newContext({viewport:{width:680,height:900},locale:'en-GB'});const page=await context.newPage();const streamed=new Map();const jsonItems=[];const reads=[];
  page.on('request',request=>{const candidate=videoCandidate(request.url());if(candidate)streamed.set(candidate.url,candidate.score);});
  page.on('response',response=>{if(!response.url().startsWith('https://www.facebook.com/api/graphql')||reads.length>=20)return;reads.push((async()=>{try{const text=await response.text();if(text.length>2000000||!text.includes(id))return;let visited=0;
   const walk=(value,depth=0)=>{if(!value||typeof value!=='object'||depth>30||++visited>10000)return;if(Array.isArray(value)){for(const child of value)walk(child,depth+1);return;}
    const video=safe(value.video_hd_url||value.video_sd_url||value.browser_native_hd_url||value.browser_native_sd_url);if(video)jsonItems.push({kind:'video',url:video,poster:safe(value.video_preview_image_url)||undefined});
    const image=safe(value.original_image_url||value.resized_image_url);if(image)jsonItems.push({kind:'image',url:image});
    for(const child of Object.values(value))walk(child,depth+1);
   };for(const line of text.replace(/^for \(;;\);\s*/, '').split('\n')){try{walk(JSON.parse(line));}catch{}}
  }catch{}})());});
  await page.route('**/*',route=>{const req=route.request();let host;try{host=new URL(req.url()).hostname;}catch{return route.abort();}if(!/\.(facebook\.com|fbcdn\.net|fbsbx\.com)$/.test('.'+host)||['media','font'].includes(req.resourceType()))return route.abort();return route.continue();});
  // The token is used only in Meta's official snapshot URL; never in the incoming URL or logs.
  const url=new URL('https://www.facebook.com/ads/archive/render_ad/');url.searchParams.set('id',id);url.searchParams.set('access_token',token);
  const response=await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:25000});
  if(!response?.ok())throw Error('META_BLOCKED');
  await page.getByText(`Library ID: ${id}`,{exact:true}).waitFor({state:'visible',timeout:20000});
  const root=page.getByRole('main');
  await root.locator('video,img').filter({visible:true}).first().waitFor({state:'visible',timeout:10000});
  // Wait for a real creative, not the advertiser's small profile image.
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('video,img')).some(el=>el.tagName==='VIDEO'&&/\.fbcdn\.net\//.test(el.currentSrc||el.src)||el.tagName==='IMG'&&el.getBoundingClientRect().width>=200&&el.getBoundingClientRect().height>=150&&/\.fbcdn\.net\//.test(el.currentSrc||el.src)),null,{timeout:15000});
  const readRecords=()=>root.locator('video,img').evaluateAll(elements=>elements.map(el=>{
   const r=el.getBoundingClientRect();if(el.tagName==='IMG'&&(r.width<200||r.height<150||el.closest('[aria-label="Video player"]')))return null;
   return {kind:el.tagName==='VIDEO'?'video':'image',url:el.currentSrc||el.src,poster:el.tagName==='VIDEO'?el.poster:undefined};
  }).filter(Boolean));
  let records=await readRecords();
  if(records.some(r=>r.kind==='video')&&!records.some(r=>r.kind==='video'&&safe(r.url))){const play=root.getByRole('button',{name:'Play Video',exact:true});if(await play.count())await play.first().click({timeout:3000}).catch(()=>{});}
  for(let attempt=0;attempt<7;attempt++){await Promise.allSettled(reads);records=await readRecords();if(records.some(r=>safe(r.url))||jsonItems.length||streamed.size)break;await page.waitForTimeout(1000);}
  await Promise.allSettled(reads);
  const fallback=[...streamed.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0];
  if(fallback&&records.some(r=>r.kind==='video')&&!records.some(r=>r.kind==='video'&&safe(r.url)))records.push({kind:'video',url:fallback,poster:records.find(r=>r.kind==='video')?.poster});
  const items=[];for(const r of [...records,...jsonItems]){const url=safe(r.url);if(url&&!items.some(v=>v.url===url))items.push({kind:r.kind,url,poster:safe(r.poster)||undefined});}
  const posters=new Set(items.filter(i=>i.kind==='video').map(i=>i.poster));const filtered=items.filter(i=>i.kind!=='image'||!posters.has(i.url)).slice(0,20);
  return {items:filtered,collectedAt:new Date().toISOString(),code:filtered.length?'COLLECTED':'NO_MEDIA',source:'meta-official-snapshot'};
 }finally{await context?.close();}
}
const inflight=new Map();
const server=http.createServer(async(req,res)=>{
 const reply=(status,body)=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 const url=new URL(req.url,'http://localhost');if(url.pathname==='/health')return reply(200,{status:'ok',collector:'owned-meta-snapshot',active,queued:waiting.length});
 const expected=process.env.COLLECTOR_SECRET||'';const supplied=req.headers['x-collector-key']||'';if(typeof supplied!=='string'||!expected||Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return reply(401,{code:'UNAUTHORIZED',items:[]});
 const id=url.searchParams.get('id')||'',token=req.headers['x-meta-token'];if(req.method!=='GET'||url.pathname!=='/creative'||!/^\d{1,30}$/.test(id)||typeof token!=='string'||token.length<20||token.length>4096||/[\s\x00-\x1f]/.test(token))return reply(400,{code:'INVALID_REQUEST',items:[]});
 const key=createHash('sha256').update(token).digest('hex')+':'+id,hit=cache.get(key);if(url.searchParams.get('refresh')!=='1'&&hit&&Date.now()<hit.until)return reply(200,hit.result);
 let work=inflight.get(key);if(!work){work=(async()=>{await acquire();try{const result=await collect(id,token);if(result.items.length){if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(key,{until:expiry(result.items),result});}return result;}finally{release();}})();inflight.set(key,work);work.finally(()=>inflight.delete(key)).catch(()=>{});}
 try{reply(200,await work);}catch(error){const code=['META_BLOCKED','BUSY','COLLECTOR_UNAVAILABLE'].includes(error.message)?error.message:error.name==='TimeoutError'?'META_PREVIEW_UNAVAILABLE':'COLLECTOR_ERROR';console.log(JSON.stringify({event:'collection_failed',ad:id,code}));reply(code==='BUSY'?429:502,{code,items:[],retryAfter:4});}
});server.listen(Number(process.env.PORT||10000),'0.0.0.0');
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(async()=>{await(await browserPromise)?.close();process.exit(0);}));
