/* AdSnoop Insights: progressive enhancement for hub, category and article pages.
   Pages work fully without this script. Events go to the site's existing,
   consent-gated GA4 setup only; nothing personal is collected. */
(function(){
"use strict";
document.documentElement.classList.add("js");
var body=document.body,data={};
try{data=JSON.parse(body.getAttribute("data-ins")||"{}")}catch(e){}
var PROD=location.hostname==="adsnoop.co.uk";
var reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- Analytics -------------------------------------------------------------
function consented(){try{return localStorage.getItem("adsnoop-analytics-choice")==="allow"}catch(e){return false}}
function track(name,params){
 var p=Object.assign({page_type:data.type||"other"},params||{});
 if(data.slug)p.article_slug=data.slug;
 if(data.category&&!p.article_category)p.article_category=data.category;
 if(!PROD||!consented()){
  // Preview and local builds: keep a log for QA instead of sending anything.
  (window.__insightsEvents=window.__insightsEvents||[]).push([name,p]);
  if(!PROD&&window.console)console.debug("[insights event]",name,p);
  return;
 }
 window.dataLayer=window.dataLayer||[];
 (function(){window.dataLayer.push(arguments)})("event",name,p);
}
// Remember which article led to the product so the next advertiser search
// can be attributed to it (session only, cleared after 30 minutes).
function rememberSource(placement){
 try{sessionStorage.setItem("adsnoop-insights-ref",JSON.stringify({slug:data.slug||data.type||"insights",category:data.category||"",placement:placement,t:Date.now()}))}catch(e){}
}

if(data.type==="article")track("insights_article_view",{});

document.addEventListener("click",function(e){
 var t=e.target.closest&&e.target.closest("a,button");if(!t)return;
 var cta=t.getAttribute("data-ins-cta");
 if(cta){
  var dest=t.getAttribute("href")||"";
  track("insights_product_cta_click",{cta_placement:cta,link_url:dest.slice(0,120)});
  if(dest.charAt(0)==="/"&&dest.indexOf("/insights")!==0)rememberSource(cta);
  return;
 }
 var cat=t.getAttribute("data-ins-cat");
 if(cat){track("insights_category_select",{selected_category:cat});return}
 var rel=t.getAttribute("data-ins-related");
 if(rel==="related"){var to=(t.getAttribute("href")||"").split("/").pop();track("insights_related_article_click",{target_slug:to})}
},{capture:true});

// Advertiser search boxes inside Insights hand over to the main search.
document.querySelectorAll("[data-ins-search-form]").forEach(function(f){
 f.addEventListener("submit",function(){
  var place="search_band_"+f.getAttribute("data-ins-search-form");
  track("insights_product_cta_click",{cta_placement:place,link_url:"/"});
  rememberSource(place);
 });
});

// ---- Hub search ------------------------------------------------------------
var form=document.querySelector("[data-ins-search]"),grid=document.getElementById("ins-grid");
if(form&&grid){
 var input=form.querySelector("input"),cards=[].slice.call(grid.querySelectorAll(".ins-card")),empty=document.getElementById("ins-empty"),results=document.getElementById("ins-results"),featured=document.querySelector(".ins-featured"),timer=0,last="";
 function apply(q,report){
  var terms=q.toLowerCase().trim().split(/\s+/).filter(Boolean),n=0;
  cards.forEach(function(c){var hay=c.getAttribute("data-search")||"";var ok=terms.every(function(w){return hay.indexOf(w)>-1});c.hidden=!ok;if(ok)n++});
  if(empty)empty.hidden=n>0;
  if(featured)featured.hidden=terms.length>0;
  if(results)results.textContent=terms.length?(n+" article"+(n===1?"":"s")+" for “"+q.trim()+"”"):"";
  if(report&&terms.length&&q.trim()!==last){last=q.trim();track("insights_search",{search_term:last.slice(0,80),results_count:n})}
 }
 form.addEventListener("submit",function(e){e.preventDefault();clearTimeout(timer);apply(input.value,true);var u=new URL(location.href);if(input.value.trim())u.searchParams.set("q",input.value.trim());else u.searchParams.delete("q");history.replaceState(null,"",u);document.getElementById("all-h").scrollIntoView({behavior:reduce?"auto":"smooth",block:"start"})});
 input.addEventListener("input",function(){apply(input.value,false);clearTimeout(timer);timer=setTimeout(function(){if(input.value.trim().length>1)apply(input.value,true)},1200)});
 var initial=new URLSearchParams(location.search).get("q");
 if(initial){input.value=initial.slice(0,80);apply(input.value,true)}
}

// ---- Article: reading progress and table of contents -----------------------
var article=document.querySelector(".ins-prose");
if(article){
 var bar=document.querySelector(".ins-progress"),ticking=false;
 function progress(){ticking=false;var r=article.getBoundingClientRect(),h=r.height-innerHeight*.6;var p=Math.min(1,Math.max(0,-r.top/(h>0?h:1)));if(bar)bar.style.setProperty("--p",p.toFixed(3))}
 addEventListener("scroll",function(){if(!ticking){ticking=true;requestAnimationFrame(progress)}},{passive:true});progress();
 var links=[].slice.call(document.querySelectorAll(".ins-toc a"));
 if(links.length&&"IntersectionObserver" in window){
  var map={};links.forEach(function(a){map[a.getAttribute("href").slice(1)]=a});
  var heads=[].slice.call(article.querySelectorAll("h2[id]")).filter(function(h){return map[h.id]});
  var active=null;
  var io=new IntersectionObserver(function(){
   var current=heads[0];heads.forEach(function(h){if(h.getBoundingClientRect().top<innerHeight*.3)current=h});
   if(current&&map[current.id]!==active){if(active)active.classList.remove("is-active");active=map[current.id];active.classList.add("is-active")}
  },{rootMargin:"0px 0px -60% 0px",threshold:[0,1]});
  heads.forEach(function(h){io.observe(h)});
 }
 // Track reading depth once per article at 50% and 90%.
 var marks={50:false,90:false};
 addEventListener("scroll",function(){var r=article.getBoundingClientRect(),p=Math.round(100*Math.min(1,Math.max(0,(innerHeight-r.top)/r.height)));[50,90].forEach(function(m){if(!marks[m]&&p>=m){marks[m]=true;track("insights_read_depth",{percent:m})}})},{passive:true});
}

// ---- Gentle reveal for cards below the fold --------------------------------
if(!reduce&&"IntersectionObserver" in window){
 var items=[].slice.call(document.querySelectorAll(".ins-all .ins-card,.ins-topic,.ins-related .ins-card,.ins-live-card"));
 var ro=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){en.target.classList.add("is-in");ro.unobserve(en.target)}})},{rootMargin:"0px 0px -40px 0px"});
 items.forEach(function(el,i){if(el.getBoundingClientRect().top>innerHeight){el.classList.add("ins-reveal");el.style.transitionDelay=(i%3)*60+"ms";ro.observe(el)}});
}
})();
