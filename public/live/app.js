(function(){
"use strict";
const $=id=>document.getElementById(id), esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const homeUrl="";
const storeKey="adsnoop-live-preview-saved-v1";
const state={view:"discover",query:"",page:"",brand:"",identity:null,adsFailed:false,coverage:"GB",rows:[],choices:new Map(),cursor:null,discoveryCursor:null,canFindAlternates:false,needsPageStart:false,filter:"all",sort:"reach",limit:25,theme:"",revealAll:false,loading:false,saved:new Map(),compare:new Map(),health:null};
// /tracker is the signed-in-style competitor area; the rest of the site is the public research desk.
const TRACKER=/^\/tracker\/?$/.test(location.pathname);
if(TRACKER){state.view="tracker";document.body.classList.add("tracker-mode");
 const w=document.querySelector(".hero .wrap");if(w){
  const blips=[[22,-38],[64,-18],[118,-44],[168,-26],[214,-40],[262,-16],[306,-34]];
  const radar='<div class="trk-radar" aria-hidden="true"><i class="r1"></i><i class="r2"></i><i class="r3"></i><i class="sweep"></i>'+blips.map(([a,d],i)=>'<b style="--a:'+a+'deg;--d:'+(140+d*2)+'px;--t:'+(a/360*6).toFixed(2)+'s"></b>').join("")+'</div>';
  const h=document.createElement("div");h.className="trk-hero";
  h.innerHTML=radar+'<p class="eyebrow">My competitors</p><h1>Your brand vs. <span class="trk-rot" aria-live="off">every ad they run.</span></h1><p class="hero-desc">Your brand and up to five competitors, every live UK ad, turned into creative tests worth running.</p>';
  w.appendChild(h);
  // Rotating endings, paused for reduced motion.
  const words=["every ad they run.","their newest launches.","their video strategy.","their sharpest offers.","the whole category."];
  if(!matchMedia("(prefers-reduced-motion: reduce)").matches){let i=0;const el=h.querySelector(".trk-rot");setInterval(()=>{if(document.hidden)return;el.classList.add("out");setTimeout(()=>{i=(i+1)%words.length;el.textContent=words[i];el.classList.remove("out")},380)},2800)}
 }
 document.title="My competitors | AdSnoop";document.querySelectorAll(".nav-trk").forEach(a=>{a.classList.add("active");a.setAttribute("aria-current","page")});document.querySelectorAll('.nav-btn[data-view="discover"]').forEach(a=>a.classList.remove("active"));}
const mediaCache=new Map(),mediaState=new Map(),mediaQueue=[];
// Collected creatives are remembered in this browser until Meta's signed links
// expire, so returning to a brand shows its ads instantly.
const MEDIA_STORE="adsnoop-media-v1",MEDIA_STORE_MAX=900;const mediaRetried=new Set();
function mediaUntil(items){let until=Date.now()+(items.every(i=>/^https:\/\/media\.adsnoop\.co\.uk\//.test(i.url))?30:3)*86400000;for(const i of items)for(const u of [i.url,i.poster])if(u)try{const oe=new URL(u).searchParams.get("oe");if(oe&&/^[a-f\d]+$/i.test(oe))until=Math.min(until,parseInt(oe,16)*1000-600000)}catch{}return until}
let mediaSaveTimer=0;
function persistMedia(){clearTimeout(mediaSaveTimer);mediaSaveTimer=setTimeout(()=>{try{const now=Date.now(),rows=[...mediaCache.entries()].filter(([,v])=>v.until>now).slice(-MEDIA_STORE_MAX);localStorage.setItem(MEDIA_STORE,JSON.stringify(rows))}catch{try{localStorage.removeItem(MEDIA_STORE)}catch{}}},400)}
(function restoreMedia(){try{const rows=JSON.parse(localStorage.getItem(MEDIA_STORE)||"[]"),now=Date.now();if(!Array.isArray(rows))return;for(const [id,v] of rows){if(!/^\d{1,30}$/.test(id)||!v||!(v.until>now)||!Array.isArray(v.items))continue;const items=v.items.filter(i=>i&&(i.kind==="image"||i.kind==="video")&&safeMedia(i.url)&&(!i.poster||safeMedia(i.poster)));if(items.length)mediaCache.set(id,{...v,items})}}catch{}})();let collectorStatus="checking",mediaActive=0;
const MEDIA_CONCURRENCY=3,MEDIA_REVEAL_AFTER=40000,MEDIA_RETRY_CODES=["BUSY","COLLECTOR_UNAVAILABLE","RATE_LIMITED"],MEDIA_MAX_ATTEMPTS=3;
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
// Analytics: one event per advertiser search, credited to the Insights article
// that sent the visitor here (if any, within 30 minutes). Consent-gated GA4 only.
function trackAdvertiserSearch(){
 let ref=null;try{ref=JSON.parse(sessionStorage.getItem("adsnoop-insights-ref")||"null");if(ref&&Date.now()-ref.t>1800000)ref=null;}catch{}
 const p={search_source:ref?"insights":"direct"};if(ref){p.insights_article=String(ref.slug).slice(0,100);p.insights_category=String(ref.category||"").slice(0,60);p.insights_placement=String(ref.placement||"").slice(0,60);}
 try{if(location.hostname!=="adsnoop.co.uk"||localStorage.getItem("adsnoop-analytics-choice")!=="allow"){(window.__insightsEvents=window.__insightsEvents||[]).push(["advertiser_search",p]);return;}}catch{return}
 window.dataLayer=window.dataLayer||[];(function(){window.dataLayer.push(arguments)})("event","advertiser_search",p);
}
function searchClient(query){
 const q=String(query||"").trim();if(!q)return;
 trackAdvertiserSearch();
 state.view="discover";state.filter="all";state.limit=25;state.theme="";state.revealAll=false;
 const exact=directAdvertiser(q);
 state.query=q;
 state.choices.clear();
 state.discoveryCursor=null;
 state.canFindAlternates=Boolean(exact&&!/^\d{1,30}$/.test(q));
 state.brand=exact?.name||"";
 state.page=exact?.id||"";
 state.pick=null;state.identity=null;state.adsFailed=false;
 if(exact){state.choices.set(exact.id,{id:exact.id,name:exact.name,count:0});void runSearch(q,state.page);return}
 void resolveByName(q);
}
// A trading name opens on its own only when the server verified one Page.
// Ad-text mentions are never treated as that Page.
async function resolveByName(q){
 const rid=++requestNumber;
 error("");busy(true,q);state.rows=[];state.identity=null;state.adsFailed=false;renderCards();
 feedback("");
 let d=null,ok=false;
 try{
  const r=await fetch("/api/advertisers?"+new URLSearchParams({q}),{cache:"no-store",signal:AbortSignal.timeout(25000)});
  ok=r.ok;try{d=await r.json()}catch{d=null}
  if(r.status===429)d=Object.assign(d||{},{code:"RATE_LIMITED",status:"lookup_failed"});
 }catch{d=null}
 if(rid!==requestNumber)return;
 const usable=a=>a&&typeof a.name==="string"&&(/^\d{3,30}$/.test(a.id||"")||(typeof a.handle==="string"&&a.handle.length>1));
 const list=Array.isArray(d&&d.advertisers)?d.advertisers.filter(usable):[];
 const mentions=Array.isArray(d&&d.mentions)?d.mentions.filter(a=>a&&/^\d{3,30}$/.test(a.id)&&typeof a.name==="string"):[];
 const open=a=>{state.identity=a;state.brand=a.name;state.page=a.id;state.choices.clear();state.choices.set(a.id,{id:a.id,name:a.name,count:a.adCount||0});busy(false);void runSearch(q,a.id)};
 if(d&&list.length===1&&/^\d{3,30}$/.test(list[0].id)&&(d.status==="resolved"||(d.resolved===true&&!d.status))){open(list[0]);return}
 if(d&&list.length&&(d.status==="choose"||d.status==="resolved")){
  const choose={q,kind:"choose",items:list.slice(0,8),message:d.message||""};
  // Only handle-only Pages (no usable Page id): look for real advertisers too.
  if(!list.some(a=>/^\d{3,30}$/.test(a.id||""))){void discoverAdvertisers(q,rid,choose,open,list);return}
  busy(false);feedback("");state.pick=choose;renderCards();return}
 const failed=!d||!ok||(d.status!=="not_found"&&(d.status==="lookup_failed"||["LOOKUP_FAILED","PAGE_METADATA_PERMISSION","NO_PAGE_TOKEN","HANDLE_UNRESOLVED","RATE_LIMITED"].includes(d.code)||!!d.message));
 const fallback=failed?{q,kind:"failed",items:[],message:(d&&(d.code==="RATE_LIMITED"?"Please wait a minute, then search again.":d.message))||"The lookup failed before a Page could be identified. This does not mean the advertiser has no ads."}
  :{q,kind:"missing",items:mentions,message:(d&&d.message)||"No Facebook Page could be identified from an official website or from a Page name in the Ad Library."};
 void discoverAdvertisers(q,rid,fallback,open);
}
// No exact Page match: read several hundred ads mentioning the words and rank
// every advertiser using them by UK reach (for example "blinds" lists the big
// blinds retailers). A multi-word search that clearly names one of them opens it.
async function discoverAdvertisers(q,rid,fallback,open,extra=[]){
 busy(true,q);feedback("");
 let d=null;
 try{const r=await fetch("/api/discover?"+new URLSearchParams({q}),{cache:"no-store",signal:AbortSignal.timeout(70000)});if(r.ok)d=await r.json()}catch{}
 if(rid!==requestNumber)return;
 busy(false);feedback("");
 const list=Array.isArray(d&&d.advertisers)?d.advertisers.filter(a=>a&&/^\d{3,30}$/.test(a.id)&&typeof a.name==="string"):[];
 for(const a of list)rememberPageId(a.name,a.id);
 const term=q.trim(),wholeWord=n=>new RegExp('^'+term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![a-z0-9])','i').test(String(n).trim());
 const exact=list.filter(a=>nameScore(term,a.name)>=5);
 const named=term.split(/\s+/).length>1||/\d/.test(term)?list.filter(a=>wholeWord(a.name)):[];
 const pickOne=exact.length===1?exact[0]:!exact.length&&named.length===1?named[0]:null;
 if(pickOne){open({id:pickOne.id,name:pickOne.name,adCount:pickOne.ads});return}
 if(!list.length){state.pick=fallback;renderCards();return}
 state.pick={q,kind:"category",items:list.slice(0,24).concat(extra.slice(0,2)),scanned:d.scanned||0,more:!!d.more,related:Array.isArray(d.related)?d.related.filter(x=>typeof x==="string").slice(0,6):[]};
 renderCards();
}
const formatDate=s=>{if(!s)return "Unknown";const d=new Date(s.length===10?s+"T12:00:00Z":s);return Number.isFinite(d.getTime())?d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}):"Unknown"};
const reach=n=>typeof n==="number"&&Number.isFinite(n)?n.toLocaleString("en-GB"):"Not available";
function error(msg){const el=$("error");el.textContent=msg;el.hidden=!msg;}
function feedback(message){const el=$("feedback");el.textContent=message;el.hidden=!message;}
function busy(v,lookup=""){state.loading=v;const stage=$("as-search-stage");if(stage){stage.hidden=!v;stageMessages(v,lookup)}if(v)setBar("search");else if(!state.rows.length)setBar("hide");else updateReveal(true);$("searchGo").disabled=v;$("searchGo").textContent=v?"Searching…":"Search ↗";}
// While ads are being found, say plainly what is happening and keep the message moving on long waits.
let stageTimer=0;
function stageMessages(on,lookup){
 clearInterval(stageTimer);stageTimer=0;if(!on)return;
 const who=lookup||state.brand||state.query||"this advertiser",where=state.coverage==="GB"?"the UK":"the selected countries",start=Date.now();
 const title=$("as-stage-query");if(title)title.textContent=lookup?"Finding “"+who+"”…":state.page?"Loading ads for "+who+"…":"Finding "+who+"’s ads…";
 const lines=lookup?[[0,"Matching the brand’s website to its Facebook Page, so we load the right advertiser’s ads."],[8,"Checking which advertisers are running ads about “"+who+"”."],[25,"Still searching. Meta’s Ad Library is slower than usual right now."],[50,"Nearly there, thanks for waiting. Meta is taking its time today."]]:[[0,state.page?"Asking Meta’s Ad Library for every ad "+who+" is running in "+where+".":"Looking up advertisers called “"+who+"” in Meta’s Ad Library."],[6,"Reading each ad’s copy, format, start date and reach."],[13,"Bigger advertisers can have hundreds of ads, so this can take up to 30 seconds."],[26,"Still loading. Meta’s Ad Library is slower than usual right now."],[50,"Nearly there, thanks for waiting. Meta is taking its time today."]];
 const tick=()=>{const s=Math.floor((Date.now()-start)/1000),hint=$("as-stage-hint"),time=$("as-stage-time");
  let line=lines[0][1];for(const [at,t] of lines)if(s>=at)line=t;
  if(hint&&hint.textContent!==line)hint.textContent=line;
  if(time)time.textContent=s>=3?s+"s":"";};
 tick();stageTimer=setInterval(tick,1000);
}
function safeMedia(input){try{const u=new URL(input);return u.protocol==="https:"&&(u.hostname.endsWith(".fbcdn.net")||u.hostname==="media.adsnoop.co.uk")&&!u.username&&!u.password&&!u.searchParams.has("access_token")?u.href:null}catch{return null}}
function save(){try{localStorage.setItem(storeKey,JSON.stringify(Array.from(state.saved.values()).slice(0,300)))}catch(e){feedback("Saved research cannot be written to this browser. Use a local download for a backup.");}}
function allRows(){return state.view==="saved"?Array.from(state.saved.values()):state.rows}
function shownRows(){
 const f=state.filter,added=new Set(state.changes?.added||[]);
 let rows=allRows().filter(a=>{
  if(f==="all")return true;
  if(f==="video"||f==="static"||f==="carousel"||f==="catalogue")return formatOf(a.id)===f;
  if(f==="added")return added.has(a.id);
  if(["new","testing","proven","long"].includes(f))return lifeStage(daysRunning(a))?.key===f;
  return (a.platforms||[]).map(p=>String(p).toLowerCase()).includes(f);
 });
 const by={reach:(a,b)=>(b.reach??-1)-(a.reach??-1),longest:(a,b)=>String(a.start||"9").localeCompare(String(b.start||"9")),newest:(a,b)=>String(b.start||"").localeCompare(String(a.start||""))};
 rows.sort(by[state.sort]||by.reach);
 return groupRows(rows);
}
// Brands often run the same ad several times (one per audience or budget).
// Identical copy + headline become one tile so the grid shows distinct ads.
function groupKey(a){const c=copyPattern(a);return c.length>=15?variationKey(a):"id:"+a.id}
function groupRows(rows){
 state.groupMeta=new Map();
 if(state.view==="saved")return rows;
 const groups=new Map();
 for(const a of rows){const k=groupKey(a);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(a)}
 const lead=g=>g.reduce((m,a)=>(a.reach??-1)>(m.reach??-1)?a:m,g[0]);
 const total=g=>g.some(a=>typeof a.reach==="number")?g.reduce((n,a)=>n+(typeof a.reach==="number"?a.reach:0),0):null;
 let list=[...groups.entries()].map(([k,g])=>({k,g,lead:lead(g),total:total(g),first:g[0]}));
 // Keep the user's chosen order, but rank by combined reach when sorting by reach.
 if(state.sort==="reach"||!state.sort)list.sort((x,y)=>(y.total??-1)-(x.total??-1));
 const out=[];
 for(const x of list){
  const open=state.expanded?.has(x.k)&&x.g.length>1;
  const head=state.sort==="reach"||!state.sort?x.lead:x.first;
  state.groupMeta.set(head.id,{key:x.k,n:x.g.length,total:x.total,open,head:true});out.push(head);
  if(open)x.g.filter(a=>a!==head).forEach((a,i)=>{state.groupMeta.set(a.id,{key:x.k,n:x.g.length,open,head:false,pos:i+2});out.push(a)});
 }
 return out;
}
// Advertiser logo = the Facebook Page profile picture, with initials underneath
// so a missing or slow image never leaves an empty circle.
function logoHTML(id,name,cls,picture,fallback){
 const ini=String(name||"?").split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase();
 const graph=id&&/^\d{1,30}$/.test(id)?"https://graph.facebook.com/"+encodeURIComponent(id)+"/picture?type=square&width=128&height=128":"";
 const chain=[picture,graph,fallback].filter((u,i,a)=>typeof u==="string"&&/^https:/.test(u)&&a.indexOf(u)===i);
 const src=chain[0]||"",fb=chain[1]||"";
 const img=src?'<img alt="" loading="eager" referrerpolicy="no-referrer" src="'+esc(src)+'"'+(fb?' data-fallback="'+esc(fb)+'" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;delete this.dataset.fallback}else this.remove()"':' onerror="this.remove()"')+'>':"";
 return '<span class="brandlogo '+(cls||"")+'" aria-hidden="true"><b>'+esc(ini)+'</b>'+img+'</span>';
}
function identityLinks(){
 const id=state.page;if(!/^\d{1,30}$/.test(id||""))return "";
 const handle=state.identity&&state.identity.handle&&!/-\d{8,}$/.test(state.identity.handle)?state.identity.handle:"";
 const pageUrl="https://www.facebook.com/"+encodeURIComponent(handle||id);
 const lib="https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=GB&view_all_page_id="+encodeURIComponent(id);
 let site="";if(state.identity&&state.identity.website){try{const h=new URL(state.identity.website).hostname.replace(/^www\./,"");site=' · <a href="'+esc(state.identity.website)+'" target="_blank" rel="noopener noreferrer">'+esc(h)+'</a>'}catch{}}
 const cat=state.identity&&state.identity.category?' · '+esc(state.identity.category):"";
 return '<span style="display:block;margin-top:6px;font-size:13px;font-weight:500"><a href="'+esc(pageUrl)+'" target="_blank" rel="noopener noreferrer">Facebook Page</a> · Page ID '+esc(id)+' · <a href="'+esc(lib)+'" target="_blank" rel="noopener noreferrer">Page Ad Library</a>'+site+cat+'</span>';
}
function showHeader(){
 {const title=state.view==="intel"?state.brand+" — Intelligence":state.view==="saved"?"Your saved ideas.":state.view==="insights"?(state.brand?state.brand+" — Messaging":"Messaging map."):state.view==="tracker"?(!(auth.enabled&&!auth.signedIn)&&!auth.checking&&activeBrand()&&!trk.mode&&activeBrand().competitors.length?activeBrand().name+" vs competitors.":"My competitors."):state.view==="compare"?"You vs your competitors.":(state.brand?(state.rows.length||state.loading?state.brand+" — Active ads":state.brand+" — No active UK ads"):"The creative library.");
 $("heading").innerHTML=(state.view!=="saved"&&state.view!=="compare"&&state.view!=="tracker"&&state.brand&&state.page?logoHTML(state.page,state.brand,"lg",state.identity&&state.identity.picture,state.identity&&state.identity.logo):"")+'<span>'+esc(title)+'</span>';}
 {let base=state.view==="intel"?"":state.view==="saved"?"Ads saved in this browser.":state.view==="insights"?"Hooks, benefits, offers, proof and calls to action across the loaded ads.":state.view==="tracker"?(!(auth.enabled&&!auth.signedIn)&&!auth.checking&&activeBrand()&&!trk.mode&&activeBrand().competitors.length?"All of their live UK ads, side by side: opportunities, creative mix, launch activity and messaging.":"Track your brand against up to "+COMP_MAX+" competitors, from their live UK ads."):state.view==="compare"?"Your brand side by side with up to 5 pinned competitors, from their live UK ads.":state.adsFailed&&state.page?"The Page was identified, but Meta’s ad lookup failed. This does not mean there are zero ads.":state.loading&&state.brand?"Loading active UK ads…":state.brand&&state.page&&!state.rows.length?"Page found. Meta returned no active ads for this Page in the selected countries.":state.brand?"Loaded from Meta's public Ad Library. Refresh the search to update.":"Search a brand to discover its Facebook advertiser pages.";
  if(state.view==="discover"&&state.identity&&state.identity.evidence&&!state.loading&&!state.adsFailed)base=state.identity.evidence+(state.page&&!state.rows.length?" Page found, no active UK ads.":"");
  const links=state.view==="discover"?identityLinks():"";
  if(links)$("subheading").innerHTML=esc(base)+links;else $("subheading").textContent=base;}
 renderViewTabs();
 {const m=$("metrics"),show=(state.view==="discover"&&state.rows.length>0)||state.view==="saved";m.hidden=!show;
 if(show){const shown=shownRows(),live=allRows().length,saved=state.view==="saved";
  const distinct=saved?shown.length:new Set(state.rows.map(groupKey)).size;
  countTo($("metricAds"),distinct);
  $("metricAdsSub").textContent=saved?"saved ads":distinct<live?"distinct ads · from "+live+" live":"live ads";
  const starts=state.rows.map(a=>a.start).filter(Boolean).sort();
  $("bsSince").hidden=saved||!starts.length;$("metricSince").textContent=starts.length?formatDate(starts[0]):"—";
  const week=state.rows.filter(a=>{const d=daysRunning(a);return d!=null&&d<=7}).length;
  $("bsNew").hidden=saved;countTo($("metricNew"),week);
  const f=$("followBtn"),on=isFollowed(state.page);f.hidden=saved||!state.page;f.setAttribute("aria-pressed",String(on));const isMine=tracker().brands.some(b=>b.id===state.page);f.hidden=f.hidden||isMine;f.querySelector(".bs-star").textContent=on?"★":"☆";{const n=brandsTracking(state.page).length,multi=tracker().brands.length>1;f.querySelector(".bs-label").textContent=multi?(n?"Competitor of "+n+" brand"+(n===1?"":"s")+" ▾":"Add to my competitors ▾"):on?"In my competitors":"Add to my competitors";f.setAttribute("aria-pressed",String(multi?n>0:on));}
  const mb=$("mineBtn");if(mb){mb.hidden=saved||!state.page;mb.setAttribute("aria-pressed",String(isMine));mb.querySelector(".bs-label").textContent=tracker().brands.some(b=>b.id===state.page)?"Your brand ✓ Open tracker":"Track as my brand";}
  $("savedBtn").hidden=saved;}
 }
 $("toolbar").style.display=(state.view==="discover"&&state.rows.length||state.view==="saved")?"flex":"none";
 $("feature").hidden=state.rows.length>0||state.view!=="discover";
 $("metricSaved").textContent=String(state.saved.size);
 {const sc=$("savedCount");if(sc)sc.textContent=state.saved.size?"("+state.saved.size+")":"";}
 document.querySelectorAll("[data-view]").forEach(el=>el.classList.toggle("active",el.dataset.view===state.view));
 document.querySelectorAll("[data-filter]").forEach(el=>el.classList.toggle("active",el.dataset.filter===state.filter));
 $("comparisonBar").classList.toggle("show",state.compare.size>0);
 $("compareCount").textContent=state.compare.size+" of 3 selected";
}
function skelCard(i){return '<div class="tile-skel ad-skel" aria-hidden="true" style="animation-delay:'+(i%3)*.15+'s"><div class="ask-img"><span class="ls-spin"></span>Loading ad…</div><div class="ask-body"><i style="width:45%"></i><i style="width:92%"></i><i style="width:78%"></i><i style="width:58%"></i></div></div>'}
function loadingCards(){return Array.from({length:6},(_,i)=>skelCard(i)).join("")}
// Numbers count up the first time a brand loads, then update quietly.
function countTo(el,to){
 if(!el)return;const key=state.page+"|"+state.view,prev=Number(el.dataset.v||0);
 if(el.dataset.v===String(to)&&el.dataset.k===key)return;
 const animate=el.dataset.k!==key&&!document.hidden&&!matchMedia("(prefers-reduced-motion: reduce)").matches&&to>0;
 el.dataset.v=String(to);el.dataset.k=key;cancelAnimationFrame(el._raf||0);clearTimeout(el._done||0);
 if(!animate){el.textContent=String(to);return}
 // The clock starts on the first frame and progress is clamped to 0..1. A frame's
 // timestamp can be earlier than performance.now() taken during a long render, and
 // a negative progress made the eased value dip below zero (showing "-1").
 const dur=Math.min(1200,500+to*12);let t0=null;
 el.textContent="0";
 const step=t=>{if(t0==null)t0=t;const k=Math.max(0,Math.min(1,(t-t0)/dur)),e=1-Math.pow(1-k,3);el.textContent=String(Math.max(0,Math.min(to,Math.round(to*e))));if(k<1)el._raf=requestAnimationFrame(step)};
 el._raf=requestAnimationFrame(step);void prev;
 // Frames can stall while the page isn't being painted; always land on the real number.
 el._done=setTimeout(()=>{cancelAnimationFrame(el._raf||0);el.textContent=String(to)},dur+400);
}
// Preferences sit behind one small store so they can later belong to a signed-in
// account (saved watchlists, weekly alerts) without changing the features that read them.
const prefStore={adapter:{get:k=>{try{return localStorage.getItem(k)}catch{return null}},set:(k,v)=>{try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch{}}},
 read(k,fb){const v=this.adapter.get(k);if(v==null)return fb;try{return JSON.parse(v)}catch{return fb}},
 write(k,v){this.adapter.set(k,v==null?null:JSON.stringify(v))}};
// ---- My competitors: brands you track, each with up to five competitors ----
// One account-ready store. Until sign-in is connected it lives on this device
// (account.mode "device"); with accounts it will sync to the user's profile.
const account={mode:"device",user:null};
const TRACK_KEY="adsnoop-tracker-v1",followKey="adsnoop-follow-v1",MINE_KEY="adsnoop-mybrand-v1";
const COMP_MAX=5;
// Plan limits in one place. The free plan tracks one brand; ?plan=pro previews more.
let PLAN=(()=>{let pro=false;try{if(/[?&]plan=pro\b/.test(location.search))sessionStorage.setItem("adsnoop-plan","pro");pro=sessionStorage.getItem("adsnoop-plan")==="pro"}catch{}return pro?{name:"Pro preview",brands:10,competitors:COMP_MAX}:{name:"Free",brands:1,competitors:COMP_MAX}})();
const validB=b=>b&&/^\d{1,30}$/.test(b.id)&&typeof b.name==="string";
function tracker(){
 let t=prefStore.read(TRACK_KEY,null);
 if(!t||!Array.isArray(t.brands)){
  // First visit since multi-brand: turn "my brand" + pins into the first brand.
  t={v:1,active:"",brands:[],pending:[]};
  const mine=prefStore.read(MINE_KEY,null),pins=(prefStore.read(followKey,[])||[]).filter(validB);
  if(validB(mine)){t.brands.push({id:mine.id,name:mine.name,competitors:pins.filter(b=>b.id!==mine.id).slice(0,COMP_MAX).map(b=>({id:b.id,name:b.name}))});t.active=mine.id}
  else t.pending=pins.slice(0,COMP_MAX).map(b=>({id:b.id,name:b.name}));
  prefStore.write(TRACK_KEY,t);
 }
 t.brands=t.brands.filter(validB).map(b=>({...b,competitors:(Array.isArray(b.competitors)?b.competitors:[]).filter(validB).slice(0,COMP_MAX)}));
 t.pending=(Array.isArray(t.pending)?t.pending:[]).filter(validB).slice(0,COMP_MAX);
 if(!t.brands.some(b=>b.id===t.active))t.active=t.brands[0]?.id||"";
 return t;
}
function saveTracker(t){prefStore.write(TRACK_KEY,t);if(typeof auth!=="undefined"&&auth.signedIn)pushAccount()}
function activeBrand(){const t=tracker();return t.brands.find(b=>b.id===t.active)||null}
function myBrand(){const b=activeBrand();return b?{id:b.id,name:b.name}:null}
// Competitors of the active brand (or ones added before any brand was set up).
function followed(){const t=tracker(),b=t.brands.find(x=>x.id===t.active);return (b?b.competitors:t.pending).slice(0,COMP_MAX)}
function comparisonSet(){const b=activeBrand();return {mine:b?{id:b.id,name:b.name}:null,competitors:b?b.competitors.slice(0,COMP_MAX):[]}}
function isFollowed(id){return !!id&&followed().some(b=>b.id===id)}
function brandsTracking(id){return tracker().brands.filter(b=>b.competitors.some(c=>c.id===id))}
function setCompetitor(brandId,comp,on){
 const t=tracker(),list=brandId?t.brands.find(b=>b.id===brandId)?.competitors:t.pending;if(!list)return "missing";
 const has=list.some(c=>c.id===comp.id);
 if(on&&!has){if(brandId===comp.id)return "self";if(list.length>=COMP_MAX)return "full";list.push({id:comp.id,name:comp.name})}
 if(!on&&has)list.splice(list.findIndex(c=>c.id===comp.id),1);
 saveTracker(t);return "ok";
}
function replaceCompetitor(brandId,oldId,comp){
 if(!validB(comp)||!comp.name.trim())return "invalid";
 const t=tracker(),b=t.brands.find(x=>x.id===brandId),at=b?.competitors.findIndex(c=>c.id===oldId)??-1;
 if(at<0)return "missing";
 if(comp.id===b.id)return "self";
 if(b.competitors.some(c=>c.id===comp.id))return "exists";
 b.competitors[at]={id:comp.id,name:comp.name};saveTracker(t);return "ok";
}
function replaceTrackedBrand(brandId,brand){
 if(!validB(brand)||!brand.name.trim())return "invalid";
 const t=tracker(),at=t.brands.findIndex(b=>b.id===brandId);if(at<0)return "missing";
 if(t.brands.some(b=>b.id===brand.id))return "exists";
 // Changing the selected brand uses the same plan slot and keeps the chosen
 // competitors. Its old category is not an assumption about the new brand.
 t.brands[at]={id:brand.id,name:brand.name,competitors:t.brands[at].competitors.filter(c=>c.id!==brand.id)};
 t.active=brand.id;saveTracker(t);return "ok";
}
function removeTrackedCompetitor(brandId,id){
 const t=tracker(),b=t.brands.find(x=>x.id===brandId),at=b?.competitors.findIndex(c=>c.id===id)??-1;
 if(at<0)return "missing";
 trk.removed={brandId,competitor:{...b.competitors[at]},at};b.competitors.splice(at,1);saveTracker(t);return "ok";
}
function undoTrackedCompetitor(){
 const last=trk.removed;if(!last)return "missing";
 const t=tracker(),b=t.brands.find(x=>x.id===last.brandId);if(!b)return "missing";
 if(b.competitors.some(c=>c.id===last.competitor.id)||b.id===last.competitor.id)return "exists";
 if(b.competitors.length>=COMP_MAX)return "full";
 b.competitors.splice(Math.min(last.at,b.competitors.length),0,last.competitor);saveTracker(t);trk.removed=null;return "ok";
}
function addBrand(b){
 const t=tracker();if(t.brands.some(x=>x.id===b.id)){t.active=b.id;saveTracker(t);return "exists"}
 if(t.brands.length>=PLAN.brands)return "limit";
 t.brands.push({id:b.id,name:b.name,competitors:(t.brands.length?[]:t.pending).filter(c=>c.id!==b.id).slice(0,COMP_MAX)});
 if(t.brands.length===1)t.pending=[];
 t.active=b.id;saveTracker(t);return "ok";
}
function removeBrand(id){const t=tracker();t.brands=t.brands.filter(b=>b.id!==id);if(t.active===id)t.active=t.brands[0]?.id||"";saveTracker(t)}
function switchBrand(id){const t=tracker();if(t.brands.some(b=>b.id===id)){t.active=id;saveTracker(t)}}
// Research desk: "Add to my competitors". With several brands, choose which ones.
function toggleFollow(){
 if(!state.page)return;const comp={id:state.page,name:state.brand||"Advertiser"},t=tracker();
 if(needAccount({kind:"comp",id:comp.id,name:comp.name}))return;
 if(t.brands.length>1){openBrandPicker(comp);return}
 const target=t.brands[0]?.id||"",on=isFollowed(comp.id);
 const r=setCompetitor(target,comp,!on);
 if(r==="full"){toast("Each brand can track up to "+COMP_MAX+" competitors. Remove one in My competitors.");return}
 if(r==="self"){toast("That’s the brand you’re tracking.");return}
 toast(on?"Removed "+comp.name:"Added "+comp.name+(t.brands[0]?" to "+t.brands[0].name+"’s competitors":". Set your brand in My competitors to compare."));
 cmp.data.delete(comp.id);showHeader();renderPinbar();
}
function openBrandPicker(comp){
 closeBrandPicker();const t=tracker(),btn=$("followBtn");if(!btn)return;
 const pop=document.createElement("div");pop.className="bpick";pop.id="brandPicker";pop.setAttribute("role","dialog");pop.setAttribute("aria-label","Choose which brands track "+comp.name);
 pop.innerHTML='<p>Add <b>'+esc(comp.name)+'</b> as a competitor of:</p>'+t.brands.map(b=>{const on=b.competitors.some(c=>c.id===comp.id),full=!on&&b.competitors.length>=COMP_MAX,self=b.id===comp.id;return '<label class="'+(full||self?'off':'')+'"><input type="checkbox" data-bpick="'+esc(b.id)+'"'+(on?' checked':'')+(full||self?' disabled':'')+'>'+logoHTML(b.id,b.name,"")+'<span>'+esc(b.name)+'<small>'+(self?'This brand':full?'Full ('+COMP_MAX+'/'+COMP_MAX+')':b.competitors.length+'/'+COMP_MAX+' competitors')+'</small></span></label>'}).join("")+'<button type="button" class="pill" data-bpick-done>Done</button>';
 btn.parentElement.style.position="relative";btn.parentElement.appendChild(pop);
 pop.addEventListener("change",e=>{const i=e.target.closest("[data-bpick]");if(!i)return;setCompetitor(i.dataset.bpick,comp,i.checked);cmp.data.delete(comp.id)});
 pop.querySelector("[data-bpick-done]").onclick=()=>{closeBrandPicker();showHeader();renderPinbar();const n=brandsTracking(comp.id).length;toast(n?comp.name+" is tracked for "+n+" brand"+(n===1?"":"s")+".":"Not tracking "+comp.name+".")};
 setTimeout(()=>document.addEventListener("click",outsidePicker,true),0);
}
function outsidePicker(e){const p=$("brandPicker");if(p&&!p.contains(e.target)&&!e.target.closest("#followBtn"))closeBrandPicker()}
function closeBrandPicker(){$("brandPicker")?.remove();document.removeEventListener("click",outsidePicker,true)}
let toastTimer=0;
function toast(msg){const t=$("toast");if(!t)return;t.textContent=msg;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2400)}
// Start page before any search: brands you follow plus popular UK advertisers.
let popular=null,popularLoading=false;
const POPULAR_FALLBACK=["Dunelm","Next","IKEA","boohoo","Gymshark","Currys","Wren Kitchens","Sharps Fitted Furniture"];
function loadPopular(){
 if(popular||popularLoading)return;popularLoading=true;
 fetch("/api/popular",{cache:"no-store",signal:AbortSignal.timeout(90000)}).then(r=>r.ok?r.json():{brands:[]}).then(d=>{popular=Array.isArray(d.brands)?d.brands.filter(b=>b&&/^\d{1,30}$/.test(b.pageId)):[]}).catch(()=>{popular=[]}).finally(()=>{popularLoading=false;if(isStart())renderCards()});
}
function isStart(){return state.view==="discover"&&!state.brand&&!state.rows.length&&!state.loading&&!state.pick}
function compactNumber(n){return n>=1e6?(n/1e6).toFixed(n>=1e7?0:1).replace(/\.0$/,"")+"M":n>=1e3?(n/1e3).toFixed(n>=1e4?0:1).replace(/\.0$/,"")+"K":String(n)}
function pickHTML(){
 const p=state.pick;
 const head=p.kind==="category"?"Advertisers running ads about “"+p.q+"”":p.kind==="failed"?"Meta lookup failed":p.kind==="missing"?"Couldn’t identify a Facebook Page for “"+p.q+"”":p.items.length===1&&!/^\d{3,30}$/.test(p.items[0].id||"")?"Facebook Page found":"Which advertiser do you mean?";
 const sub=p.kind==="category"?"Ranked by Meta’s estimated UK reach across the "+p.scanned+(p.more?" most recent":"")+" live UK ads checked for the words. Choose one to see all of its ads.":p.message||(p.kind==="missing"?"Paste the brand’s website, Facebook Page link, @handle or Page ID.":"Choose the business you mean. A shared owner or a name inside someone else’s ad is not listed as a match.");
 const cards=p.items.map((a,i)=>{
  let host="";if(a.website){try{host=new URL(a.website).hostname.replace(/^www\./,"")}catch{}}
  const ads=a.activeAds===false?"No active UK ads":a.activeAds===true?"Active UK ads":"";
  const meta=p.kind==="category"&&!/^\d{3,30}$/.test(a.id||"")?[host,a.handle?"@"+a.handle:"","Facebook Page"].filter(Boolean).join(" · "):p.kind==="category"?a.ads+" matching ad"+(a.ads===1?"":"s")+(a.reach?" · UK reach "+compactNumber(a.reach):""):p.kind==="missing"?(a.count||a.mentions||0)+" ads mention the words — not a Page match":[a.category,host,a.handle?"@"+a.handle:"",ads].filter(Boolean).join(" · ");
  const go=a.activeAds===false?"Open Page":"See their ads →";
  const body=logoHTML(a.id,a.name,"lg",a.picture,a.logo)+'<span><strong>'+esc(a.name)+'</strong><br><small>'+esc(meta||"Facebook Page")+'</small>'+(p.kind!=="missing"&&a.evidence?'<br><small>'+esc(a.evidence)+'</small>':'')+'</span><span class="go">'+go+'</span>';
  if(!/^\d{3,30}$/.test(a.id||"")){const href=a.handle?"https://www.facebook.com/"+encodeURIComponent(a.handle):(a.website||"");return href?'<a class="bcard" style="--i:'+i+'" href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+body+'</a>':"";}
  return '<button class="bcard" style="--i:'+i+'" data-page="'+esc(a.id)+'" data-name="'+esc(a.name)+'">'+body+'</button>';
 }).join("");
 const related=p.kind==="category"&&p.related&&p.related.length?'<div class="pick-related"><span>Narrow it down:</span>'+p.related.map(r=>'<button type="button" class="chip-q" data-query="'+esc(r)+'">'+esc(r)+'</button>').join("")+'</div>':"";
 return '<div class="start pick"><h3>'+esc(head)+'</h3><p class="pick-sub">'+esc(sub)+'</p>'+related+(cards?'<div class="start-grid">'+cards+'</div>':'')+'</div>';
}
function brandCard(b,i,extra){return '<button class="bcard" style="--i:'+i+'" data-page="'+esc(b.id)+'" data-name="'+esc(b.name)+'">'+logoHTML(b.id,b.name,"lg")+'<span><strong>'+esc(b.name)+'</strong><br><small'+(extra?' class="live"':'')+'>'+esc(extra||"Followed brand")+'</small></span><span class="go">Explore ads →</span></button>'}
function startHTML(){
 loadPopular();
 const out=typeof auth!=="undefined"&&auth.enabled&&!auth.signedIn;
 const mine=out?[]:followed();
 let html='<div class="start">';
 if(out)html+='<button type="button" class="cmp-cta" data-acct="signup"><b>Track your brand against up to '+COMP_MAX+' competitors</b><span>Free account: opportunities, creative mix and launch activity →</span></button>';
 else{const me=myBrand();html+='<a class="cmp-cta" href="/tracker"><b>'+(me?'Track '+esc(me.name)+' against':'Track your brand against')+' up to '+COMP_MAX+' competitors</b><span>My competitors: opportunities, creative mix and launch activity →</span></a>'}
 if(mine.length)html+='<h3>Your competitors ('+mine.length+'/'+COMP_MAX+')</h3><div class="start-grid">'+mine.map((b,i)=>brandCard(b,i,"Your competitor")).join("")+'</div>';
 html+='<h3>Popular in the UK right now</h3><div class="start-grid">';
 if(popular&&popular.length)html+=popular.map((b,i)=>brandCard({id:b.pageId,name:b.name},i,(b.more?b.count+"+":b.count)+" live UK ads")).join("");
 else if(popular)html+='<p class="intel-sub" style="grid-column:1/-1">Search any brand above to see its live ads.</p>';
 else html+=POPULAR_FALLBACK.map((n,i)=>'<div class="bcard skel" style="--i:'+i+'"><span class="brandlogo lg" aria-hidden="true"><b>'+esc(n.split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase())+'</b></span><span><strong>'+esc(n)+'</strong><br><small></small></span></div>').join("");
 return html+'</div></div>';
}
function renderViewTabs(){
 const el=$("viewtabs"),panel=$("research-panel");
 const has=!!state.brand&&state.rows.length>0;
 const show=has&&["discover","intel","insights"].includes(state.view);
 el.hidden=!show;
 document.body.classList.toggle("has-tabs",show);
 if(show){
  panel.setAttribute("role","tabpanel");
  panel.setAttribute("aria-labelledby","research-tab-"+state.view);
 }else{
  panel.removeAttribute("role");
  panel.removeAttribute("aria-labelledby");
 }
 const tab=(view,label)=>'<button type="button" id="research-tab-'+view+'" class="viewtab" role="tab" aria-controls="research-panel" data-view="'+view+'" aria-selected="'+(state.view===view)+'" tabindex="'+(state.view===view?0:-1)+'">'+label+'</button>';
 const html=show?tab("discover","Ads")+tab("intel","Intelligence")+tab("insights","Messaging"):"";
 if(el.dataset.markup!==html){el.innerHTML=html;el.dataset.markup=html}
}
function empty(title,detail,html){return '<div class="empty"><h3>'+esc(title)+'</h3><p>'+esc(detail)+'</p>'+(html||"")+'</div>'}
function card(a){
 const d=daysRunning(a),stage=lifeStage(d),gm=state.groupMeta?.get(a.id);
 const grp=gm&&gm.n>1?(gm.head?'<button class="groupbadge'+(gm.open?' on':'')+'" data-action="group" data-id="'+esc(a.id)+'" title="The brand is running this same copy and headline as '+gm.n+' separate ads, usually for different audiences or budgets">'+(gm.open?'Hide '+(gm.n-1)+' similar':'Running as '+gm.n+' ads')+'</button>':'<span class="groupbadge sub">'+gm.pos+' of '+gm.n+' · same copy</span>'):'';
 const badges='<div class="tilebadges">'+(stage?'<span class="lifebadge st-'+stage.key+'" title="'+esc(stage.hint)+'">'+esc(stage.label)+' · '+d+'d</span>':'')+grp+'</div>';
 const reachText=gm&&gm.n>1&&gm.head&&!gm.open?'UK reach: '+reach(gm.total)+' across '+gm.n+' ads':'UK reach: '+reach(a.reach);
 const platforms=(a.platforms||[]).join(", ")||"Platform not reported";
 const format=a.format&&a.format!=="Unknown"?a.format:"Format to be verified";
 const isSaved=state.saved.has(a.id),isCompared=state.compare.has(a.id);
 return '<article class="adcard tile-hidden"><div class="live-visual" data-media="'+esc(a.id)+'" data-loaded="false">'+badges+'<span class="fmtbadge" data-fmt="'+esc(a.id)+'"></span><div class="creative-recovery"><span class="loadingring" aria-hidden="true"></span><strong>Preparing creative preview</strong><small>Loading only when this card is in view.</small></div></div><div class="adbody"><div class="admeta"><span class="adbrand">'+logoHTML(a.pageId,a.pageName||state.brand,"sm")+esc(a.pageName||state.brand||"Advertiser")+'</span>'+(a.format&&a.format!=="Unknown"?'<span class="tag">'+esc(a.format)+'</span>':'')+'</div><h3 class="adtitle">'+esc(a.title||"Ad creative")+'</h3><p class="adcopy adtext">'+esc(a.copy||"No copy provided by Meta.")+'</p><div class="metadata"><span>'+esc(formatDate(a.start))+'</span><span>'+esc(platforms)+'</span><span'+(gm&&gm.n>1&&gm.head&&!gm.open?' title="Sum of each ad\'s reach. People who saw more than one are counted more than once."':'')+'>'+esc(reachText)+'</span></div>'+ctaLineHTML(a.id)+'<div class="adbottom"><button class="linkbutton" data-action="detail" data-id="'+esc(a.id)+'">View ad details ↗</button><div class="smallactions"><button class="remixbtn" data-action="remix" data-id="'+esc(a.id)+'" data-rpage="'+esc(a.pageId||state.page||"")+'" data-name="'+esc(a.pageName||state.brand||"")+'" title="AI: a prompt to recreate this ad’s style, plus copy for your brand">✦ Remix</button><button class="square '+(isSaved?"on":"")+'" data-action="save" data-id="'+esc(a.id)+'" aria-label="'+(isSaved?"Remove saved ad":"Save ad")+'">'+(isSaved?"♥":"♡")+'</button><button class="square '+(isCompared?"on":"")+'" data-action="compare" data-id="'+esc(a.id)+'" aria-label="Compare ad">'+(isCompared?"✓":"⊕")+'</button></div></div></div></article>';
}
function renderCards(){
 if(observer)observer.disconnect();
 showHeader();
 renderBrands();
 const intel=state.view==="intel";
 $("cards").hidden=intel;
 $("pager").hidden=intel;
 renderIntel();
 if(intel){setBar("hide");renderPinbar();return}
 const all=state.view==="discover"||state.view==="saved"?shownRows():[],rows=all.slice(0,state.limit),hidden=all.length-rows.length;
 if(state.view==="insights"){setBar("hide");$("cards").innerHTML='<div style="grid-column:1/-1">'+messagingView()+'</div>';hydrateThumbs();$("pager").innerHTML="";$("toolbar").style.display="none";renderPinbar();return}
 if(state.view==="tracker"){const focused=document.activeElement,search=focused?.matches('#trkBrandQ,#trkCompQ')?{id:focused.id,start:focused.selectionStart,end:focused.selectionEnd}:null;setBar("hide");$("cards").innerHTML='<div style="grid-column:1/-1">'+trackerHTML()+'</div>';if(search){const input=$(search.id);if(input){input.focus({preventScroll:true});if(search.start!=null)input.setSelectionRange(search.start,search.end)}}hydrateThumbs();$("pager").innerHTML="";$("toolbar").style.display="none";showHeader();renderPinbar();return}
 if(state.view==="compare"){setBar("hide");$("cards").innerHTML='<div style="grid-column:1/-1">'+compareHTML()+'</div>';hydrateThumbs();$("pager").innerHTML="";$("toolbar").style.display="none";showHeader();renderPinbar();return}
 const blank=state.view==="saved"?empty("No saved ads yet.","Save a creative from an advertiser search to find it here."):state.adsFailed&&state.page?empty("Meta lookup failed","The Page was identified, but its ads could not be loaded. Try again in a moment.",identityLinks()):state.page&&/^\d{1,30}$/.test(state.page)?empty("Page found, no active UK ads","Meta has no active ads for this Page in the selected countries. It can still be the right advertiser.",identityLinks()):empty("No ads to display.",state.brand?"Try a different platform filter or another advertiser.":"Search an advertiser above to begin.");
 $("cards").innerHTML=rows.length?rows.map(card).join(""):state.loading?loadingCards():(state.pick&&state.view==="discover"&&!state.loading?pickHTML():isStart()?startHTML():blank);
 renderPinbar();
 $("pager").innerHTML=hidden>0?'<button class="ghost" data-action="showmore">Show '+Math.min(25,hidden)+' more ads ('+hidden+' remaining)</button>':state.view==="discover"&&(state.cursor||state.needsPageStart)&&state.brand?'<button class="ghost" data-action="loadmore">Load more Meta ads</button>':"";
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
 list.hidden=state.view!=="discover"||!choices.length||Boolean(state.pick);
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
const FULL_SET_CAP=300;
async function collectPageAds(q,page,signal,rows,cursor){
 // Meta returns the newest 50 first; longevity, launch and change stats are
 // only meaningful across all of an advertiser's live ads.
 const seen=new Set(rows.map(a=>a.id));let all=[...rows];
 while(cursor&&all.length<FULL_SET_CAP){
  const t=$("loadbarText");if(t)t.textContent="Gathering all of "+(state.brand||q)+"’s active ads · "+all.length+" found…";
  const params=new URLSearchParams({q:q||page,coverage:state.coverage,page,after:cursor});
  const data=await request("/api/ads?"+params,"GET",null,signal);
  for(const a of Array.isArray(data.ads)?data.ads:[])if(!seen.has(a.id)){seen.add(a.id);all.push(a)}
  cursor=data.nextCursor||null;
 }
 return {rows:all,cursor};
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
 feedback(moreBrands?"Looking for more advertiser pages…":"");
 if(page)state.pick=null;
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
   const ranked=rankedBrands(),top=ranked[0];
   const wholeWord=n=>new RegExp('^'+q.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![a-z0-9])','i').test(String(n).trim());
   if(!top||!(nameScore(q,top.name)>=5||wholeWord(top.name))){
    // No advertiser by that name: show who mentions it instead of guessing.
    state.page="";state.brand="";state.rows=[];
    state.pick={q,kind:"mentions",items:ranked.slice(0,8).map(c=>({id:c.id,name:c.name,mentions:c.count}))};
    busy(false);feedback("");renderCards();return;
   }
   const match=top;
   state.page=match?.id||"";
   state.brand=match?.name||"";
   if(match&&data.pageId!==state.page){
    // A keyword search only returns some of this advertiser's ads; load the Page itself.
    const first=await request("/api/ads?"+new URLSearchParams({q,coverage:state.coverage,page:state.page}),"GET",null,controller.signal);
    if(rid!==requestNumber)return;
    const full=await collectPageAds(q,state.page,controller.signal,Array.isArray(first.ads)?first.ads:[],first.nextCursor||null);
    if(rid!==requestNumber)return;
    state.rows=full.rows;state.cursor=full.cursor;
   }else{
    const full=match?await collectPageAds(q,state.page,controller.signal,rows.filter(ad=>ad.pageId===state.page),data.nextCursor||null):{rows:[],cursor:null};
    if(rid!==requestNumber)return;
    state.rows=full.rows;state.cursor=full.cursor;
   }
   state.needsPageStart=false;
  }else{
   state.page=page;state.brand=rows[0]?.pageName||state.brand||q;
   const seen=new Set(state.rows.map(ad=>ad.id));
   if(after||appendAds){state.rows=[...state.rows,...rows.filter(ad=>!seen.has(ad.id))];state.cursor=data.nextCursor||null}
   else{const full=await collectPageAds(q,page,controller.signal,rows,data.nextCursor||null);if(rid!==requestNumber)return;state.rows=full.rows;state.cursor=full.cursor}
   state.needsPageStart=false;
  }
  state.lastSearchAt=Date.now();
  state.variations=variationCounts(state.rows);state.expanded=new Set();
  state.changes=after||appendAds?state.changes:compareWithLastVisit();
  if(state.page&&state.brand&&state.rows.length){rememberAdvertiser(state.page,state.brand,state.rows.length);rememberPageId(state.brand,state.page)}
  state.adsFailed=false;
  feedback(state.rows.length?"":page?"Page found, no active UK ads in the selected countries.":"No matching advertiser pages returned. Try another search.");
  busy(false);
  renderCards();
 }catch(err){
  if(controller.signal.aborted)return;
  state.adsFailed=!!page;
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
 const keepF=[...node.querySelectorAll(".tilebadges")];
 node.innerHTML='<div class="creative-recovery"><strong>'+esc(title)+'</strong><small>'+esc(desc)+'</small><a target="_blank" rel="noopener noreferrer" href="'+metaUrl(id)+'">View creative on Meta ↗</a><button data-action="retrymedia" data-id="'+esc(id)+'">Retry preview</button></div>';
 node.append(...keepF);
}
function displayMedia(node,id,items){
 if(!node||!node.isConnected)return;
 const item=items[0];
 if(!item){mediaFallback(node,id,"NO_MEDIA");return}
 const media=document.createElement(item.kind==="video"?"video":"img");
 if(item.kind==="video"){media.controls=true;media.muted=true;media.loop=true;media.playsInline=true;media.preload="metadata";if(item.poster&&safeMedia(item.poster))media.poster=item.poster;media.setAttribute("aria-label","Meta ad video creative");}
 else media.alt="Original Meta Ad Library creative";
 media.onerror=()=>{mediaCache.delete(id);persistMedia();if(!mediaRetried.has(id)){mediaRetried.add(id);mediaState.delete(id);requestMedia(id,{refresh:true,priority:true});return}mediaState.set(id,{status:"failed",code:"FAILED",attempts:0});mediaFallback(node,id,"FAILED");node.dataset.loaded="failed"};
 media.classList.add("mfade");media.addEventListener(item.kind==="video"?"loadeddata":"load",()=>media.classList.add("on"),{once:true});
 media.src=item.url;
 const keep=[...node.querySelectorAll(".tilebadges,.fmtbadge")];node.replaceChildren(media,...keep);node.dataset.loaded="done";
 const fb=node.querySelector(".fmtbadge"),fm=formatOf(id);if(fb&&fm){fb.textContent=formatLabel[fm];fb.className="fmtbadge fmt-"+fm}
 if(items.length>1){
  const counter=document.createElement("button");
  counter.className="square";counter.style.cssText="position:absolute;bottom:12px;right:12px;background:white;width:auto;padding:0 12px;border-radius:50px;";
  let index=0;const fk=formatOf(id),unit=fk==="carousel"?"Card ":fk==="catalogue"?"Product ":"Size ";counter.title=fk==="carousel"?"Carousel cards":fk==="catalogue"?"Catalogue ad: Meta shows each person products from the brand's catalogue":"Same creative in different placement sizes";counter.textContent=unit+"1 / "+items.length+" ›";
  counter.onclick=e=>{e.preventDefault();index=(index+1)%items.length;const next=items[index];const changed=document.createElement(next.kind==="video"?"video":"img");if(next.kind==="video"){changed.controls=true;changed.muted=true;changed.playsInline=true;changed.preload="metadata";if(next.poster)changed.poster=next.poster}else changed.alt="Meta ad creative";changed.onerror=()=>mediaFallback(node,id,"FAILED");changed.src=next.url;node.replaceChild(changed,node.firstChild);counter.textContent=unit+(index+1)+" / "+items.length+" ›";};
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
 const keepP=[...node.querySelectorAll(".tilebadges,.fmtbadge")];
 node.innerHTML='<div class="creative-recovery"><span class="loadingring" aria-hidden="true"></span><strong>'+esc(title)+'</strong><small>'+esc(detail)+'</small></div>';
 node.append(...keepP);
}
function paintMedia(id){
 paintThumbs(id);
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
 if(mediaCache.has(id)){const c=mediaCache.get(id);if(!c.until||c.until>Date.now()){paintMedia(id);return}mediaCache.delete(id)}
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
  if(!mediaNodes(id).length&&!document.querySelector('[data-thumb="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]')){mediaState.delete(id);continue}
  st.status="loading";st.started=Date.now();mediaActive++;paintMedia(id);
  (async()=>{
   let data;
   try{
    const resp=await fetch("/api/media?id="+encodeURIComponent(id)+(st.refresh?"&refresh=1":""),{signal:AbortSignal.timeout(115000),cache:"no-store"});
    data=await resp.json().catch(()=>({code:resp.status===429?"RATE_LIMITED":"COLLECTOR_UNAVAILABLE",items:[]}));
   }catch{data={code:"COLLECTOR_UNAVAILABLE",items:[]}}
   const items=(Array.isArray(data.items)?data.items:[]).filter(i=>i&&["video","image"].includes(i.kind)&&safeMedia(i.url)).map(i=>({...i,url:safeMedia(i.url),poster:safeMedia(i.poster)})).filter((i,n,all)=>{const f=u=>{try{return new URL(u).pathname.split("/").pop()}catch{return u}};return all.findIndex(j=>f(j.url)===f(i.url))===n});
   if(items.length){mediaCache.set(id,{until:mediaUntil(items),items,collectedAt:data.collectedAt,displayFormat:typeof data.displayFormat==="string"?data.displayFormat:"",cards:Number(data.cards)||0,cta:cleanCta(data.cta)});persistMedia();paintCta(id);mediaState.set(id,{status:"done",attempts:st.attempts})}
   else if(MEDIA_RETRY_CODES.includes(data.code)&&st.attempts+1<MEDIA_MAX_ATTEMPTS){
    st.attempts++;st.status="queued";st.refresh=false;
    // Back off, then rejoin the queue behind ads that have not been tried yet.
    setTimeout(()=>{if(mediaState.get(id)===st&&st.status==="queued"){mediaQueue.push(id);paintQueue();pumpMedia()}},Math.min(4000*st.attempts,12000));
   }
   else mediaState.set(id,{status:"failed",code:data.code||"NO_MEDIA",attempts:st.attempts});
  })().finally(()=>{mediaActive--;paintMedia(id);paintQueue();pumpMedia();updateReveal()});
 }
}
function observeMedia(){
 // Collect the shown ads in display order so rows complete top to bottom.
 const ids=[...document.querySelectorAll("#cards [data-media]")].map(el=>el.dataset.media);
 for(const id of ids){paintMedia(id);requestMedia(id)}
 updateReveal(true);
}
function tileResolved(id){
 if(state.revealAll||mediaCache.has(id))return true;
 const st=mediaState.get(id);
 if(!st||st.status==="failed"||st.status==="done")return !st?false:true;
 // Never hold a whole row back for one slow creative.
 return st.status==="loading"&&st.started&&Date.now()-st.started>MEDIA_REVEAL_AFTER;
}
let revealTimer=null;
function updateReveal(instant=false){
 if(state.view==="intel"){renderIntel();return}
 const tiles=[...document.querySelectorAll("#cards .adcard")];
 // Keep the placeholder ads while the search itself is still running.
 if(tiles.length||!state.loading)document.querySelectorAll("#cards .tile-skel").forEach(e=>e.remove());
 if(!tiles.length){$("pager").style.display="";if(!state.loading)setBar("hide");return}
 const ids=tiles.map(t=>t.querySelector("[data-media]").dataset.media);
 let k=0;while(k<ids.length&&tileResolved(ids[k]))k++;
 const upTo=k===ids.length?k:Math.floor(k/3)*3;
 let fresh=0;
 tiles.forEach((t,i)=>{
  if(i<upTo&&t.classList.contains("tile-hidden")){
   t.classList.remove("tile-hidden");
   if(!instant){t.classList.add("tile-in");t.style.animationDelay=(fresh++%3)*90+"ms"}
  }
 });
 const ready=ids.filter(id=>mediaCache.has(id)||mediaState.get(id)?.status==="failed").length;
 const complete=upTo===ids.length;
 // Placeholder row where the next three tiles will appear.
 if(!complete){const grid=$("cards");for(let i=0;i<Math.min(3,ids.length-upTo);i++)grid.insertAdjacentHTML("beforeend",skelCard(i))}
 $("pager").style.display=complete?"":"none";
 if(complete&&ready===ids.length)setBar("done",ids.length,ids.length,ids);
 else if(complete)setBar("hide");
 else setBar("progress",ready,ids.length,ids);
 renderIntel();
 clearTimeout(revealTimer);
 // Re-check so a slow tile is released once it passes the reveal threshold.
 if(!complete)revealTimer=setTimeout(()=>updateReveal(),5000);
}
let barTimer=null;
let barRun={key:"",start:0,r0:0},gameTimer=0,gameMounted=false;
function stopGame(){clearTimeout(gameTimer);gameTimer=0;const g=window.AdSnoopDash;if(g)g.stop();$("loadbar")?.classList.remove("game")}
function mountGame(){if(gameMounted||!window.AdSnoopDash)return;gameMounted=true;window.AdSnoopDash.mount($("loadbarGame"))}
function barEta(ready,total){
 const now=Date.now(),elapsed=(now-barRun.start)/1000,done=ready-barRun.r0,left=total-ready;
 if(left<=0)return "";
 // Measured pace once a few creatives have landed, otherwise a typical first-collection pace.
 const per=done>=2&&elapsed>3?elapsed/done:18/MEDIA_CONCURRENCY;
 const secs=Math.round(left*per);
 return secs<8?"almost there":secs<60?"about "+Math.max(10,Math.round(secs/5)*5)+"s left":"about "+Math.round(secs/60)+" min left";
}
function paintStrip(ids){
 const strip=$("loadbarStrip");if(!strip)return;
 if(!ids){strip.innerHTML="";return}
 const want=ids.slice(0,25);
 if(strip.dataset.ids!==want.join(",")){strip.dataset.ids=want.join(",");strip.innerHTML=want.map(id=>'<span class="lb-slot" data-slot="'+esc(id)+'"></span>').join("")}
 for(const id of want){
  const slot=strip.querySelector('[data-slot="'+id+'"]');if(!slot||slot.classList.contains("in"))continue;
  const m=mediaCache.get(id);
  if(m&&m.items&&m.items.length){const first=m.items[0],src=safeMedia(first.kind==="video"?(first.poster||""):first.url);slot.classList.add("in");if(first.kind==="video")slot.classList.add("vid");if(src){const im=new Image();im.alt="";im.decoding="async";im.src=src;slot.appendChild(im)}}
  else if(mediaState.get(id)?.status==="failed")slot.classList.add("fail");
 }
}
function setBar(mode,ready=0,total=0,ids=null){
 const bar=$("loadbar");if(!bar)return;mountGame();
 clearTimeout(barTimer);
 const game=window.AdSnoopDash;
 if(mode==="hide"){bar.hidden=true;paintStrip(null);stopGame();return}
 bar.hidden=false;bar.classList.toggle("indeterminate",mode==="search");bar.classList.toggle("complete",mode==="done");
 const who=state.brand||state.query||"this advertiser";
 const fill=bar.querySelector(".loadbar-fill"),rider=$("loadbarRider"),hint=$("loadbarHint");
 if(mode==="search"){stopGame();fill.style.width="";rider.style.left="";$("loadbarText").textContent="Loading "+who+"’s ads…";hint.textContent="";$("loadbarAll").hidden=true;paintStrip(null);barRun={key:"",start:0,r0:0};bar.hidden=!!($("as-search-stage")&&!$("as-search-stage").hidden);return}
 const key=state.page+"|"+total;if(barRun.key!==key)barRun={key,start:Date.now(),r0:ready};
 const pct=total?Math.max(6,Math.round(ready/total*100)):0;
 fill.style.width=pct+"%";rider.style.left="calc("+pct+"% - "+(pct>=100?19:0)+"px)";
 // The story animation only appears when there is a real wait (not for instant loads).
 if(game&&game.supported){game.progress(total?ready/total:0);if(mode==="progress"&&!game.running&&!gameTimer)gameTimer=setTimeout(()=>{gameTimer=0;if(!$("loadbar").hidden&&!$("loadbar").classList.contains("complete")){bar.classList.add("game");game.start()}},900)}
 $("loadbarAll").hidden=mode==="done";
 paintStrip(ids);
 if(mode==="done"){
  const quick=Date.now()-barRun.start<2500;
  $("loadbarText").textContent="All "+total+" ads loaded";
  const gameLine=game&&game.running?game.finish():"";clearTimeout(gameTimer);gameTimer=0;
  hint.textContent=(gameLine?gameLine+" · ":"")+(quick?"Loaded instantly from the AdSnoop library.":"Saved to the AdSnoop library, so next time they’re instant.");
  barTimer=setTimeout(()=>{bar.hidden=true;paintStrip(null);stopGame()},game&&game.running?3200:2200);return}
 const eta=barEta(ready,total);
 $("loadbarText").textContent="Loading "+who+"’s ads · "+ready+" of "+total+" ready"+(eta?" · "+eta:"");
 hint.textContent=ready<total&&(Date.now()-barRun.start>2500)?"Ads appear below as their previews arrive. Each one is fetched from Meta once, then saved so it’s instant next time.":"Ads appear below as their previews arrive.";
}
// ---- Pinned competitors, your brand and the comparison view ----
const PIN_MAX=COMP_MAX;
// Research desk: "Track as my brand" adds the open advertiser as one of your brands.
function toggleMine(){
 if(!state.page)return;
 if(needAccount({kind:"brand",id:state.page,name:state.brand||"My brand"}))return;const b={id:state.page,name:state.brand||"My brand"},r=addBrand(b);
 if(r==="limit"){toast("The "+PLAN.name+" plan tracks "+PLAN.brands+" brand"+(PLAN.brands===1?"":"s")+". More brands are coming with paid plans.");return}
 if(r==="exists"){location.href="/tracker";return}
 toast("Tracking "+b.name+". Open My competitors to pick up to "+COMP_MAX+" competitors.");cmp.data.delete(b.id);showHeader();renderPinbar();
}
function unpin(id){setCompetitor(activeBrand()?.id||"",{id,name:""},false);renderPinbar();if(state.view==="compare"||state.view==="tracker")renderCards();else showHeader()}
function renderPinbar(){
 // The research desk no longer repeats your competitor list: My competitors has its own page,
 // and the brand's "Add to my competitors" button shows whether it's tracked.
 const el=$("pinbar");if(!el)return;el.hidden=true;el.innerHTML="";return;const list=followed(),mine=myBrand(),t=tracker();
 const show=(list.length||mine)&&!isStart()&&state.view!=="tracker";el.hidden=!show;if(!show){el.innerHTML="";return}
 const chip=(b,cls,label)=>'<span class="pinchip'+(b.id===state.page?' on':'')+(cls?' '+cls:'')+'"><button data-page="'+esc(b.id)+'" data-name="'+esc(b.name)+'" title="Open '+esc(b.name)+'">'+logoHTML(b.id,b.name,"")+'<span>'+esc(label||b.name)+'</span></button>'+(cls?'':'<button class="unpin" data-action="unpin" data-id="'+esc(b.id)+'" aria-label="Stop tracking '+esc(b.name)+'">×</button>')+'</span>';
 el.innerHTML='<span class="pin-k">'+(mine?'Tracking for '+esc(mine.name)+(t.brands.length>1?' (+'+(t.brands.length-1)+')':''):'Competitors')+' · '+list.length+'/'+COMP_MAX+'</span>'+(mine?chip(mine,"mine",mine.name+" · you"):'')+list.map(b=>chip(b)).join("")+'<a class="pin-cmp" href="/tracker">My competitors →</a>';
}
// ---- Accounts (Clerk) ----
// Switched on when the server has Clerk keys; until then everything runs in
// device mode. Signed-in users' brands sync to their account.
const auth={checking:true,enabled:false,clerk:null,signedIn:false,userId:"",pushTimer:0,pulling:false};
function loadScript(src,attrs){return new Promise((ok,bad)=>{const s=document.createElement("script");s.src=src;s.crossOrigin="anonymous";s.defer=true;for(const [k,v] of Object.entries(attrs||{}))s.setAttribute(k,v);s.onload=ok;s.onerror=()=>bad(Error("script"));document.head.appendChild(s)})}
async function initAuth(){
 let cfg=null;try{cfg=await fetch("/api/auth/config",{cache:"no-store"}).then(r=>r.ok?r.json():null)}catch{}
 if(!cfg||!cfg.enabled||!/^[a-z0-9.-]+$/i.test(cfg.frontendApi||"")){auth.checking=false;renderAccountUI();if(TRACKER)renderCards();return}
 auth.enabled=true;account.mode="clerk";
 try{
  const base="https://"+cfg.frontendApi+"/npm/";
  await loadScript(base+"@clerk/ui@1/dist/ui.browser.js");
  await loadScript(base+"@clerk/clerk-js@6/dist/clerk.browser.js",{"data-clerk-publishable-key":cfg.publishableKey});
  await window.Clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor},appearance:{variables:{colorPrimary:"#0071e3",borderRadius:"12px"}}});
  auth.clerk=window.Clerk;
  auth.clerk.addListener(({user})=>{onAuthChange(user||null)});
  await onAuthChange(auth.clerk.user||null);
 }catch{auth.enabled=false;account.mode="device";toast("Sign-in is unavailable right now. Your brands stay on this device.")}
 auth.checking=false;renderAccountUI();if(TRACKER||isStart())renderCards();
}
async function authToken(){try{return auth.clerk&&auth.clerk.session?await auth.clerk.session.getToken():null}catch{return null}}
async function onAuthChange(user){
 const id=user?user.id:"";
 if(id===auth.userId)return;
 const wasIn=auth.signedIn;auth.userId=id;auth.signedIn=!!id;account.user=id?{id,email:user.primaryEmailAddress?.emailAddress||""}:null;
 if(id){await pullAccount();applyIntent()}
 else if(wasIn){prefStore.write(TRACK_KEY,null);cmp.data.clear()} // signed out: don't leave brands on a shared device
 renderAccountUI();renderPinbar();if(TRACKER||state.view==="discover")renderCards();
}
async function pullAccount(){
 auth.pulling=true;
 try{
  const tok=await authToken();if(!tok)return;
  const r=await fetch("/api/account",{headers:{Authorization:"Bearer "+tok},cache:"no-store"});if(!r.ok)throw Error();
  const d=await r.json();
  if(d.plan==="pro")PLAN={name:"Pro",brands:10,competitors:COMP_MAX};
  const local=tracker();
  if(d.tracker&&d.tracker.brands&&d.tracker.brands.length)prefStore.write(TRACK_KEY,{v:1,active:d.tracker.active,brands:d.tracker.brands,pending:[]});
  else if(local.brands.length){pushAccount(true);toast("Your tracked brands are now saved to your account.")}
 }catch{toast("Couldn’t load your account. Changes stay on this device for now.")}
 finally{auth.pulling=false}
}
function pushAccount(now){
 if(!auth.signedIn)return;clearTimeout(auth.pushTimer);
 auth.pushTimer=setTimeout(async()=>{
  const t=tracker(),tok=await authToken();if(!tok)return;
  try{const r=await fetch("/api/account",{method:"PUT",headers:{Authorization:"Bearer "+tok,"Content-Type":"application/json"},body:JSON.stringify({tracker:{active:t.active,brands:t.brands}})});if(!r.ok)throw Error()}
  catch{toast("Couldn’t save to your account. We’ll retry on your next change.")}
 },now?0:600);
}
// Logged-out visitors on the desk: remember what they clicked, ask them to sign up.
const INTENT_KEY="adsnoop-intent-v1";
function needAccount(intent){
 if(!auth.enabled||auth.signedIn)return false;
 prefStore.write(INTENT_KEY,{...intent,at:Date.now()});
 toast("Create a free account to track competitors.");
 try{auth.clerk.openSignUp({})}catch{}
 return true;
}
function applyIntent(){
 const it=prefStore.read(INTENT_KEY,null);prefStore.write(INTENT_KEY,null);
 if(!it||Date.now()-it.at>30*60000||!/^\d{1,30}$/.test(it.id||""))return;
 if(it.kind==="brand"){if(addBrand({id:it.id,name:it.name})==="ok")toast("Tracking "+it.name+".")}
 else{const b=activeBrand();const r=setCompetitor(b?b.id:"",{id:it.id,name:it.name},true);if(r==="ok")toast("Added "+it.name+(b?" to "+b.name+"’s competitors":"")+".")}
}
function renderAccountUI(){
 const el=$("acct");if(!el)return;
 if(!auth.enabled){el.hidden=true;el.innerHTML="";return}
 el.hidden=false;
 if(auth.signedIn){if(!el.dataset.mounted){el.innerHTML='<div id="acctBtn"></div>';try{auth.clerk.mountUserButton($("acctBtn"))}catch{}el.dataset.mounted="1"}}
 else{delete el.dataset.mounted;el.innerHTML='<button type="button" class="acct-in" data-acct="signin">Sign in</button>'}
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-acct]");if(!b||!auth.clerk)return;if(b.closest("#modalOverlay"))$("modalOverlay").classList.remove("open");if(b.dataset.acct==="signin")auth.clerk.openSignIn({});if(b.dataset.acct==="signup")auth.clerk.openSignUp({})});
// Show the value before asking for an account. All example figures are illustrative.
function radarExampleBannerHTML(prefix){
 if(prefix!=="homeRadarExample")return '<div class="trk-example-head"><div><p class="eyebrow">A look inside the radar</p><h3 id="'+prefix+'Title">Find your next creative test.</h3><p>Compare your brand with up to five competitors, then see where your ads could try something different.</p></div><span class="trk-example-label">Illustrative example</span></div>';
 const instruments={
  format:'<rect x="5" y="9" width="32" height="25" rx="4"/><rect x="16" y="16" width="34" height="26" rx="4" class="rd-glyph-front"/><path d="m29 23 9 6-9 6Z" class="rd-glyph-fill"/>',
  message:'<path d="M5 9h32v18H17l-8 6v-6H5Z"/><path d="M19 21h32v18h-6v6l-8-6H19Z" class="rd-glyph-front"/><path d="M25 27h17m-17 6h11"/>',
  activity:'<path d="M5 39h46M5 27h46M5 15h46" opacity=".3"/><path d="M9 31h5v8H9zm10-12h5v20h-5zm10 5h5v15h-5zm10-14h5v29h-5z" class="rd-glyph-fill"/>'
 };
 const signals=radarExamples.map(signal=>`
   <button type="button" class="rd-signal rd-${signal.kind}" data-demo-filter="${signal.kind}" aria-controls="${prefix}Insights" aria-pressed="false">
     <svg class="rd-instrument" viewBox="0 0 56 52" aria-hidden="true">${instruments[signal.kind]}</svg>
     <span><b>${signal.tag}</b><small>${signal.shortMetric}</small></span>
   </button>`).join("");
 return '<div class="rd-banner"><div class="rd-grid" aria-hidden="true"></div><div class="rd-ambient" aria-hidden="true"></div><div class="rd-copy"><div class="rd-kicker"><span class="rd-kicker-mark" aria-hidden="true">✳</span> COMPETITOR RADAR</div><h3 id="'+prefix+'Title">Their ads.<br><span>Your next move.</span></h3><p class="rd-description">See how your Meta ads compare with your competitors’ ads, and choose what to test next.</p><span class="rd-example-badge">Illustrative data</span></div><div class="rd-stage" role="group" aria-label="Filter example insights"><div class="rd-disc" aria-hidden="true"><div class="rd-ring rd-ring-outer"></div><div class="rd-ring rd-ring-middle"></div><div class="rd-ring rd-ring-inner"></div><div class="rd-cross"></div><div class="rd-sweep"></div><span class="rd-dot rd-dot-a"></span><span class="rd-dot rd-dot-b"></span><span class="rd-dot rd-dot-c"></span><span class="rd-origin"></span></div>'+signals+'</div></div>';
}
const radarExamples=[
  {kind:"format",tag:"Creative mix",shortMetric:"Video share",title:"Give your best image a video version",mine:"12%",rivals:"46%",metric:"Video share of classified ads",why:"In this example, competitors use more video. That is a format gap to explore, not evidence that their videos perform better.",test:"Try a 15-second product demonstration with the same message and offer as your strongest image ad."},
  {kind:"message",tag:"Messaging gap",shortMetric:"Guarantees",title:"Make your reassurance easier to spot",mine:"2%",rivals:"24%",metric:"Ads mentioning a guarantee",why:"The example competitors mention guarantees more often. Your real radar checks the ad copy and links to the ads behind the finding; it does not verify the claims.",test:"If you offer a guarantee, test putting it beside your main benefit rather than leaving it on the landing page."},
  {kind:"activity",tag:"Creative activity",shortMetric:"New ad launches",title:"Try a steadier rhythm of new ads",mine:"4",rivals:"18",metric:"Active ads launched in the last 30 days",why:"This counts currently active ad IDs by their start date. Stopped ads are not included, and a new ad ID is not necessarily a new creative.",test:"Test one fresh angle each week. Compare the results in your own ad account before increasing production."}
 ];
function radarExampleHTML(prefix){
 const isHome=prefix==="homeRadarExample";
 function comparisonBar(signal,value){
  const scale=signal.mine.endsWith("%")?100:Math.max(Number(signal.mine),Number(signal.rivals));
  return '<i class="rd-bar" aria-hidden="true"><i style="width:'+parseFloat(value)/scale*100+'%"></i></i>';
 }
 const cards=radarExamples.map((o,i)=>'<article data-demo-kind="'+o.kind+'" class="op-card op-'+o.kind+'" style="--i:'+i+'"><span class="op-tag">'+o.tag+'</span><h4>'+o.title+'</h4><p class="trk-example-metric">'+o.metric+'</p><div class="trk-example-values"><div><strong>'+o.mine+'</strong><span>Example brand</span>'+comparisonBar(o,o.mine)+'</div><div><strong>'+o.rivals+'</strong><span>Competitor average</span>'+comparisonBar(o,o.rivals)+'</div></div><details class="trk-example-details"><summary>What this tells you</summary><p>'+o.why+'</p></details><div class="op-test"><span>Test idea</span>'+o.test+'</div></article>').join("");
 const filters=isHome
  ? '<div class="rd-results-head"><h4>Example insights</h4><button type="button" class="rd-reset" data-demo-filter="all" aria-controls="'+prefix+'Insights" aria-pressed="true">Show all signals</button></div>'
  : '<div class="trk-demo-filters" role="group" aria-label="Explore example opportunities">'+[["all","All opportunities"],["format","Creative mix"],["message","Messaging"],["activity","Activity"]].map(([key,label])=>'<button type="button" data-demo-filter="'+key+'" aria-pressed="'+(key==="all")+'">'+label+'</button>').join("")+'</div>';
 return '<section class="trk-sample" data-radar-example aria-labelledby="'+prefix+'Title">'+radarExampleBannerHTML(prefix)+filters+'<div class="op-grid" id="'+prefix+'Insights">'+cards+'</div><p class="trk-example-note">Made-up figures to explain the radar, not live research or sector benchmarks. Your radar uses the ads collected from Meta, with supporting ad links and coverage notes. Ad activity is not proof of performance.</p></section>';
}
function trackerGateHTML(){
 return '<div class="trk-gate">'+radarExampleHTML('radarExample')+'<section class="trk-gate-card" aria-labelledby="radarJoinTitle"><div><p class="trk-step">Make it yours · Free account</p><h3 id="radarJoinTitle">What could your brand try next?</h3><p>Choose your brand, add up to five competitors, and save your comparison to come back to.</p><ol class="trk-join-steps"><li>Find your brand</li><li>Choose competitors</li><li>Explore your opportunities</li></ol></div><div class="trk-join-action"><button class="pill" data-acct="signup">Build my free radar →</button><button class="ghost" data-acct="signin">Already have an account? Sign in</button><small>Free plan: 1 brand and up to 5 competitors.</small><a href="/" class="trk-browse">Explore live advertiser ads first ↗</a></div></section></div>';
}
// Preview filters stay local to each example; they never change tracked brands.
document.addEventListener("click",e=>{
 const button=e.target.closest("[data-demo-filter]");if(!button)return;
 const demo=button.closest("[data-radar-example]");if(!demo)return;
 for(const b of demo.querySelectorAll("[data-demo-filter]"))b.setAttribute("aria-pressed",String(b.dataset.demoFilter===button.dataset.demoFilter));
 for(const card of demo.querySelectorAll("[data-demo-kind]"))card.hidden=button.dataset.demoFilter!=="all"&&card.dataset.demoKind!==button.dataset.demoFilter;
});
if(!TRACKER&&$("radarDemo")){
 const home=$("radarDemo");
 home.innerHTML='<div class="wrap">'+radarExampleHTML("homeRadarExample")+'<div class="trk-home-next"><a class="pill" href="/tracker">Build my competitor radar →</a><span>Free account · 1 brand · up to 5 competitors</span></div></div>';
 home.hidden=false;
}
// ---- Tracker page (/tracker): brand switcher, onboarding and the dashboard ----
const trk={mode:null,target:"",query:"",results:null,searching:false,removed:null,timer:0,seq:0,lookups:new Map()};
function trackerHTML(){
 if(auth.checking)return '<div class="trk"><div class="op-empty"><span class="cmp-wait"></span> Checking your account…</div></div>';
 if(auth.enabled&&!auth.signedIn)return trackerGateHTML();
 const t=tracker(),active=activeBrand();
 const note=auth.signedIn?'<div class="trk-note"><span aria-hidden="true">✓</span><span>Saved to your account'+(account.user&&account.user.email?' ('+esc(account.user.email)+')':'')+'. Your brands follow you to any device.</span></div>':'<div class="trk-note"><span aria-hidden="true">🔒</span><span><b>Preview:</b> your brands are saved on this device. Sign-in with email or Google is on the way, and this setup will move into your account.</span></div>';
 if(!t.brands.length||trk.mode==="add")return '<div class="trk">'+(t.brands.length?switcherHTML(t):'')+onboardBrandHTML(t)+note+'</div>';
 const changing=["changebrand","changecomp","addcomp"].includes(trk.mode);
 const body=changing&&!active.competitors.length?trackerPickerHTML(active):trk.mode==="edit"||!active.competitors.length?editorHTML(active):compareHTML();
 const undo=trk.removed?.brandId===active.id?'<div class="trk-undo" role="status"><span>'+esc(trk.removed.competitor.name)+' removed from your competitors.</span><button type="button" data-tk="undo">Undo</button></div>':'';
 return '<div class="trk">'+switcherHTML(t)+undo+body+note+'</div>';
}
function switcherHTML(t){
 const atLimit=t.brands.length>=PLAN.brands;
 return '<div class="trk-bar"><div class="trk-brands" role="tablist" aria-label="Your brands">'+t.brands.map(b=>'<button role="tab" aria-selected="'+(b.id===t.active)+'" class="trk-b'+(b.id===t.active?' on':'')+'" data-tk="switch" data-id="'+esc(b.id)+'">'+logoHTML(b.id,b.name,"")+'<span>'+esc(b.name)+'<small>'+b.competitors.length+'/'+COMP_MAX+' competitors</small></span></button>').join("")+
  '<button class="trk-add'+(atLimit?' locked':'')+'" data-tk="newbrand" title="'+(atLimit?esc("The "+PLAN.name+" plan tracks "+PLAN.brands+" brand"+(PLAN.brands===1?"":"s")):"Track another brand")+'">'+(atLimit?'<span aria-hidden="true">🔒</span> ':'+ ')+'Add brand</button></div>'+
  (trk.mode!=="add"&&t.brands.length?'<div class="trk-acts"><button type="button" class="ghost" data-tk="changebrand">Change my brand</button><button class="ghost" data-tk="'+(trk.mode==="edit"?'done':'edit')+'">'+(trk.mode==="edit"?'Done':'Manage competitors')+'</button></div>':'')+'</div>';
}
function trkSearchBoxHTML(id,placeholder,label){
 const kind=trk.mode==="changebrand"?"replacebrand":trk.mode==="changecomp"?"replacecomp":id==="trkBrandQ"?"pick":"add";
 const results=trk.results?trkResultHTML(trk.results,kind,kind==="pick"?null:activeBrand()):trk.searching?'<p class="intel-sub">Checking the Ad Library…</p>':'';
 return '<div class="trk-search"><input id="'+id+'" type="search" value="'+esc(trk.query)+'" placeholder="'+esc(placeholder)+'" autocomplete="off" aria-label="'+esc(label)+'"><span class="trk-spin"'+(trk.searching?'':' hidden')+'></span></div><div class="trk-results" id="trkResults" aria-live="polite">'+results+'</div>';
}
function trackerPickerHTML(b){
 if(!["changebrand","changecomp","addcomp"].includes(trk.mode))return "";
 const mine=trk.mode==="changebrand",old=b.competitors.find(c=>c.id===trk.target);
 if(trk.mode==="changecomp"&&!old)return "";
 const title=mine?'Choose your brand':old?'Replace '+old.name:'Add a competitor';
 const copy=mine?'Your selected competitors will be kept. Your new brand is excluded from the competitor list.':old?old.name+' stays tracked until you choose a replacement.':'Only competitors you select are added to your tracker.';
 return '<section class="trk-on trk-picker" aria-labelledby="trkPickerTitle"><div class="trk-picker-head"><div><p class="trk-step">'+(mine?'Your brand':'Your selected competitors')+'</p><h3 id="trkPickerTitle">'+esc(title)+'</h3></div><button type="button" class="ghost" data-tk="cancel">Cancel</button></div><p class="intel-sub">'+esc(copy)+'</p>'+trkSearchBoxHTML(mine?'trkBrandQ':'trkCompQ','Search a brand name, website or Facebook Page',mine?'Search for your new brand':'Search for a competitor')+'</section>';
}
function onboardBrandHTML(t){
 const first=!t.brands.length;
 return '<section class="trk-on"><p class="trk-step">'+(first?'Step 1 of 2':'New brand')+'</p><h3>Which brand do you advertise for?</h3><p class="intel-sub">Search the advertiser’s name or website. You can track '+(PLAN.brands===1?'one brand':'up to '+PLAN.brands+' brands')+' on the '+esc(PLAN.name)+' plan'+(first&&t.pending.length?'; the '+t.pending.length+' competitor'+(t.pending.length===1?'':'s')+' you already added will carry over':'')+'.</p>'+trkSearchBoxHTML('trkBrandQ','e.g. 247 Blinds or 247blinds.co.uk','Search your brand')+(first?'':'<button class="ghost" data-tk="cancel">Cancel</button>')+'</section>';
}
function editorHTML(b){
 const n=b.competitors.length;
 return '<section class="trk-on"><p class="trk-step">'+(n?'Edit competitors':'Step 2 of 2')+'</p><h3>Who are '+esc(b.name)+'’s competitors?</h3><p class="intel-sub">Pick up to '+COMP_MAX+'. Search a brand, or a product or service you both sell (e.g. “blinds”) to see the advertisers with the most UK reach.</p>'+
  '<div class="trk-chosen">'+b.competitors.map(c=>'<span class="trk-chip">'+logoHTML(c.id,c.name,"")+esc(c.name)+'<button type="button" data-tk="changecomp" data-id="'+esc(c.id)+'" aria-label="Change competitor '+esc(c.name)+'">Change</button><button data-tk="rm" data-id="'+esc(c.id)+'" aria-label="Remove '+esc(c.name)+'">×</button></span>').join("")+Array.from({length:COMP_MAX-n},()=>'<span class="trk-chip empty">Empty slot</span>').join("")+'</div>'+
  (n<COMP_MAX?trkSearchBoxHTML('trkCompQ','Competitor name, website or product (e.g. blinds)','Search competitors'):'<p class="intel-sub">All '+COMP_MAX+' slots are full. Use Change on a competitor card to replace it directly.</p>')+
  '<div class="trk-foot">'+(n?'<button class="pill" data-tk="done">See the comparison →</button>':'')+(tracker().brands.length>1?'<button class="ghost danger" data-tk="delbrand" data-id="'+esc(b.id)+'">Stop tracking '+esc(b.name)+'</button>':'')+'</div></section>';
}
function trkResultHTML(list,kind,b){
 if(!list.length)return '<p class="intel-sub">No advertisers found. Try the brand’s website or a different word.</p>';
 return list.map((a,i)=>{
  const replacingBrand=kind==="replacebrand",taken=replacingBrand?tracker().brands.some(x=>x.id===a.id):b&&(b.competitors.some(c=>c.id===a.id)||b.id===a.id);
  const meta=a.source==="category"?a.count+" ads mention it"+(a.reach?" · UK reach "+compactNumber(a.reach):""):[a.category,a.count?a.count+" ads":""].filter(Boolean).join(" · ")||"Facebook Page";
  return '<button class="trk-r" style="--i:'+i+'" data-tk="'+kind+'" data-id="'+esc(a.id)+'" data-name="'+esc(a.name)+'"'+(taken?' disabled':'')+'>'+logoHTML(a.id,a.name,"",a.picture,a.logo)+'<span><b>'+esc(a.name)+'</b><small>'+esc(meta)+'</small></span><em>'+(taken?(b?.id===a.id?'Your brand':replacingBrand?'Already tracked':'Added'):kind==="replacebrand"?'Select my brand':kind==="replacecomp"?'Replace competitor':kind==="pick"?'This is mine':'+ Add')+'</em></button>';
 }).join("");
}
async function trkSearch(input){
 const q=input.value.trim(),kind=trk.mode==="changebrand"?"replacebrand":trk.mode==="changecomp"?"replacecomp":input.id==="trkBrandQ"?"pick":"add",seq=++trk.seq;
 trk.query=input.value;trk.results=null;trk.searching=q.length>=2;
 const spin=input.parentElement.querySelector(".trk-spin");if(spin)spin.hidden=!trk.searching;
 if(q.length<2){const out=$("trkResults");if(out)out.innerHTML="";return}
 const valid=a=>a&&/^\d{3,30}$/.test(a.id||""),list=[],seen=new Set(),add=xs=>{for(const a of xs||[])if(valid(a)&&!seen.has(a.id)){seen.add(a.id);list.push(a)}};
 const show=(pending)=>{if(seq!==trk.seq)return;trk.results=list.length||!pending?list.slice(0,10):null;trk.searching=pending;const out=$("trkResults");if(out)out.innerHTML=list.length?trkResultHTML(trk.results,kind,kind==="pick"?null:activeBrand()):pending?'<p class="intel-sub">Checking the Ad Library for “'+esc(q)+'”…</p>':trkResultHTML([],kind,null);const currentSpin=document.querySelector('.trk-search .trk-spin');if(currentSpin)currentSpin.hidden=!pending};
 // Fast: known advertisers (and, for competitors, advertisers using the word).
 const [named,cat]=await Promise.all([fetchSuggestions(q).catch(()=>[]),fetchCategorySuggestions(q).catch(()=>[])]);
 add(named);add(cat);
 const exact=list.some(a=>canonicalName(a.name)===canonicalName(q));
 show(!exact);
 // Thorough: the same Page lookup the main search uses (website, Page name, Ad Library).
 if(!exact){
  try{const ck=canonicalName(q);let d=trk.lookups.get(ck);if(!d){const r=await fetch("/api/advertisers?"+new URLSearchParams({q}),{cache:"no-store",signal:AbortSignal.timeout(25000)});d=await r.json();if(trk.lookups.size>50)trk.lookups.clear();trk.lookups.set(ck,d)}if(seq!==trk.seq)return;const found=(Array.isArray(d.advertisers)?d.advertisers:[]).map(a=>({...a,count:a.adCount||0}));list.unshift(...found.filter(a=>valid(a)&&!seen.has(a.id)));found.forEach(a=>valid(a)&&seen.add(a.id));add((Array.isArray(d.mentions)?d.mentions:[]).map(a=>({id:a.id,name:a.name,count:a.count||0,source:"category"})))}catch{}
  show(false);
 }
 if(seq===trk.seq){trk.searching=false;const currentSpin=document.querySelector('.trk-search .trk-spin');if(currentSpin)currentSpin.hidden=true;}
}
function trkInput(e){const i=e.target;if(!i||(i.id!=="trkBrandQ"&&i.id!=="trkCompQ"))return;clearTimeout(trk.timer);++trk.seq;trk.query=i.value;trk.results=null;trk.searching=i.value.trim().length>=2;trk.timer=setTimeout(()=>{const current=$(i.id);if(current)trkSearch(current)},350)}
function trkFocus(){setTimeout(()=>{const i=$("trkCompQ")||$("trkBrandQ");if(i){i.scrollIntoView({block:"center",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});if(!("ontouchstart" in window))i.focus({preventScroll:true})}},50)}
function trkClick(e){
 const b=e.target.closest("[data-tk]");if(!b||b.disabled)return;
 const k=b.dataset.tk,id=b.dataset.id,name=b.dataset.name;
 clearTimeout(trk.timer);++trk.seq;trk.searching=false;
 const keep=(k==="add"||k==="rm")&&trk.mode==="edit"?trk.query:"";
 if(!keep){trk.query="";trk.results=null}
 if(k==="switch"){switchBrand(id);trk.mode=null;cmp.anim=true}
 else if(k==="newbrand"){if(tracker().brands.length>=PLAN.brands){toast("The "+PLAN.name+" plan tracks "+PLAN.brands+" brand"+(PLAN.brands===1?"":"s")+". Multi-brand tracking is coming with paid plans.");return}trk.mode="add"}
 else if(k==="cancel"){trk.mode=null;trk.target=""}
 else if(k==="changebrand"){trk.mode="changebrand";trk.target=""}
 else if(k==="changecomp"){if(!activeBrand()?.competitors.some(c=>c.id===id))return;trk.mode="changecomp";trk.target=id}
 else if(k==="addcomp"){if(activeBrand()?.competitors.length>=COMP_MAX){toast("All competitor slots are full. Use Change competitor to replace one.");return}trk.mode="addcomp";trk.target=""}
 else if(k==="replacecomp"||k==="replacebrand"){
  const ab=activeBrand();if(!ab)return;
  const r=k==="replacebrand"?replaceTrackedBrand(ab.id,{id,name}):replaceCompetitor(ab.id,trk.target,{id,name});
  if(r!=="ok"){toast(r==="self"?"That’s your brand.":r==="exists"?"That advertiser is already selected.":"The selection changed. Please try again.");return}
  trk.mode=null;trk.target="";trk.removed=null;cmp.anim=true;toast(k==="replacebrand"?"Your brand is now "+name:"Now tracking "+name);
 }
 else if(k==="pick"){const r=addBrand({id,name});if(r==="limit"){toast("The "+PLAN.name+" plan tracks "+PLAN.brands+" brand"+(PLAN.brands===1?"":"s")+".");return}trk.mode=activeBrand()?.competitors.length?null:"edit"}
 else if(k==="add"){const ab=activeBrand();const r=setCompetitor(ab.id,{id,name},true);if(r==="full"){toast("Up to "+COMP_MAX+" competitors per brand.");return}if(r==="self"){toast("That’s your brand.");return}trk.mode=trk.mode==="addcomp"?null:"edit";toast("Added "+name)}
 else if(k==="rm"){removeTrackedCompetitor(activeBrand().id,id);if(trk.mode!=="edit")trk.mode=null}
 else if(k==="undo"){const r=undoTrackedCompetitor();if(r!=="ok"){toast(r==="full"?"Remove a competitor to make room before undoing.":"That competitor is already selected or the brand changed.");return}trk.mode=null}
 else if(k==="edit")trk.mode="edit";
 else if(k==="done"){trk.mode=null;cmp.anim=true}
 else if(k==="delbrand"){if(!confirmStop(b))return;removeBrand(id);trk.mode=null}
 else return;
 renderCards();
 if(keep){const i=$("trkCompQ");if(i){i.value=keep;trkSearch(i);i.focus({preventScroll:true})}}
 else if(trk.mode)trkFocus();
}
// Two-step confirm without a browser dialog.
function confirmStop(b){if(b.dataset.armed){return true}b.dataset.armed="1";b.textContent="Click again to stop tracking";setTimeout(()=>{if(b.isConnected){delete b.dataset.armed}},4000);return false}
// ---- Compare: your brand against up to five competitors ----
// Data: /api/compare collects every accessible active ad per advertiser (no media),
// cached on the server. Messaging reuses messagingThemes(); spend is a separate,
// explicitly labelled category benchmark model, never observed performance.
const cmp={data:new Map(),running:false,timer:0,tab:"overview",mode:"share",sort:"",anim:true,memo:new WeakMap()};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function compareBrands(){const set=comparisonSet();return (set.mine?[{...set.mine,mine:true}]:[]).concat(set.competitors)}
const median=xs=>{const s=xs.filter(x=>x!=null).sort((a,b)=>a-b);if(!s.length)return null;const m=Math.floor(s.length/2);return s.length%2?s[m]:Math.round((s[m-1]+s[m])/2)};
const pctOf=(n,t)=>t?Math.round(n/t*100):0;
const fmtN=n=>Number(n||0).toLocaleString("en-GB");
const FMT=[{k:"v",label:"Video",c:"#6e56cf"},{k:"s",label:"Static image",c:"#2f80ed"},{k:"c",label:"Carousel",c:"#f5a524"},{k:"d",label:"Catalogue / dynamic",c:"#14a3a3"},{k:"i",label:"Image-based, type unconfirmed",c:"#a9c8ef"},{k:"u",label:"Unknown",c:"#d9dbe3"}];
const fmtName=k=>FMT.find(f=>f.k===k).label;
// Older single-page loader, used only if the comparison service can't be reached.
async function loadBrandRowsFallback(b){
 let rows=[],cursor=null,pages=0,seen=new Set();
 do{
  const p=new URLSearchParams({q:b.name,coverage:state.coverage,page:b.id});if(cursor)p.set("after",cursor);
  let d;try{d=await request("/api/ads?"+p)}catch(e){if(e.code!=="RATE_LIMITED")throw e;await sleep(20000);d=await request("/api/ads?"+p)}
  for(const a of Array.isArray(d.ads)?d.ads:[])if(!seen.has(a.id)){seen.add(a.id);rows.push({...a,fmt:"u"})}
  cursor=d.nextCursor||null;
 }while(cursor&&++pages<2);
 return {status:"ready",rows,meta:{complete:!cursor,limitReason:cursor?"Only the newest "+rows.length+" ads could be loaded.":null,source:"fallback",formats:{complete:false,basis:{},note:"Formats unavailable in this fallback."},generatedAt:new Date().toISOString()}};
}
function toRows(d){return (d.ads||[]).map(a=>({id:a.id,start:a.s||"",stop:a.e||null,fmt:a.f||"u",title:a.t||"",copy:a.b||"No ad copy provided by Meta.",reach:a.r??null,pageId:d.page}))}
async function loadCompare(force){
 if(cmp.running)return;cmp.running=true;clearTimeout(cmp.timer);
 const brands=compareBrands();if(!brands.length){cmp.running=false;return}
 if(force)for(const b of brands)cmp.data.delete(b.id);
 const started=Date.now(),coverage=state.coverage,selection=brands.map(b=>b.id).join(","),current=()=>coverage===state.coverage&&selection===compareBrands().map(b=>b.id).join(",");
 try{
  while(true){
   if(!current())break;
   const need=brands.filter(b=>{const d=cmp.data.get(b.id);return !d||d.status==="running"||d.status==="queued"});
   if(!need.length)break;
   let st;
   try{st=await request("/api/compare?"+new URLSearchParams({pages:need.map(b=>b.id).join(","),coverage}))}
   catch(e){
    if(!current())break;
    // Service unavailable: fall back to the older sample so the page still works.
    for(const b of need){cmp.data.set(b.id,{status:"running",fetched:0,phase:"fallback"});}
    if(state.view==="compare"||state.view==="tracker")renderCards();
    for(const b of need){if(!current())break;try{cmp.data.set(b.id,await loadBrandRowsFallback(b))}catch(err){cmp.data.set(b.id,{status:"error",error:err.message||"Couldn’t load"})}if(state.view==="compare"||state.view==="tracker")renderCards()}
    break;
   }
   if(!current())break;
   for(const b of need){
    if(!current())break;
    const it=st.items&&st.items[b.id]||{status:"queued"};
    if(it.status==="ready"){
     try{const d=await request("/api/compare?"+new URLSearchParams({page:b.id,coverage}));
      if(Array.isArray(d.ads)&&current()){cmp.data.set(b.id,{status:"ready",rows:toRows(d),meta:d});recordSnapshot(b.id,d)}
     }catch(e){cmp.data.set(b.id,{status:"error",error:e.message||"Couldn’t load"})}
    }else if(it.status==="error")cmp.data.set(b.id,{status:"error",error:it.error||"Couldn’t load"});
    else cmp.data.set(b.id,{status:it.status==="running"?"running":"queued",fetched:it.fetched||0,phase:it.phase||"queued"});
   }
   if(state.view==="compare"||state.view==="tracker")renderCards();
   if(Date.now()-started>8*60000)break;
   await sleep(2500);
  }
 }finally{cmp.running=false;if(state.view==="compare"||state.view==="tracker")renderCards()}
}
// Observed history, kept per browser: which ad IDs were active at each complete check.
// Lets us say "newly observed" or "no longer active" only when we really saw both states.
const snapKey=id=>"adsnoop-cmp-snap-v1:"+id;
function recordSnapshot(id,d){
 if(!d.complete||!Array.isArray(d.ads))return;
 const cur={at:Date.parse(d.generatedAt)||Date.now(),ids:d.ads.map(a=>a.id)};
 const s=prefStore.read(snapKey(id),{});
 if(s.last&&cur.at-s.last.at<20*3600e3){s.last=s.last.ids.length===cur.ids.length?s.last:{...cur,at:s.last.at}}
 else{if(s.last)s.prev=s.last;s.last=cur}
 prefStore.write(snapKey(id),s);
}
function observedChange(id,rows){
 const s=prefStore.read(snapKey(id),{});if(!s.prev)return null;
 const before=new Set(s.prev.ids),now=new Set(rows.map(a=>a.id));
 let added=0,gone=0;for(const x of now)if(!before.has(x))added++;for(const x of before)if(!now.has(x))gone++;
 return {since:s.prev.at,added,gone};
}
// Benchmarks for one advertiser, computed once per dataset.
function bench(c){
 const d=c.d;if(!d||d.status!=="ready")return null;
 const hit=cmp.memo.get(d);if(hit)return hit;
 const rows=d.rows,total=new Set(rows.map(a=>a.id)).size,days=rows.map(daysRunning);
 const fmt={v:0,s:0,c:0,d:0,i:0,u:0};for(const a of rows)fmt[a.fmt in fmt?a.fmt:"u"]++;
 const classified=total-fmt.u,imageBased=fmt.s+fmt.c+fmt.d+fmt.i;
 const n7=days.filter(x=>x!=null&&x<=7).length,n30=days.filter(x=>x!=null&&x<=30).length,long=days.filter(x=>x!=null&&x>=90).length;
 const age={a:days.filter(x=>x!=null&&x<=7).length,b:days.filter(x=>x!=null&&x>7&&x<30).length,c:days.filter(x=>x!=null&&x>=30&&x<90).length,d:long};
 const recent=rows.filter(a=>{const x=daysRunning(a);return x!=null&&x<=30&&a.fmt!=="u"}),older=rows.filter(a=>{const x=daysRunning(a);return x!=null&&x>30&&a.fmt!=="u"});
 const themes=messagingThemes(rows),share={},count={},byRule={};
 for(const t of themes){share[t.id]=pctOf(t.ads.length,total);count[t.id]=t.ads.length;byRule[t.id]=t}
 const offerIds=new Set(themes.filter(t=>t.category==="offers").flatMap(t=>t.ads.map(a=>a.id)));
 const top=cat=>themes.find(t=>t.category===cat)?.label||"—";
 const meta=d.meta||{};
 const out={total,creatives:new Set(rows.map(groupKey)).size,fmt,classified,confirmed:imageBased?(fmt.s+fmt.c+fmt.d)/imageBased:1,n7,n30,long,age,median:median(days),weekly:weeklyLaunches(rows,12),
  recentVideo:recent.length>=5?pctOf(recent.filter(a=>a.fmt==="v").length,recent.length):null,olderVideo:older.length>=5?pctOf(older.filter(a=>a.fmt==="v").length,older.length):null,recentN:recent.length,olderN:older.length,
  share,count,byRule,offers:pctOf(offerIds.size,total),offerN:offerIds.size,hook:top("hooks"),benefit:top("benefits"),proof:top("proof"),cta:topCTAs(rows).list[0]?.label||"—",
  partial:!meta.complete,limitReason:meta.limitReason||null,fmtComplete:!!(meta.formats&&meta.formats.complete),fmtNote:meta.formats?.note||"",source:meta.source||"",carouselKnown:meta.source==="direct",generatedAt:meta.generatedAt,
  change:observedChange(c.id,rows)};
 cmp.memo.set(d,out);return out;
}
const fpct=(b,k)=>b.classified?pctOf(b.fmt[k],b.classified):0;
const listNames=xs=>xs.length<=1?xs.join(""):xs.slice(0,-1).join(", ")+" and "+xs[xs.length-1];
const words=["no","one","two","three","four","five","six"];
const numWord=n=>words[n]||String(n);
const cap1=t=>t.charAt(0).toUpperCase()+t.slice(1);
// "Three of your four competitors" / "All four competitors", with the base stated.
const ofYour=(k,n)=>k===n?(n===1?"Your competitor":"All "+numWord(n)+" competitors"):cap1(numWord(k))+" of your "+numWord(n)+" competitors";
function evidenceFor(cols,pick,limit=4){
 const out=[],used=new Set();
 // One ad per competitor first, then fill; never the same creative twice.
 for(let round=0;round<2&&out.length<limit;round++)for(const c of cols){
  const ads=pick(c).filter(a=>!used.has(groupKey(a)));if(!ads.length)continue;
  const take=round?ads:ads.slice(0,1);
  for(const a of take){if(out.length>=limit)break;if(used.has(groupKey(a)))continue;used.add(groupKey(a));out.push({a,c})}
 }
 return out;
}
const byReach=(x,y)=>(y.reach??-1)-(x.reach??-1)||String(x.start||"9").localeCompare(String(y.start||"9"));
// Creative Opportunity Radar: deterministic, explainable comparisons. Picks the
// strongest two or three, one per kind, each with denominators and caveats.
function opportunities(cols){
 const me=cols.find(c=>c.mine&&c.b),rivals=cols.filter(c=>!c.mine&&c.b&&c.b.total>=10);
 if(!cols.some(c=>c.mine))return {list:[],why:"mine"};
 if(!me)return {list:[],why:"wait"};
 if(!rivals.length||me.b.total<5)return {list:[],why:rivals.length?"small":"rivals"};
 const R=rivals.length,partial=[me,...rivals].filter(c=>c.b.partial).map(c=>c.name);
 const small=cols.filter(c=>!c.mine&&c.b&&c.b.total<10).map(c=>c.name+" ("+c.b.total+")");
 const pnote=(partial.length?" Partial data for "+listNames(partial)+": counts cover the ads collected.":"")+(small.length?" Left out with fewer than ten active ads: "+listNames(small)+".":"");
 const cand=[];
 const fmtWhy={v:"Competitors are putting production effort into video. If your customers respond the way theirs might, your account may have little creative suited to Reels, Stories and in-stream placements. This shows where competitors invest, not what performs for them.",c:"Carousels let competitors show a range, steps or several benefits in one ad. Heavy use suggests they see value in giving people more to swipe through. It doesn’t prove carousels work better.",d:"Catalogue ads are built from a product feed and are typically used for product retargeting or broad product prospecting. Competitors running them likely have a feed set up; you may be missing that coverage."};
 const fmtTest={v:"Turn your strongest current static concept into a 6–15 second video with the same offer, audience and landing page, and run it against the static version.",c:"Build a 3–5 card carousel from one existing concept (one product, benefit or step per card) and test it against your best single image.",d:"If you sell products online, test a catalogue ad set from your product feed against your best static product ad, with the same budget and audience."};
 for(const k of ["v","c","d"]){
  if(k==="c"&&!me.b.carouselKnown)continue;
  // Carousel and catalogue counts are only trusted when most image-based ads have a confirmed type.
  const rv=rivals.filter(c=>c.b.classified>=10&&(k==="v"||c.b.confirmed>=.6));if(rv.length<1||me.b.classified<5||(k!=="v"&&me.b.confirmed<.6))continue;
  const mine=fpct(me.b,k),vals=rv.map(c=>fpct(c.b,k)),avg=Math.round(vals.reduce((s,x)=>s+x,0)/vals.length),users=rv.filter(c=>fpct(c.b,k)>=20);
  if(avg-mine>=15&&users.length>=Math.min(2,rv.length)){
   const lo=Math.min(...vals),hi=Math.max(...vals);
   cand.push({kind:"format",tag:"Format opportunity",score:(avg-mine)*(users.length/rv.length)*1.1,
    title:fmtName(k)+" is under-used in your ads",
    data:"Your brand uses "+fmtName(k).toLowerCase()+" in "+mine+"% of classified ads ("+me.b.fmt[k]+" of "+fmtN(me.b.classified)+"), compared with a competitor average of "+avg+"% (range "+lo+"–"+hi+"% across "+rv.length+"). "+ofYour(users.length,rv.length)+" use it in at least 20% of their ads.",
    why:fmtWhy[k],test:fmtTest[k],
    ev:evidenceFor(users,c=>c.d.rows.filter(a=>a.fmt===k).sort(byReach)),
    note:"Shares use classified ads only (unknown formats excluded)."+(rivals.concat(me).some(c=>!c.b.fmtComplete)?" Some formats couldn’t be classified.":"")+pnote});
  }
 }
 {
  const busy=rivals.filter(c=>c.b.n30>=10),med=median(busy.map(c=>c.b.n30));
  if(busy.length>=Math.min(2,R)&&med!=null&&me.b.n30<med/2){
   cand.push({kind:"activity",tag:"Creative activity",score:Math.min(60,(med-me.b.n30)/med*60)*(busy.length/R),
    title:"Competitors are launching more new ads",
    data:ofYour(busy.length,R)+" have at least ten currently active ads launched in the last 30 days (median "+med+"). You have "+me.b.n30+".",
    why:"A steadier stream of new ads gives an account more creative to rotate and learn from, and suggests those competitors are actively testing. It doesn’t show their new ads are working.",
    test:"Commit to a fixed cadence for the next month, for example three to five new ads a fortnight, each built around one message, and track how many are still running after 30 days.",
    ev:evidenceFor(busy,c=>c.d.rows.filter(a=>{const x=daysRunning(a);return x!=null&&x<=30}).sort((x,y)=>String(y.start).localeCompare(String(x.start)))),
    note:"Counts only include ads still active today, by Meta’s delivery start date; ads launched and already stopped aren’t visible, and a launch isn’t necessarily new creative."+pnote});
  }
 }
 const catWhy={hooks:"It’s a recurring way competitors open their ads, so your audience is seeing it often from others.",benefits:"Competitors keep returning to this benefit, which suggests they think it matters to buyers in this category.",offers:"Competitors are giving people a reason to act now. If your ads rarely do, compare them on how clear the next step and incentive are.",proof:"Reassurance answers buying objections. If competitors keep addressing them and you don’t, your ads may leave the question open.",actions:"This is a common next step competitors ask for."};
 for(const r of messageRules){
  if(r.category==="actions")continue;
  const mine=me.b.share[r.id]||0,users=rivals.filter(c=>(c.b.share[r.id]||0)>=15);
  if(mine<5&&users.length>=Math.min(2,R)){
   const avgU=Math.round(users.reduce((s,c)=>s+c.b.share[r.id],0)/users.length);
   cand.push({kind:"message",tag:"Messaging gap",score:(avgU-mine)*(users.length/R),
    title:r.label+": competitors use it, you rarely do",
    data:ofYour(users.length,R)+" use "+r.label.toLowerCase()+" in at least 15% of their ads ("+users.slice(0,3).map(c=>c.name+" "+c.b.share[r.id]+"%").join(", ")+"). It appears in "+mine+"% of yours ("+(me.b.count[r.id]||0)+" of "+fmtN(me.b.total)+").",
    why:catWhy[r.category],test:r.test,
    ev:evidenceFor(users,c=>(c.b.byRule[r.id]?.ads||[]).slice().sort(byReach)).map(e=>({...e,quote:e.c.b.byRule[r.id]?.evidence[e.a.id]})),
    note:"Themes are matched in ad text by fixed rules; claims aren’t verified."+pnote});
  }
  if(mine>=15&&(me.b.count[r.id]||0)>=3&&rivals.every(c=>(c.b.share[r.id]||0)<5)){
   cand.push({kind:"edge",tag:"Your distinctive advantage",score:mine*0.6,
    title:"You own "+r.label.toLowerCase(),
    data:r.label+" appears in "+mine+"% of your ads ("+me.b.count[r.id]+" of "+fmtN(me.b.total)+"). None of your "+R+" competitors uses it in more than 5% of theirs.",
    why:"It’s a point of difference in what people see from your category. Worth protecting rather than diluting.",
    test:"Keep "+r.label.toLowerCase()+" in your lead creative and test moving it earlier (first line of copy or first three seconds) against your current version.",
    ev:evidenceFor([me],c=>(c.b.byRule[r.id]?.ads||[]).slice().sort(byReach)).map(e=>({...e,quote:me.b.byRule[r.id]?.evidence[e.a.id]})),
    note:"Themes are matched in ad text by fixed rules."+pnote});
  }
 }
 {
  const avg=Math.round(rivals.reduce((s,c)=>s+c.b.offers,0)/R);
  if(avg-me.b.offers>=20)cand.push({kind:"offer",tag:"Offer strategy",score:(avg-me.b.offers)*0.7,
   title:"Competitors lean harder on offers",
   data:"Offers (price incentives, free first steps or payment options) appear in "+me.b.offers+"% of your ads ("+me.b.offerN+" of "+fmtN(me.b.total)+") against a competitor average of "+avg+"%.",
   why:"Competitors are giving people a reason to act now. That may suit the category’s buying cycle, or it may be margin they’re willing to give away.",
   test:"If you have a genuine offer, test stating it clearly in the first line against your current opening. Don’t invent one to match competitors.",
   ev:evidenceFor(rivals.filter(c=>c.b.offers>=avg),c=>c.d.rows.filter(a=>["saving","free","finance"].some(id=>c.b.byRule[id]?.evidence[a.id])).sort(byReach)),
   note:"Offer detection reads ad text only."+pnote});
 }
 cand.sort((a,b)=>b.score-a.score);
 const picked=[],kinds=new Set();
 for(const x of cand){if(picked.length>=3)break;if(kinds.has(x.kind))continue;kinds.add(x.kind);picked.push(x)}
 return {list:picked,why:"none"};
}
// ---- Rendering ----
function cmpStatusChip(c){
 const d=c.d,b=c.b;
 if(b)return '<span class="cb-st '+(b.partial?'part':'ok')+'" title="'+esc(b.partial?(b.limitReason||"Partial data")+" Figures use the "+fmtN(b.total)+" ads collected.":"All accessible active ads analysed")+'">'+(b.partial?'Partial · ':'')+fmtN(b.total)+' ads</span>';
 if(d&&d.status==="error")return '<span class="cb-st err">Couldn’t load</span>';
 return '<span class="cb-st load"><i></i>'+(d&&d.fetched?'Collecting '+fmtN(d.fetched)+'…':d&&d.phase==="formats"?'Classifying…':'Queued…')+'</span>';
}
function brandStrip(cols){
 const ready=cols.filter(c=>c.b),rank=[...ready].sort((x,y)=>y.b.total-x.b.total);
 return '<p class="cb-help">Your selected brands. Use Change to swap a selection; View ads opens a separate tab.</p><div class="cb-strip" role="list">'+cols.map(c=>{
  const r=c.b?rank.indexOf(c)+1:0;
  const change='<button type="button" data-tk="'+(c.mine?'changebrand':'changecomp')+'" data-id="'+esc(c.id)+'" aria-label="'+esc(c.mine?'Change my brand':'Change competitor '+c.name)+'">'+(c.mine?'Change my brand':'Change competitor')+'</button>';
  return '<div class="cb'+(c.mine?' me':'')+'" role="listitem"><div class="cb-name">'+logoHTML(c.id,c.name,"")+'<span><b>'+esc(c.name)+'</b><small>'+(c.mine?'Your brand':'Competitor')+'</small></span></div><div class="cb-foot">'+cmpStatusChip(c)+(r?'<span class="cb-rank" title="Rank by active ads">#'+r+'</span>':'')+'</div><div class="cb-actions">'+change+(!c.mine?'<button type="button" class="cb-remove" data-tk="rm" data-id="'+esc(c.id)+'" aria-label="Remove '+esc(c.name)+' from competitors">Remove</button>':'')+'</div><a class="cb-view" href="/?'+new URLSearchParams({page:c.id,name:c.name}).toString()+'" target="_blank" rel="noopener noreferrer" aria-label="View ads for '+esc(c.name)+' in a new tab">View ads ↗</a></div>';
 }).join("")+(cols.filter(c=>!c.mine).length<COMP_MAX?'<button type="button" class="cb-add" data-tk="addcomp"><span aria-hidden="true">+</span><b>Add competitor</b><small>Choose who to track</small></button>':'')+'</div>';
}
function tabsHTML(){
 const t=[["overview","Overview"],["mix","Creative mix"],["activity","Creative activity"],["messaging","Messaging"],["remix","Remix ads ✦"]];
 return '<div class="cmp-tabs" role="tablist" aria-label="Comparison sections">'+t.map(([k,l])=>'<button role="tab" aria-selected="'+(cmp.tab===k)+'" class="'+(cmp.tab===k?'on':'')+'" data-action="cmptab" data-tab="'+k+'">'+l+'</button>').join("")+'</div>';
}
function evidenceHTML(ev){
 if(!ev||!ev.length)return "";
 return '<div class="op-ev"><span class="op-k">Supporting ads</span><div class="op-ev-row">'+ev.map(e=>'<a class="op-ad" href="https://www.facebook.com/ads/library/?id='+esc(e.a.id)+'" target="_blank" rel="noopener noreferrer" title="'+esc(e.c.name+(e.quote?" — “"+e.quote+"”":"")+" · open in Meta Ad Library")+'">'+thumbHTML(e.a.id,"op-th")+'<span><b>'+esc(e.c.name)+'</b><small>'+esc(e.quote?"“"+e.quote.slice(0,70)+(e.quote.length>70?"…":"")+"”":fmtName(e.a.fmt)+(e.a.start?" · since "+e.a.start:""))+'</small></span></a>').join("")+'</div></div>';
}
function radarHTML(cols){
 const loading=cols.some(c=>!c.b&&!(c.d&&c.d.status==="error"));
 const op=opportunities(cols);
 const head='<div class="op-head"><div><p class="eyebrow">Creative Opportunity Radar</p><h3>Where your brand could test next</h3></div><span class="op-sub">The strongest differences between your ads and your competitors’, ranked. Signals of competitor activity, not proof of performance.</span></div>';
 if(op.why==="mine")return '<section class="op">'+head+'<div class="op-empty">Add your brand in <a href="/tracker">My competitors</a> to see opportunities against your competitors.</div></section>';
 if(op.why==="wait")return '<section class="op">'+head+'<div class="op-empty"><span class="cmp-wait"></span> Collecting your ads and your competitors’ ads. Opportunities appear as soon as they’re in.</div></section>';
 if(op.why==="rivals"||op.why==="small")return '<section class="op">'+head+'<div class="op-empty">'+(loading?'<span class="cmp-wait"></span> Collecting ads…':op.why==="small"?'Your brand has fewer than five active ads, too few to compare fairly.':'Add competitors with at least ten active ads to compare against.')+'</div></section>';
 if(!op.list.length)return '<section class="op">'+head+'<div class="op-empty">'+(loading?'<span class="cmp-wait"></span> Still collecting, opportunities appear when all brands are in.':'No strong gaps: your formats, launch activity and messaging sit close to your competitors.')+'</div></section>';
 return '<section class="op">'+head+'<div class="op-grid">'+op.list.map((o,i)=>'<article class="op-card op-'+o.kind+'" style="--i:'+i+'"><span class="op-tag">'+esc(o.tag)+'</span><h4>'+esc(o.title)+'</h4><p class="op-data">'+esc(o.data)+'</p><p class="op-why"><b>Why it could matter.</b> '+esc(o.why)+'</p><div class="op-test"><span>Test</span>'+esc(o.test)+'</div>'+evidenceHTML(o.ev)+'<p class="op-note">'+esc(o.note)+'</p></article>').join("")+'</div>'+(loading?'<p class="op-foot"><span class="cmp-wait"></span> Some brands are still loading; this may change.</p>':'')+'</section>';
}
// A ranked bar list with your brand highlighted.
const BRAND_PAL=["#ff6b4a","#14b8a6","#a855f7","#f59e0b","#ec4899"];
const brandColor=id=>(cmp.colors&&cmp.colors.get(id))||"#8e8e93";
function rankBars(cols,val,label,fmtv){
 const r=cols.filter(c=>c.b).map(c=>({c,v:val(c.b)})).filter(x=>x.v!=null).sort((a,b)=>b.v-a.v);
 if(!r.length)return '<div class="rb-wait"><span class="cmp-wait"></span> Collecting…</div>';
 const max=Math.max(1,...r.map(x=>x.v));
 return '<div class="rb">'+r.map(x=>'<div class="rb-row'+(x.c.mine?' me':'')+'" style="--bc:'+brandColor(x.c.id)+'" title="'+esc(x.c.name+": "+label(x.c.b))+'"><span class="rb-n">'+esc(x.c.name)+'</span><span class="rb-bar"><i style="--w:'+(x.v/max*100).toFixed(1)+'%"></i></span><span class="rb-v">'+(fmtv?fmtv(x.c.b):fmtN(x.v))+'</span></div>').join("")+'</div>';
}
const KPI_ACCENT={"Active ad volume":"vol","Video share":"vid","Launched in 30 days":"new","Median ad age":"age","How hard each brand pushes offers":"off"};
function kpiCard(title,sub,body,foot){return '<div class="bm k-'+(KPI_ACCENT[title]||"x")+'"><div class="bm-h"><h4>'+esc(title)+'</h4>'+(sub?'<small>'+sub+'</small>':'')+'</div>'+body+(foot?'<p class="bm-f">'+foot+'</p>':'')+'</div>'}
function positionLine(cols,val,unit){unit=unit||"";
 const me=cols.find(c=>c.mine&&c.b);const r=cols.filter(c=>c.b&&val(c.b)!=null);if(!me||r.length<2)return "";
 const sorted=[...r].sort((a,b)=>val(b.b)-val(a.b));const pos=sorted.indexOf(me)+1;
 const rv=r.filter(c=>!c.mine).map(c=>val(c.b)),avg=rv.length?Math.round(rv.reduce((s,x)=>s+x,0)/rv.length):null;
 return 'You rank <b>#'+pos+' of '+r.length+'</b>'+(avg!=null?' · competitor average '+fmtN(avg)+unit:'');
}
const spendMoney=value=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",notation:value>=1000?"compact":"standard",maximumFractionDigits:value>=1000?1:0}).format(value).replace("K","k");
function spendHTML(cols){
 const model=globalThis.AdSnoopSpend;
 const rivals=cols.filter(c=>!c.mine);
 if(!model||!rivals.length)return "";
 const items=rivals.map(c=>({id:c.id,estimate:model.estimate(c.d,"average",state.coverage)}));
 const avg=model.average(items);
 const value=avg.count?"≈"+spendMoney(avg.value):"—";
 let detail;
 if(avg.count){
  const count=avg.count===avg.total?String(avg.count):avg.count+" of "+avg.total;
  detail="UK active ads to date · "+count+" competitor"+(avg.total===1?"":"s");
 }else if(state.coverage!=="GB"){
  detail="Choose UK coverage to see an estimate";
 }else if(rivals.some(c=>!c.d||c.d.status==="running"||c.d.status==="queued")){
  detail="Collecting ad data";
 }else{
  detail="Insufficient reach data for an estimate";
 }
 return `<section class="bm spend-tile" aria-labelledby="spendTitle">
  <div><h3 id="spendTitle">Modelled avg. competitor spend</h3><p>${detail}</p></div>
  <strong aria-live="polite">${value}</strong>
 </section>`;
}
function overviewHTML(cols){
 const ready=cols.filter(c=>c.b);
 const vol=kpiCard("Active ad volume","Unique Meta ad IDs live now",rankBars(cols,b=>b.total,b=>fmtN(b.total)+" active ads · "+fmtN(b.creatives)+" distinct creatives (identical copy and headline grouped)"),positionLine(cols,b=>b.total));
 const vid=kpiCard("Video share","% of ads with a known format",rankBars(cols,b=>b.classified?fpct(b,"v"):null,b=>fpct(b,"v")+"% video ("+b.fmt.v+" of "+fmtN(b.classified)+" classified)",b=>fpct(b,"v")+"%"),positionLine(cols,b=>b.classified?fpct(b,"v"):null,"%"));
 const fresh=kpiCard("Launched in 30 days","Active ads that started in the last 30 days",rankBars(cols,b=>b.n30,b=>b.n30+" ads ("+pctOf(b.n30,b.total)+"% of active) · "+b.n7+" in the last 7 days",b=>b.n30+' <small>'+pctOf(b.n30,b.total)+'%</small>'),positionLine(cols,b=>b.n30));
 const age=kpiCard("Median ad age","Days since launch, active ads",rankBars(cols,b=>b.median,b=>"Median "+b.median+" days · "+b.long+" ads running 90+ days",b=>b.median+'d'),"Longer isn’t better or worse: long-running ads aren’t proof of performance.");
 return radarHTML(cols)+spendHTML(cols)+'<div class="bm-grid">'+vol+vid+fresh+age+'</div>';
}
function mixHTML(cols){
 const ready=cols.filter(c=>c.b);if(!ready.length)return '<div class="op-empty"><span class="cmp-wait"></span> Collecting ads…</div>';
 const mode=cmp.mode,sort=cmp.sort;
 const list=sort?[...ready].sort((a,b)=>(sort==="total"?b.b.total-a.b.total:fpct(b.b,sort)-fpct(a.b,sort))):ready;
 const maxT=Math.max(1,...ready.map(c=>c.b.total));
 const legend='<div class="mx-legend">'+FMT.filter(f=>mode==="count"||f.k!=="u").map(f=>'<button class="'+(sort===f.k?'on':'')+'" data-action="cmpsort" data-sort="'+f.k+'" title="Sort by '+esc(f.label)+'"><i style="background:'+f.c+'"></i>'+esc(f.label)+'</button>').join("")+'</div>';
 const toggle='<div class="seg" role="group" aria-label="Show"><button class="'+(mode==="share"?'on':'')+'" data-action="cmpmode" data-mode="share">Share</button><button class="'+(mode==="count"?'on':'')+'" data-action="cmpmode" data-mode="count">Count</button></div>';
 const bars=list.map(c=>{
  const b=c.b,base=mode==="share"?Math.max(1,b.classified):maxT;
  const segs=FMT.map(f=>{const n=b.fmt[f.k];if(!n||(mode==="share"&&f.k==="u"))return "";const w=n/base*100;const p=f.k==="u"?pctOf(n,b.total)+"% of all ads":fpct(b,f.k)+"% of classified";return '<span class="mx-seg" style="--w:'+w.toFixed(2)+'%;background:'+f.c+'" title="'+esc(c.name+" · "+f.label+": "+fmtN(n)+" ads ("+p+")")+'">'+(w>=9?'<em'+(f.k==="i"||f.k==="u"?' class="dk"':'')+'>'+(mode==="share"?(f.k==="u"?pctOf(n,b.total):fpct(b,f.k))+'%':fmtN(n))+'</em>':'')+'</span>'}).join("");
  return '<div class="mx-row'+(c.mine?' me':'')+'"><span class="mx-n">'+esc(c.name)+'<small>'+fmtN(b.classified)+' of '+fmtN(b.total)+' classified'+(b.fmt.u?' · '+fmtN(b.fmt.u)+' unknown':'')+'</small></span><span class="mx-bar">'+(segs||'<span class="mx-none">No classified ads</span>')+'</span></div>';
 }).join("");
 const shift='<div class="bm"><div class="bm-h"><h4>Video in recent launches</h4><small>Video share of ads launched in the last 30 days vs older active ads</small></div><div class="sh">'+ready.map(c=>{const b=c.b;if(b.recentVideo==null||b.olderVideo==null)return '<div class="sh-row'+(c.mine?' me':'')+'"><span>'+esc(c.name)+'</span><small>Too few dated ads to compare</small></div>';const dlt=b.recentVideo-b.olderVideo;return '<div class="sh-row'+(c.mine?' me':'')+'" title="'+esc(b.recentN+" recent and "+b.olderN+" older classified ads")+'"><span>'+esc(c.name)+'</span><span class="sh-v">'+b.olderVideo+'% <i>→</i> <b>'+b.recentVideo+'%</b></span><span class="sh-d '+(dlt>=10?'up':dlt<=-10?'down':'')+'">'+(dlt>0?'+':'')+dlt+' pts</span></div>'}).join("")+'</div><p class="bm-f">Compares ads still active today by launch date. It describes the current mix, not ads that were replaced.</p></div>';
 const note='<details class="cmp-how"><summary>How formats are classified</summary>'+ready.map(c=>'<p><b>'+esc(c.name)+':</b> '+esc(c.b.fmtNote||"No format data.")+'</p>').join("")+'<p>Unknown ads are left out of shares. Format choices show where competitors put effort, not what performs.</p></details>';
 return '<div class="mx"><div class="mx-top"><div><h3 class="cmp-h">Creative format mix</h3><small class="intel-sub">'+(mode==="share"?'Share of each brand’s classified ads (unknown formats left out)':'Number of active ads, on one scale, including unknown')+'. Click a format to sort.</small></div>'+toggle+'</div>'+legend+'<div class="mx-bars">'+bars+'</div>'+note+'</div>'+shift;
}
function sparkWeeks(w,max){
 const W=168,H=40,bw=W/w.length;
 return '<svg class="spk" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" role="img" aria-label="Weekly launches, last 12 weeks: '+w.join(", ")+'">'+w.map((n,i)=>{const h=max?Math.max(n?2:0,n/max*(H-4)):0;return '<rect x="'+(i*bw+1).toFixed(1)+'" y="'+(H-h).toFixed(1)+'" width="'+(bw-2).toFixed(1)+'" height="'+h.toFixed(1)+'" rx="2"><title>'+(12-i===1?"This week":(12-i-1)+" weeks ago")+': '+n+' launched</title></rect>'}).join("")+'</svg>';
}
function activityHTML(cols){
 const ready=cols.filter(c=>c.b);if(!ready.length)return '<div class="op-empty"><span class="cmp-wait"></span> Collecting ads…</div>';
 const head='<div class="ac-row ac-h"><span>Brand</span><span>Weekly launches · last 12 weeks (own scale)</span><span>7 days</span><span>30 days</span><span>Median age</span><span>90d+</span></div>';
 const rows=ready.map(c=>{const b=c.b;return '<div class="ac-row'+(c.mine?' me':'')+'"><span class="ac-n">'+esc(c.name)+(b.partial?'<small>Partial data</small>':'')+'</span><span class="ac-spk">'+sparkWeeks(b.weekly,Math.max(1,...b.weekly))+'<small>'+fmtN(b.weekly.reduce((x,y)=>x+y,0))+' in 12 weeks · peak '+Math.max(...b.weekly)+'/wk</small></span><span><b>'+b.n7+'</b><small>'+pctOf(b.n7,b.total)+'%</small></span><span><b>'+b.n30+'</b><small>'+pctOf(b.n30,b.total)+'%</small></span><span><b>'+(b.median??"—")+'</b><small>days</small></span><span><b>'+b.long+'</b><small>'+pctOf(b.long,b.total)+'%</small></span></div>'}).join("");
 const ageCols=[["a","≤7 days","#0071e3"],["b","8–29 days","#5ea8ff"],["c","30–89 days","#a8cfff"],["d","90+ days","#d5e6fb"]];
 const ages='<div class="bm"><div class="bm-h"><h4>Recently launched vs long-running</h4><small>Active ads by age</small></div><div class="mx-legend static">'+ageCols.map(a=>'<span><i style="background:'+a[2]+'"></i>'+a[1]+'</span>').join("")+'</div><div class="mx-bars">'+ready.map(c=>{const b=c.b,t=Math.max(1,b.age.a+b.age.b+b.age.c+b.age.d);return '<div class="mx-row'+(c.mine?' me':'')+'"><span class="mx-n">'+esc(c.name)+'</span><span class="mx-bar">'+ageCols.map(a=>{const n=b.age[a[0]];if(!n)return "";const w=n/t*100;return '<span class="mx-seg" style="--w:'+w.toFixed(2)+'%;background:'+a[2]+'" title="'+esc(c.name+" · "+a[1]+": "+n+" ads ("+Math.round(w)+"%)")+'">'+(w>=9?'<em class="dk">'+Math.round(w)+'%</em>':'')+'</span>'}).join("")+'</span></div>'}).join("")+'</div></div>';
 const changes=ready.map(c=>{const ch=c.b.change;return '<div class="ob-row'+(c.mine?' me':'')+'"><span>'+esc(c.name)+'</span>'+(ch?'<span><b class="up">+'+ch.added+'</b> newly observed · <b class="down">−'+ch.gone+'</b> no longer active <small>since '+new Date(ch.since).toLocaleDateString("en-GB",{day:"numeric",month:"short"})+'</small></span>':'<span class="intel-sub">Tracking from today</span>')+'</div>'}).join("");
 return '<div class="bm"><div class="bm-h"><h4>Creative momentum</h4><small>When currently active ads launched (Meta delivery start dates)</small></div><div class="ac">'+head+rows+'</div><p class="bm-f">These count launches of ads that are still running today. AdSnoop can’t see ads that launched and already stopped, so this isn’t a creative refresh rate.</p></div>'+ages+'<div class="bm"><div class="bm-h"><h4>Observed changes</h4><small>Ad IDs seen in this browser between complete checks at least a day apart</small></div><div class="ob">'+changes+'</div><p class="bm-f">“Newly observed” means active now but not at your last check; it may have launched earlier. History is kept on this device for now.</p></div>';
}
function messagingCmpHTML(cols){
 const ready=cols.filter(c=>c.b);if(!ready.length)return '<div class="op-empty"><span class="cmp-wait"></span> Collecting ads…</div>';
 const me=ready.find(c=>c.mine),rivals=ready.filter(c=>!c.mine&&c.b.total>=10);
 // 1. What each brand leads with: its most-used theme per category.
 const cats=[["hooks","Hook"],["benefits","Benefit"],["offers","Offer"],["proof","Proof"]];
 const lead=c=>cats.map(([cat,l])=>{const t=messageRules.filter(r=>r.category===cat).map(r=>({r,v:c.b.share[r.id]||0})).sort((a,b)=>b.v-a.v)[0];return '<span><small><i style="background:'+catColor[cat]+'"></i>'+l+'</small>'+(t&&t.v>=5?esc(t.r.label)+' <em>'+t.v+'%</em>':'<span class="mg-none">Rarely used</span>')+'</span>'}).join("");
 const leads='<div class="bm"><div class="bm-h"><h4>What each brand leads with</h4><small>Most-used theme in each category, as a share of that brand’s ads</small></div><div class="mg">'+ready.map(c=>'<div class="mg-c'+(c.mine?' me':'')+'"><b>'+esc(c.name)+'</b>'+lead(c)+'</div>').join("")+'</div></div>';
 // 2. Biggest differences: only themes several competitors share, so one brand's own phrasing doesn't dominate.
 let diff="";
 if(me&&rivals.length){
  const rows=messageRules.filter(r=>r.category!=="actions").map(r=>{
   const mine=me.b.share[r.id]||0,vals=rivals.map(c=>c.b.share[r.id]||0),avg=Math.round(vals.reduce((s,x)=>s+x,0)/vals.length),users=vals.filter(v=>v>=10).length;
   return {r,mine,avg,users,d:mine-avg};
  }).filter(x=>Math.max(x.mine,x.avg)>=10&&Math.abs(x.d)>=8&&(x.d>0||x.users>=Math.min(2,rivals.length)))
   .sort((a,b)=>Math.abs(b.d)-Math.abs(a.d)).slice(0,5);
  const max=Math.max(10,...rows.flatMap(x=>[x.mine,x.avg]));
  diff='<div class="bm"><div class="bm-h"><h4>Biggest differences</h4><small>Themes where your share of ads differs most from the average of your '+numWord(rivals.length)+' competitors</small></div>'+(rows.length?'<div class="df">'+rows.map(x=>'<div class="df-row"><span class="df-l"><b>'+esc(x.r.label)+'</b><small>'+esc(messageCategories.find(c=>c.id===x.r.category).label)+(x.d<0?' · '+x.users+' of '+rivals.length+' competitors use it':'')+'</small></span><span class="df-bars"><span class="df-b me" title="You: '+x.mine+'%"><i style="--w:'+(x.mine/max*100).toFixed(1)+'%"></i><em>You '+x.mine+'%</em></span><span class="df-b" title="Competitor average: '+x.avg+'%"><i style="--w:'+(x.avg/max*100).toFixed(1)+'%"></i><em>Competitors '+x.avg+'%</em></span></span><span class="df-tag '+(x.d<0?'gap':'edge')+'">'+(x.d<0?'Gap':'Your edge')+'</span></div>').join("")+'</div>':'<p class="intel-sub">Your messaging sits close to your competitors’ on every shared theme.</p>')+'<p class="bm-f">Only themes used in at least 10% of ads are shown. Brand-specific phrasing isn’t compared.</p></div>';
 }
 // 3. Offers.
 const offers='<div class="bm k-off"><div class="bm-h"><h4>How hard each brand pushes offers</h4><small>Share of ads with a price incentive, free first step or payment option</small></div>'+rankBars(cols,b=>b.offers,b=>b.offers+"% of ads ("+b.offerN+")",b=>b.offers+'%')+'</div>';
 return (diff||"")+leads+offers+'<p class="cmp-note">Themes come from the same rules as the Messaging tab, applied to every collected ad’s text. Claims aren’t verified. For one brand’s full theme breakdown, open it and use the Messaging tab.</p>';
}
function compareHTML(){
 const brands=compareBrands(),mine=myBrand();
 if(!brands.length)return '<div class="cmp-empty"><h3>Compare your brand with your competitors</h3><p><a href="/tracker">Set up My competitors →</a></p></div>';
 const need=brands.some(b=>{const d=cmp.data.get(b.id);return !d||d.status==="running"||d.status==="queued"});
 if(need&&!cmp.running)setTimeout(()=>loadCompare(false),0);
 const cols=brands.map(b=>{const c={...b,d:cmp.data.get(b.id)};c.b=bench(c);return c});
 {let k=0;cmp.colors=new Map(cols.map(c=>[c.id,c.mine?"#0071e3":BRAND_PAL[k++%BRAND_PAL.length]]))}
 const hint=!mine?'<p class="cmp-hint">Add your brand in <a href="/tracker">My competitors</a> to unlock the Opportunity Radar.</p>':'';
 const pane=cmp.tab==="remix"?remixTabHTML(cols):cmp.tab==="mix"?mixHTML(cols):cmp.tab==="activity"?activityHTML(cols):cmp.tab==="messaging"?messagingCmpHTML(cols):overviewHTML(cols);
 const when=cols.map(c=>c.b&&c.b.generatedAt).filter(Boolean).sort()[0];
 const anim=cmp.anim;cmp.anim=false;
 return '<div class="cmp-wrap cmp2">'+hint+brandStrip(cols)+trackerPickerHTML(activeBrand())+tabsHTML()+'<div class="cmp-pane'+(anim?' in':'')+'" role="tabpanel">'+pane+'</div><div class="cmp-foot"><button class="ghost" data-action="cmpreload">Refresh</button><span class="intel-sub">All accessible active '+(state.coverage==="GB"?"UK":"UK + EU")+' ads per brand from Meta’s Ad Library'+(when?', collected '+new Date(when).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):'')+'. Activity and format signals aren’t measures of performance.</span></div></div>';
}
// Messaging tab: what is rising, what lasts, and how it compares with your brand.
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
const notesKey=()=>"adsnoop-messaging-notes-v1:"+(state.page||state.brand);
function readNotes(){try{const v=JSON.parse(localStorage.getItem(notesKey())||"{}");return v&&typeof v==="object"?v:{}}catch{return {}}}
function writeNote(id,text){const n=readNotes();if(text)n[id]=text;else delete n[id];try{localStorage.setItem(notesKey(),JSON.stringify(n))}catch{}}
function highlight(sentence,re){
 const m=sentence.match(re);if(!m)return esc(sentence);
 let end=m.index+m[0].length;if(/[£$€]\s*$/.test(m[0])){const num=sentence.slice(end).match(/^[\d,.]+/);if(num)end+=num[0].length}
 const i=m.index;return esc(sentence.slice(0,i))+"<mark>"+esc(sentence.slice(i,end))+"</mark>"+esc(sentence.slice(end));
}
const catColor={hooks:"#a347d1",benefits:"#0071e3",offers:"#e07800",proof:"#1f9d4c",actions:"#0a8fb5"};
// ---- Messaging explorer: what is this advertiser saying, which ads prove it,
// and what should we test in response? Everything is computed from loaded ads.
const SUBSTANTIVE=new Set(["hooks","benefits","offers","proof"]);
const normSentence=s=>String(s||"").toLowerCase().replace(/[^\p{L}\p{N}%£$€]+/gu," ").replace(/\s+/g," ").trim();
const wordSet=s=>new Set(normSentence(s).split(" ").filter(w=>w.length>2));
// Same wording give or take punctuation or a word: word overlap (Jaccard) of 75%+.
function similar(a,b){const A=wordSet(a),B=wordSet(b);if(!A.size||!B.size)return normSentence(a)===normSentence(b);let n=0;for(const w of A)if(B.has(w))n++;return n/(A.size+B.size-n)>=.75}
// Distinct wordings of a theme: grouped by the matched sentence (copy or headline),
// so repeats count towards prevalence but appear once as evidence.
function themeWordings(t){
 const groups=[];
 for(const a of t.ads){
  const s=t.evidence[a.id];if(!s)continue;
  const g=groups.find(x=>similar(x.sentence,s));
  if(g){g.ads.push(a);if(a.start&&(!g.first||a.start<g.first))g.first=a.start;if(a.start&&(!g.last||a.start>g.last))g.last=a.start}
  else groups.push({sentence:s,ads:[a],first:a.start||"",last:a.start||""});
 }
 for(const g of groups)g.ads.sort((x,y)=>(y.start||"").localeCompare(x.start||""));
 return groups.sort((x,y)=>y.ads.length-x.ads.length||(y.last||"").localeCompare(x.last||""));
}
// The ad shown for a wording: prefer one whose creative is already cached.
const repAd=g=>g.ads.find(a=>mediaCache.has(a.id))||g.ads[0];
// Kept for the CSV/text export: one representative ad per distinct wording.
function themeExamples(t){return themeWordings(t).map(g=>g.ads[0])}
// Compare launch periods only when the evidence supports it.
const RECENT_DAYS=30,MIN_PERIOD=8,MIN_MATCHES=5;
function periodComparison(t,ads){
 const ids=new Set(t.ads.map(a=>a.id)),dated=ads.filter(a=>daysRunning(a)!=null);
 const recent=dated.filter(a=>daysRunning(a)<=RECENT_DAYS),earlier=dated.filter(a=>daysRunning(a)>RECENT_DAYS);
 const r=recent.filter(a=>ids.has(a.id)).length,e=earlier.filter(a=>ids.has(a.id)).length;
 const out={recent:recent.length,earlier:earlier.length,r,e,undated:ads.length-dated.length,enough:recent.length>=MIN_PERIOD&&earlier.length>=MIN_PERIOD&&r+e>=MIN_MATCHES,claim:""};
 if(out.enough){
  const p1=r/recent.length,p2=e/earlier.length,p=(r+e)/(recent.length+earlier.length);
  const se=Math.sqrt(p*(1-p)*(1/recent.length+1/earlier.length)),z=se?(p1-p2)/se:0,diff=Math.round((p1-p2)*100);
  // Two-proportion test at 95% and at least a 10-point gap.
  if(Math.abs(z)>=1.96&&Math.abs(diff)>=10)out.claim=diff>0?"more":"less";
 }
 return out;
}
function thumbHTML(id,cls,pri){return '<span class="th'+(cls?' '+cls:'')+'" data-thumb="'+esc(id)+'"'+(pri?' data-pri="1"':'')+' aria-hidden="true"></span>'}
function fillThumb(node,id){
 const c=mediaCache.get(id),st=mediaState.get(id);
 if(c&&c.items&&c.items.length){
  if(node.dataset.done==="1")return;
  const img=c.items.find(i=>i.kind==="image"),vid=c.items.find(i=>i.kind==="video"),poster=c.items.find(i=>i.poster)?.poster;
  const src=img?.url||poster||"";
  if(!src&&!vid){node.classList.add("none");node.dataset.done="1";return}
  // No still image at all: show the video's first frame.
  node.innerHTML=(src?'<img alt="" loading="lazy" referrerpolicy="no-referrer" src="'+esc(src)+'">':'<video muted playsinline preload="metadata" src="'+esc(vid.url)+'#t=0.5"></video>')+(!img&&vid?'<b class="th-play">▶</b>':'');
  node.dataset.done="1";node.classList.add("ok");
  const im=node.querySelector("img");if(im)im.onerror=()=>{node.classList.remove("ok");node.classList.add("none");im.remove()};
 }else if(st&&st.status==="failed")node.classList.add("none");
}
function paintThumbs(id){for(const n of document.querySelectorAll('[data-thumb="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]'))fillThumb(n,id)}
function hydrateThumbs(){
 const seen=new Set();
 for(const n of document.querySelectorAll("[data-thumb]")){
  const id=n.dataset.thumb;fillThumb(n,id);
  if(n.dataset.done!=="1"&&!seen.has(id)){seen.add(id);requestMedia(id,{priority:n.dataset.pri==="1"})}
 }
}
// ---- Launch timeline: when this theme's ads went live vs the advertiser's other ads ----
function launchTimeline(t,ads){
 // Weekly bars: how many ads launched each week, with this theme's share coloured.
 // The range fits the data, so a burst of recent launches is not squeezed into a corner.
 const ids=new Set(t.ads.map(a=>a.id)),pts=ads.map(a=>({d:daysRunning(a),on:ids.has(a.id)})).filter(p=>p.d!=null);
 if(pts.length<2)return "";
 const span=Math.max(...pts.map(p=>p.d)),weeks=Math.max(4,Math.min(12,Math.ceil((span+1)/7))),older=span>=weeks*7;
 const n=weeks+(older?1:0),bins=Array.from({length:n},()=>({on:0,all:0}));
 for(const p of pts){const i=Math.min(n-1,Math.floor(p.d/7));bins[i].all++;if(p.on)bins[i].on++}
 const W=640,H=168,L=8,R=8,T=26,B=40,ch=H-T-B,gap=6,bw=(W-L-R-gap*(n-1))/n,max=Math.max(...bins.map(b=>b.all)),col=catColor[t.category];
 const now=Date.now(),lab=i=>{if(older&&i===n-1)return "Older";if(i===0)return "This week";const d=new Date(now-(i*7+6)*DAY);return d.getUTCDate()+" "+d.toLocaleString("en-GB",{month:"short",timeZone:"UTC"})};
 const every=n>8?2:1,y=v=>T+ch-(v/max)*ch;
 const gid='tlg'+Math.random().toString(36).slice(2,8);
 let svg='<svg class="tl-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Ads launched each week, with ads using '+esc(t.label)+' highlighted" style="--tc:'+col+'">';
 svg+='<defs><linearGradient id="'+gid+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+col+'" stop-opacity="1"/><stop offset="1" stop-color="'+col+'" stop-opacity=".55"/></linearGradient><linearGradient id="'+gid+'a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ececf1"/><stop offset="1" stop-color="#f6f6f9"/></linearGradient></defs>';
 for(const f of [.5,1])svg+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(max*f).toFixed(1)+'" y2="'+y(max*f).toFixed(1)+'" class="tl-guide"/>';
 svg+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+(T+ch)+'" y2="'+(T+ch)+'" class="tl-grid"/>';
 // Oldest on the left, this week on the right.
 for(let k=0;k<n;k++){const i=n-1-k,b=bins[i],x=L+k*(bw+gap),cx=x+bw/2;
  const tip=lab(i)+(i===0||(older&&i===n-1)?'':' week')+': '+b.on+' of '+b.all+' ad'+(b.all===1?'':'s')+' use this theme';
  svg+='<g class="tl-col'+(i===0?' tl-now':'')+'" style="--k:'+k+'"><title>'+esc(tip)+'</title><rect x="'+x.toFixed(1)+'" y="'+T+'" width="'+bw.toFixed(1)+'" height="'+ch+'" class="tl-hit"/>';
  if(b.all){svg+='<rect x="'+x.toFixed(1)+'" y="'+y(b.all).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+(ch*b.all/max).toFixed(1)+'" rx="5" class="tl-all tl-grow" fill="url(#'+gid+'a)"/>';
   if(b.on)svg+='<rect x="'+x.toFixed(1)+'" y="'+y(b.on).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+(ch*b.on/max).toFixed(1)+'" rx="5" class="tl-on2 tl-grow" fill="url(#'+gid+')"/>';
   if(i===0&&b.on)svg+='<circle cx="'+cx.toFixed(1)+'" cy="'+(H-12)+'" r="2.5" class="tl-pulse"/>';
   svg+='<text x="'+cx.toFixed(1)+'" y="'+(y(b.all)-6).toFixed(1)+'" class="tl-val" text-anchor="middle">'+(b.on?'<tspan style="fill:'+col+'">'+b.on+'</tspan><tspan class="tl-of">/'+b.all+'</tspan>':'<tspan class="tl-of">'+b.all+'</tspan>')+'</text>'}
  if(k%every===(n-1)%every)svg+='<text x="'+cx.toFixed(1)+'" y="'+(H-B+18)+'" class="tl-tick" text-anchor="middle">'+lab(i)+'</text>';
  svg+='</g>'}
 const onN=pts.filter(p=>p.on).length;
 return '<div class="tl-legend"><span><i style="background:'+col+'"></i>This theme · '+onN+'</span><span><i class="tl-key-all"></i>All dated ads · '+pts.length+'</span><span class="tl-hint">By launch week</span></div>'+svg+'</svg>';
}
function messagingView(){
 const ads=state.rows,total=ads.length;
 if(!total)return empty("No messaging to map yet.","Search an advertiser above, then open Messaging to see what they say and which ads prove it.");
 const themes=messagingThemes(ads);
 const lists={messages:themes.filter(t=>SUBSTANTIVE.has(t.category)),actions:themes.filter(t=>t.category==="actions")};
 if(!state.msgFilter||!lists[state.msgFilter].length&&lists[state.msgFilter==="messages"?"actions":"messages"].length)state.msgFilter=lists.messages.length||!lists.actions.length?"messages":"actions";
 const list=lists[state.msgFilter];
 if(!list.some(t=>t.id===state.theme))state.theme=list[0]?.id||"";
 const mapped=new Set(themes.flatMap(t=>t.ads.map(a=>a.id))).size,distinct=new Set(ads.map(groupKey)).size;
 const head='<div class="mx-head"><div><p class="mx-base"><b>'+total+'</b> loaded ad'+(total===1?'':'s')+(distinct<total?' ('+distinct+' after merging duplicate creatives)':'')+' from '+esc(state.brand||"this advertiser")+' · '+(total-mapped)+' with no detected theme</p><p class="mx-note">Shares are of all '+total+' loaded ads. An ad can match more than one theme, so shares can add up to more than 100%.</p></div><div class="mx-tools"><div class="seg" role="group" aria-label="Theme type"><button type="button" data-msgfilter="messages" aria-pressed="'+(state.msgFilter==="messages")+'">Messages <span>'+lists.messages.length+'</span></button><button type="button" data-msgfilter="actions" aria-pressed="'+(state.msgFilter==="actions")+'">Calls to action <span>'+lists.actions.length+'</span></button></div><button class="ghost" data-action="exportmsg">Export ↓</button></div></div>';
 if(!themes.length)return '<div class="msg-wrap">'+head+'<div class="mx-empty"><h3>No themes detected</h3><p>None of the '+total+' loaded ad'+(total===1?'':'s')+' matched a hook, benefit, offer, proof point or call to action. Their copy may be very short, image-only or not in English. Open the ads in Ads &amp; insights to read them directly.</p></div></div>';
 // At a glance: the leading message in each part of the pitch, with a real creative.
 const usedGl=new Set();
 // Each tile shows a different ad where the theme allows, cached creatives first.
 const glanceAd=t=>{const all=themeWordings(t).flatMap(g=>g.ads),pick=all.find(a=>!usedGl.has(a.id)&&mediaCache.has(a.id))||all.find(a=>!usedGl.has(a.id))||all[0];if(pick)usedGl.add(pick.id);return pick};
 const glance='<div class="mx-glance" role="group" aria-label="Leading message by category">'+[...messageCategories].map(c=>{
  const top=themes.find(x=>x.category===c.id);
  if(!top)return '<div class="gl gl-none"><p class="gl-cat"><i style="background:'+catColor[c.id]+'"></i>'+esc(c.label)+'</p><p class="gl-name">None detected</p><p class="gl-sub">An angle no loaded ad uses</p></div>';
  const rep=glanceAd(top);
  return '<button type="button" class="gl'+(top.id===state.theme?' on':'')+'" data-theme="'+top.id+'" style="--c:'+catColor[c.id]+'">'+(rep?thumbHTML(rep.id,"gl-th"):'')+'<span class="gl-body"><span class="gl-cat"><i></i>'+esc(c.label)+'</span><span class="gl-name">'+esc(top.label)+'</span><span class="gl-pct"><b>'+pctOf(top.ads.length,total)+'%</b> of ads</span></span></button>';
 }).join("")+'</div>';
 if(!list.length)return '<div class="msg-wrap">'+head+glance+'<div class="mx-empty"><h3>Nothing in this view</h3><p>Switch the filter above to see the other themes.</p></div></div>';
 const t=list.find(x=>x.id===state.theme);
 let items="";
 list.forEach((x,i)=>{
  const pct=pctOf(x.ads.length,total),on=x.id===t.id,cat=messageCategories.find(c=>c.id===x.category);
  const reps=themeWordings(x).slice(0,3).map(g=>repAd(g).id);
  items+='<button type="button" class="mx-item'+(on?' on':'')+'" data-theme="'+x.id+'" aria-pressed="'+on+'" aria-controls="mxDetail" style="grid-row:'+(i+1)+';--c:'+catColor[x.category]+'"><span class="mx-rank">'+(i+1)+'</span><span class="mx-name">'+esc(x.label)+'<small><i></i>'+esc(cat?.label||"")+'</small></span><span class="mx-stack">'+reps.map(id=>thumbHTML(id,"st")).join("")+'</span><span class="mx-num"><b>'+pct+'%</b><small>'+x.ads.length+' of '+total+'</small></span><span class="mx-track" aria-hidden="true"><i style="width:'+Math.max(2,pct)+'%"></i></span></button>';
  if(on)items+=detailPanel(x,ads,list.length);
 });
 return '<div class="msg-wrap">'+head+glance+'<div class="mx2">'+items+'</div><p class="notice">Themes are detected from ad text with fixed rules and describe what was published, not how ads performed. English copy only.</p></div>';
}
function detailPanel(t,ads,rows){
 const total=ads.length,w=themeWordings(t),cat=messageCategories.find(c=>c.id===t.category),pc=periodComparison(t,ads);
 const ds=t.ads.map(daysRunning).filter(d=>d!=null),med=median(ds);
 const showAll=state.msgAllExamples===t.id,shown=showAll?w:w.slice(0,3);
 const ex=shown.map(g=>{const a=repAd(g),when=g.first?(g.first===g.last||!g.last?formatDate(g.first):formatDate(g.first)+" – "+formatDate(g.last)):"Launch date not available";
  return '<li class="ev"><button type="button" class="ev-media" data-action="detail" data-id="'+esc(a.id)+'" aria-label="View ad">'+thumbHTML(a.id,"big",true)+(g.ads.length>1?'<span class="ev-count">×'+g.ads.length+'</span>':'')+'</button><div class="ev-body"><blockquote>“'+highlight(g.sentence,t.match)+'”</blockquote><p class="ev-meta">'+esc(when)+(g.ads.length>1?' · used in '+g.ads.length+' ads':'')+'</p><p class="ev-links"><button type="button" class="linkbutton" data-action="detail" data-id="'+esc(a.id)+'">View ad</button><a href="'+esc(metaUrl(a.id))+'" target="_blank" rel="noopener">Ad Library ↗</a></p></div></li>'}).join("");
 let timing;
 if(!pc.enough)timing=(pc.r+pc.e?'<b>'+pc.r+' of '+(pc.r+pc.e)+'</b> dated ads with this theme launched in the last '+RECENT_DAYS+' days. ':'')+(pc.earlier<MIN_PERIOD?'Almost everything live started recently ('+pc.recent+' of '+(pc.recent+pc.earlier)+'), so there is no older baseline to say whether this theme is growing.':'Too few ads use this theme to say whether it is growing.');
 else timing='Last '+RECENT_DAYS+' days: <b>'+pc.r+' of '+pc.recent+'</b> ads ('+pctOf(pc.r,pc.recent)+'%) · Earlier: <b>'+pc.e+' of '+pc.earlier+'</b> ('+pctOf(pc.e,pc.earlier)+'%). '+(pc.claim?'<strong class="mx-claim mx-claim-'+pc.claim+'">'+(pc.claim==="more"?'↑ More':'↓ Less')+' common in newer ads</strong>':'No clear difference between the periods.');
 if(pc.undated)timing+=' '+pc.undated+' undated ad'+(pc.undated===1?'':'s')+' excluded.';
  return '<section class="mx-detail" id="mxDetail" aria-live="polite" style="grid-row:1 / span '+(rows+1)+';--c:'+catColor[t.category]+'">'+
  '<header class="mx-dhead"><p class="mx-cat"><i></i>'+esc(cat?.label||"")+' · '+esc(cat?.question||"")+'</p><div class="mx-titlerow"><h3>'+esc(t.label)+'</h3><div class="mx-big"><b>'+pctOf(t.ads.length,total)+'%</b><span>'+t.ads.length+' of '+total+' ads</span></div></div><p class="mx-stat">'+w.length+' distinct wording'+(w.length===1?'':'s')+(med!=null?' · median '+med+' days since launch':'')+'</p></header>'+
  '<h4 class="mx-sub">How they say it</h4><ol class="mx-ev">'+ex+'</ol>'+(w.length>3?'<button type="button" class="linkbutton mx-more" data-action="msgall" data-id="'+t.id+'">'+(showAll?'Show fewer':'Show all '+w.length+' wordings')+'</button>':'')+
  '<h4 class="mx-sub">When these ads launched</h4>'+launchTimeline(t,ads)+'<p class="mx-timing">'+timing+'</p>'+
 '</section>';
}
function exportMessaging(){
 const themes=messagingThemes(state.rows),notes=readNotes();
 const text="MESSAGING MAP — "+(state.brand||"Advertiser")+"\nGenerated "+new Date().toISOString().slice(0,10)+" from "+state.rows.length+" loaded ads (UK). Themes are detected from ad text; claims are not verified.\n\n"+messageCategories.map(c=>c.label.toUpperCase()+"\n"+(themes.filter(t=>t.category===c.id).map(t=>"• "+t.label+" — "+t.ads.length+" ads\n  Test direction: "+(notes[t.id]||t.test)+"\n"+themeExamples(t).slice(0,5).map(a=>"  “"+t.evidence[a.id]+"”\n  "+metaUrl(a.id)).join("\n")).join("\n\n")||"  None detected")).join("\n\n");
 const url=URL.createObjectURL(new Blob([text],{type:"text/plain;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download="adsnoop-messaging-"+(state.brand||"map").toLowerCase().replace(/[^a-z0-9]+/g,"-")+".txt";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
// ---- Ad intelligence: format, longevity, launches, variations, changes ----
// Longevity is the signal every ad-intelligence tool leans on: brands keep
// paying for ads that work. It is a clue, not proof of performance.
const DAY=86400000;
function daysRunning(a){if(!a.start)return null;const t=Date.parse(a.start+"T00:00:00Z");return Number.isFinite(t)?Math.max(0,Math.floor((Date.now()-t)/DAY)):null}
function lifeStage(d){if(d==null)return null;if(d<=7)return {key:"new",label:"New",hint:"Launched in the last 7 days"};if(d<30)return {key:"testing",label:"Active 8–29d",hint:"Started 8–29 days ago"};if(d<90)return {key:"proven",label:"Active 30–89d",hint:"Active 30–89 days; outcomes unknown"};return {key:"long",label:"Long-runner",hint:"Active 90+ days; outcomes unknown"}}
// Meta's display_format is the source of truth. Several images on their own
// usually mean one creative supplied in feed, story and square sizes, not a carousel.
function formatOf(id){
 const m=mediaCache.get(id),items=m?.items;if(!items||!items.length)return null;
 const f=String(m.displayFormat||"").toUpperCase();
 if(f==="VIDEO")return "video";
 if(f==="CAROUSEL"||f==="MULTI_IMAGES"||f==="MULTI_VIDEOS"||(!f&&m.cards>1))return "carousel";
 if(f==="DPA")return "catalogue";
 if(f==="IMAGE")return "static";
 return items.some(i=>i.kind==="video")?"video":"static";
}
const formatLabel={video:"Video",static:"Static",carousel:"Carousel",catalogue:"Catalogue"};
// Real button and destination, read by the collector from Meta's own snapshot.
function cleanCta(c){if(!c||typeof c!=="object")return null;const txt=v=>typeof v==="string"&&v.length<=80&&!/[<>\x00-\x1f]/.test(v)?v.trim():"";let url="";try{const u=new URL(String(c.url||""));if(/^https?:$/.test(u.protocol)&&!u.username&&!u.password)url=u.href}catch{}const type=typeof c.type==="string"&&/^[A-Z_]{2,40}$/.test(c.type)?c.type:"";const out={text:txt(c.text),type,url,caption:txt(c.caption)};return out.text||out.type||out.url?out:null}
function ctaLabel(c){if(!c)return "";if(c.type==="NO_BUTTON")return "";if(c.text)return c.text;if(!c.type)return "";const t=c.type.toLowerCase().replace(/_/g," ");return t.charAt(0).toUpperCase()+t.slice(1)}
function ctaHost(url){try{return new URL(url).hostname.replace(/^www\./,"")}catch{return ""}}
function ctaPath(url){try{const u=new URL(url);return u.hostname.replace(/^www\./,"")+(u.pathname==="/"?"":u.pathname.replace(/\/$/,""))}catch{return ""}}
function ctaLineHTML(id){
 const c=mediaCache.get(id)?.cta,label=ctaLabel(c),host=c&&c.url?ctaHost(c.url):"";
 if(!label&&!host)return '<div class="ctaline" data-cta="'+esc(id)+'"></div>';
 return '<div class="ctaline has" data-cta="'+esc(id)+'">'+(label?'<span class="ctabtn">'+esc(label)+'</span>':'<span class="ctabtn none">No button</span>')+(host?'<a href="'+esc(c.url)+'" target="_blank" rel="noopener noreferrer nofollow" title="'+esc(c.url)+'">→ '+esc(ctaPath(c.url).slice(0,48))+'</a>':'')+'</div>';
}
function paintCta(id){const html=ctaLineHTML(id);document.querySelectorAll('[data-cta="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]').forEach(el=>{el.outerHTML=html})}
function variationKey(a){return copyPattern(a)+"|"+String(a.title||"").toLowerCase().trim()}
function variationCounts(rows){const m=new Map();for(const a of rows){const k=variationKey(a);m.set(k,(m.get(k)||0)+1)}return m}
// Remember which ads were live on the last visit, per advertiser, to show changes.
const seenKey=page=>"adsnoop-seen-v1:"+page;
function compareWithLastVisit(){
 if(!state.page||!state.rows.length)return null;
 let prev=null;try{prev=JSON.parse(localStorage.getItem(seenKey(state.page))||"null")}catch{}
 const ids=state.rows.map(a=>a.id),now=Date.now();
 // Only treat ads as stopped when the full set of active ads was loaded.
 const complete=!state.cursor&&!state.needsPageStart;
 let result={first:!prev};
 if(prev&&Array.isArray(prev.ids)){
  const before=new Set(prev.ids),current=new Set(ids);
  // "New" = not seen before AND launched on or after the day of the last visit,
  // so loading more ads than last time never counts old ads as new.
  const sinceDay=new Date(prev.at).toISOString().slice(0,10);
  const added=state.rows.filter(a=>!before.has(a.id)&&String(a.start||"")>=sinceDay).map(a=>a.id);
  result={first:false,since:prev.at,added,removed:complete&&prev.complete?prev.ids.filter(id=>!current.has(id)):null};
 }
 // Keep the baseline from the earlier visit until a day has passed, so
 // repeated searches the same day still show what changed since that visit.
 if(!prev||now-(prev.at||0)>DAY){try{localStorage.setItem(seenKey(state.page),JSON.stringify({ids,at:now,complete}))}catch{}}
 return result;
}
function weeklyLaunches(rows,weeks=12){
 const counts=Array(weeks).fill(0),now=Date.now();
 for(const a of rows){const d=daysRunning(a);if(d==null)continue;const w=Math.floor(d/7);if(w<weeks)counts[weeks-1-w]++}
 return counts;
}
function topCTAs(rows){
 const real=rows.map(a=>mediaCache.get(a.id)?.cta).filter(Boolean);
 if(real.length>=3){const m=new Map();for(const c of real){const l=ctaLabel(c)||"No button";m.set(l,(m.get(l)||0)+1)}return {real:true,base:real.length,list:[...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([label,n])=>({label,n}))}}
 const themes=messagingThemes(rows).filter(t=>t.category==="actions");
 return {real:false,base:rows.length,list:themes.slice(0,3).map(t=>({label:t.label,n:t.ads.length}))};
}
function topLandings(rows){
 const m=new Map();let base=0;
 for(const a of rows){const c=mediaCache.get(a.id)?.cta;if(!c||!c.url)continue;base++;const k=ctaPath(c.url);const e=m.get(k)||{path:k,url:c.url,n:0};e.n++;m.set(k,e)}
 return {base,list:[...m.values()].sort((a,b)=>b.n-a.n).slice(0,4)};
}
// "What they're testing": a short Claude-written read of the brand's live ads.
// The server fetches the ads itself and caches each brand for a day; when no
// API key is configured it answers 204 and nothing is shown.
const aiSum={page:"",status:"",data:null};
function aiSummaryHTML(){
 if(!state.page||aiSum.page!==state.page||aiSum.status==="none")return '<div class="ai-sum" data-ai-sum hidden></div>';
 if(aiSum.status!=="ready")return '<div class="ai-sum is-loading" data-ai-sum aria-busy="true"><p class="ai-k"><span class="ai-spark" aria-hidden="true"></span>What '+esc(state.brand||"they")+' are testing</p><div class="ai-skel"><i></i><i></i><i></i></div></div>';
 const s=aiSum.data;
 const ad=id=>{const n=state.rows.findIndex(a=>a.id===id);return n<0?"":'<button type="button" class="ai-ad" data-action="detail" data-id="'+esc(id)+'">Ad '+(n+1)+'</button>'};
 return '<div class="ai-sum" data-ai-sum><p class="ai-k"><span class="ai-spark" aria-hidden="true"></span>What '+esc(state.brand||"they")+' are testing</p><p class="ai-head">'+esc(s.headline)+'</p><ul class="ai-points">'+s.points.map(p=>'<li><b>'+esc(p.label)+'</b><span>'+esc(p.text)+(p.adIds.length?' <span class="ai-ads">'+p.adIds.map(ad).join("")+'</span>':'')+'</span></li>').join("")+'</ul>'+(s.testIdea?'<p class="ai-test"><b>Test idea</b> '+esc(s.testIdea)+'</p>':'')+'<p class="ai-foot">Written by AI from the text of '+s.adsRead+' live ads · '+new Date(s.generatedAt).toLocaleDateString("en-GB",{day:"numeric",month:"short"})+'. Check the ads before acting on it.</p></div>';
}
function paintAiSummary(){const el=document.querySelector("[data-ai-sum]");if(!el)return;const t=document.createElement("template");t.innerHTML=aiSummaryHTML();el.replaceWith(t.content.firstChild)}
async function loadAiSummary(){
 const page=state.page;if(!page||aiSum.page===page)return;
 Object.assign(aiSum,{page,status:"loading",data:null});paintAiSummary();
 try{
  const r=await fetch("/api/brand-summary?page="+encodeURIComponent(page)+"&name="+encodeURIComponent(state.brand||""));
  if(aiSum.page!==page)return;
  if(r.status===200){const d=await r.json();if(d&&d.summary){Object.assign(aiSum,{status:"ready",data:d.summary});paintAiSummary();return}}
 }catch{}
 if(aiSum.page===page){aiSum.status="none";paintAiSummary()}
}
// Evidence-first overview drawn from existing ad records and deterministic classifiers.
function intelligenceOverview(ads){
 const total=ads.length, themes=messagingThemes(ads).filter(t=>t.category!=="actions");
 const main=themes.find(t=>t.ads.length>=Math.max(2,Math.ceil(total*.1)))||null;
 const fresh=ads.filter(a=>{const d=daysRunning(a);return d!=null&&d<=7});
 const long=ads.filter(a=>{const d=daysRunning(a);return d!=null&&d>=90});
 const percentage=(n,d)=>d?Math.round(n/d*100):0;
 const signals=[];
 signals.push(main?{tag:"Leading message",title:main.label,desc:main.ads.length+" of "+total+" loaded ads ("+percentage(main.ads.length,total)+"%) match this copy-based theme.",example:main.ads[0]}:{tag:"Messaging",title:"No repeated theme stands out",desc:"Loaded copy has no sufficiently frequent theme yet. Explore individual ads for ideas.",example:null});
 signals.push({tag:"Recent activity",title:fresh.length+" ads launched in 7 days",desc:long.length+" of "+total+" loaded ads have been active for 90+ days. Duration alone does not prove results.",example:fresh[0]||long[0]||null,filter:fresh.length?"new":""});
 const offer=themes.find(t=>t.category==="offers");
 if(offer&&offer!==main)signals.push({tag:"Offer language",title:offer.label,desc:offer.ads.length+" of "+total+" loaded ads match this offer-related text theme.",example:offer.ads[0]});
 const exampleLink=a=>a&&/^\d{1,30}$/.test(String(a.id||""))?'<a class="io-evidence" href="'+esc(metaUrl(a.id))+'" target="_blank" rel="noopener noreferrer">Supporting ad ↗</a>':"";
 const tiles=signals.map(v=>'<article class="io-card'+(v.example?' has-th':'')+'">'+(v.example?'<button type="button" class="io-thbtn" data-action="detail" data-id="'+esc(v.example.id)+'" aria-label="View supporting ad">'+thumbHTML(v.example.id,"io-th",true)+'</button>':'')+'<div class="io-body"><p class="io-tag">'+esc(v.tag)+'</p><h4>'+esc(v.title)+'</h4><p>'+esc(v.desc)+'</p><div class="io-actions">'+exampleLink(v.example)+(v.filter?'<button type="button" class="io-evidence" data-filter="'+esc(v.filter)+'">Filter recent ads →</button>':"")+'</div></div></article>').join("");
 const partial=!!(state.cursor||state.needsPageStart);
 const checked=state.lastSearchAt?new Date(state.lastSearchAt).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"this session";
 const idea=main?main.test:"Explore recently launched ads and test one new message against your current creative.";
 return '<section class="intel-overview" aria-labelledby="intel-overview-title"><div class="io-heading"><div><p class="io-eyebrow">ADSNOOP INTELLIGENCE</p><h3 id="intel-overview-title">What matters about '+esc(state.brand||"this advertiser")+'</h3><p class="io-intro">The signals worth checking before you scroll through the ads.</p></div><button class="io-button" type="button" data-view="insights">Explore messaging →</button></div>'+aiSummaryHTML()+'<div class="io-grid">'+tiles+'</div><div class="io-direction"><strong>Creative test to consider</strong><p>'+esc(idea)+'</p></div><p class="io-method">'+total+" loaded active ads · "+(state.coverage==="GB"?"UK":"UK + EU")+" coverage · Checked "+esc(checked)+". "+(partial?"Partial sample: more Meta pages may be available. ":"")+"Themes and suggested tests are editorial research signals, not verified ROAS or performance.</p></section>";
}

const mixFormats={...formatLabel,static:"Static Image"};
const mixKeys=Object.keys(mixFormats);
const mixNumber=new Intl.NumberFormat("en-GB");
const mixPercent=new Intl.NumberFormat("en-GB",{style:"percent",maximumFractionDigits:1});
function createCreativeMix(){
 const card=document.createElement("section");
 card.className="intel-card creative-mix";
 card.setAttribute("aria-labelledby","creative-mix-title");
 card.innerHTML='<header class="mix-heading"><h4 id="creative-mix-title">Creative mix</h4><button type="button" class="mix-clear" data-mix-clear data-filter="all" hidden>Clear filter</button></header>'+
 '<div class="mix-layout"><div class="mix-figure"><svg viewBox="0 0 160 160" aria-hidden="true"><defs>'+[["video","#9b7bff","#6a3fd6"],["static","#4aa3ff","#1f62d1"],["carousel","#ffa14a","#c2541a"],["catalogue","#2fd3a4","#0f7a62"]].map(([k,a,b])=>'<linearGradient id="mixg-'+k+'" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="'+a+'"/><stop offset="1" stop-color="'+b+'"/></linearGradient>').join("")+'</defs><circle class="mix-track" cx="80" cy="80" r="64"/>'+
 mixKeys.map(key=>'<circle class="mix-arc mix-tone-'+key+'" cx="80" cy="80" r="64" pathLength="100" transform="rotate(-90 80 80)" data-mix-key="'+key+'" data-filter="'+key+'" data-empty="true"/>').join("")+
 '</svg><div class="mix-centre" aria-hidden="true"><strong></strong><span></span><small hidden></small></div></div>'+
 '<div class="mix-legend" role="group" aria-label="Filter ads by creative format" aria-describedby="creative-mix-basis">'+mixKeys.map(key=>'<button type="button" class="mix-row mix-tone-'+key+'" data-mix-key="'+key+'" data-filter="'+key+'" aria-controls="cards" disabled><i aria-hidden="true"></i><span>'+mixFormats[key]+'</span><b></b><small></small></button>').join("")+'</div></div>'+
 '<footer class="mix-footer"><p id="creative-mix-basis">Share of classified ads</p><p class="mix-coverage"></p></footer>';
 const highlight=()=>{
  const hover=card.querySelector("[data-mix-key]:hover:not(:disabled):not([data-empty=true])");
  const focus=card.querySelector("[data-mix-key]:focus-visible");
  const key=(hover||focus)?.dataset.mixKey;
  card.dataset.highlight=key||"";
  card.querySelectorAll("[data-mix-key]").forEach(el=>el.classList.toggle("mix-highlight",el.dataset.mixKey===key));
  const row=key&&card.querySelector('.mix-row[data-mix-key="'+key+'"]');
  card.querySelector(".mix-centre strong").textContent=row?row.querySelector("b").textContent:card.dataset.classified;
  card.querySelector(".mix-centre span").textContent=row?mixFormats[key]:"Classified creatives";
  const share=card.querySelector(".mix-centre small");
  share.hidden=!row;
  share.textContent=row?row.querySelector("small").textContent:"";
 };
 for(const el of card.querySelectorAll("[data-mix-key]")){
  for(const ev of ["pointerenter","pointerleave","focus","blur"])el.addEventListener(ev,()=>requestAnimationFrame(highlight));
 }
 card.updateMixHighlight=highlight;
 return card;
}
function mixPeek(card){
 let peek=card.querySelector(".mix-peek");
 const key=mixKeys.includes(state.filter)?state.filter:"";
 if(!key){peek?.remove();return}
 const ads=state.rows.filter(a=>formatOf(a.id)===key);
 if(!peek){peek=document.createElement("div");peek.className="mix-peek";card.querySelector(".mix-footer").before(peek)}
 peek.innerHTML='<div class="mix-peek-h"><b>'+esc(mixFormats[key])+'</b><span>'+mixNumber.format(ads.length)+' ad'+(ads.length===1?'':'s')+'</span><button type="button" class="mix-peek-x" data-filter="all" aria-label="Clear format filter">×</button></div>'+
  (ads.length?'<div class="mix-peek-row">'+ads.slice(0,8).map(a=>'<button type="button" class="mix-peek-ad" data-action="detail" data-id="'+esc(a.id)+'" title="'+esc((a.title||a.copy||"").slice(0,90))+'">'+thumbHTML(a.id,"mix-peek-th",true)+'</button>').join("")+'</div>':'')+
  '<button type="button" class="linkbutton mix-peek-go" data-mix-go data-filter="'+key+'">See all '+mixNumber.format(ads.length)+' in Ads →</button>';
 hydrateThumbs();
}
function updateCreativeMix(card,rows){
 const counts={video:0,static:0,carousel:0,catalogue:0};
 for(const ad of rows){const key=formatOf(ad.id);if(key)counts[key]++}
 const classified=mixKeys.reduce((sum,key)=>sum+counts[key],0);
 const active=mixKeys.includes(state.filter)?state.filter:"";
 const signature=[state.page,rows.length,active,...Object.values(counts)].join("|");
 if(card.dataset.mixSignature===signature)return;
 card.dataset.mixSignature=signature;
 card.dataset.classified=mixNumber.format(classified);
 card.querySelector(".mix-clear").hidden=!active;
 let offset=0;
 for(const key of mixKeys){
  const count=counts[key],share=classified?count/classified*100:0;
  const arc=card.querySelector('.mix-arc[data-mix-key="'+key+'"]');
  const row=card.querySelector('.mix-row[data-mix-key="'+key+'"]');
  const gap=share===100?0:Math.min(1.4,share*.2);
  arc.style.setProperty("--mix-dash",share-gap);
  arc.style.setProperty("--mix-offset",-(offset+gap/2));
  arc.dataset.empty=String(!count);
  arc.classList.toggle("mix-selected",key===active);
  offset+=share;
  const percent=!classified?"—":share>0&&share<.1?"<0.1%":share>99.9&&share<100?">99.9%":mixPercent.format(share/100);
  row.style.setProperty("--share-n",(share/100).toFixed(3));
  row.disabled=!count;
  row.setAttribute("aria-pressed",String(key===active));
  row.querySelector("b").textContent=mixNumber.format(count);
  row.querySelector("small").textContent=percent;
  row.setAttribute("aria-label",mixFormats[key]+", "+mixNumber.format(count)+(count===1?" ad":" ads")+(classified?", "+percent+" of classified ads":""));
 }
 card.querySelector(".mix-coverage").textContent=mixNumber.format(classified)+" of "+mixNumber.format(rows.length)+" loaded ads classified · "+mixNumber.format(rows.length-classified)+" unclassified";
 card.updateMixHighlight();
}

function renderIntel(){
 const box=$("intel");
 box.hidden=state.view!=="intel"||!state.rows.length;
 if(box.hidden)return;
 if(box.dataset.k!==state.page){box.dataset.k=state.page;box.classList.add("fresh");clearTimeout(box._t);box._t=setTimeout(()=>box.classList.remove("fresh"),1600)}
 const rows=state.rows,total=rows.length;
 const stages={new:0,testing:0,proven:0,long:0};let oldest=0;
 for(const a of rows){const d=daysRunning(a),s=lifeStage(d);if(s)stages[s.key]++;if(d>oldest)oldest=d}
 const weeks=weeklyLaunches(rows),wMax=Math.max(1,...weeks);
 const vc=variationCounts(rows);const scaled=[...vc.values()].filter(n=>n>1);
 const ctas=topCTAs(rows),lands=topLandings(rows);
 const changes=state.changes;
 let changeHTML;
 if(!changes||changes.first)changeHTML='<p class="intel-big">First look</p><p class="intel-sub">We’ll show new and stopped ads when you return.</p>';
 else{const add=changes.added.length,rem=changes.removed;changeHTML='<p class="intel-big"><span class="up">+'+add+'</span>'+(rem?' <span class="down">−'+rem.length+'</span>':'')+'</p><p class="intel-sub">'+(add?add+' new':'No new ads')+(rem?' · '+rem.length+' no longer running':'')+' since '+esc(new Date(changes.since).toLocaleDateString("en-GB",{day:"numeric",month:"short"}))+'</p>'+(add?'<button class="linkbutton" data-filter="added">Show new ads</button>':'');}
 const chip=(key,label,n,cls)=>'<button class="stagechip '+cls+(state.filter===key?' on':'')+'" data-filter="'+key+'"><b>'+n+'</b>'+esc(label)+'</button>';
 // Headline numbers.
 const distinct=new Set(rows.map(groupKey)).size,topReach=Math.max(0,...rows.map(a=>a.reach||0));
 const add=changes&&!changes.first?changes.added.length:null,rem=changes&&!changes.first?changes.removed.length:0;
 const sinceTxt=add==null?"First look: changes appear on your next visit":(add?'+'+add+' new':'No new ads')+(rem?' · −'+rem+' stopped':'')+' since '+new Date(changes.since).toLocaleDateString("en-GB",{day:"numeric",month:"short"});
 const kpi=(label,value,sub,extra)=>'<div class="kpi"><p class="kpi-l">'+label+'</p><p class="kpi-v">'+value+'</p><p class="kpi-s">'+sub+'</p>'+(extra||'')+'</div>';
 const kpis='<section class="intel-card intel-full kpis" aria-label="Headline numbers">'+
  kpi("Live ads",'<span class="countup" data-to="'+distinct+'">'+distinct+'</span>',total+" including size variants")+
  kpi("New in 7 days",'<span class="countup" data-to="'+stages.new+'">'+stages.new+'</span>',esc(sinceTxt),add?'<button class="linkbutton" data-filter="added">Show new ads →</button>':'')+
  kpi("Biggest UK reach",topReach?compactNumber(topReach):'—',topReach?'Meta’s estimate for their most-seen ad':'Not reported for these ads')+
  kpi("Oldest live ad",oldest+'<small> days</small>',oldest>=90?'Long-runners are worth studying':'No ad has run 90+ days')+
 '</section>';
 // Their most-seen creatives, one per message.
 const seenKeys=new Set(),topAds=[];
 for(const a of [...rows].sort((x,y)=>(y.reach||0)-(x.reach||0)||(daysRunning(y)||0)-(daysRunning(x)||0))){const k=groupKey(a);if(seenKeys.has(k))continue;seenKeys.add(k);topAds.push(a);if(topAds.length>=8)break}
 const film='<section class="intel-card intel-full film" aria-label="Most-seen creatives"><div class="film-head"><p class="intel-k">Most-seen creatives</p><button class="linkbutton" data-view="discover">See all ads →</button></div><div class="film-row">'+topAds.map((a,i)=>{const d=daysRunning(a);return '<button type="button" class="film-item" data-action="detail" data-id="'+esc(a.id)+'" aria-label="View ad '+(i+1)+'">'+thumbHTML(a.id,"film-th",i<4)+'<span class="film-meta"><b>'+(a.reach?compactNumber(a.reach)+' reach':'#'+(i+1))+'</b><small>'+(d!=null?(d<=1?'New':d+'d live'):'')+'</small></span><span class="film-copy">'+esc((a.title&&a.title!=="Ad creative"?a.title:a.copy||"").slice(0,70))+'</span></button>'}).join("")+'</div></section>';
 // Weekly launches with dated ticks.
 const weekStart=i=>{const dt=new Date();dt.setDate(dt.getDate()-(weeks.length-1-i)*7);return dt.toLocaleDateString("en-GB",{day:"numeric",month:"short"})};
 const peak=weeks.indexOf(wMax);
 const timeline='<section class="intel-card intel-wide tl2"><div class="tl2-head"><p class="intel-k">New ads per week</p><p class="tl2-big"><b>'+weeks[weeks.length-1]+'</b> this week'+(wMax>0&&peak!==weeks.length-1?' · busiest week <b>'+weekStart(peak)+'</b> ('+wMax+')':'')+'</p></div><div class="tl2-bars" role="img" aria-label="New ads launched per week over the last 12 weeks">'+weeks.map((n,i)=>'<span class="tl2-col'+(i===weeks.length-1?' now':'')+'" style="--h:'+Math.max(3,Math.round(n/wMax*100))+'%;--i:'+i+'" title="Week of '+weekStart(i)+': '+n+' new ad'+(n===1?'':'s')+'"><i></i>'+(n?'<em>'+n+'</em>':'')+'</span>').join("")+'</div><div class="tl2-axis">'+weeks.map((n,i)=>'<span>'+(i%3===0||i===weeks.length-1?(i===weeks.length-1?'This week':weekStart(i)):'')+'</span>').join("")+'</div><p class="intel-sub">Based on '+(state.cursor?'the newest '+total:'all '+total)+' live ads.</p></section>';
 // How long their live ads have been running.
 const stageDefs=[["new","New (≤7d)",stages.new,"st-new"],["testing","8–29 days",stages.testing,"st-testing"],["proven","30–89 days",stages.proven,"st-proven"],["long","90+ days",stages.long,"st-long"]];
 const stageTotal=Math.max(1,stageDefs.reduce((n,s)=>n+s[2],0));
 const age='<section class="intel-card age"><div class="age-head"><p class="intel-k">How long their ads have run</p>'+(oldest?'<p class="age-oldest">Oldest: <b>'+oldest+' days</b></p>':'')+'</div><div class="age-bar" role="group" aria-label="Ads by age. Click to filter.">'+stageDefs.filter(s=>s[2]).map((s,n)=>'<button type="button" class="age-seg '+s[3]+(state.filter===s[0]?' on':'')+'" data-filter="'+s[0]+'" style="flex:'+s[2]+';--d:'+n*90+'ms" title="'+esc(s[1])+': '+s[2]+' ad'+(s[2]===1?'':'s')+' ('+Math.round(s[2]/stageTotal*100)+'%)"><span>'+(s[2]/stageTotal>=.1?Math.round(s[2]/stageTotal*100)+'%':'')+'</span></button>').join("")+'</div><div class="age-cols">'+stageDefs.map(s=>'<button type="button" class="age-col '+s[3]+(state.filter===s[0]?' on':'')+'" data-filter="'+s[0]+'"'+(s[2]?'':' disabled')+'><b>'+s[2]+'</b><span>'+esc(s[1])+'</span><small>'+Math.round(s[2]/stageTotal*100)+'% of ads</small></button>').join("")+'</div><p class="intel-sub">Click to see those ads. Running long shows they keep paying for an ad, not that it works.</p></section>';
 // Calls to action and landing pages as bars.
 const barList=(items,valueOf,labelOf,max)=>'<ol class="barlist">'+items.map(x=>'<li><span class="bl-label">'+labelOf(x)+'</span><span class="bl-track"><i style="width:'+Math.max(4,Math.round(valueOf(x)/max*100))+'%"></i></span><b>'+valueOf(x)+(x.pct?'%':'')+'</b></li>').join("")+'</ol>';
 const ctaItems=ctas.list.map(c=>({label:c.label,n:Math.round(c.n/ctas.base*100),pct:true}));
 const ctaCard='<section class="intel-card"><p class="intel-k">'+(ctas.real?'Buttons they use':'Calls to action')+'</p>'+(ctaItems.length?barList(ctaItems,x=>x.n,x=>esc(x.label),100):'<p class="intel-sub">No clear call to action in the ad text.</p>')+'<p class="intel-sub">'+(ctas.real?'From '+ctas.base+' collected ads':'Read from ad text until creatives load')+(scaled.length?' · '+scaled.length+' message'+(scaled.length===1?' runs':'s run')+' as several ads':'')+'</p></section>';
 const lMax=Math.max(1,...lands.list.map(l=>l.n));
 const landCard='<section class="intel-card"><p class="intel-k">Where the ads send people</p>'+(lands.list.length?barList(lands.list.map(l=>({...l,pct:false})),x=>x.n,x=>'<a href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer nofollow" title="'+esc(x.url)+'">'+esc(x.path.replace(/^www\./,"").slice(0,46))+'</a>',lMax)+'<p class="intel-sub">From '+lands.base+' collected ads</p>':'<p class="intel-sub">Landing pages appear once creatives have been collected.</p>')+'</section>';
 const template=document.createElement("template");
 template.innerHTML=kpis+intelligenceOverview(rows)+film+timeline+'<div data-mix-slot></div>'+age+ctaCard+landCard;
 const slot=template.content.querySelector("[data-mix-slot]");
 let mix=box.querySelector(".creative-mix");
 if(!mix){
  slot.replaceWith(createCreativeMix());
  box.replaceChildren(template.content);
  mix=box.querySelector(".creative-mix");
 }else{
  // Keep the chart mounted across collector updates so arcs and focus stay in place.
  for(const child of [...box.children])if(child!==mix)child.remove();
  while(slot.previousSibling)mix.before(template.content.firstChild);
  slot.remove();
  mix.after(template.content);
 }
 updateCreativeMix(mix,rows);if(state.view==="intel")mixPeek(mix);
 hydrateThumbs();
 loadAiSummary();
}
// ---- Remix this ad: Claude writes a style prompt and copy for your brand (signed-in users) ----
const remix={busy:"",last:null};
function remixTabHTML(cols){
 const comps=cols.filter(c=>!c.mine);
 if(!comps.length)return '<div class="op-empty">Add competitors to remix their ads.</div>';
 const head=c=>'<h4>'+logoHTML(c.id,c.name,"")+'<span>'+esc(c.name)+'</span></h4>';
 const groups=comps.map(c=>{
  if(!c.d||c.d.status!=="ready")return '<div class="rx-group">'+head(c)+'<p class="intel-sub">'+(c.d&&c.d.status==="error"?'Couldn’t load this brand’s ads.':'<span class="cmp-wait"></span> Loading ads…')+'</p></div>';
  const seen=new Set(),ads=[...c.d.rows].filter(a=>(a.copy&&a.copy!=="No ad copy provided by Meta.")||a.title).sort(byReach).filter(a=>{const k=groupKey(a);if(seen.has(k))return false;seen.add(k);return true}).slice(0,4);
  if(!ads.length)return '<div class="rx-group">'+head(c)+'<p class="intel-sub">No live ads with copy to remix.</p></div>';
  return '<div class="rx-group">'+head(c)+'<div class="rx-grid">'+ads.map(a=>{
   const d=daysRunning(a),copy=a.copy&&a.copy!=="No ad copy provided by Meta."?a.copy:"";
   return '<div class="rx-ad">'+thumbHTML(a.id,"rx-th",true)+'<div class="rx-body"><b>'+esc((a.title||copy).slice(0,70))+'</b>'+(a.title&&copy?'<small>'+esc(copy.slice(0,110)+(copy.length>110?"…":""))+'</small>':'')+'<span class="rx-meta">'+[a.reach?'UK reach '+compactNumber(a.reach):'',d!=null?d+' days live':''].filter(Boolean).join(' · ')+'</span><button class="remixbtn" data-action="remix" data-id="'+esc(a.id)+'" data-rpage="'+esc(c.id)+'" data-name="'+esc(c.name)+'">✦ Remix this ad</button></div></div>'}).join("")+'</div></div>';
 }).join("");
 const me=myBrand();
 return '<div class="rx-intro"><h3>Turn their ads into your next test.</h3><p>Pick a competitor ad. AdSnoop’s AI breaks down how it’s built, writes a prompt to recreate the style in ChatGPT, Midjourney or Canva, and rewrites the copy for '+(me?esc(me.name):'your brand')+'.</p></div>'+groups;
}
function remixGateHTML(){
 return '<div class="rx-gate"><p class="rx-lead">Turn any competitor ad into your own version: a ready-to-paste image prompt, new copy in the same structure, and a line on why the ad works.</p><ol class="trk-join-steps"><li>Pick an ad</li><li>Paste the prompt into your image tool</li><li>Edit the copy and launch your test</li></ol><div class="modal-acts"><button class="pill" data-acct="signup">Create a free account →</button><button class="ghost" data-acct="signin">Sign in</button></div><p class="notice">Remix is free with an AdSnoop account.</p></div>';
}
async function openRemix(ad){
 if(!/^\d{1,30}$/.test(ad.id||"")||!/^\d{1,30}$/.test(ad.page||"")){toast("This ad can’t be remixed.");return}
 if(auth.checking){toast("Checking your account…");return}
 if(!auth.enabled){modal("Remix this ad",'<p>Sign-in is unavailable right now, so Remix is switched off. Please try again later.</p>');return}
 if(!auth.signedIn){modal("Remix this ad",remixGateHTML());return}
 const ab=activeBrand(),brand=ab&&ab.id!==ad.page?ab.name:"";
 remix.busy=ad.id;
 modal("Remix this ad",'<div class="rx-loading"><span class="loadingring" aria-hidden="true"></span><p><b>Reading '+esc(ad.name?ad.name+'’s':'the')+' ad…</b><br>Breaking down the hook, structure and visual style. This usually takes 10 to 20 seconds.</p></div>');
 let d=null,err="";
 try{
  const tok=await authToken();if(!tok)throw Error("Please sign in again.");
  const r=await fetch("/api/remix",{method:"POST",headers:{Authorization:"Bearer "+tok,"Content-Type":"application/json"},body:JSON.stringify({id:ad.id,page:ad.page,name:ad.name,brand}),signal:AbortSignal.timeout(90000)});
  d=await r.json().catch(()=>null);if(!r.ok||!d||!d.remix)err=(d&&d.error)||"The remix couldn’t be written just now. Please try again.";
 }catch(e){err=e&&e.name!=="TimeoutError"&&e.name!=="AbortError"&&e.message?e.message:"The remix took too long. Please try again."}
 if(remix.busy!==ad.id||!$("modalOverlay").classList.contains("open"))return;
 remix.busy="";
 if(err){$("modalContent").innerHTML='<p class="errmsg">'+esc(err)+'</p>';return}
 remix.last=d.remix;$("modalContent").innerHTML=remixResultHTML(d.remix,ad,brand,d.left);hydrateThumbs();
}
function remixResultHTML(x,ad,brand,left){
 const block=(k,label,body,copy)=>'<section class="rx-sec"><div class="rx-sec-h"><span class="eyebrow">'+label+'</span>'+(copy?'<button class="ghost rx-copy" data-action="remixcopy" data-k="'+k+'">Copy</button>':'')+'</div>'+body+'</section>';
 const c=x.copy||{};
 return '<div class="rx-src">'+thumbHTML(ad.id,"rx-th",true)+'<p>Remixed from an ad by <b>'+esc(ad.name||"a competitor")+'</b>'+(brand?' for <b>'+esc(brand)+'</b>':'')+'.'+(x.usedImage?'':' The image wasn’t available, so the visual prompt is based on the text.')+'</p></div>'+
  block("why","Why it works",'<p class="rx-why">'+esc(x.whyItWorks)+'</p>'+(x.structure&&x.structure.length?'<ol class="rx-steps">'+x.structure.map(s=>'<li>'+esc(s)+'</li>').join("")+'</ol>':''),false)+
  block("prompt","Image prompt",'<div class="modalquote rx-q adtext" data-rx="prompt">'+esc(x.imagePrompt)+'</div><p class="rx-hint">Paste into ChatGPT, Midjourney or Canva.</p>',true)+
  block("copy","Your copy, same structure",'<div class="modalquote rx-q adtext" data-rx="copy"><b>'+esc(c.headline)+'</b>\n\n'+esc(c.primaryText)+(c.cta?'\n\n['+esc(c.cta)+']':'')+'</div>',true)+
  '<p class="notice">Written by AI from the ad’s public text'+(x.usedImage?' and image':'')+'. Fill in the [placeholders], check every claim, and don’t reuse a competitor’s logo, people or trademarks.'+(left!=null?' '+left+' remix'+(left===1?'':'es')+' left today.':'')+'</p>';
}
async function copyRemix(b){
 const x=remix.last;if(!x)return;
 const c=x.copy||{},text=b.dataset.k==="prompt"?x.imagePrompt:[c.headline,c.primaryText,c.cta].filter(Boolean).join("\n\n");
 try{await navigator.clipboard.writeText(text);b.textContent="Copied ✓";setTimeout(()=>{if(b.isConnected)b.textContent="Copy"},1800)}
 catch{const q=document.querySelector('[data-rx="'+b.dataset.k+'"]');if(q){const r=document.createRange();r.selectNodeContents(q);const s=getSelection();s.removeAllRanges();s.addRange(r)}toast("Press Ctrl+C (or ⌘C) to copy.")}
}
function findAd(id){return state.rows.find(a=>a.id===id)||state.saved.get(id)||state.compare.get(id)}
function modal(title,content){$("modalTitle").textContent=title;$("modalContent").innerHTML=content;$("modalOverlay").classList.add("open");$("closeModal").focus();}
function adDetails(id){
 const a=findAd(id);if(!a)return;
 modal(a.pageName||"Ad creative",'<p>'+esc(a.title||"Meta advertising record")+'</p><div class="modalquote adtext">'+esc(a.copy||"No copy provided.")+'</div><div class="modal-row"><span>Meta Library ID</span><strong>'+esc(a.id)+'</strong></div><div class="modal-row"><span>Running since</span><strong>'+esc(formatDate(a.start))+'</strong></div><div class="modal-row"><span>Publisher platforms</span><strong>'+esc((a.platforms||[]).join(", ")||"Unknown")+'</strong></div><div class="modal-row"><span>UK reach</span><strong>'+esc(reach(a.reach))+'</strong></div>'+(()=>{const c=mediaCache.get(a.id)?.cta;if(!c)return '';return (ctaLabel(c)?'<div class="modal-row"><span>Button</span><strong>'+esc(ctaLabel(c))+'</strong></div>':'')+(c.url?'<div class="modal-row"><span>Landing page</span><strong><a href="'+esc(c.url)+'" target="_blank" rel="noopener noreferrer nofollow">'+esc(ctaPath(c.url).slice(0,60))+' ↗</a></strong></div>':'')})()+(()=>{const gm=state.groupMeta?.get(a.id);return gm&&gm.n>1?'<div class="modal-row"><span>Same copy runs as</span><strong>'+gm.n+' ads</strong></div>':''})()+'<div class="modal-row"><span>Creative format</span><strong>'+esc(a.format||"Unknown")+'</strong></div><p class="notice">UK reach is reported when provided by the API and is not ad spend or performance.</p><div class="modal-acts"><button class="pill" data-action="remix" data-id="'+esc(a.id)+'" data-rpage="'+esc(a.pageId||state.page||"")+'" data-name="'+esc(a.pageName||state.brand||"")+'">✦ Remix this ad</button><a class="ghost" href="'+metaUrl(a.id)+'" target="_blank" rel="noopener noreferrer">View on Meta ↗</a></div>');
}
function compareView(){
 const items=Array.from(state.compare.values());if(!items.length)return;
 modal("Creative comparison",'<p>Review ad messaging side by side. No conversion or spend data is implied.</p><div class="cmpcols">'+items.map(a=>'<div class="cmpcol"><h4>'+esc(a.pageName||"Advertiser")+'</h4><p><strong>'+esc(a.title||"Ad creative")+'</strong></p><p class="adtext">'+esc(a.copy||"")+'</p><p>Since '+esc(formatDate(a.start))+'</p></div>').join("")+'</div>');
}
function setView(view){
 if(view==="compare"&&!TRACKER){location.href="/tracker";return}
 if(TRACKER&&view!=="tracker"){location.href=view==="discover"?"/":"/?view="+encodeURIComponent(view);return}
 state.view=view;
 $("brands").hidden=true;
 if(view==="saved")feedback("Your saved creative records are stored locally in this browser. For an up-to-date ad, open its official Meta link.");
 else if(view==="intel"||view==="insights"||view==="compare")feedback("");
 else feedback(state.brand?"":"Search a brand above to discover active advertisers.");
 renderCards();
 for(const id of ["cards","intel","metrics","toolbar"]){const el=$(id);if(!el)continue;el.classList.remove("viewin");void el.offsetWidth;el.classList.add("viewin")}
 const tabs=$("viewtabs");
 const behavior=matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth";
 if(tabs.hidden){$("research").scrollIntoView({behavior});return}
 const top=parseFloat(getComputedStyle(tabs).top)||0,r=tabs.getBoundingClientRect();
 if(r.top<=top+1){
  const panel=$("research-panel").getBoundingClientRect();
  window.scrollTo({top:Math.max(0,panel.top+scrollY-top-r.height-12),behavior});
 }else if(r.top>innerHeight*.6)tabs.scrollIntoView({behavior,block:"start"});
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
// Well-known UK advertisers for instant suggestions. Names only: choosing one
// runs a normal search, which resolves the real Facebook Page from Meta.
const ukBrands=["Wren Kitchens","Magnet Kitchens","Howdens","Benchmarx","Sharps","Hammonds","Neville Johnson","Dunelm","DFS","ScS","Furniture Village","Oak Furnitureland","Sofology","Barker and Stonehouse","Loaf","Made.com","Swoon","Habitat","IKEA","John Lewis","Marks & Spencer","Next","Argos","Wayfair","The Range","B&Q","Wickes","Homebase","Screwfix","Toolstation","Dulux","Farrow & Ball","Victorian Plumbing","Bathstore","Victoria Plum","Topps Tiles","Carpetright","Tapi Carpets","Hillarys","Thomas Sanderson","Safestyle","Anglian Home Improvements","Everest","Sainsbury's","Tesco","Asda","Morrisons","Aldi","Lidl","Waitrose","Ocado","Iceland","Co-op","HelloFresh","Gousto","Deliveroo","Just Eat","Uber Eats","Domino's","Greggs","Nando's","Costa Coffee","Pret A Manger","McDonald's","KFC","Burger King","Boots","Superdrug","Lookfantastic","Cult Beauty","Charlotte Tilbury","The Body Shop","Lush","Holland & Barrett","Specsavers","Vision Express","Boohoo","PrettyLittleThing","ASOS","Primark","River Island","New Look","Zara","H&M","Uniqlo","JD Sports","Sports Direct","Nike","Adidas","Gymshark","Fat Face","White Stuff","Joules","Seasalt Cornwall","Boden","Jigsaw","Reiss","Ted Baker","Mango","Matalan","TK Maxx","Very","Currys","AO.com","Apple","Samsung","Google","Amazon","eBay","Etsy","Vinted","Depop","Halfords","Kwik Fit","Cazoo","Cinch","Motorpoint","Arnold Clark","Auto Trader","WeBuyAnyCar","Admiral","Aviva","Direct Line","Churchill","Compare the Market","MoneySuperMarket","Go.Compare","Confused.com","Monzo","Starling Bank","Revolut","Barclays","Lloyds Bank","NatWest","HSBC UK","Santander UK","Nationwide","Halifax","Octopus Energy","British Gas","EDF","E.ON Next","OVO Energy","Sky","Virgin Media","BT","EE","Vodafone","Three","O2","giffgaff","Plusnet","TalkTalk","Netflix","Disney+","NOW","Spotify","Audible","Jet2holidays","TUI","easyJet","Ryanair","British Airways","loveholidays","On the Beach","Booking.com","Expedia","Airbnb","Trainline","Center Parcs","Butlin's","Haven","Hoseasons","Premier Inn","Travelodge","Pets at Home","Tails.com","Butternut Box","Lily's Kitchen","Purina","Nectar","Clarks","Schuh","Office","Dr. Martens","Pandora","Goldsmiths","Ernest Jones","H. Samuel","Moonpig","Funky Pigeon","Card Factory","Smyths Toys","The Entertainer","Hobbycraft","WHSmith","Waterstones","The Works","Lakeland","Robert Dyas","Dyson","Shark","Ninja Kitchen","Simba","Emma Mattress","Eve Sleep","Silentnight","Dreams","Bensons for Beds","Mattress Online","Simply Business","Rightmove","Zoopla","Purplebricks","Hargreaves Lansdown","Nutmeg","Trading 212","PureGym","The Gym Group","David Lloyd","Myprotein","Huel","Grenade","Innocent Drinks","Heinz","Cadbury","Walkers","Coca-Cola","Pepsi","Red Bull","Heineken","Guinness","Bloom & Wild","Interflora","Patch Plants","Thompson & Morgan","Crocus","Sofa.com","Snug Sofa","Cotswold Company","Neptune","Kettle and Toast","Cox & Cox","Graham & Green","The White Company","Laura Ashley","OKA","Heal's","Liberty","Selfridges","Harrods","Fenwick","Debenhams","Next Home","George at Asda","Tu Clothing","Sweaty Betty","Lululemon","M&S Food","Charles Tyrwhitt","Hawes & Curtis","Moss","Suitsupply","Crew Clothing","Superdry","Abercrombie & Fitch","Hollister","Jack Wills","Barbour","Hunter Boots","Mountain Warehouse","Go Outdoors","Cotswold Outdoor","Blacks","Decathlon","Ring","Hive","Tado","Ovo","Bulb","So Energy","Utility Warehouse","Lebara","Lyca Mobile","SMARTY","iD Mobile","Tesco Mobile","Sky Mobile","Virgin Mobile","Cuvva","Marshmallow","By Miles","Zego"];
// Brand suggestions while typing. Meta's keyword search matches ad text, not
// advertiser names, so we combine three sources and keep only name matches:
// advertisers searched before here, well-known UK advertisers, and Meta pages.
const suggest={items:[],active:-1,timer:null,controller:null,cache:new Map(),term:""};
const historyKey="adsnoop-advertiser-history-v1";
function readHistory(){try{const v=JSON.parse(localStorage.getItem(historyKey)||"[]");return Array.isArray(v)?v.filter(x=>x&&/^\d{1,30}$/.test(x.id)&&typeof x.name==="string"):[]}catch{return []}}
function rememberAdvertiser(id,name,count){if(!id||!name)return;const list=readHistory().filter(x=>x.id!==id);list.unshift({id,name,count:count||0});try{localStorage.setItem(historyKey,JSON.stringify(list.slice(0,40)))}catch{}}
function nameScore(term,name){
 const want=canonicalName(term),lower=term.toLowerCase().trim(),c=canonicalName(name);
 if(!want)return 0;if(c===want)return 5;if(c.startsWith(want))return 4;
 if(String(name).toLowerCase().split(/[\s&.'’-]+/).some(w=>w&&w.startsWith(lower)))return 3;
 return want.length>=3&&c.includes(want)?1:0;
}
// Advertisers you have searched and well-known UK brands outrank arbitrary pages.
const sourceRank={history:4,known:3,popular:3,meta:1};
function suggestRank(term,list){
 const best=new Map();
 for(const s of list){
  const score=nameScore(term,s.name);if(!score)continue;
  const key=canonicalName(s.name),cur=best.get(key),item={...s,score};
  // One row per advertiser name; prefer an entry that already has a Page ID.
  if(!cur||(!cur.id&&item.id)||(Boolean(cur.id)===Boolean(item.id)&&(sourceRank[item.source]||0)>(sourceRank[cur.source]||0)))best.set(key,cur&&!item.count?{...item,count:cur.count}:item);
 }
 return [...best.values()].sort((a,b)=>b.score-a.score||(sourceRank[b.source]||0)-(sourceRank[a.source]||0)||(b.count||0)-(a.count||0)||a.name.localeCompare(b.name)).slice(0,7);
}
const pageIdKey="adsnoop-page-ids-v1";
function pageIds(){try{const v=JSON.parse(localStorage.getItem(pageIdKey)||"{}");return v&&typeof v==="object"?v:{}}catch{return {}}}
function rememberPageId(name,id){if(!name||!/^\d{1,30}$/.test(id||""))return;const m=pageIds();m[canonicalName(name)]=id;try{localStorage.setItem(pageIdKey,JSON.stringify(m))}catch{}}
function localSuggestions(term){
 if(canonicalName(term).length<2)return [];
 return [
  ...readHistory().map(h=>({...h,source:"history"})),
  ...knownPages.map(p=>({id:p.id,name:p.name,count:0,source:"known"})),
  ...(()=>{const ids=pageIds();return ukBrands.map(n=>({id:ids[canonicalName(n)]||"",name:n,count:0,source:"popular"}))})()
 ];
}
function mergeSuggestions(a,b){return [...a,...b]}
function initials(name){return String(name||"?").split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase()}
function renderSuggest(state_){
 const box=$("suggest"),input=$("searchInput");
 if(state_==="hide"||(!suggest.items.length&&state_!=="loading"&&state_!=="empty"&&state_!=="limited")){box.hidden=true;input.setAttribute("aria-expanded","false");return}
 box.hidden=false;input.setAttribute("aria-expanded","true");
 const head=state_==="loading"?'<li class="sg-status"><span class="sg-dots"><i></i><i></i><i></i></span>Finding advertisers…</li>':state_==="empty"?'<li class="sg-status">No advertisers found yet. Press Enter to search ads mentioning “'+esc(suggest.term)+'”.</li>':state_==="limited"?'<li class="sg-status">Keep typing, or press Enter to search.</li>':"";
 const firstCat=suggest.items.findIndex(x=>x.source==="category");
 box.innerHTML=head+suggest.items.map((s,i)=>(i===firstCat?'<li class="sg-group" role="presentation">Advertisers running ads about “'+esc(suggest.term)+'”</li>':'')+(s.phrase?'<li role="option" id="sg-'+i+'" class="sg-item sg-phrase'+(i===suggest.active?' active':'')+'" aria-selected="'+(i===suggest.active)+'" data-sg="'+i+'"><span class="sg-text"><strong>🔍 '+esc(s.name)+'</strong><small>Narrower search</small></span></li>':s.all?'<li role="option" id="sg-'+i+'" class="sg-item sg-all'+(i===suggest.active?' active':'')+'" aria-selected="'+(i===suggest.active)+'" data-sg="'+i+'"><span class="sg-text"><strong>See all advertisers running ads about “'+esc(s.name)+'” →</strong></span></li>':'<li role="option" id="sg-'+i+'" class="sg-item'+(i===suggest.active?' active':'')+'" aria-selected="'+(i===suggest.active)+'" data-sg="'+i+'">'+logoHTML(s.id,s.name,"md sg-logo")+'<span class="sg-text"><strong>'+esc(s.name)+'</strong><small>'+(s.source==="category"?s.count+" ad"+(s.count===1?"":"s")+" about it"+(s.reach?" · UK reach "+compactNumber(s.reach):""):s.source==="history"?'Searched before':s.source==="known"?'Verified advertiser':s.source==="popular"?'Popular UK advertiser':s.count?s.count+(s.count>=100?"+":"")+" ads seen":"Advertiser directory")+'</small></span><span class="sg-go">↗</span></li>')).join("");
 input.setAttribute("aria-activedescendant",suggest.active>=0?"sg-"+suggest.active:"");
}
async function fetchSuggestions(term){
 const key=canonicalName(term);
 if(suggest.cache.has(key))return suggest.cache.get(key);
 if(suggest.controller)suggest.controller.abort();
 const controller=new AbortController();suggest.controller=controller;
 const resp=await fetch("/api/advertisers?"+new URLSearchParams({q:term,suggest:"1"}),{signal:controller.signal,cache:"no-store"});
 if(!resp.ok)return [];
 const data=await resp.json();
 const list=(data.advertisers||[]).map(p=>({...p,count:p.adCount||0,source:"directory"}));
 if(list.length){if(suggest.cache.size>=100)suggest.cache.clear();suggest.cache.set(key,list);}
 return list;
}
async function fetchCategorySuggestions(term){
 const key="cat:"+term.toLowerCase();
 if(suggest.cache.has(key))return suggest.cache.get(key);
 try{
  const r=await fetch("/api/discover?"+new URLSearchParams({q:term,quick:"1"}),{cache:"no-store",signal:AbortSignal.timeout(25000)});
  if(!r.ok)return [];
  const d=await r.json();
  const list=(Array.isArray(d.advertisers)?d.advertisers:[]).filter(a=>a&&/^\d{3,30}$/.test(a.id)&&typeof a.name==="string").slice(0,8).map(a=>({id:a.id,name:a.name,count:a.ads,reach:a.reach,source:"category"}));
  list.related=(Array.isArray(d.related)?d.related:[]).filter(x=>typeof x==="string").slice(0,3);
  for(const a of list)rememberPageId(a.name,a.id);
  if(suggest.cache.size>=100)suggest.cache.clear();suggest.cache.set(key,list);
  return list;
 }catch{return []}
}
function onSearchInput(){
 const term=$("searchInput").value.trim();suggest.term=term;suggest.active=-1;
 clearTimeout(suggest.timer);
 if(term.length<2||/^@|facebook\.com[/?#]/i.test(term)){suggest.items=[];renderSuggest("hide");return}
 // Known advertisers appear instantly; Meta results follow after a short pause.
 const local=localSuggestions(term);suggest.items=suggestRank(term,local);
 const cached=suggest.cache.get(canonicalName(term));
 if(cached){suggest.items=suggestRank(term,mergeSuggestions(local,cached));renderSuggest(suggest.items.length?"":"empty");return}
 renderSuggest(suggest.items.length?"":"loading");
 suggest.timer=setTimeout(async()=>{
  try{
   const list=await fetchSuggestions(term);
   if($("searchInput").value.trim()!==term)return;
   suggest.items=suggestRank(term,mergeSuggestions(local,list));
   // Few advertisers are named after the words: also list who runs ads about them.
   if(suggest.items.length<4&&canonicalName(term).length>=4){
    renderSuggest(suggest.items.length?"":"loading");
    const cat=await fetchCategorySuggestions(term);
    if($("searchInput").value.trim()!==term)return;
    const have=new Set(suggest.items.map(x=>x.id).filter(Boolean));
    suggest.items=suggest.items.concat(cat.filter(x=>!have.has(x.id)).slice(0,7-suggest.items.length));
    for(const r of (cat.related||[]))suggest.items.push({phrase:true,name:r,id:""});
    if(cat.length)suggest.items.push({all:true,name:term,id:""});
   }
   renderSuggest(suggest.items.length?"":"empty");
  }catch(err){
   if(err.name==="AbortError")return;
   renderSuggest(suggest.items.length?"":err.code==="RATE_LIMITED"?"limited":"hide");
  }
 },350);
}
function chooseSuggestion(i){
 const s=suggest.items[i];if(!s)return;
 $("searchInput").value=s.name;renderSuggest("hide");clearTimeout(suggest.timer);
 if(!s.id){searchClient(s.name);$("research").scrollIntoView({behavior:"smooth"});return}
 state.view="discover";state.filter="all";state.limit=25;state.theme="";state.revealAll=false;
 state.query=s.name;state.brand=s.name;state.page=s.id;state.discoveryCursor=null;state.canFindAlternates=true;
 state.choices.clear();for(const o of suggest.items)if(o.id)state.choices.set(o.id,{id:o.id,name:o.name,count:o.count});
 void runSearch(s.name,s.id);
 $("research").scrollIntoView({behavior:"smooth"});
}
$("searchInput").addEventListener("input",onSearchInput);
$("searchInput").addEventListener("focus",()=>{if(suggest.items.length)renderSuggest("")});
$("searchInput").addEventListener("keydown",e=>{
 const box=$("suggest");if(box.hidden||!suggest.items.length){if(e.key==="Escape")renderSuggest("hide");return}
 if(e.key==="ArrowDown"){e.preventDefault();suggest.active=(suggest.active+1)%suggest.items.length;renderSuggest("")}
 else if(e.key==="ArrowUp"){e.preventDefault();suggest.active=(suggest.active-1+suggest.items.length)%suggest.items.length;renderSuggest("")}
 else if(e.key==="Enter"&&suggest.active>=0){e.preventDefault();chooseSuggestion(suggest.active)}
 else if(e.key==="Escape"){renderSuggest("hide")}
});
$("suggest").addEventListener("mousedown",e=>{const li=e.target.closest("[data-sg]");if(li){e.preventDefault();chooseSuggestion(Number(li.dataset.sg))}});
document.addEventListener("click",e=>{if(!e.target.closest("#searchForm"))renderSuggest("hide")});
$("searchForm").addEventListener("submit",e=>{
 e.preventDefault();
 renderSuggest("hide");clearTimeout(suggest.timer);
 searchClient($("searchInput").value);
 $("research").scrollIntoView({behavior:"smooth"});
});
$("coverage").addEventListener("change",e=>{state.coverage=e.target.value;if(state.view==="tracker"||state.view==="compare")renderCards();else if(state.query)searchClient(state.query)});
$("sort").value=state.sort;
$("sort").addEventListener("change",e=>{state.sort=e.target.value;state.limit=25;renderCards()});
document.addEventListener("keydown",e=>{const t=e.target.closest&&e.target.closest(".viewtab");if(!t||!["ArrowLeft","ArrowRight"].includes(e.key))return;const tabs=[...document.querySelectorAll(".viewtab")];const next=tabs[(tabs.indexOf(t)+(e.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length];if(next){e.preventDefault();setView(next.dataset.view);requestAnimationFrame(()=>document.querySelector('.viewtab[aria-selected="true"]')?.focus())}});
document.addEventListener("click",e=>{
 let b=e.target.closest("[data-query]");if(b){$("searchInput").value=b.dataset.query;searchClient(b.dataset.query);$("research").scrollIntoView({behavior:"smooth"});return}
 b=e.target.closest("[data-page]");if(b&&TRACKER){location.href="/?"+new URLSearchParams({page:b.dataset.page,name:b.dataset.name||""});return}if(b){if(state.view==="compare"){state.view="discover";if(b.dataset.page===state.page&&state.rows.length){renderCards();return}}if(b.dataset.page!==state.page||(!state.rows.length&&!state.loading)){if(state.pick){const chosen=state.pick.items.find(x=>x.id===b.dataset.page);if(chosen)state.identity=chosen;state.choices.clear();for(const it of state.pick.items)if(it.id)state.choices.set(it.id,{id:it.id,name:it.name,count:it.adCount||it.mentions||it.count||0})}state.brand=b.dataset.name;state.page=b.dataset.page;state.adsFailed=false;runSearch(state.query||state.brand,state.page);}return}
 b=e.target.closest("[data-view]");if(b){
  const tab=b.matches(".viewtab");
  setView(b.dataset.view);
  if(tab)document.querySelector('.viewtab[aria-selected="true"]')?.focus({preventScroll:true});
  return;
 }
 b=e.target.closest("[data-theme]");if(b){const id=b.dataset.theme;state.theme=id;state.msgFilter=messageRules.find(r=>r.id===id)?.category==="actions"?"actions":"messages";state.msgAllExamples="";renderCards();const nb=document.querySelector('.mx-item[data-theme="'+id+'"]');nb?.focus({preventScroll:true});if(nb&&matchMedia("(max-width:820px)").matches){const navh=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--navh"))||64,tabs=$("viewtabs")?.offsetHeight||0;scrollTo({top:nb.getBoundingClientRect().top+scrollY-navh-tabs-16,behavior:"smooth"})}return}
 b=e.target.closest("[data-msgfilter]");if(b){state.msgFilter=b.dataset.msgfilter;state.theme="";renderCards();document.querySelector('[data-msgfilter="'+b.dataset.msgfilter+'"]')?.focus();return}
 b=e.target.closest("[data-filter]");if(b){
  const fromIntel=state.view==="intel",key=b.dataset.filter;
  state.filter=b.closest(".creative-mix")&&!b.hasAttribute("data-mix-go")&&key===state.filter?"all":key;
  state.limit=25;
  // On Intelligence, the donut filters in place: highlight the slice and preview its ads
  // under the chart, instead of jumping to the Ads tab.
  const mixCard=b.closest(".creative-mix");
  if(fromIntel&&mixCard&&!b.hasAttribute("data-mix-go")){updateCreativeMix(mixCard,state.rows);mixPeek(mixCard);return}
  if(fromIntel){
   setView("discover");
   const target=$("toolbar").querySelector('.filter[data-filter="'+state.filter+'"]')||$("research-tab-discover");
   target?.focus({preventScroll:true});
   $("toolbar").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
  }else renderCards();
  return;
 }
 b=e.target.closest("[data-action]");if(!b)return;
 const {action,id}=b.dataset;
 if(action==="detail")adDetails(id);
 if(action==="remix"){openRemix({id,page:b.dataset.rpage||"",name:b.dataset.name||""});return}
 if(action==="remixcopy"){copyRemix(b);return}
 if(action==="save"){const a=findAd(id);if(a){const was=state.saved.has(id);if(was)state.saved.delete(id);else state.saved.set(id,a);save();renderCards();toast(was?"Removed from saved ideas":"Saved to your ideas ♥");if(!was)document.querySelectorAll('[data-action="save"][data-id="'+id+'"]').forEach(el=>{el.classList.add("pop");setTimeout(()=>el.classList.remove("pop"),500)});}}
 if(action==="follow")toggleFollow();
 if(action==="mybrand")toggleMine();
 if(action==="unpin")unpin(b.dataset.id);
 if(action==="cmpreload"){cmp.data.clear();loadCompare(true)}
 if(action==="cmptab"){const t=b.dataset.tab;if(t&&t!==cmp.tab){cmp.tab=t;cmp.anim=true;state.view=TRACKER?"tracker":"compare";renderCards();document.querySelector(".cmp-tabs")?.scrollIntoView({block:"nearest",behavior:"smooth"})}}
 if(action==="cmpmode"){cmp.mode=b.dataset.mode==="count"?"count":"share";renderCards()}
 if(action==="cmpsort"){const k=b.dataset.sort;cmp.sort=cmp.sort===k?"":k;renderCards()}
 if(action==="compare"){const a=findAd(id);if(a){if(state.compare.has(id))state.compare.delete(id);else if(state.compare.size<3)state.compare.set(id,a);else{error("Select up to three ads to compare.");return}renderCards();}}
 if(action==="showmore"){state.limit+=25;renderCards()}
 if(action==="group"){const gm=state.groupMeta?.get(id);if(gm){state.expanded=state.expanded||new Set();if(state.expanded.has(gm.key))state.expanded.delete(gm.key);else{state.expanded.add(gm.key);state.revealAll=true}renderCards();for(const a of state.rows)if(groupKey(a)===gm.key)requestMedia(a.id,{priority:true})}}
 if(action==="revealall"){state.revealAll=true;updateReveal()}
 if(action==="exportmsg")exportMessaging();
 if(action==="msgall"){state.msgAllExamples=state.msgAllExamples===id?"":id;renderCards();document.querySelector('[data-action="msgall"]')?.focus({preventScroll:true})}
 if(action==="retrymedia")requestMedia(id,{refresh:true,priority:true});
 if(action==="loadmore"&&(state.cursor||state.needsPageStart)){state.limit+=25;runSearch(state.query||state.brand,state.page,state.cursor||"",false,state.needsPageStart)}
 if(action==="morebrands"&&!state.loading&&(state.discoveryCursor||state.canFindAlternates))runSearch(state.query,"",state.discoveryCursor||"",true);
});
document.addEventListener("input",e=>{const t=e.target.closest("[data-note]");if(t)writeNote(t.dataset.note,t.value.trim())});
$("closeModal").onclick=()=>$("modalOverlay").classList.remove("open");
$("modalOverlay").onclick=e=>{if(e.target===$("modalOverlay"))$("modalOverlay").classList.remove("open")};
document.addEventListener("keydown",e=>{if(e.key==="Escape")$("modalOverlay").classList.remove("open")});
// Arrow keys move between themes in the message explorer.
document.addEventListener("keydown",e=>{if(e.key!=="ArrowDown"&&e.key!=="ArrowUp")return;const cur=e.target.closest&&e.target.closest(".mx-item");if(!cur)return;const all=[...document.querySelectorAll(".mx-item")],i=all.indexOf(cur),n=all[i+(e.key==="ArrowDown"?1:-1)];if(n){e.preventDefault();n.focus()}});
$("compareOpen").onclick=compareView;
$("compareClear").onclick=()=>{state.compare.clear();renderCards()};
document.addEventListener("click",trkClick);document.addEventListener("input",trkInput);initAuth();
renderCards();if(TRACKER&&(!tracker().brands.length||!activeBrand()?.competitors.length))trkFocus();if(!TRACKER)health();
// Deep links from other pages: /?page=PAGE_ID&name=Brand or /?q=brand
{const p=new URLSearchParams(location.search),pg=p.get("page")||"",nm=(p.get("name")||"").slice(0,120),q=(p.get("q")||"").slice(0,120);
 if(/^\d{1,30}$/.test(pg)){state.brand=nm;state.page=pg;state.query=nm||pg;state.choices.set(pg,{id:pg,name:nm||"Advertiser",count:0});if(nm)rememberPageId(nm,pg);void runSearch(nm||pg,pg);setTimeout(()=>$("cards")?.scrollIntoView({behavior:"smooth"}),300)
  // From the Chrome extension: "Pin as a competitor" (do=pin) pins once sign-in has been checked.
  if(p.get("do")==="pin"){let n=0;const go=()=>{if(typeof auth!=="undefined"&&auth.checking&&n++<40){setTimeout(go,250);return}if(state.page===pg&&!isFollowed(pg))toggleFollow()};setTimeout(go,600)}}
 else if(q){const i=$("searchInput");if(i)i.value=q;searchClient(q)}
 const vw=p.get("view");if(!pg&&!q&&(vw==="saved"||vw==="insights"))setView(vw);
 if(pg||q||vw)history.replaceState(null,"",location.pathname);}
})();
// ---- Page polish: glass header, tile glow, hover-to-play video ----
(function(){
 // The header never changes size; only its glass background fades in, with
 // separate on/off points so it can't flicker at the threshold.
 let scrolled=false;
 const onScroll=()=>{const next=scrolled?scrollY>8:scrollY>40;if(next!==scrolled){scrolled=next;document.body.classList.toggle("scrolled",next)}};
 addEventListener("scroll",onScroll,{passive:true});onScroll();
 // Sticky tabs and loading bar sit under the header's real height (taller on phones).
 const nav=document.querySelector(".as-unified-nav");
 if(nav){const setH=()=>document.documentElement.style.setProperty("--navh",Math.round(nav.getBoundingClientRect().height)+"px");setH();if("ResizeObserver" in window)new ResizeObserver(setH).observe(nav);else addEventListener("resize",setH)}
 const fine=matchMedia("(hover: hover) and (pointer: fine)").matches;
 const grid=document.getElementById("cards");
 if(grid&&fine){
  grid.addEventListener("pointermove",e=>{const c=e.target.closest(".adcard");if(!c)return;const r=c.getBoundingClientRect();c.style.setProperty("--mx",(e.clientX-r.left)+"px");c.style.setProperty("--my",(e.clientY-r.top)+"px")},{passive:true});
  grid.addEventListener("pointerover",e=>{const v=e.target.closest(".live-visual")?.querySelector("video");if(v&&v.paused){v.muted=true;v.dataset.hoverplay="1";v.play().catch(()=>{})}});
  grid.addEventListener("pointerout",e=>{const box=e.target.closest(".live-visual");if(!box||box.contains(e.relatedTarget))return;const v=box.querySelector("video");if(v&&v.dataset.hoverplay==="1"){v.pause();delete v.dataset.hoverplay}});
 }
 document.addEventListener("click",e=>{const a=e.target.closest("[data-scrolltop]");if(a){e.preventDefault();scrollTo({top:0,behavior:"smooth"})}});
})();
