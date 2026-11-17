(function(){
"use strict";
const $=id=>document.getElementById(id), esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const homeUrl="https://ad-library-scraper-94t0.onrender.com";
const storeKey="adsnoop-live-preview-saved-v1";
const state={view:"discover",query:"",page:"",brand:"",coverage:"GB",rows:[],choices:new Map(),cursor:null,discoveryCursor:null,canFindAlternates:false,needsPageStart:false,filter:"all",sort:"reach",limit:25,theme:"",loading:false,saved:new Map(),compare:new Map(),health:null};
const mediaCache=new Map(),mediaState=new Map(),mediaQueue=[];let collectorStatus="checking",mediaActive=0;
const MEDIA_CONCURRENCY=2,MEDIA_RETRY_CODES=["BUSY","COLLECTOR_UNAVAILABLE","RATE_LIMITED"],MEDIA_MAX_ATTEMPTS=3;
let requestController=null,requestNumber=0,observer=null;
try{const entries=JSON.parse(localStorage.getItem(storeKey)||"[]");for(const ad of Array.isArray(entries)?entries:[])if(ad&&/^\d{1,30}$/.test(ad.id)&&typeof ad.copy==="string")state.saved.set(ad.id,ad);}catch(e){}
const metaUrl=id=>"https://www.facebook.com/ads/library/?id="+encodeURIComponent(id);
// Known Facebook pages were verified previously; they are identity shortcuts, not cached ad records.
const knownPages=[
 {id:"280531915302272", name:"Sharps Fitted Furniture", aliases:["sharps","sharps fitted furniture","sharps.co.uk"]},
 {id:"384841908531592", name:"Neville Johnson", aliases:["neville johnson","nevillejohnson","nevillejohnson.co.uk"]},
 {id:"180833751931315", name:"Hammonds", aliases:["hammonds","hammonds furniture","hammonds-uk.com"]}
];
function canonicalName(value){
 let v=String(value||"").trim().toLowerCase();
 try{if(/^(https?:\/\/|www\.)/.test(v)||/^[a-z\d.-]+\.(com|co\.uk|org|net|io)(\/|$)/.test(v)){const u=new URL(v.startsWith("http")?v:"https://"+v);v=u.hostname.replace(/^www\./,"").replace(/\.(co\.uk|com|org|net|io)$/,"");}}catch{}
 return v.replace(/[^a-z\d]/g,"");
}
function directAdvertiser(query){
 const q=String(query||"").trim();
 if(/^\d{1,30}$/.test(q))return {id:q,name:"Facebook Page "+q};
 const v=canonicalName(q);
 return knownPages.find(p=>p.aliases.some(a=>canonicalName(a)===v)||canonicalName(p.name)===v)||null;
}
function searchClient(query){
 const q=String(query||"").trim();if(!q)return;
 state.view="discover";state.filter="all";state.limit=25;state.theme="";
 const exact=directAdvertiser(q);
 state.query=q;
 state.choices.clear();
 state.discoveryCursor=null;
 state.canFindAlternates=Boolean(exact&&!/^\d{1,30}$/.test(q));
 state.brand=exact?.name||"";
 state.page=exact?.id||"";
 if(exact)state.choices.set(exact.id,{id:exact.id,name:exact.name,count:0});
 void runSearch(q,state.page);
}
const formatDate=s=>{if(!s)return "Unknown";const d=new Date(s.length===10?s+"T12:00:00Z":s);return Number.isFinite(d.getTime())?d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}):"Unknown"};
const reach=n=>typeof n==="number"&&Number.isFinite(n)?n.toLocaleString("en-GB"):"Not available";
function error(msg){const el=$("error");el.textContent=msg;el.hidden=!msg;}
function feedback(message){const el=$("feedback");el.textContent=message;el.hidden=!message;}
function busy(v){state.loading=v;$("searchGo").disabled=v;$("searchGo").textContent=v?"Searching…":"Search ↗";}
function safeMedia(input){try{const u=new URL(input);return u.protocol==="https:"&&u.hostname.endsWith(".fbcdn.net")&&!u.username&&!u.password&&!u.searchParams.has("access_token")?u.href:null}catch{return null}}
function save(){try{localStorage.setItem(storeKey,JSON.stringify(Array.from(state.saved.values()).slice(0,300)))}catch(e){feedback("Saved research cannot be written to this browser. Use a local download for a backup.");}}
function allRows(){return state.view==="saved"?Array.from(state.saved.values()):state.rows}
function shownRows(){
 let rows=allRows().filter(a=>{
 if(state.filter==="video")return a.format==="Video"||a.format==="Mixed"||(mediaCache.get(a.id)?.items||[]).some(i=>i.kind==="video");
 if(state.filter==="all")return true;
 return (a.platforms||[]).map(p=>String(p).toLowerCase()).includes(state.filter);
 });
 return rows.sort((a,b)=>state.sort==="oldest"?String(a.start||"").localeCompare(String(b.start||"")):state.sort==="reach"?(b.reach??-1)-(a.reach??-1):String(b.start||"").localeCompare(String(a.start||"")));
}
function showHeader(){
 $("heading").textContent=state.view==="saved"?"Your saved ideas.":state.view==="insights"?(state.brand?state.brand+" — Messaging":"Messaging map."):state.brand?state.brand+" — Active ads":"The creative library.";
 $("subheading").textContent=state.view==="saved"?"Ads saved in this browser.":state.view==="insights"?"Hooks, benefits, offers, proof and calls to action across the loaded ads.":state.brand?"Loaded from Meta's public Ad Library. Refresh the search to update.":"Search a brand to discover its Facebook advertiser pages.";
 $("metrics").style.display=state.view!=="insights"&&(state.rows.length||state.view==="saved")?"grid":"none";
 $("toolbar").style.display=state.rows.length||state.view==="saved"?"flex":"none";
 $("metricAds").textContent=String(shownRows().length).padStart(2,"0");
 $("metricBrands").textContent=state.view==="saved"?"Multiple":state.brand||"—";
 $("metricSaved").textContent=String(state.saved.size).padStart(2,"0");
 $("savedCount").textContent=state.saved.size?"("+state.saved.size+")":"";
 document.querySelectorAll("[data-view]").forEach(el=>el.classList.toggle("active",el.dataset.view===state.view));
 document.querySelectorAll("[data-filter]").forEach(el=>el.classList.toggle("active",el.dataset.filter===state.filter));
 $("comparisonBar").classList.toggle("show",state.compare.size>0);
 $("compareCount").textContent=state.compare.size+" of 3 selected";
}
function loadingCards(){
 return '<div role="status" aria-live="polite" style="grid-column:1/-1;padding:28px 0"><style>@keyframes adsnoopPulse{50%{opacity:.4}}.search-placeholder{animation:adsnoopPulse 1.4s ease-in-out infinite;background:#f0f0f3;border-radius:16px;height:220px}@media(prefers-reduced-motion:reduce){.search-placeholder{animation:none}}</style><p style="font-size:20px;font-weight:600;margin:0 0 6px">Finding your next creative inspiration</p><p style="color:#6e6e73;margin:0 0 24px">Loading ads for '+esc(state.query||state.brand)+'…</p><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px" aria-hidden="true"><div class="search-placeholder"></div><div class="search-placeholder" style="animation-delay:.15s"></div><div class="search-placeholder" style="animation-delay:.3s"></div></div></div>';
}
function empty(title,detail){return '<div class="empty"><h3>'+esc(title)+'</h3><p>'+esc(detail)+'</p></div>'}
function card(a){
 const platforms=(a.platforms||[]).join(", ")||"Platform not reported";
 const format=a.format&&a.format!=="Unknown"?a.format:"Format to be verified";
 const isSaved=state.saved.has(a.id),isCompared=state.compare.has(a.id);
 return '<article class="adcard"><div class="live-visual" data-media="'+esc(a.id)+'" data-loaded="false"><div class="creative-recovery"><span class="loadingring" aria-hidden="true"></span><strong>Preparing creative preview</strong><small>Loading only when this card is in view.</small></div></div><div class="adbody"><div class="admeta"><span>'+esc(a.pageName||state.brand||"Advertiser")+'</span><span class="tag">'+esc(format)+'</span></div><h3 class="adtitle">'+esc(a.title||"Ad creative")+'</h3><p class="adcopy adtext">'+esc(a.copy||"No copy provided by Meta.")+'</p><div class="metadata"><span>'+esc(formatDate(a.start))+'</span><span>'+esc(platforms)+'</span><span>UK reach: '+esc(reach(a.reach))+'</span></div><div class="adbottom"><button class="linkbutton" data-action="detail" data-id="'+esc(a.id)+'">View ad details ↗</button><div class="smallactions"><button class="square '+(isSaved?"on":"")+'" data-action="save" data-id="'+esc(a.id)+'" aria-label="'+(isSaved?"Remove saved ad":"Save ad")+'">'+(isSaved?"♥":"♡")+'</button><button class="square '+(isCompared?"on":"")+'" data-action="compare" data-id="'+esc(a.id)+'" aria-label="Compare ad">'+(isCompared?"✓":"⊕")+'</button></div></div></div></article>';
}
function renderCards(){
 if(observer)observer.disconnect();
 showHeader();
 renderBrands();
 const all=state.view==="insights"?[]:shownRows(),rows=all.slice(0,state.limit),hidden=all.length-rows.length;
 if(state.view==="insights"){$("cards").innerHTML='<div style="grid-column:1/-1">'+messagingView()+'</div>';$("pager").innerHTML="";$("toolbar").style.display="none";renderInsights();return}
 $("cards").innerHTML=rows.length?rows.map(card).join(""):state.loading?loadingCards():empty(state.view==="saved"?"No saved ads yet.":"No ads to display.",state.view==="saved"?"Save a creative from an advertiser search to find it here.":state.brand?"Try a different platform filter or another advertiser.":"Search an advertiser above to begin.");
 $("pager").innerHTML=hidden>0?'<button class="ghost" data-action="showmore">Show '+Math.min(25,hidden)+' more ads ('+hidden+' remaining)</button>':state.view==="discover"&&(state.cursor||state.needsPageStart)&&state.brand?'<button class="ghost" data-action="loadmore">Load more Meta ads</button>':"";
 renderInsights();
 observeMedia();
}
function addBrands(rows){
 for(const ad of rows){
  if(!ad.pageId||!ad.pageName)continue;
  const entry=state.choices.get(ad.pageId);
  if(entry)entry.count++;
  else state.choices.set(ad.pageId,{id:ad.pageId,name:ad.pageName,count:1});
 }
}
function rankedBrands(){
 const wanted=canonicalName(state.query);
 const score=choice=>{
  const name=canonicalName(choice.name);
  return name===wanted?3:name.startsWith(wanted)?2:name.includes(wanted)?1:0;
 };
 return [...state.choices.values()].sort((a,b)=>score(b)-score(a)||b.count-a.count);
}
function renderBrands(){
 const choices=rankedBrands().slice(0,45);
 const selected=state.choices.get(state.page);
 if(selected&&!choices.includes(selected))choices[choices.length-1]=selected;
 const list=$("brands");
 list.hidden=state.view!=="discover"||!choices.length;
 list.style.cssText="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:18px 0 24px";
 if(list.hidden)list.style.display="none";
 list.innerHTML='<label style="display:flex;align-items:center;gap:10px;font-size:13px;color:#6e6e73;max-width:100%">Advertiser<select id="advertiserSelect" aria-label="Choose advertiser" style="min-width:0;max-width:260px;padding:9px 32px 9px 12px;border:1px solid #d2d2d7;border-radius:10px;background:#fff;color:#1d1d1f;font:inherit">'+choices.map(c=>'<option value="'+esc(c.id)+'"'+(c.id===state.page?' selected':'')+'>'+esc(c.name)+'</option>').join("")+'</select></label>';
 if(state.discoveryCursor||state.canFindAlternates)list.insertAdjacentHTML("beforeend",'<button class="linkbutton" data-action="morebrands">Find another page</button>');
 $("advertiserSelect").addEventListener("change",e=>{
  const choice=state.choices.get(e.target.value);
  if(!choice||choice.id===state.page)return;
  state.brand=choice.name;
  state.page=choice.id;state.limit=25;
  void runSearch(state.query,choice.id);
 });
}
async function request(path,method,body,signal){
 const resp=await fetch(path,{method:method||"GET",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined,signal,cache:"no-store"});
 let data;
 try{data=await resp.json()}catch{
  if(resp.status===429)throw Object.assign(new Error("The hosting service is rate-limiting searches."),{code:"RATE_LIMITED"});
  throw Error("The research service is temporarily unavailable. Please try again.");
 }
 if(!resp.ok||data.error){const ex=new Error(data.error||"Live search failed. Status "+resp.status);ex.code=data.code||"";throw ex;}
 return data;
}
async function runSearch(query,page="",after="",moreBrands=false,appendAds=false){
 const q=(query||"").trim();if(!q&&!page)return;
 if(requestController)requestController.abort();
 const controller=new AbortController();requestController=controller;const rid=++requestNumber;
 error("");busy(true);
 if(!moreBrands&&!after&&!appendAds){
  state.rows=[];state.cursor=null;state.needsPageStart=false;
  renderCards();
 }
 feedback(moreBrands?"Looking for more advertiser pages…":"Loading active ads from Meta…");
 const params=new URLSearchParams({q:q||page,coverage:state.coverage});
 if(page)params.set("page",page);
 if(after)params.set("after",after);
 try{
  const data=await request("/api/ads?"+params,"GET",null,controller.signal);
  if(rid!==requestNumber)return;
  const rows=Array.isArray(data.ads)?data.ads:[];
  state.query=q;
  if(!page){
   addBrands(rows);
   state.discoveryCursor=data.nextCursor||null;
   if(moreBrands){
    state.canFindAlternates=false;
    renderBrands();
    feedback(state.choices.size>1?"":"No other advertiser pages were found.");
    return;
   }
   const match=rankedBrands()[0];
   state.page=match?.id||"";
   state.brand=match?.name||"";
   state.rows=rows.filter(ad=>ad.pageId===state.page);
   state.cursor=data.pageId===state.page?data.nextCursor||null:null;
   // A term-search cursor cannot be used to paginate a specific advertiser.
   state.needsPageStart=Boolean(match&&data.pageId!==state.page&&data.nextCursor);
  }else{
   state.page=page;state.brand=rows[0]?.pageName||state.brand||q;
   const seen=new Set(state.rows.map(ad=>ad.id));
   state.rows=after||appendAds?[...state.rows,...rows.filter(ad=>!seen.has(ad.id))]:rows;
   state.cursor=data.nextCursor||null;
   state.needsPageStart=false;
  }
  feedback(state.rows.length?"":page?"Meta returned no active ads for this advertiser in the selected countries.":"No matching advertiser pages returned. Try another search.");
  busy(false);
  renderCards();
 }catch(err){
  if(controller.signal.aborted)return;
  const code=err.code||"";
  const guidance=["META_EXPIRED","NOT_CONFIGURED","META_RECONNECT"].includes(code)?" The account owner may need to reconnect Meta on the original website.":code==="RATE_LIMITED"?" Try again in a minute.":"";
  error(String(err.message||"Search failed.")+guidance);
  feedback("");
  busy(false);
  renderCards();
 }finally{if(rid===requestNumber)busy(false)}
}
function mediaMessage(code){
 const messages={
 NOT_COLLECTED:["Creative not collected","The preview collector has not supplied this media."],
 NO_MEDIA:["Creative unavailable","Meta did not return an extractable image or playable video."],
 META_BLOCKED:["Meta restricted the preview","This particular ad could not be previewed through the collector."],
 META_PREVIEW_UNAVAILABLE:["Meta preview unavailable","The official snapshot did not include extractable media."],
 NOT_CONFIGURED:["Creative connection needed","Media access is not currently configured."],
 META_STORAGE_UNAVAILABLE:["Connection unavailable","The private Meta token store cannot be reached."],
 HOST_RATE_LIMITED:["Media hosting is rate-limited","The free media collector is returning HTTP 429. Open the ad on Meta while hosting access is restored."],
 COLLECTOR_UNAVAILABLE:["Collector unavailable","The media service did not respond. You can still inspect this ad on Meta."],
 BUSY:["Collector busy","The media service is processing other ads. Retry in a moment."],
 RATE_LIMITED:["Too many preview requests","Please wait a minute, then retry this preview."],
 FAILED:["Preview unavailable","The image or video could not be played in this browser."]
 };
 return messages[code]||["Creative preview unavailable","The creative could not be retrieved. Ad details remain available."];
}
function mediaFallback(node,id,code){
 if(!node||!node.isConnected)return;
 const [title,desc]=mediaMessage(code);
 node.innerHTML='<div class="creative-recovery"><strong>'+esc(title)+'</strong><small>'+esc(desc)+'</small><a target="_blank" rel="noopener noreferrer" href="'+metaUrl(id)+'">View creative on Meta ↗</a><button data-action="retrymedia" data-id="'+esc(id)+'">Retry preview</button></div>';
}
function displayMedia(node,id,items){
 if(!node||!node.isConnected)return;
 const item=items[0];
 if(!item){mediaFallback(node,id,"NO_MEDIA");return}
 const media=document.createElement(item.kind==="video"?"video":"img");
 if(item.kind==="video"){media.controls=true;media.muted=true;media.loop=true;media.playsInline=true;media.preload="metadata";if(item.poster&&safeMedia(item.poster))media.poster=item.poster;media.setAttribute("aria-label","Meta ad video creative");}
 else media.alt="Original Meta Ad Library creative";
 media.onerror=()=>{mediaCache.delete(id);mediaState.set(id,{status:"failed",code:"FAILED",attempts:0});mediaFallback(node,id,"FAILED");node.dataset.loaded="failed"};
 media.src=item.url;
 node.replaceChildren(media);node.dataset.loaded="done";
 if(items.length>1){
  const counter=document.createElement("button");
  counter.className="square";counter.style.cssText="position:absolute;bottom:12px;right:12px;background:white;width:auto;padding:0 12px;border-radius:50px;";
  let index=0;counter.textContent="1 / "+items.length+" ›";
  counter.onclick=e=>{e.preventDefault();index=(index+1)%items.length;const next=items[index];const changed=document.createElement(next.kind==="video"?"video":"img");if(next.kind==="video"){changed.controls=true;changed.muted=true;changed.playsInline=true;changed.preload="metadata";if(next.poster)changed.poster=next.poster}else changed.alt="Meta ad creative";changed.onerror=()=>mediaFallback(node,id,"FAILED");changed.src=next.url;node.replaceChild(changed,node.firstChild);counter.textContent=(index+1)+" / "+items.length+" ›";};
  node.appendChild(counter);
 }
}
// Media loading is keyed by ad ID, not by DOM node, so re-rendering cards
// (filters, saving, comparing) never discards finished or in-flight work.
function mediaNodes(id){return Array.from(document.querySelectorAll('[data-media="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]'))}
function mediaPending(node,title,detail){
 if(node.dataset.loaded==="done")return;
 const key=title+"|"+detail;if(node.dataset.loaded==="loading"&&node.dataset.pending===key)return;
 node.dataset.loaded="loading";node.dataset.pending=key;
 node.innerHTML='<div class="creative-recovery"><span class="loadingring" aria-hidden="true"></span><strong>'+esc(title)+'</strong><small>'+esc(detail)+'</small></div>';
}
function paintMedia(id){
 const nodes=mediaNodes(id);if(!nodes.length)return;
 const cached=mediaCache.get(id),st=mediaState.get(id);
 for(const node of nodes){
  if(cached){if(node.dataset.loaded!=="done")displayMedia(node,id,cached.items);continue}
  if(!st)continue;
  if(st.status==="failed"){if(node.dataset.loaded!=="failed"){mediaFallback(node,id,st.code);node.dataset.loaded="failed"}continue}
  if(st.status==="loading")mediaPending(node,st.attempts>0?"Retrying creative preview":"Collecting creative from Meta","This usually takes 10–20 seconds the first time.");
  else{const ahead=mediaQueue.indexOf(id);mediaPending(node,"Queued for preview",ahead>0?ahead+" ahead of this ad":"Starting shortly…")}
 }
}
function paintQueue(){for(const id of mediaQueue)paintMedia(id)}
function requestMedia(id,{refresh=false,priority=false}={}){
 if(!id)return;
 if(collectorStatus==="rate-limited"){mediaState.set(id,{status:"failed",code:"HOST_RATE_LIMITED",attempts:0});paintMedia(id);return}
 if(refresh){mediaCache.delete(id);mediaState.delete(id);for(const n of mediaNodes(id))n.dataset.loaded="false"}
 if(mediaCache.has(id)){paintMedia(id);return}
 const st=mediaState.get(id);
 if(st&&(st.status==="loading"||st.status==="failed")){paintMedia(id);return}
 if(st&&st.status==="queued"){if(priority){mediaQueue.splice(mediaQueue.indexOf(id),1);mediaQueue.unshift(id);paintQueue()}else paintMedia(id);return}
 mediaState.set(id,{status:"queued",attempts:0,refresh});
 if(priority)mediaQueue.unshift(id);else mediaQueue.push(id);
 paintQueue();pumpMedia();
}
function deprioritiseMedia(id){
 const at=mediaQueue.indexOf(id);if(at<0||at===mediaQueue.length-1)return;
 mediaQueue.splice(at,1);mediaQueue.push(id);paintQueue();
}
function pumpMedia(){
 while(mediaActive<MEDIA_CONCURRENCY&&mediaQueue.length){
  const id=mediaQueue.shift(),st=mediaState.get(id);
  if(!st||st.status!=="queued")continue;
  // The advertiser changed and this ad is no longer on the page.
  if(!mediaNodes(id).length){mediaState.delete(id);continue}
  st.status="loading";mediaActive++;paintMedia(id);
  (async()=>{
   let data;
   try{
    const resp=await fetch("/api/media?id="+encodeURIComponent(id)+(st.refresh?"&refresh=1":""),{signal:AbortSignal.timeout(115000),cache:"no-store"});
    data=await resp.json().catch(()=>({code:resp.status===429?"RATE_LIMITED":"COLLECTOR_UNAVAILABLE",items:[]}));
   }catch{data={code:"COLLECTOR_UNAVAILABLE",items:[]}}
   const items=(Array.isArray(data.items)?data.items:[]).filter(i=>i&&["video","image"].includes(i.kind)&&safeMedia(i.url)).map(i=>({...i,url:safeMedia(i.url),poster:safeMedia(i.poster)}));
   if(items.length){mediaCache.set(id,{items,collectedAt:data.collectedAt});mediaState.set(id,{status:"done",attempts:st.attempts})}
   else if(MEDIA_RETRY_CODES.includes(data.code)&&st.attempts+1<MEDIA_MAX_ATTEMPTS){
    st.attempts++;st.status="queued";st.refresh=false;
    // Back off, then rejoin the queue behind ads that have not been tried yet.
    setTimeout(()=>{if(mediaState.get(id)===st&&st.status==="queued"){mediaQueue.push(id);paintQueue();pumpMedia()}},Math.min(4000*st.attempts,12000));
   }
   else mediaState.set(id,{status:"failed",code:data.code||"NO_MEDIA",attempts:st.attempts});
  })().finally(()=>{mediaActive--;paintMedia(id);paintQueue();pumpMedia()});
 }
}
function observeMedia(){
 if(observer)observer.disconnect();
 observer=new IntersectionObserver(entries=>{
  for(const e of entries){
   const id=e.target.dataset.media;
   // Cards in view jump the queue; cards scrolled past give way to them.
   if(e.isIntersecting)requestMedia(id,{priority:true});else deprioritiseMedia(id);
  }
 },{rootMargin:"300px 0px",threshold:.01});
 document.querySelectorAll("[data-media]").forEach(el=>{observer.observe(el);paintMedia(el.dataset.media)});
}
// Messaging map: deterministic rules applied to loaded ad copy. Ported from
// lib/messaging.ts so the preview and the original app classify identically.
const messageCategories=[
 {id:"hooks",label:"Hooks",question:"What earns attention?"},
 {id:"benefits",label:"Benefits",question:"What changes for the customer?"},
 {id:"offers",label:"Offers",question:"What makes acting attractive?"},
 {id:"proof",label:"Proof & reassurance",question:"What builds confidence?"},
 {id:"actions",label:"Next steps",question:"What does the ad ask people to do?"}
];
const messageRules=[
 {id:"tension",category:"hooks",label:"Everyday frustrations",match:/\b(clutter|crammed|dark corners|nothing to wear|struggling|tired of|messy)\b/i,test:"Open with one frustration your customers actually describe. Show how your product addresses it; keep the offer unchanged."},
 {id:"transformation",category:"hooks",label:"Transformation",match:/\b(transform\w*|makeover|before.?and.?after|refresh|renew|upgrade)\b/i,test:"Test a clear before-and-after story against your current opening. Use an outcome you can demonstrate."},
 {id:"identity",category:"hooks",label:"Lifestyle & identity",match:/\b(your style|own unique|expression|way you live|things you love|home feels|unwind|relax)\b/i,test:"Test an opening about the customer’s desired way of life, followed by a concrete product benefit."},
 {id:"discovery",category:"hooks",label:"Discovery & curiosity",match:/\b(discover|explore|introducing|meet|what.?s inside|inside that)\b/i,test:"Give the viewer a specific reason to keep watching. Reveal one useful product detail instead of a vague teaser."},
 {id:"space",category:"benefits",label:"Space & organisation",match:/\b(storage|maximi[sz]\w*|more space|every inch|organi[sz]\w*|space.saving)\b/i,test:"Demonstrate one practical benefit visually. Compare the benefit-led opening against your existing creative."},
 {id:"personal",category:"benefits",label:"Made for you",match:/\b(bespoke|tailored|fitted|personali[sz]\w*|designed around)\b/i,test:"Show how your solution adapts to a specific customer need. Keep the audience, offer and landing page consistent."},
 {id:"choice",category:"benefits",label:"Style & choice",match:/\b(colou?rs?|styles?|finishes|collection)\b/i,test:"Help the customer picture one relevant option. Test a focused example against a broad product showcase."},
 {id:"ease",category:"benefits",label:"Ease & comfort",match:/\b(easy|easier|effortless|smooth|comfort\w*|seamless\w*)\b/i,test:"Show a moment that becomes easier with your product. Measure qualified responses rather than attention alone."},
 {id:"saving",category:"offers",label:"Price incentive",match:/\b(sale|half.price|discount|\d+\s*%\s*off|save\s*£|price match|match any)\b/i,test:"If you have a genuine offer, test clearer presentation of its value. Keep the actual offer and eligibility consistent."},
 {id:"free",category:"offers",label:"Free first step",match:/\bfree\b/i,test:"Test a low-commitment first step that you actually provide. Compare lead quality as well as response volume."},
 {id:"finance",category:"offers",label:"Payment flexibility",match:/\b(finance|deposit|pay monthly|interest.free)\b/i,test:"If payment options apply, test explaining them clearly with the relevant terms. Do not invent a financial offer."},
 {id:"endorsement",category:"proof",label:"Ratings & endorsement",match:/\b(which|recommended|award\w*|accredited|rated|reviews?|stars?)\b/i,test:"Place your own substantiated endorsement beside the main benefit. Compare against the same ad without that proof."},
 {id:"guarantee",category:"proof",label:"Guarantee & longevity",match:/\b(guarantee|warranty|\d+[- ]?year|years? of|since\s+\d{4}|craftsmanship|established)\b/i,test:"Address one buying objection with evidence you can substantiate. Test the placement of reassurance, not a borrowed competitor claim."},
 {id:"trust",category:"proof",label:"Popularity & trust",match:/\b(trusted|no\.?\s*1|number one|customers?|homeowners|bestsell\w*|leading)\b/i,test:"Use your own customer evidence to support a specific benefit. Judge the test by qualified leads or purchases."},
 {id:"book",category:"actions",label:"Book a visit",match:/\b(book|design visit|appointment)\b/i,test:"Make the next step and what happens afterwards explicit. Compare the CTA wording while holding the rest of the ad constant."},
 {id:"brochure",category:"actions",label:"Download a brochure",match:/\b(download|brochure)\b/i,test:"Explain what the download helps someone decide. Track downstream lead quality, not just downloads."},
 {id:"shop",category:"actions",label:"Shop or order",match:/\b(shop|buy|order)\b/i,test:"Test a direct purchase next step against your current CTA. Keep the destination and offer identical."},
 {id:"learn",category:"actions",label:"Explore or learn",match:/\b(learn more|find out|discover|explore)\b/i,test:"Tell people exactly what they will find next. Compare a specific CTA against a generic learn-more prompt."}
];
const copyPattern=a=>String(a.copy||"").toLowerCase().replace(/\s+/g," ").trim();
function messagingThemes(ads){
 return messageRules.map(rule=>{
  const evidence={};
  const matched=ads.filter(ad=>{
   const copy=ad.copy==="No ad copy provided by Meta."?"":String(ad.copy||"");
   const title=ad.title==="Ad creative"?"":String(ad.title||"");
   const sentence=(copy+"\n"+title).split(/(?<=[.!?])\s+|\n+/).map(s=>s.trim()).filter(Boolean).find(s=>rule.match.test(s));
   if(sentence)evidence[ad.id]=sentence;return !!sentence;
  });
  return {...rule,ads:matched,evidence};
 }).filter(t=>t.ads.length).sort((a,b)=>b.ads.length-a.ads.length||a.label.localeCompare(b.label));
}
function themeExamples(theme){
 const seen=new Set();
 return [...theme.ads].sort((a,b)=>(b.reach??-1)-(a.reach??-1)).filter(a=>{const k=copyPattern(a);if(seen.has(k))return false;seen.add(k);return true});
}
const notesKey=()=>"adsnoop-messaging-notes-v1:"+(state.page||state.brand);
function readNotes(){try{const v=JSON.parse(localStorage.getItem(notesKey())||"{}");return v&&typeof v==="object"?v:{}}catch{return {}}}
function writeNote(id,text){const n=readNotes();if(text)n[id]=text;else delete n[id];try{localStorage.setItem(notesKey(),JSON.stringify(n))}catch{}}
function highlight(sentence,re){
 const m=sentence.match(re);if(!m)return esc(sentence);
 const i=m.index;return esc(sentence.slice(0,i))+"<mark>"+esc(m[0])+"</mark>"+esc(sentence.slice(i+m[0].length));
}
function messagingView(){
 const ads=state.rows;
 if(!ads.length)return empty("No messaging to map yet.","Search an advertiser above, then open Messaging to see its hooks, benefits, offers and proof points.");
 const themes=messagingThemes(ads),total=ads.length,distinct=new Set(ads.map(copyPattern)).size;
 const mapped=new Set(themes.flatMap(t=>t.ads.map(a=>a.id))).size;
 if(!themes.some(t=>t.id===state.theme))state.theme=themes[0]?.id||"";
 const cols=messageCategories.map(cat=>{
  const list=themes.filter(t=>t.category===cat.id);
  return '<section class="msg-col msg-'+cat.id+'"><div class="msg-colhead"><h3>'+esc(cat.label)+'</h3><span>'+list.length+'</span></div><p class="msg-q">'+esc(cat.question)+'</p>'+
   (list.length?list.map(t=>{const pct=Math.round(t.ads.length/total*100);return '<button class="msg-theme'+(t.id===state.theme?' on':'')+'" data-theme="'+t.id+'" aria-pressed="'+(t.id===state.theme)+'"><span class="msg-label">'+esc(t.label)+'</span><span class="msg-count">'+t.ads.length+'</span><span class="msg-bar"><i style="width:'+pct+'%"></i></span><span class="msg-pct">'+pct+'% of ads</span></button>'}).join(""):'<p class="msg-none">Not detected in the loaded copy.</p>')+'</section>';
 }).join("");
 const t=themes.find(x=>x.id===state.theme);
 let detail="";
 if(t){
  const ex=themeExamples(t),note=readNotes()[t.id]||"";
  detail='<section class="msg-detail" aria-live="polite"><div class="msg-dhead"><div><p class="eyebrow">'+esc(messageCategories.find(c=>c.id===t.category).label)+'</p><h3>'+esc(t.label)+'</h3><p>'+t.ads.length+' of '+total+' ads ('+Math.round(t.ads.length/total*100)+'%) · '+ex.length+' distinct message'+(ex.length===1?'':'s')+'</p></div></div>'+
   '<div class="msg-dgrid"><div><h4>How '+esc(state.brand||"they")+' say it</h4><ul class="msg-evidence">'+ex.slice(0,8).map(a=>'<li><blockquote>“'+highlight(t.evidence[a.id],t.match)+'”</blockquote><div class="msg-meta"><span>'+(a.reach!=null?'UK reach '+reach(a.reach):'Reach not reported')+' · since '+esc(formatDate(a.start))+'</span><button class="linkbutton" data-action="detail" data-id="'+esc(a.id)+'">View ad</button></div></li>').join("")+'</ul>'+(ex.length>8?'<p class="msg-more">+ '+(ex.length-8)+' more variations in the loaded ads.</p>':'')+'</div>'+
   '<div class="msg-test"><h4>Your test direction</h4><textarea data-note="'+t.id+'" rows="6" placeholder="'+esc(t.test)+'">'+esc(note)+'</textarea><p>Starts from a suggested direction; edit it for your brand. Saved in this browser.</p></div></div></section>';
 }
 return '<div class="msg-wrap"><div class="msg-top" style="align-items:center"><div><p>'+total+' ads analysed · '+distinct+' distinct copy variations · '+themes.length+' themes · '+(total-mapped)+' ads with no detected theme</p></div><button class="ghost" data-action="exportmsg">Export map ↓</button></div><div class="msg-grid">'+cols+'</div>'+detail+'<p class="notice">Themes are detected from ad text with fixed rules; ads can appear in several themes. Claims are not verified, and this is not a measure of performance. English copy only.</p></div>';
}
function exportMessaging(){
 const themes=messagingThemes(state.rows),notes=readNotes();
 const text="MESSAGING MAP — "+(state.brand||"Advertiser")+"\nGenerated "+new Date().toISOString().slice(0,10)+" from "+state.rows.length+" loaded ads (UK). Themes are detected from ad text; claims are not verified.\n\n"+messageCategories.map(c=>c.label.toUpperCase()+"\n"+(themes.filter(t=>t.category===c.id).map(t=>"• "+t.label+" — "+t.ads.length+" ads\n  Test direction: "+(notes[t.id]||t.test)+"\n"+themeExamples(t).slice(0,5).map(a=>"  “"+t.evidence[a.id]+"”\n  "+metaUrl(a.id)).join("\n")).join("\n\n")||"  None detected")).join("\n\n");
 const url=URL.createObjectURL(new Blob([text],{type:"text/plain;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download="adsnoop-messaging-"+(state.brand||"map").toLowerCase().replace(/[^a-z0-9]+/g,"-")+".txt";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function renderInsights(){
 const rows=state.rows,themes=messagingThemes(rows).slice(0,4),total=Math.max(1,rows.length);
 $("themePanel").innerHTML=rows.length&&themes.length?themes.map(t=>'<div class="themebar"><div class="rowtop"><span>'+esc(t.label)+'</span><span>'+t.ads.length+' / '+rows.length+' ads</span></div><div class="track"><div class="fill" style="width:'+Math.round(t.ads.length/total*100)+'%"></div></div></div>').join("")+'<button class="pill sm" data-view="insights" style="margin-top:22px">Open the messaging map →</button>':'<p>Select an advertiser to see recurring message themes.</p>';
}
function findAd(id){return state.rows.find(a=>a.id===id)||state.saved.get(id)||state.compare.get(id)}
function modal(title,content){$("modalTitle").textContent=title;$("modalContent").innerHTML=content;$("modalOverlay").classList.add("open");$("closeModal").focus();}
function adDetails(id){
 const a=findAd(id);if(!a)return;
 modal(a.pageName||"Ad creative",'<p>'+esc(a.title||"Meta advertising record")+'</p><div class="modalquote adtext">'+esc(a.copy||"No copy provided.")+'</div><div class="modal-row"><span>Meta Library ID</span><strong>'+esc(a.id)+'</strong></div><div class="modal-row"><span>Running since</span><strong>'+esc(formatDate(a.start))+'</strong></div><div class="modal-row"><span>Publisher platforms</span><strong>'+esc((a.platforms||[]).join(", ")||"Unknown")+'</strong></div><div class="modal-row"><span>UK reach</span><strong>'+esc(reach(a.reach))+'</strong></div><div class="modal-row"><span>Creative format</span><strong>'+esc(a.format||"Unknown")+'</strong></div><p class="notice">UK reach is reported when provided by the API and is not ad spend or performance.</p><a class="pill" href="'+metaUrl(a.id)+'" target="_blank" rel="noopener noreferrer">View on Meta ↗</a>');
}
function compareView(){
 const items=Array.from(state.compare.values());if(!items.length)return;
 modal("Creative comparison",'<p>Review ad messaging side by side. No conversion or spend data is implied.</p><div class="cmpcols">'+items.map(a=>'<div class="cmpcol"><h4>'+esc(a.pageName||"Advertiser")+'</h4><p><strong>'+esc(a.title||"Ad creative")+'</strong></p><p class="adtext">'+esc(a.copy||"")+'</p><p>Since '+esc(formatDate(a.start))+'</p></div>').join("")+'</div>');
}
function setView(view){
 state.view=view;
 $("brands").hidden=true;
 if(view==="saved")feedback("Your saved creative records are stored locally in this browser. For an up-to-date ad, open its official Meta link.");
 else if(view==="insights")feedback("");
 else feedback(state.brand?"":"Search a brand above to discover active advertisers.");
 renderCards();
 $("research").scrollIntoView({behavior:"smooth"});
}
async function health(){
 const status=$("status"),details=$("serviceDetails");
 try{
  const r=await fetch("/api/collector-status",{cache:"no-store",signal:AbortSignal.timeout(16000)});
  const c=await r.json();
  collectorStatus=c.status==="rate-limited"?"rate-limited":c.status==="reachable"?"reachable":"unavailable";
  if(collectorStatus==="rate-limited"){
   details.innerHTML='<div class="errmsg"><strong>Creative previews temporarily restricted by hosting.</strong> The media collector returns HTTP 429. Ad text and Meta Library links still work. <a href="https://dashboard.render.com/web/srv-db417f3bc2fs73c95390" target="_blank" rel="noopener noreferrer">Review collector on Render ↗</a></div>';
   renderCards();
  }
 }catch{collectorStatus="unavailable";}

 try{
  const h=await request("/api/health","GET",null,AbortSignal.timeout(20000));state.health=h;
  const s=h.connection?.state||"unknown",message=h.connection?.message||"";
  const connected=["connected","renew-soon"].includes(s);
  const media=h.mediaCollector?.configured===true;
  status.innerHTML='<span><i class="statusdot '+(connected?"ok":"bad")+'"></i>Meta API: '+esc(connected?"Connected":s.replace(/-/g," "))+'</span><span><i class="statusdot '+(media?"ok":"bad")+'"></i>Image/video collector: '+esc(media?"Configured":"Needs attention")+'</span>';
  details.innerHTML+=(!connected||!media)?'<div class="live-info">'+esc(message||(!connected?"Live Meta access needs attention.":""))+' '+(media?"":"Creative-media connection is not fully configured.")+' <a href="'+homeUrl+'/connection" target="_blank" rel="noopener noreferrer">Owner connection settings ↗</a></div>':"";
 }catch{
  status.innerHTML='<span><i class="statusdot bad"></i>Could not verify the Meta API connection</span>';
  details.innerHTML='<div class="live-info">Live status could not be checked. Search may still work; if it fails, saved ideas remain available.</div>';
 }
}
$("searchForm").addEventListener("submit",e=>{
 e.preventDefault();
 searchClient($("searchInput").value);
 $("research").scrollIntoView({behavior:"smooth"});
});
$("coverage").addEventListener("change",e=>{state.coverage=e.target.value;if(state.query)searchClient(state.query)});
$("sort").value=state.sort;
$("sort").addEventListener("change",e=>{state.sort=e.target.value;state.limit=25;renderCards()});
document.addEventListener("click",e=>{
 let b=e.target.closest("[data-query]");if(b){$("searchInput").value=b.dataset.query;searchClient(b.dataset.query);$("research").scrollIntoView({behavior:"smooth"});return}
 b=e.target.closest("[data-page]");if(b){if(b.dataset.page!==state.page||(!state.rows.length&&!state.loading)){state.brand=b.dataset.name;state.page=b.dataset.page;runSearch(state.query||state.brand,state.page);}return}
 b=e.target.closest("[data-view]");if(b){setView(b.dataset.view);return}
 b=e.target.closest("[data-theme]");if(b){state.theme=b.dataset.theme;renderCards();document.querySelector(".msg-detail")?.scrollIntoView({behavior:"smooth",block:"nearest"});return}
 b=e.target.closest("[data-filter]");if(b){state.filter=b.dataset.filter;state.limit=25;renderCards();return}
 b=e.target.closest("[data-action]");if(!b)return;
 const {action,id}=b.dataset;
 if(action==="detail")adDetails(id);
 if(action==="save"){const a=findAd(id);if(a){if(state.saved.has(id))state.saved.delete(id);else state.saved.set(id,a);save();renderCards();}}
 if(action==="compare"){const a=findAd(id);if(a){if(state.compare.has(id))state.compare.delete(id);else if(state.compare.size<3)state.compare.set(id,a);else{error("Select up to three ads to compare.");return}renderCards();}}
 if(action==="showmore"){state.limit+=25;renderCards()}
 if(action==="exportmsg")exportMessaging();
 if(action==="retrymedia")requestMedia(id,{refresh:true,priority:true});
 if(action==="loadmore"&&(state.cursor||state.needsPageStart)){state.limit+=25;runSearch(state.query||state.brand,state.page,state.cursor||"",false,state.needsPageStart)}
 if(action==="morebrands"&&!state.loading&&(state.discoveryCursor||state.canFindAlternates))runSearch(state.query,"",state.discoveryCursor||"",true);
});
document.addEventListener("input",e=>{const t=e.target.closest("[data-note]");if(t)writeNote(t.dataset.note,t.value.trim())});
$("closeModal").onclick=()=>$("modalOverlay").classList.remove("open");
$("modalOverlay").onclick=e=>{if(e.target===$("modalOverlay"))$("modalOverlay").classList.remove("open")};
document.addEventListener("keydown",e=>{if(e.key==="Escape")$("modalOverlay").classList.remove("open")});
$("compareOpen").onclick=compareView;
$("compareClear").onclick=()=>{state.compare.clear();renderCards()};
renderCards();health();
})();