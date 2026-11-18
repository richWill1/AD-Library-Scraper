import http from 'node:http';
import {timingSafeEqual,createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {safe,videoCandidate} from './media.mjs';
import {readStored,storeCreative,storeStatus} from './store.mjs';
import {findAdvertisers} from './advertisers.mjs';
const cache=new Map();let browserPromise=null;let active=0;const waiting=[];const maximum=2;

// The landing page is shown to marketers, so unwrap Meta's redirect and drop click-tracking parameters.
function landing(input){try{let u=new URL(String(input||''));if(/(^|\.)facebook\.com$/.test(u.hostname)&&u.pathname==='/l.php'&&u.searchParams.get('u'))u=new URL(u.searchParams.get('u'));if(!['http:','https:'].includes(u.protocol)||u.username||u.password||/(^|\.)(facebook|fb|instagram)\.com$/.test(u.hostname)&&u.pathname.length<2)return null;for(const k of [...u.searchParams.keys()])if(/^(utm_|fbclid$|gclid$|mc_|_ga$|dclid$|msclkid$)/i.test(k))u.searchParams.delete(k);u.hash='';const v=u.href;return v.length<=500?v:null;}catch{return null;}}
function ctaOf(text,type,link,caption){const t=typeof text==='string'&&text.length<=40&&!/[\x00-\x1f<>]/.test(text)?text.trim():'';const k=typeof type==='string'&&/^[A-Z_]{2,40}$/.test(type)?type:'';const url=landing(link);const cap=typeof caption==='string'&&caption.length<=80&&!/[\x00-\x1f<>]/.test(caption)?caption.trim():'';return t||k||url?{text:t||undefined,type:k||undefined,url:url||undefined,caption:cap||undefined}:null;}
function expiry(items){return Math.min(Date.now()+3*86400000,...items.flatMap(i=>[i.url,i.poster].filter(Boolean).map(u=>{const oe=new URL(u).searchParams.get('oe');return oe&&/^[a-f\d]+$/i.test(oe)?parseInt(oe,16)*1000-600000:Infinity;})));}
function acquire(){if(active<maximum){active++;return Promise.resolve();}if(waiting.length>=20)return Promise.reject(Error('BUSY'));return new Promise((resolve,reject)=>{const ticket={resolve:null,timer:null};ticket.resolve=()=>{clearTimeout(ticket.timer);resolve();};ticket.timer=setTimeout(()=>{const at=waiting.indexOf(ticket);if(at>=0)waiting.splice(at,1);reject(Error('BUSY'));},75000);waiting.push(ticket);});}
function release(){const next=waiting.shift();if(next)next.resolve();else active--;}
// Advertiser lookups load Meta's full Ad Library page, which is memory-heavy:
// run them alone so they never overlap creative collection on a 512 MB instance.
async function acquireExclusive(){const until=Date.now()+25000;while(active>0){if(Date.now()>until)throw Error('BUSY');await new Promise(r=>setTimeout(r,250));}active=maximum;}
function releaseExclusive(){active=0;while(waiting.length&&active<maximum){active++;waiting.shift().resolve();}}
async function browser(){if(!browserPromise)browserPromise=chromium.launch({headless:true}).then(b=>{b.on('disconnected',()=>browserPromise=null);return b;}).catch(()=>{browserPromise=null;throw Error('COLLECTOR_UNAVAILABLE');});return browserPromise;}
async function collect(id,token){
 let context,page;let phase='browser';const started=Date.now();const streamed=new Map();const jsonItems=[];const shape={format:'',cards:0,own:false,cta:null};
 try{
  const b=await browser();context=await b.newContext({viewport:{width:680,height:900},locale:'en-GB'});page=await context.newPage();const reads=[];
  page.on('request',request=>{const candidate=videoCandidate(request.url());if(candidate)streamed.set(candidate.url,candidate.score);});
  page.on('response',response=>{if(!response.url().startsWith('https://www.facebook.com/api/graphql')||reads.length>=20)return;reads.push((async()=>{try{const text=await response.text();if(text.length>2000000||!text.includes(id))return;let visited=0;
   const walk=(value,depth=0)=>{if(!value||typeof value!=='object'||depth>30||++visited>10000)return;if(Array.isArray(value)){for(const child of value)walk(child,depth+1);return;}
    // Meta states the real format; several images alone usually means one creative in several placement sizes.
    if(typeof value.display_format==='string'&&/^[A-Z_]{2,30}$/.test(value.display_format)){const own=String(value.ad_archive_id||value.adArchiveID||'')===id;if(!shape.format||(own&&!shape.own)){shape.format=value.display_format;shape.own=own;if(Array.isArray(value.cards))shape.cards=value.cards.filter(c=>c&&typeof c==='object').length;const src=[value,...(Array.isArray(value.cards)?value.cards:[])].find(c=>c&&(c.cta_text||c.link_url));const cta=src&&ctaOf(src.cta_text,src.cta_type,src.link_url,src.caption);if(cta)shape.cta=cta;}}
    const video=safe(value.video_hd_url||value.video_sd_url||value.browser_native_hd_url||value.browser_native_sd_url);if(video)jsonItems.push({kind:'video',url:video,poster:safe(value.video_preview_image_url)||undefined});
    const image=safe(value.original_image_url||value.resized_image_url);if(image)jsonItems.push({kind:'image',url:image});
    for(const child of Object.values(value))walk(child,depth+1);
   };for(const line of text.replace(/^for \(;;\);\s*/, '').split('\n')){try{walk(JSON.parse(line));}catch{}}
  }catch{}})());});
  await page.route('**/*',route=>{const req=route.request();let host;try{host=new URL(req.url()).hostname;}catch{return route.abort();}if(!/\.(facebook\.com|fbcdn\.net|fbsbx\.com)$/.test('.'+host)||['media','font'].includes(req.resourceType()))return route.abort();return route.continue();});
  // The token is used only in Meta's official snapshot URL; never in the incoming URL or logs.
  const url=new URL('https://www.facebook.com/ads/archive/render_ad/');url.searchParams.set('id',id);url.searchParams.set('access_token',token);
  phase='snapshot';const response=await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:25000});
  if(!response?.ok())throw Error('META_BLOCKED');
  phase='ad-identity';await page.getByText(`Library ID: ${id}`,{exact:true}).waitFor({state:'visible',timeout:20000});
  const root=page.getByRole('main');
  phase='creative-elements';await root.locator('video,img').filter({visible:true}).first().waitFor({state:'visible',timeout:10000});
  // Wait for a real creative, not the advertiser's small profile image.
  const play=root.getByRole('button',{name:'Play Video',exact:true});
  phase='creative-ready';await Promise.any([
   page.waitForFunction(()=>document.querySelector('[aria-label="Video player"]')||Array.from(document.querySelectorAll('video,img')).some(el=>el.tagName==='VIDEO'||el.tagName==='IMG'&&el.getBoundingClientRect().width>=200&&el.getBoundingClientRect().height>=150&&/\.fbcdn\.net\//.test(el.currentSrc||el.src)),null,{timeout:15000}),
   play.first().waitFor({state:'visible',timeout:15000}),
   (async()=>{for(let i=0;i<60;i++){if(streamed.size||jsonItems.length)return;await page.waitForTimeout(250);}const error=Error('Media evidence did not arrive');error.name='TimeoutError';throw error;})()
  ]).catch(error=>{throw error.errors?.[0]||error;});
  const readRecords=()=>root.locator('video,img').evaluateAll(elements=>elements.map(el=>{
   const r=el.getBoundingClientRect();if(el.tagName==='IMG'&&(r.width<200||r.height<150||el.closest('[aria-label="Video player"]')))return null;
   return {kind:el.tagName==='VIDEO'?'video':'image',url:el.currentSrc||el.src,poster:el.tagName==='VIDEO'?el.poster:undefined};
  }).filter(Boolean));
  phase='media-source';let records=await readRecords();const hasPlayer=await root.locator('[aria-label="Video player"]').count()>0||await play.count()>0;
  // Some snapshots only create the video element after Play is pressed.
  if((hasPlayer||records.some(r=>r.kind==='video'))&&!records.some(r=>r.kind==='video'&&safe(r.url))){if(await play.count())await play.first().click({timeout:3000}).catch(()=>{});}
  for(let attempt=0;attempt<7;attempt++){await Promise.allSettled(reads);records=await readRecords();if(records.some(r=>safe(r.url))||jsonItems.length||streamed.size)break;await page.waitForTimeout(1000);}
  await Promise.allSettled(reads);
  const fallback=[...streamed.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0];
  // The exact Library ID was verified above. A CDN video request can arrive
  // before React creates its player; aborting its download must not hide that URL.
  if(fallback&&!records.some(r=>r.kind==='video'&&safe(r.url)))records.push({kind:'video',url:fallback,poster:records.find(r=>r.kind==='video')?.poster});
  if(!shape.cta?.url){const dom=await root.evaluate(m=>{const a=Array.from(m.querySelectorAll('a[href]')).find(x=>/l\.facebook\.com\/l\.php|^https?:\/\/(?!([a-z0-9-]+\.)*(facebook|fb|instagram|fbcdn)\.)/i.test(x.href));if(!a)return null;const btn=Array.from(a.querySelectorAll('div,span')).map(e=>e.textContent.trim()).filter(t=>t&&t.length<=24).pop()||'';return {href:a.href,text:btn};}).catch(()=>null);const known=/^(shop now|learn more|sign up|book now|order now|get offer|buy now|download|apply now|contact us|subscribe|get quote|see menu|watch more|send message|install now|play game|donate now|get directions|call now|listen now|see more|get started|view products|get access|request time|book a visit|find out more)$/i;const c=dom&&ctaOf(shape.cta?.text||(known.test(dom.text)?dom.text:''),shape.cta?.type,dom.href,shape.cta?.caption);if(c)shape.cta=c;}
  const items=[];for(const r of [...records,...jsonItems]){const url=safe(r.url);if(url&&!items.some(v=>v.url===url))items.push({kind:r.kind,url,poster:safe(r.poster)||undefined});}
  const posters=new Set(items.filter(i=>i.kind==='video').map(i=>i.poster));const filtered=items.filter(i=>i.kind!=='image'||!posters.has(i.url)).slice(0,20);
  return {items:filtered,displayFormat:shape.format||undefined,cards:shape.cards||undefined,cta:shape.cta||undefined,collectedAt:new Date().toISOString(),code:filtered.length?'COLLECTED':'NO_MEDIA',source:'meta-official-snapshot'};
 }catch(error){error.collectionPhase=phase;error.collectionMs=Date.now()-started;
  // Only structural counters and known public error phrases, never HTML, URLs or tokens.
  if(page)error.previewSignals=await page.evaluate(()=>({videos:document.querySelectorAll('video').length,images:document.querySelectorAll('img').length,buttons:document.querySelectorAll('button,[role="button"]').length,unavailable:/content isn't available|ad isn't available|ad is unavailable/i.test(document.body?.innerText||''),login:/log in to continue|you must log in/i.test(document.body?.innerText||'')})).catch(()=>null);
  error.streamedVideos=streamed.size;error.metadataItems=jsonItems.length;throw error;}finally{await context?.close();}
}
const inflight=new Map();
const server=http.createServer(async(req,res)=>{
 const reply=(status,body)=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 const url=new URL(req.url,'http://localhost');if(url.pathname==='/health')return reply(200,{status:'ok',collector:'owned-meta-snapshot',active,queued:waiting.length,storage:storeStatus().configured});
 const expected=process.env.COLLECTOR_SECRET||'';const supplied=req.headers['x-collector-key']||'';if(typeof supplied!=='string'||!expected||Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return reply(401,{code:'UNAUTHORIZED',items:[]});
 // Advertiser lookup by name (Meta Ad Library advertiser search).
 if(req.method==='GET'&&url.pathname==='/advertisers'){
  const q=(url.searchParams.get('q')||'').trim();if(q.length<2||q.length>80||/[\x00-\x1f<>]/.test(q))return reply(400,{code:'INVALID_REQUEST',advertisers:[]});
  // Off by default: loading Meta's Ad Library page exceeds this instance's 512 MB.
  if(process.env.ADVERTISER_BROWSER_LOOKUP!=='1')return reply(503,{code:'LOOKUP_DISABLED',advertisers:[]});
  try{await acquireExclusive();}catch{return reply(429,{code:'BUSY',advertisers:[]});}
  try{const advertisers=await findAdvertisers(await browser(),q);return reply(200,{advertisers,source:'meta-ad-library-search'});}
  catch(error){console.log(JSON.stringify({event:'advertiser_lookup_failed',reason:String(error?.message||'ERROR').slice(0,60)}));return reply(502,{code:'LOOKUP_FAILED',advertisers:[]});}
  finally{releaseExclusive();}
 }
 const id=url.searchParams.get('id')||'',token=req.headers['x-meta-token'];if(req.method!=='GET'||url.pathname!=='/creative'||!/^\d{1,30}$/.test(id)||typeof token!=='string'||token.length<20||token.length>4096||/[\s\x00-\x1f]/.test(token))return reply(400,{code:'INVALID_REQUEST',items:[]});
 const key=createHash('sha256').update(token).digest('hex')+':'+id,hit=cache.get(key);if(url.searchParams.get('refresh')!=='1'&&hit&&Date.now()<hit.until)return reply(200,hit.result);
 const refresh=url.searchParams.get('refresh')==='1';
 let work=inflight.get(key);if(!work){work=(async()=>{
  // Stored creatives come back instantly; only ads never seen before are collected.
  if(!refresh){const stored=await readStored(id);if(stored){if(cache.size>=4000)cache.delete(cache.keys().next().value);cache.set(key,{until:Date.now()+3*86400000,result:stored});return stored;}}
  await acquire();try{const result=await collect(id,token);if(result.items.length){storeCreative(id,result);if(cache.size>=4000)cache.delete(cache.keys().next().value);cache.set(key,{until:expiry(result.items),result});}return result;}finally{release();}})();inflight.set(key,work);work.finally(()=>inflight.delete(key)).catch(()=>{});}
 try{reply(200,await work);}catch(error){const code=['META_BLOCKED','BUSY','COLLECTOR_UNAVAILABLE'].includes(error.message)?error.message:error.name==='TimeoutError'?'META_PREVIEW_UNAVAILABLE':'COLLECTOR_ERROR';const phase=['browser','snapshot','ad-identity','creative-elements','creative-ready','media-source'].includes(error.collectionPhase)?error.collectionPhase:'queue';console.log(JSON.stringify({event:'collection_failed',ad:id,code,phase,durationMs:error.collectionMs||null,signals:error.previewSignals||null,streamedVideos:error.streamedVideos||0,metadataItems:error.metadataItems||0}));reply(code==='BUSY'?429:502,{code,items:[],retryAfter:4});}
});server.listen(Number(process.env.PORT||10000),'0.0.0.0');
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(async()=>{await(await browserPromise)?.close();process.exit(0);}));
