(function(){
"use strict";
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const event=document.body.dataset.event;
const num=n=>n>=1e6?(n/1e6).toFixed(1).replace(/\.0$/,"")+"M":n>=1e3?(n/1e3).toFixed(n>=1e4?0:1).replace(/\.0$/,"")+"K":String(n);
const logo=id=>/^\d{1,30}$/.test(id)?'https://graph.facebook.com/'+encodeURIComponent(id)+'/picture?type=square&width=96&height=96':"";
const research=(id,name)=>'/?'+new URLSearchParams({page:id,name});
const metaUrl=id=>'https://www.facebook.com/ads/library/?id='+encodeURIComponent(id);
function bars(list,max,color){return '<div class="bars" style="--bar:'+color+'">'+list.map(r=>'<div class="bar-row"><span>'+esc(r.label)+'</span><span class="track"><i style="width:'+(max?Math.round(r.ads/max*100):0)+'%"></i></span><b>'+r.ads+'</b></div>').join("")+'</div>'}
function render(d){
 const s=d.stats;
 const season=!!d.lists;
 $("stats").innerHTML=(season?[["ads",num(s.ads),d.name+" ads collected this season"],["advertisers",num(s.advertisers),"UK advertisers running them"],["live",num(s.live),"still running right now"],["disc",s.typicalDiscount!=null?s.typicalDiscount+"%":"—","typical discount"+(s.deepest?" · up to "+s.deepest+"%":"")]]:[["ads",num(s.ads),d.name+" ads analysed (newest live UK ads)"],["advertisers",num(s.advertisers),"advertisers running them"],["new",num(s.newThisWeek),"of them launched in the last 7 days"],["disc",s.typicalDiscount!=null?s.typicalDiscount+"%":"—","typical discount"+(s.deepest?" · up to "+s.deepest+"%":"")]]).map(([k,v,l])=>'<div class="pg-stat"><b>'+v+'</b><span>'+esc(l)+'</span></div>').join("");
 $("updated").textContent="Updated "+new Date(d.updatedAt).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})+". Refreshed every few hours from Meta’s Ad Library."+(d.coverage?" Each refresh runs "+d.coverage.keywords+" seasonal searches and checks "+d.coverage.brandsChecked+" of "+d.coverage.brandPool+" tracked brands.":"")+(d.building?" A fuller collection is being built.":"");
 if(!s.ads){$("content").innerHTML='<div class="pg-card"><h3>Not much running yet</h3><p>Few UK advertisers are running '+esc(d.name)+' ads right now. Check back closer to the date.</p></div>';return}
 const max=Math.max(1,...d.timeline);
 const tl='<div class="timeline" role="img" aria-label="New '+esc(d.name)+' ads launched per day over the last 6 weeks">'+d.timeline.map((n,i)=>'<span title="'+n+' launched '+(41-i?(41-i)+' days ago':'today')+'" style="height:'+Math.max(2,Math.round(n/max*100))+'%"'+((41-i)%7===0?' class="wk"':'')+'></span>').join("")+'</div><div class="tl-axis"><span>6 weeks ago</span><span>3 weeks ago</span><span>Today</span></div>';
 const LISTS=[["reach","Biggest reach","The ads Meta estimates reached the most people in the UK. Mostly big retailers with big budgets."],["longest","Longest running","Ads kept running for longest this season. Brands rarely keep paying for an ad that isn’t working, so staying power is a good sign."],["tested","Most tested","The same message run as the most separate ads, usually to test images, formats or audiences. A sign a brand is backing it."],["challengers","Rising challengers","The best reach from smaller brands, leaving out the big retailers, so clever ads with smaller budgets get seen."]].filter(([k])=>season&&d.lists[k]&&d.lists[k].length);
 const card=(a,i)=>{const chips=[];
  {if(a.reach)chips.push('<span class="chip">UK reach '+num(a.reach)+'</span>');
   if(a.versions)chips.push('<span class="chip">'+a.versions+' versions</span>');
   if(season&&a.start)chips.push(a.live?'<span class="chip live">'+(a.days<=1?"New today":"Live "+a.days+" days")+'</span>':'<span class="chip ended">Ran '+Math.max(1,a.run)+' days</span>');
   else if(a.days!=null)chips.push('<span class="chip">'+(a.days<=1?"New today":"Live "+a.days+" days")+'</span>');}
  return '<article class="ad"><div class="ad-media" data-media="'+esc(a.id)+'"><span class="ad-rank">#'+(i+1)+'</span><span class="ph">Loading creative…</span></div><div class="ad-body"><div class="ad-brand">'+(logo(a.pageId)?'<img alt="" loading="lazy" referrerpolicy="no-referrer" src="'+logo(a.pageId)+'" onerror="this.remove()">':'')+esc(a.pageName)+'</div>'+(a.title?'<strong style="font-size:14px">'+esc(a.title)+'</strong>':'')+'<p class="ad-copy">'+esc(a.copy||"No ad text")+'</p>'+'<div class="ad-meta">'+chips.join("")+'</div><div class="ad-links">'+(a.pageId?'<a href="'+research(a.pageId,a.pageName)+'">Research brand →</a>':'')+'<a href="'+metaUrl(a.id)+'" target="_blank" rel="noopener">View on Meta ↗</a></div></div></article>'};
 const best=LISTS.length?'<section class="pg-sec"><h2>The best '+esc(d.name)+' ads of '+(d.season||new Date().getFullYear())+'</h2><p class="sub">Meta doesn’t share spend or sales for commercial ads, so there’s no single “best”. Pick a lens: each one uses a different, stated signal.</p><div class="col-tabs" role="tablist">'+LISTS.map(([k,l],i)=>'<button type="button" role="tab" data-list="'+k+'" aria-selected="'+(i===0)+'">'+esc(l)+'</button>').join("")+'</div><p class="col-why" id="col-why"></p><div class="ad-grid" id="col-grid"></div></section>'
  :'<section class="pg-sec"><h2>Top '+esc(d.name)+' ads right now</h2><p class="sub">Ranked by Meta’s estimated UK reach, then by how long they’ve run. Up to two per brand.</p><div class="ad-grid">'+d.top.map(card).join("")+'</div></section>';
 const advs='<ol class="adv-list">'+d.advertisers.map((a,i)=>'<li><span class="n">'+(i+1)+'</span>'+(logo(a.id)?'<img alt="" loading="lazy" referrerpolicy="no-referrer" src="'+logo(a.id)+'" onerror="this.style.visibility=\'hidden\'">':'<span></span>')+'<span><a href="'+research(a.id,a.name)+'">'+esc(a.name)+'</a><small>'+a.ads+' '+esc(d.name)+' ad'+(a.ads===1?'':'s')+(a.reach?' · UK reach '+num(a.reach):'')+'</small></span><a class="go" href="'+research(a.id,a.name)+'">Research →</a></li>').join("")+'</ol>';
 const tMax=Math.max(1,...d.tactics.map(t=>t.ads)),dMax=Math.max(1,...d.discounts.map(t=>t.ads));
 $("content").innerHTML=
  best+
  '<section class="pg-sec pg-grid2"><div class="pg-card"><h3>Who’s running the most</h3>'+(season?'<p class="sub" style="margin:0 0 10px;font-size:14px;color:#6e6e73">Across the season, by combined UK reach</p>':'')+''+advs+'</div><div class="pg-card"><h3>Launch tracker</h3><p class="sub" style="margin:0 0 10px;font-size:14px;color:#6e6e73">New '+esc(d.name)+' ads per day, last 6 weeks</p>'+tl+'</div></section>'+
  '<section class="pg-sec pg-grid2"><div class="pg-card"><h3>Tactics brands are using</h3>'+(d.tactics.length?bars(d.tactics,tMax,"#0071e3"):'<p>No common tactics detected.</p>')+'</div><div class="pg-card"><h3>How deep the discounts go</h3>'+(s.withDiscount?bars(d.discounts,dMax,"#e0533d")+'<p class="sub" style="margin:12px 0 0;font-size:13px;color:#86868b">Highest percentage mentioned in each of '+s.withDiscount+' ads that state one.</p>':'<p>No percentage discounts mentioned yet.</p>')+'</div></section>'+
  '<section class="pg-sec"><div class="pg-cta"><p>See every live ad from any of these brands, with their messaging and testing patterns.</p><a class="btn" href="/">Research a brand</a></div></section>'+
  '<p class="pg-note">How this works: Meta’s Ad Library can only be searched by keyword or by advertiser, so there is no complete list of every ad. Each refresh searches for '+esc(d.name)+' phrases, checks a rotating list of UK retailers and every brand we’ve already found, and keeps only ads whose text actually refers to '+esc(d.name)+'. Every match is saved for the season, so ads stay here after they stop running'+(d.coverage&&d.coverage.since?' (collecting since '+new Date(d.coverage.since).toLocaleDateString("en-GB",{day:"numeric",month:"long"})+')':'')+'. That means thousands of UK ads, but not every one: an ad that never mentions '+esc(d.name)+' from a brand we don’t check can’t be found. Reach is Meta’s own estimate and isn’t available for every ad. “Still running” means we saw it live in the last 30 hours. Tactics are detected from ad text. None of this measures sales or performance. Not affiliated with Meta.</p>';
 if(!LISTS.length){loadMedia(d.top.map(a=>a.id));return}
 const show=k=>{const L=LISTS.find(x=>x[0]===k)||LISTS[0];document.querySelectorAll(".col-tabs button").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.list===L[0])));$("col-why").textContent=L[2];$("col-grid").innerHTML=d.lists[L[0]].map(card).join("");loadMedia(d.lists[L[0]].map(a=>a.id))};
 document.querySelector(".col-tabs").addEventListener("click",e=>{const b=e.target.closest("button[data-list]");if(b)show(b.dataset.list)});
 show(LISTS[0][0]);
}
const mediaCache=new Map();
async function loadMedia(ids){
 let i=0;
 const worker=async()=>{while(i<ids.length){const id=ids[i++];const box=document.querySelector('[data-media="'+id+'"]');if(!box)continue;
  try{if(!mediaCache.has(id))mediaCache.set(id,fetch("/api/media?id="+encodeURIComponent(id),{signal:AbortSignal.timeout(90000)}).then(r=>r.json()));const m=await mediaCache.get(id);if(!box.isConnected)continue;const it=(m.items||[]).find(x=>x.kind==="image")||(m.items||[])[0];
   const rank=box.querySelector(".ad-rank").outerHTML;
   if(it&&it.kind==="video")box.innerHTML=rank+'<video muted playsinline loop preload="metadata" '+(it.poster?'poster="'+esc(it.poster)+'"':'')+' src="'+esc(it.url)+'"></video>';
   else if(it)box.innerHTML=rank+'<img alt="Ad creative" loading="lazy" referrerpolicy="no-referrer" src="'+esc(it.url)+'">';
   else box.querySelector(".ph").textContent="Creative unavailable";
  }catch{const ph=box.querySelector(".ph");if(ph)ph.textContent="Creative unavailable"}}};
 await Promise.all([worker(),worker()]);
}
document.addEventListener("pointerover",e=>{const v=e.target.closest(".ad-media")?.querySelector("video");if(v&&v.paused)v.play().catch(()=>{})});
document.addEventListener("pointerout",e=>{const b=e.target.closest(".ad-media");if(b&&!b.contains(e.relatedTarget))b.querySelector("video")?.pause()});
fetch("/api/seasonal?event="+encodeURIComponent(event),{signal:AbortSignal.timeout(240000)}).then(r=>r.ok?r.json():Promise.reject()).then(render).catch(()=>{$("content").innerHTML='<div class="pg-card"><h3>Couldn’t load the latest ads</h3><p>Please refresh in a minute.</p></div>'});
})();
