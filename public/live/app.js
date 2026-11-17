(function(){
"use strict";
const $=id=>document.getElementById(id), esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const homeUrl="https://ad-library-scraper-94t0.onrender.com";
const storeKey="adsnoop-live-preview-saved-v1";
const state={view:"discover",query:"",page:"",brand:"",coverage:"GB",rows:[],discovery:[],cursor:null,discoveryCursor:null,filter:"all",sort:"newest",loading:false,saved:new Map(),compare:new Map(),health:null};
const mediaCache=new Map(),mediaRunning=new Set(),pendingMedia=[];let collectorStatus="checking";
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
 state.view="discover";state.filter="all";
 const exact=directAdvertiser(q);
 if(exact){state.brand=exact.name;state.page=exact.id;void runSearch(q,exact.id);}
 else{state.brand="";state.page="";void runSearch(q);}
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
 $("heading").textContent=state.view==="saved"?"Your saved ideas.":state.view==="insights"?"Discover the patterns.":state.brand?state.brand+" — Active ads":"The creative library.";
 $("subheading").textContent=state.view==="saved"?"Ads saved in this browser.":state.brand?"Loaded from Meta's public Ad Library. Refresh the search to update.":"Search a brand to discover its Facebook advertiser pages.";
 $("metrics").style.display=state.rows.length||state.view==="saved"?"grid":"none";
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
 const rows=shownRows();
 $("cards").innerHTML=rows.length?rows.map(card).join(""):empty(state.view==="saved"?"No saved ads yet.":"No ads to display.",state.view==="saved"?"Save a creative from an advertiser search to find it here.":state.brand?"Try a different platform filter or another advertiser.":"Search an advertiser above to begin.");
 $("pager").innerHTML=state.view==="discover"&&state.cursor&&state.brand?'<button class="ghost" data-action="loadmore">Load more Meta ads</button>':"";
 renderInsights();
 observeMedia();
}
function showBrands(data,append=false){
 const rows=Array.isArray(data.ads)?data.ads:[];
 const ids=new Map();
 for(const ad of [...(append?state.discovery:[]),...rows]){
   if(!ad.pageId||!ad.pageName)continue;
   const item=ids.get(ad.pageId);
   if(item)item.count+=1;
   else ids.set(ad.pageId,{id:ad.pageId,name:ad.pageName,count:1});
 }
 state.discovery=[...ids.values()].flatMap(entry=>Array.from({length:entry.count},()=>({pageId:entry.id,pageName:entry.name})));
 const choices=Array.from(ids.values()).sort((a,b)=>b.count-a.count).slice(0,45);
 // Do not require an extra advertiser selection when a client can be identified confidently.
 if(!append&&choices.length){
  const wanted=canonicalName(state.query);
  const exact=choices.filter(c=>canonicalName(c.name)===wanted);
  const match=exact.length===1?exact[0]:(choices.length===1?choices[0]:null);
  if(match){
   state.brand=match.name;state.page=match.id;
   $("brands").hidden=true;
   void runSearch(state.query,match.id);
   return true;
  }
 }
 $("brands").hidden=!choices.length;
 $("brands").innerHTML=choices.map(c=>'<button class="brandchoice" data-page="'+esc(c.id)+'" data-name="'+esc(c.name)+'"><strong>'+esc(c.name)+'</strong><span>'+c.count+' matching ad records · Select advertiser ↗</span></button>').join("");
 state.discoveryCursor=data.nextCursor||null;
 if(state.discoveryCursor)$("brands").insertAdjacentHTML("beforeend",'<button class="brandchoice" data-action="morebrands"><strong>Find more matching pages →</strong><span>Retrieve the next page of advertiser results</span></button>');
 feedback(choices.length?"Several advertisers match this search. Choose the correct one to load its ads.":"No matching advertiser pages returned. Try another search.");
 return false;
}
async function request(path,method,body,signal){
 const resp=await fetch(path,{method:method||"GET",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined,signal,cache:"no-store"});
 let data;
 try{data=await resp.json()}catch{throw Error("The server returned an invalid response.");}
 if(!resp.ok||data.error){const ex=new Error(data.error||"Live search failed. Status "+resp.status);ex.code=data.code||"";throw ex;}
 return data;
}
async function runSearch(query,page="",after="",discoveryAppend=false){
 const q=(query||"").trim();if(!q&&!page)return;
 if(requestController)requestController.abort();
 const controller=new AbortController();requestController=controller;const rid=++requestNumber;
 error("");busy(true);feedback("Retrieving current advertising records from Meta…");
 if(!after){state.rows=[];state.cursor=null;if(!page){state.brand="";state.page="";state.discovery=[];$("brands").hidden=true;}}
 const params=new URLSearchParams({q:q||page,coverage:state.coverage});
 if(page)params.set("page",page);else params.set("discover","1");
 if(after)params.set("after",after);
 try{
  const data=await request("/api/ads?"+params,"GET",null,controller.signal);
  if(rid!==requestNumber)return;
  state.query=q;
  if(!page){
   state.brand="";state.rows=[];state.cursor=null;
   if(!showBrands(data,discoveryAppend))renderCards();
  }else{
   state.page=page;state.brand=state.brand||data.ads?.[0]?.pageName||q;
   state.rows=after?[...state.rows,...(data.ads||[]).filter(a=>!state.rows.some(old=>old.id===a.id))]:data.ads||[];
   state.cursor=data.nextCursor||null;
   $("brands").hidden=true;
   feedback(state.rows.length?"":"Meta returned no active ads for this advertiser in the selected countries.");
   renderCards();
  }
 }catch(err){
  if(controller.signal.aborted)return;
  const code=err.code||"";
  const guidance=["META_EXPIRED","NOT_CONFIGURED","META_RECONNECT"].includes(code)?" The account owner may need to reconnect Meta on the original website.":code==="RATE_LIMITED"?" Try again in a minute.":"";
  error(String(err.message||"Search failed.")+guidance);
  feedback("");
  if(!page)showHeader();
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
 BUSY:["Collector busy","The media service is currently processing other ads."],
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
 media.onerror=()=>{mediaFallback(node,id,"FAILED")};
 media.src=item.url;
 node.replaceChildren(media);
 if(items.length>1){
  const counter=document.createElement("button");
  counter.className="square";counter.style.cssText="position:absolute;bottom:12px;right:12px;background:white;width:auto;padding:0 12px;border-radius:50px;";
  let index=0;counter.textContent="1 / "+items.length+" ›";
  counter.onclick=e=>{e.preventDefault();index=(index+1)%items.length;const next=items[index];const changed=document.createElement(next.kind==="video"?"video":"img");if(next.kind==="video"){changed.controls=true;changed.muted=true;changed.playsInline=true;changed.preload="metadata";if(next.poster)changed.poster=next.poster}else changed.alt="Meta ad creative";changed.onerror=()=>mediaFallback(node,id,"FAILED");changed.src=next.url;node.replaceChild(changed,node.firstChild);counter.textContent=(index+1)+" / "+items.length+" ›";};
  node.appendChild(counter);
 }
}
function queueMedia(node,id,refresh=false){
 if(!node||!node.isConnected)return;
 if(collectorStatus==="rate-limited"){mediaFallback(node,id,"HOST_RATE_LIMITED");return;}
 if(!refresh&&mediaCache.has(id)){const data=mediaCache.get(id);displayMedia(node,id,data.items);return}
 if(!refresh&&node.dataset.loaded==="loading")return;
 node.dataset.loaded="loading";
 pendingMedia.push({node,id,refresh});
 pump();
}
let mediaActive=0;
function pump(){
 while(mediaActive<2&&pendingMedia.length){
  const job=pendingMedia.shift();
  if(!job.node.isConnected)continue;
  mediaActive++;
  (async()=>{
   let data=null;try{
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),115000);
    try{const resp=await fetch("/api/media?id="+encodeURIComponent(job.id)+(job.refresh?"&refresh=1":""),{signal:controller.signal,cache:"no-store"});data=await resp.json();}finally{clearTimeout(timer)}
   }catch{data={code:"COLLECTOR_UNAVAILABLE",items:[]}}
   if(!job.node.isConnected)return;
   const items=(Array.isArray(data.items)?data.items:[]).filter(i=>i&&["video","image"].includes(i.kind)&&safeMedia(i.url)).map(i=>({...i,url:safeMedia(i.url),poster:safeMedia(i.poster)}));
   if(items.length){mediaCache.set(job.id,{items,collectedAt:data.collectedAt});displayMedia(job.node,job.id,items)}
   else mediaFallback(job.node,job.id,data.code||"NO_MEDIA");
   job.node.dataset.loaded="done";
  })().finally(()=>{mediaActive--;pump()});
 }
}
function observeMedia(){
 if(observer)observer.disconnect();
 observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){const el=e.target;observer.unobserve(el);queueMedia(el,el.dataset.media)}},{rootMargin:"250px 0px",threshold:.01});
 document.querySelectorAll("[data-media]").forEach(el=>observer.observe(el));
}
function renderInsights(){
 const rows=allRows();
 const themes=[
 ["Offers and incentives",/\b(sale|discount|offer|save|free|half.price|% off|deal)\b/i],
 ["Benefits and outcomes",/\b(benefit|improve|feel|comfort|designed|transform|better|easy|quality)\b/i],
 ["Proof and trust",/\b(trusted|reviews|rated|guarantee|years|award|recommended|certified)\b/i],
 ["Next steps and action",/\b(shop|book|discover|explore|visit|learn|find|contact|order)\b/i]
 ];
 const total=Math.max(1,rows.length);
 $("themePanel").innerHTML=rows.length?themes.map(([label,re])=>{
 const n=rows.filter(a=>re.test((a.copy||"")+" "+(a.title||""))).length;
 return '<div class="themebar"><div class="rowtop"><span>'+esc(label)+'</span><span>'+n+' / '+rows.length+' loaded ads</span></div><div class="track"><div class="fill" style="width:'+Math.round(n/total*100)+'%"></div></div></div>';
 }).join(""):'<p>Select an advertiser to see recurring message themes.</p>';
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
 else if(view==="insights"){feedback("");$("feature").scrollIntoView({behavior:"smooth"})}
 else feedback(state.brand?"":"Search a brand above to discover active advertisers.");
 renderCards();
 if(view!=="insights")$("research").scrollIntoView({behavior:"smooth"});
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
$("coverage").addEventListener("change",e=>{state.coverage=e.target.value;if(state.page)runSearch(state.query||state.brand,state.page);else if(state.query)runSearch(state.query)});
$("sort").addEventListener("change",e=>{state.sort=e.target.value;renderCards()});
document.addEventListener("click",e=>{
 let b=e.target.closest("[data-query]");if(b){$("searchInput").value=b.dataset.query;searchClient(b.dataset.query);$("research").scrollIntoView({behavior:"smooth"});return}
 b=e.target.closest("[data-page]");if(b){state.brand=b.dataset.name;state.page=b.dataset.page;runSearch(state.query||state.brand,state.page);return}
 b=e.target.closest("[data-view]");if(b){setView(b.dataset.view);return}
 b=e.target.closest("[data-filter]");if(b){state.filter=b.dataset.filter;renderCards();return}
 b=e.target.closest("[data-action]");if(!b)return;
 const {action,id}=b.dataset;
 if(action==="detail")adDetails(id);
 if(action==="save"){const a=findAd(id);if(a){if(state.saved.has(id))state.saved.delete(id);else state.saved.set(id,a);save();renderCards();}}
 if(action==="compare"){const a=findAd(id);if(a){if(state.compare.has(id))state.compare.delete(id);else if(state.compare.size<3)state.compare.set(id,a);else{error("Select up to three ads to compare.");return}renderCards();}}
 if(action==="retrymedia"){const node=b.closest("[data-media]");if(node){mediaCache.delete(id);node.innerHTML='<div class="creative-recovery"><span class="loadingring"></span><strong>Retrying preview…</strong></div>';queueMedia(node,id,true)}}
 if(action==="loadmore"&&state.cursor)runSearch(state.query||state.brand,state.page,state.cursor);
 if(action==="morebrands"&&state.discoveryCursor)runSearch(state.query,"",state.discoveryCursor,true);
});
$("closeModal").onclick=()=>$("modalOverlay").classList.remove("open");
$("modalOverlay").onclick=e=>{if(e.target===$("modalOverlay"))$("modalOverlay").classList.remove("open")};
document.addEventListener("keydown",e=>{if(e.key==="Escape")$("modalOverlay").classList.remove("open")});
$("compareOpen").onclick=compareView;
$("compareClear").onclick=()=>{state.compare.clear();renderCards()};
renderCards();health();
})();