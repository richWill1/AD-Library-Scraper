(function(){
"use strict";
const $=id=>document.getElementById(id), esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const homeUrl="";
const storeKey="adsnoop-live-preview-saved-v1";
const state={view:"discover",query:"",page:"",brand:"",coverage:"GB",rows:[],choices:new Map(),cursor:null,discoveryCursor:null,canFindAlternates:false,needsPageStart:false,filter:"all",sort:"reach",limit:25,theme:"",revealAll:false,loading:false,saved:new Map(),compare:new Map(),health:null};
const mediaCache=new Map(),mediaState=new Map(),mediaQueue=[];
// Collected creatives are remembered in this browser until Meta's signed links
// expire, so returning to a brand shows its ads instantly.
const MEDIA_STORE="adsnoop-media-v1",MEDIA_STORE_MAX=900;const mediaRetried=new Set();
function mediaUntil(items){let until=Date.now()+3*86400000;for(const i of items)for(const u of [i.url,i.poster])if(u)try{const oe=new URL(u).searchParams.get("oe");if(oe&&/^[a-f\d]+$/i.test(oe))until=Math.min(until,parseInt(oe,16)*1000-600000)}catch{}return until}
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
function searchClient(query){
 const q=String(query||"").trim();if(!q)return;
 state.view="discover";state.filter="all";state.limit=25;state.theme="";state.revealAll=false;
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
function busy(v){state.loading=v;const stage=$("as-search-stage");if(stage){stage.hidden=!v;if(v){const label=$("as-stage-query");if(label)label.textContent="Scanning "+(state.brand||state.query||"competitor")+"…";}}if(v)setBar("search");else if(!state.rows.length)setBar("hide");else updateReveal(true);$("searchGo").disabled=v;$("searchGo").textContent=v?"Searching…":"Search ↗";}
function safeMedia(input){try{const u=new URL(input);return u.protocol==="https:"&&u.hostname.endsWith(".fbcdn.net")&&!u.username&&!u.password&&!u.searchParams.has("access_token")?u.href:null}catch{return null}}
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
function logoHTML(id,name,cls){
 const ini=String(name||"?").split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase();
 return '<span class="brandlogo '+(cls||"")+'" aria-hidden="true"><b>'+esc(ini)+'</b>'+(id&&/^\d{1,30}$/.test(id)?'<img alt="" loading="lazy" referrerpolicy="no-referrer" src="https://graph.facebook.com/'+encodeURIComponent(id)+'/picture?type=square&width=128&height=128" onerror="this.remove()">':'')+'</span>';
}
function showHeader(){
 {const title=state.view==="saved"?"Your saved ideas.":state.view==="insights"?(state.brand?state.brand+" — Messaging":"Messaging map."):state.brand?state.brand+" — Active ads":"The creative library.";
 $("heading").innerHTML=(state.view!=="saved"&&state.brand&&state.page?logoHTML(state.page,state.brand,"lg"):"")+'<span>'+esc(title)+'</span>';}
 $("subheading").textContent=state.view==="saved"?"Ads saved in this browser.":state.view==="insights"?"Hooks, benefits, offers, proof and calls to action across the loaded ads.":state.brand?"Loaded from Meta's public Ad Library. Refresh the search to update.":"Search a brand to discover its Facebook advertiser pages.";
 renderViewTabs();
 {const m=$("metrics"),show=state.view!=="insights"&&(state.rows.length>0||state.view==="saved");m.hidden=!show;
 if(show){const shown=shownRows(),live=allRows().length,saved=state.view==="saved";
  const distinct=saved?shown.length:new Set(state.rows.map(groupKey)).size;
  countTo($("metricAds"),distinct);
  $("metricAdsSub").textContent=saved?"saved ads":distinct<live?"distinct ads · from "+live+" live":"live ads";
  const starts=state.rows.map(a=>a.start).filter(Boolean).sort();
  $("bsSince").hidden=saved||!starts.length;$("metricSince").textContent=starts.length?formatDate(starts[0]):"—";
  const week=state.rows.filter(a=>{const d=daysRunning(a);return d!=null&&d<=7}).length;
  $("bsNew").hidden=saved;countTo($("metricNew"),week);
  const f=$("followBtn"),on=isFollowed(state.page);f.hidden=saved||!state.page;f.setAttribute("aria-pressed",String(on));f.querySelector(".bs-star").textContent=on?"★":"☆";f.querySelector(".bs-label").textContent=on?"Following":"Follow brand";
  $("savedBtn").hidden=saved;}
 }
 $("toolbar").style.display=state.rows.length||state.view==="saved"?"flex":"none";
 $("metricSaved").textContent=String(state.saved.size);
 $("savedCount").textContent=state.saved.size?"("+state.saved.size+")":"";
 document.querySelectorAll("[data-view]").forEach(el=>el.classList.toggle("active",el.dataset.view===state.view));
 document.querySelectorAll("[data-filter]").forEach(el=>el.classList.toggle("active",el.dataset.filter===state.filter));
 $("comparisonBar").classList.toggle("show",state.compare.size>0);
 $("compareCount").textContent=state.compare.size+" of 3 selected";
}
function loadingCards(){return ""}
// Numbers count up the first time a brand loads, then update quietly.
function countTo(el,to){
 if(!el)return;const key=state.page+"|"+state.view,prev=Number(el.dataset.v||0);
 if(el.dataset.v===String(to)&&el.dataset.k===key)return;
 const animate=el.dataset.k!==key&&!matchMedia("(prefers-reduced-motion: reduce)").matches&&to>0;
 el.dataset.v=String(to);el.dataset.k=key;cancelAnimationFrame(el._raf||0);
 if(!animate){el.textContent=String(to);return}
 const from=0,t0=performance.now(),dur=Math.min(1200,500+to*12);
 const step=t=>{const k=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-k,3);el.textContent=String(Math.round(from+(to-from)*e));if(k<1)el._raf=requestAnimationFrame(step)};
 el._raf=requestAnimationFrame(step);void prev;
}
const followKey="adsnoop-follow-v1";
function followed(){try{const v=JSON.parse(localStorage.getItem(followKey)||"[]");return Array.isArray(v)?v.filter(b=>b&&/^\d{1,30}$/.test(b.id)&&typeof b.name==="string").slice(0,30):[]}catch{return []}}
function isFollowed(id){return !!id&&followed().some(b=>b.id===id)}
function toggleFollow(){
 if(!state.page)return;let list=followed();const on=list.some(b=>b.id===state.page);
 list=on?list.filter(b=>b.id!==state.page):[{id:state.page,name:state.brand||"Advertiser"},...list];
 try{localStorage.setItem(followKey,JSON.stringify(list.slice(0,30)))}catch{}
 toast(on?"Unfollowed "+(state.brand||"brand"):"Following "+(state.brand||"brand")+". It’ll be on your start page.");showHeader();
}
let toastTimer=0;
function toast(msg){const t=$("toast");if(!t)return;t.textContent=msg;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2400)}
// Start page before any search: brands you follow plus popular UK advertisers.
let popular=null,popularLoading=false;
const POPULAR_FALLBACK=["Dunelm","Next","IKEA","boohoo","Gymshark","Currys","Wren Kitchens","Sharps Fitted Furniture"];
function loadPopular(){
 if(popular||popularLoading)return;popularLoading=true;
 fetch("/api/popular",{cache:"no-store",signal:AbortSignal.timeout(90000)}).then(r=>r.ok?r.json():{brands:[]}).then(d=>{popular=Array.isArray(d.brands)?d.brands.filter(b=>b&&/^\d{1,30}$/.test(b.pageId)):[]}).catch(()=>{popular=[]}).finally(()=>{popularLoading=false;if(isStart())renderCards()});
}
function isStart(){return state.view==="discover"&&!state.brand&&!state.rows.length&&!state.loading}
function brandCard(b,i,extra){return '<button class="bcard" style="--i:'+i+'" data-page="'+esc(b.id)+'" data-name="'+esc(b.name)+'">'+logoHTML(b.id,b.name,"lg")+'<span><strong>'+esc(b.name)+'</strong><br><small'+(extra?' class="live"':'')+'>'+esc(extra||"Followed brand")+'</small></span><span class="go">Explore ads →</span></button>'}
function startHTML(){
 loadPopular();
 const mine=followed();
 let html='<div class="start">';
 if(mine.length)html+='<h3>Brands you follow</h3><div class="start-grid">'+mine.slice(0,8).map((b,i)=>brandCard(b,i,"")).join("")+'</div>';
 html+='<h3>Popular in the UK right now</h3><div class="start-grid">';
 if(popular&&popular.length)html+=popular.map((b,i)=>brandCard({id:b.pageId,name:b.name},i,(b.more?b.count+"+":b.count)+" live UK ads")).join("");
 else if(popular)html+='<p class="intel-sub" style="grid-column:1/-1">Search any brand above to see its live ads.</p>';
 else html+=POPULAR_FALLBACK.map((n,i)=>'<div class="bcard skel" style="--i:'+i+'"><span class="brandlogo lg" aria-hidden="true"><b>'+esc(n.split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase())+'</b></span><span><strong>'+esc(n)+'</strong><br><small></small></span></div>').join("");
 return html+'</div></div>';
}
// One-click switch between the ad grid (with the intelligence panel) and the
// messaging map for the brand that is loaded.
function renderViewTabs(){
 const el=$("viewtabs");if(!el)return;
 const show=!!state.brand&&state.rows.length>0&&(state.view==="discover"||state.view==="insights");
 el.hidden=!show;document.body.classList.toggle("has-tabs",show);if(!show){el.innerHTML="";return}
 const distinct=new Set(state.rows.map(groupKey)).size;
 let themes=0;try{themes=messagingThemes(state.rows).length}catch{}
 const tab=(view,label,count)=>'<button class="viewtab" role="tab" data-view="'+view+'" aria-selected="'+(state.view===view)+'" tabindex="'+(state.view===view?0:-1)+'">'+label+(count?'<small>'+count+'</small>':'')+'</button>';
 el.innerHTML=tab("discover","Ads &amp; insights",(distinct||state.rows.length)+" ads")+tab("insights","Messaging",themes?themes+" themes":"");
}
function empty(title,detail){return '<div class="empty"><h3>'+esc(title)+'</h3><p>'+esc(detail)+'</p></div>'}
function card(a){
 const d=daysRunning(a),stage=lifeStage(d),gm=state.groupMeta?.get(a.id);
 const grp=gm&&gm.n>1?(gm.head?'<button class="groupbadge'+(gm.open?' on':'')+'" data-action="group" data-id="'+esc(a.id)+'" title="The brand is running this same copy and headline as '+gm.n+' separate ads, usually for different audiences or budgets">'+(gm.open?'Hide '+(gm.n-1)+' similar':'Running as '+gm.n+' ads')+'</button>':'<span class="groupbadge sub">'+gm.pos+' of '+gm.n+' · same copy</span>'):'';
 const badges='<div class="tilebadges">'+(stage?'<span class="lifebadge st-'+stage.key+'" title="'+esc(stage.hint)+'">'+esc(stage.label)+' · '+d+'d</span>':'')+grp+'</div>';
 const reachText=gm&&gm.n>1&&gm.head&&!gm.open?'UK reach: '+reach(gm.total)+' across '+gm.n+' ads':'UK reach: '+reach(a.reach);
 const platforms=(a.platforms||[]).join(", ")||"Platform not reported";
 const format=a.format&&a.format!=="Unknown"?a.format:"Format to be verified";
 const isSaved=state.saved.has(a.id),isCompared=state.compare.has(a.id);
 return '<article class="adcard tile-hidden"><div class="live-visual" data-media="'+esc(a.id)+'" data-loaded="false">'+badges+'<span class="fmtbadge" data-fmt="'+esc(a.id)+'"></span><div class="creative-recovery"><span class="loadingring" aria-hidden="true"></span><strong>Preparing creative preview</strong><small>Loading only when this card is in view.</small></div></div><div class="adbody"><div class="admeta"><span class="adbrand">'+logoHTML(a.pageId,a.pageName||state.brand,"sm")+esc(a.pageName||state.brand||"Advertiser")+'</span>'+(a.format&&a.format!=="Unknown"?'<span class="tag">'+esc(a.format)+'</span>':'')+'</div><h3 class="adtitle">'+esc(a.title||"Ad creative")+'</h3><p class="adcopy adtext">'+esc(a.copy||"No copy provided by Meta.")+'</p><div class="metadata"><span>'+esc(formatDate(a.start))+'</span><span>'+esc(platforms)+'</span><span'+(gm&&gm.n>1&&gm.head&&!gm.open?' title="Sum of each ad\'s reach. People who saw more than one are counted more than once."':'')+'>'+esc(reachText)+'</span></div>'+ctaLineHTML(a.id)+'<div class="adbottom"><button class="linkbutton" data-action="detail" data-id="'+esc(a.id)+'">View ad details ↗</button><div class="smallactions"><button class="square '+(isSaved?"on":"")+'" data-action="save" data-id="'+esc(a.id)+'" aria-label="'+(isSaved?"Remove saved ad":"Save ad")+'">'+(isSaved?"♥":"♡")+'</button><button class="square '+(isCompared?"on":"")+'" data-action="compare" data-id="'+esc(a.id)+'" aria-label="Compare ad">'+(isCompared?"✓":"⊕")+'</button></div></div></div></article>';
}
function renderCards(){
 if(observer)observer.disconnect();
 showHeader();
 renderBrands();
 const all=state.view==="insights"?[]:shownRows(),rows=all.slice(0,state.limit),hidden=all.length-rows.length;
 if(state.view==="insights"){setBar("hide");if($("intel"))$("intel").hidden=true;$("cards").innerHTML='<div style="grid-column:1/-1">'+messagingView()+'</div>';$("pager").innerHTML="";$("toolbar").style.display="none";renderInsights();return}
 $("cards").innerHTML=rows.length?rows.map(card).join(""):state.loading?loadingCards():(isStart()?startHTML():empty(state.view==="saved"?"No saved ads yet.":"No ads to display.",state.view==="saved"?"Save a creative from an advertiser search to find it here.":state.brand?"Try a different platform filter or another advertiser.":"Search an advertiser above to begin."));
 $("pager").innerHTML=hidden>0?'<button class="ghost" data-action="showmore">Show '+Math.min(25,hidden)+' more ads ('+hidden+' remaining)</button>':state.view==="discover"&&(state.cursor||state.needsPageStart)&&state.brand?'<button class="ghost" data-action="loadmore">Load more Meta ads</button>':"";
 renderInsights();
 renderIntel();
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
  state.variations=variationCounts(state.rows);state.expanded=new Set();
  state.changes=after||appendAds?state.changes:compareWithLastVisit();
  if(state.page&&state.brand&&state.rows.length){rememberAdvertiser(state.page,state.brand,state.rows.length);rememberPageId(state.brand,state.page)}
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
  if(!mediaNodes(id).length){mediaState.delete(id);continue}
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
 const tiles=[...document.querySelectorAll("#cards .adcard")];
 document.querySelectorAll("#cards .tile-skel").forEach(e=>e.remove());
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
 if(!complete){const grid=$("cards");for(let i=0;i<Math.min(3,ids.length-upTo);i++)grid.insertAdjacentHTML("beforeend",'<div class="tile-skel" aria-hidden="true" style="animation-delay:'+i*.15+'s"></div>')}
 $("pager").style.display=complete?"":"none";
 if(complete&&ready===ids.length)setBar("done",ids.length,ids.length);
 else if(complete)setBar("hide");
 else setBar("progress",ready,ids.length);
 renderIntel();
 clearTimeout(revealTimer);
 // Re-check so a slow tile is released once it passes the reveal threshold.
 if(!complete)revealTimer=setTimeout(()=>updateReveal(),5000);
}
let barTimer=null;
function setBar(mode,ready=0,total=0){
 const bar=$("loadbar");if(!bar)return;
 clearTimeout(barTimer);
 if(mode==="hide"){bar.hidden=true;return}
 bar.hidden=false;bar.classList.toggle("indeterminate",mode==="search");bar.classList.toggle("complete",mode==="done");
 const who=state.brand||state.query||"this advertiser";
 const fill=bar.querySelector(".loadbar-fill");
 if(mode==="search"){fill.style.width="";$("loadbarText").textContent="Searching Meta for "+who+"…";$("loadbarAll").hidden=true;return}
 const pct=total?Math.max(6,Math.round(ready/total*100)):0;
 fill.style.width=pct+"%";
 $("loadbarAll").hidden=mode==="done";
 if(mode==="done"){$("loadbarText").textContent="All "+total+" creatives ready";barTimer=setTimeout(()=>{bar.hidden=true},1600);return}
 $("loadbarText").textContent="Loading "+who+"’s creatives · "+ready+" of "+total+" ready";
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
// ---- Ad intelligence: format, longevity, launches, variations, changes ----
// Longevity is the signal every ad-intelligence tool leans on: brands keep
// paying for ads that work. It is a clue, not proof of performance.
const DAY=86400000;
function daysRunning(a){if(!a.start)return null;const t=Date.parse(a.start+"T00:00:00Z");return Number.isFinite(t)?Math.max(0,Math.floor((Date.now()-t)/DAY)):null}
function lifeStage(d){if(d==null)return null;if(d<=7)return {key:"new",label:"New",hint:"Launched in the last 7 days"};if(d<30)return {key:"testing",label:"Testing",hint:"Live under 30 days"};if(d<90)return {key:"proven",label:"Proven",hint:"Live 30–89 days"};return {key:"long",label:"Long-runner",hint:"Live 90+ days, likely a winner"}}
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
function renderIntel(){
 const box=$("intel");if(!box)return;
 if(state.view!=="discover"||!state.rows.length){box.hidden=true;return}
 box.hidden=false;
 if(box.dataset.k!==state.page){box.dataset.k=state.page;box.classList.add("fresh");clearTimeout(box._t);box._t=setTimeout(()=>box.classList.remove("fresh"),1600)}
 const rows=state.rows,total=rows.length;
 const stages={new:0,testing:0,proven:0,long:0};let oldest=0;
 for(const a of rows){const d=daysRunning(a),s=lifeStage(d);if(s)stages[s.key]++;if(d>oldest)oldest=d}
 const fmt={video:0,static:0,carousel:0,catalogue:0},collected=rows.filter(a=>mediaCache.has(a.id));
 for(const a of collected){const f=formatOf(a.id);if(f)fmt[f]++}
 const fTotal=Math.max(1,collected.length);
 const weeks=weeklyLaunches(rows),wMax=Math.max(1,...weeks);
 const vc=variationCounts(rows);const scaled=[...vc.values()].filter(n=>n>1);
 const ctas=topCTAs(rows),lands=topLandings(rows);
 const changes=state.changes;
 let changeHTML;
 if(!changes||changes.first)changeHTML='<p class="intel-big">First look</p><p class="intel-sub">We’ll show new and stopped ads when you return.</p>';
 else{const add=changes.added.length,rem=changes.removed;changeHTML='<p class="intel-big"><span class="up">+'+add+'</span>'+(rem?' <span class="down">−'+rem.length+'</span>':'')+'</p><p class="intel-sub">'+(add?add+' new':'No new ads')+(rem?' · '+rem.length+' no longer running':'')+' since '+esc(new Date(changes.since).toLocaleDateString("en-GB",{day:"numeric",month:"short"}))+'</p>'+(add?'<button class="linkbutton" data-filter="added">Show new ads</button>':'');}
 const chip=(key,label,n,cls)=>'<button class="stagechip '+cls+(state.filter===key?' on':'')+'" data-filter="'+key+'"><b>'+n+'</b>'+esc(label)+'</button>';
 box.innerHTML=
 '<div class="intel-card intel-wide"><p class="intel-k">Launch timeline · new ads per week</p><div class="spark" role="img" aria-label="New ads launched per week over the last 12 weeks">'+weeks.map((n,i)=>'<span title="'+n+' launched '+(weeks.length-1-i?(weeks.length-1-i)+' weeks ago':'this week')+'" style="--i:'+i+';height:'+Math.max(4,Math.round(n/wMax*100))+'%"'+(i===weeks.length-1?' class="now"':'')+'></span>').join("")+'</div><p class="intel-sub">'+stages.new+' launched in the last 7 days · oldest live ad running '+oldest+' days · based on '+(state.cursor?'the newest '+total:'all '+total)+' live ads</p></div>'+
 '<div class="intel-card"><p class="intel-k">Creative mix</p>'+(collected.length?'<div class="mixbar">'+["video","static","carousel","catalogue"].map(k=>fmt[k]?'<i class="mix-'+k+'" style="width:'+(fmt[k]/fTotal*100)+'%"></i>':'').join("")+'</div><p class="intel-legend">'+["video","static","carousel","catalogue"].map(k=>'<span><i class="dot mix-'+k+'"></i>'+formatLabel[k]+' '+Math.round(fmt[k]/fTotal*100)+'%</span>').join("")+'</p><p class="intel-sub">From '+collected.length+' collected creatives</p>':'<p class="intel-sub">Appears as creatives load.</p>')+'</div>'+
 '<div class="intel-card"><p class="intel-k">Since your last visit</p>'+changeHTML+'</div>'+
 '<div class="intel-card"><p class="intel-k">'+(ctas.real?'Top buttons':'Top calls to action')+'</p>'+(ctas.list.length?'<ol class="ctalist">'+ctas.list.map(c=>'<li><span>'+esc(c.label)+'</span><b>'+Math.round(c.n/ctas.base*100)+'%</b></li>').join("")+'</ol>':'<p class="intel-sub">No clear call to action in the ad text.</p>')+'<p class="intel-sub">'+(ctas.real?'Real buttons from '+ctas.base+' collected ads':'Read from ad text until creatives load')+(scaled.length?' · '+scaled.length+' message'+(scaled.length===1?' runs':'s run')+' as several ads':'')+'</p></div>'+'<div class="intel-card"><p class="intel-k">Top landing pages</p>'+(lands.list.length?'<ol class="ctalist landlist">'+lands.list.map(l=>'<li><a href="'+esc(l.url)+'" target="_blank" rel="noopener noreferrer nofollow" title="'+esc(l.url)+'">'+esc(l.path.slice(0,40))+'</a><b>'+l.n+'</b></li>').join("")+'</ol><p class="intel-sub">From '+lands.base+' collected ads</p>':'<p class="intel-sub">Appears as creatives load.</p>')+'</div>'+
 '<div class="intel-stages">'+chip("new","New this week",stages.new,"st-new")+chip("testing","Testing",stages.testing,"st-testing")+chip("proven","Proven 30d+",stages.proven,"st-proven")+chip("long","Long-runners 90d+",stages.long,"st-long")+'</div>';
}
function renderInsights(){
 const rows=state.rows,themes=messagingThemes(rows).slice(0,4),total=Math.max(1,rows.length);
 $("themePanel").innerHTML=rows.length&&themes.length?themes.map(t=>'<div class="themebar"><div class="rowtop"><span>'+esc(t.label)+'</span><span>'+t.ads.length+' / '+rows.length+' ads</span></div><div class="track"><div class="fill" style="width:'+Math.round(t.ads.length/total*100)+'%"></div></div></div>').join("")+'<button class="pill sm" data-view="insights" style="margin-top:22px">Open the messaging map →</button>':'<p>Select an advertiser to see recurring message themes.</p>';
}
function findAd(id){return state.rows.find(a=>a.id===id)||state.saved.get(id)||state.compare.get(id)}
function modal(title,content){$("modalTitle").textContent=title;$("modalContent").innerHTML=content;$("modalOverlay").classList.add("open");$("closeModal").focus();}
function adDetails(id){
 const a=findAd(id);if(!a)return;
 modal(a.pageName||"Ad creative",'<p>'+esc(a.title||"Meta advertising record")+'</p><div class="modalquote adtext">'+esc(a.copy||"No copy provided.")+'</div><div class="modal-row"><span>Meta Library ID</span><strong>'+esc(a.id)+'</strong></div><div class="modal-row"><span>Running since</span><strong>'+esc(formatDate(a.start))+'</strong></div><div class="modal-row"><span>Publisher platforms</span><strong>'+esc((a.platforms||[]).join(", ")||"Unknown")+'</strong></div><div class="modal-row"><span>UK reach</span><strong>'+esc(reach(a.reach))+'</strong></div>'+(()=>{const c=mediaCache.get(a.id)?.cta;if(!c)return '';return (ctaLabel(c)?'<div class="modal-row"><span>Button</span><strong>'+esc(ctaLabel(c))+'</strong></div>':'')+(c.url?'<div class="modal-row"><span>Landing page</span><strong><a href="'+esc(c.url)+'" target="_blank" rel="noopener noreferrer nofollow">'+esc(ctaPath(c.url).slice(0,60))+' ↗</a></strong></div>':'')})()+(()=>{const gm=state.groupMeta?.get(a.id);return gm&&gm.n>1?'<div class="modal-row"><span>Same copy runs as</span><strong>'+gm.n+' ads</strong></div>':''})()+'<div class="modal-row"><span>Creative format</span><strong>'+esc(a.format||"Unknown")+'</strong></div><p class="notice">UK reach is reported when provided by the API and is not ad spend or performance.</p><a class="pill" href="'+metaUrl(a.id)+'" target="_blank" rel="noopener noreferrer">View on Meta ↗</a>');
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
 for(const id of ["cards","intel","metrics","toolbar"]){const el=$(id);if(!el)continue;el.classList.remove("viewin");void el.offsetWidth;el.classList.add("viewin")}
 const tabs=$("viewtabs");
 if(tabs&&!tabs.hidden){const prev=tabs.previousElementSibling,r=tabs.getBoundingClientRect();if(r.top<=1&&prev)window.scrollTo({top:Math.max(0,prev.getBoundingClientRect().bottom+scrollY-8),behavior:"smooth"});else if(r.top>innerHeight*.6)tabs.scrollIntoView({behavior:"smooth",block:"start"})}
 else $("research").scrollIntoView({behavior:"smooth"});
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
const logoLookups=new Map();
// Find the Page behind a well-known name so its logo can be shown. Results are
// remembered in this browser; at most two lookups run per keystroke pause.
function resolveLogos(){
 const want=suggest.items.filter(s=>!s.id&&!logoLookups.has(canonicalName(s.name))).slice(0,2);
 for(const s of want){
  const key=canonicalName(s.name);
  logoLookups.set(key,(async()=>{
   try{
    const params=new URLSearchParams({q:s.name,coverage:state.coverage,discover:"1"});
    const data=await fetch("/api/ads?"+params,{cache:"no-store"}).then(r=>r.ok?r.json():null);
    const hit=(data?.ads||[]).find(a=>a.pageId&&canonicalName(a.pageName)===key);
    if(!hit)return;
    rememberPageId(s.name,hit.pageId);
    let changed=false;for(const it of suggest.items)if(canonicalName(it.name)===key&&!it.id){it.id=hit.pageId;changed=true}
    if(changed&&!$("suggest").hidden)renderSuggest("");
   }catch{}
  })());
 }
}
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
 box.innerHTML=head+suggest.items.map((s,i)=>'<li role="option" id="sg-'+i+'" class="sg-item'+(i===suggest.active?' active':'')+'" aria-selected="'+(i===suggest.active)+'" data-sg="'+i+'">'+logoHTML(s.id,s.name,"md sg-logo")+'<span class="sg-text"><strong>'+esc(s.name)+'</strong><small>'+(s.source==="history"?'Searched before':s.source==="known"?'Verified advertiser':s.source==="popular"?'Popular UK advertiser':s.count+' active UK ad'+(s.count===1?'':'s')+' found')+'</small></span><span class="sg-go">↗</span></li>').join("");
 input.setAttribute("aria-activedescendant",suggest.active>=0?"sg-"+suggest.active:"");
}
async function fetchSuggestions(term){
 const key=canonicalName(term);
 if(suggest.cache.has(key))return suggest.cache.get(key);
 if(suggest.controller)suggest.controller.abort();
 const controller=new AbortController();suggest.controller=controller;
 const params=new URLSearchParams({q:term,coverage:state.coverage,discover:"1"});
 const resp=await fetch("/api/ads?"+params,{signal:controller.signal,cache:"no-store"});
 if(resp.status===429)throw Object.assign(Error("limited"),{code:"RATE_LIMITED"});
 const data=await resp.json();if(!resp.ok||data.error)throw Error(data.error||"failed");
 const pages=new Map();for(const ad of data.ads||[]){if(!ad.pageId||!ad.pageName)continue;const e=pages.get(ad.pageId);if(e)e.count++;else pages.set(ad.pageId,{id:ad.pageId,name:ad.pageName,count:1})}
 const list=[...pages.values()].map(p=>(rememberPageId(p.name,p.id),{...p,source:"meta"}));suggest.cache.set(key,list);return list;
}
function onSearchInput(){
 const term=$("searchInput").value.trim();suggest.term=term;suggest.active=-1;
 clearTimeout(suggest.timer);
 if(term.length<2){suggest.items=[];renderSuggest("hide");return}
 // Known advertisers appear instantly; Meta results follow after a short pause.
 const local=localSuggestions(term);suggest.items=suggestRank(term,local);
 const cached=suggest.cache.get(canonicalName(term));
 if(cached){suggest.items=suggestRank(term,mergeSuggestions(local,cached));renderSuggest(suggest.items.length?"":"empty");resolveLogos();return}
 renderSuggest(suggest.items.length?"":"loading");
 suggest.timer=setTimeout(async()=>{
  try{
   const list=await fetchSuggestions(term);
   if($("searchInput").value.trim()!==term)return;
   suggest.items=suggestRank(term,mergeSuggestions(local,list));
   renderSuggest(suggest.items.length?"":"empty");resolveLogos();
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
 state.choices.clear();for(const o of suggest.items)state.choices.set(o.id,{id:o.id,name:o.name,count:o.count});
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
$("coverage").addEventListener("change",e=>{state.coverage=e.target.value;if(state.query)searchClient(state.query)});
$("sort").value=state.sort;
$("sort").addEventListener("change",e=>{state.sort=e.target.value;state.limit=25;renderCards()});
document.addEventListener("keydown",e=>{const t=e.target.closest&&e.target.closest(".viewtab");if(!t||!["ArrowLeft","ArrowRight"].includes(e.key))return;const tabs=[...document.querySelectorAll(".viewtab")];const next=tabs[(tabs.indexOf(t)+(e.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length];if(next){e.preventDefault();setView(next.dataset.view);requestAnimationFrame(()=>document.querySelector('.viewtab[aria-selected="true"]')?.focus())}});
document.addEventListener("click",e=>{
 let b=e.target.closest("[data-query]");if(b){$("searchInput").value=b.dataset.query;searchClient(b.dataset.query);$("research").scrollIntoView({behavior:"smooth"});return}
 b=e.target.closest("[data-page]");if(b){if(b.dataset.page!==state.page||(!state.rows.length&&!state.loading)){state.brand=b.dataset.name;state.page=b.dataset.page;runSearch(state.query||state.brand,state.page);}return}
 b=e.target.closest("[data-view]");if(b){setView(b.dataset.view);return}
 b=e.target.closest("[data-theme]");if(b){state.theme=b.dataset.theme;renderCards();document.querySelector(".msg-detail")?.scrollIntoView({behavior:"smooth",block:"nearest"});return}
 b=e.target.closest("[data-filter]");if(b){state.filter=b.dataset.filter;state.limit=25;renderCards();return}
 b=e.target.closest("[data-action]");if(!b)return;
 const {action,id}=b.dataset;
 if(action==="detail")adDetails(id);
 if(action==="save"){const a=findAd(id);if(a){const was=state.saved.has(id);if(was)state.saved.delete(id);else state.saved.set(id,a);save();renderCards();toast(was?"Removed from saved ideas":"Saved to your ideas ♥");if(!was)document.querySelectorAll('[data-action="save"][data-id="'+id+'"]').forEach(el=>{el.classList.add("pop");setTimeout(()=>el.classList.remove("pop"),500)});}}
 if(action==="follow")toggleFollow();
 if(action==="compare"){const a=findAd(id);if(a){if(state.compare.has(id))state.compare.delete(id);else if(state.compare.size<3)state.compare.set(id,a);else{error("Select up to three ads to compare.");return}renderCards();}}
 if(action==="showmore"){state.limit+=25;renderCards()}
 if(action==="group"){const gm=state.groupMeta?.get(id);if(gm){state.expanded=state.expanded||new Set();if(state.expanded.has(gm.key))state.expanded.delete(gm.key);else{state.expanded.add(gm.key);state.revealAll=true}renderCards();for(const a of state.rows)if(groupKey(a)===gm.key)requestMedia(a.id,{priority:true})}}
 if(action==="revealall"){state.revealAll=true;updateReveal()}
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
