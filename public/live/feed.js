(function(){
"use strict";
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const TAGS=["Ads & campaigns","AI & automation","Measurement","Formats & placements","Policy & privacy","Business tools"];
let data=null,filter="All",official=false;
function ago(iso){if(!iso)return "";const d=(Date.now()-Date.parse(iso))/86400000;if(d<1)return "Today";if(d<2)return "Yesterday";if(d<7)return Math.floor(d)+" days ago";return new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:d>300?"numeric":undefined})}
function render(){
 const items=data.items.filter(i=>(filter==="All"||i.tags.includes(filter))&&(!official||i.official));
 $("tools").innerHTML=["All",...TAGS].map(t=>'<button data-tag="'+esc(t)+'" aria-pressed="'+(t===filter)+'">'+esc(t)+'</button>').join("")+'<button data-official aria-pressed="'+official+'">Official Meta only</button>';
 $("feed").innerHTML=items.length?items.map(i=>'<article class="post"><div><time datetime="'+esc(i.date||"")+'">'+esc(ago(i.date))+'</time><br><span class="src'+(i.official?' official':'')+'">'+(i.official?'✓ ':'')+esc(i.source)+'</span></div><div><h3><a href="'+esc(i.url)+'" target="_blank" rel="noopener">'+esc(i.title)+' ↗</a></h3>'+(i.summary?'<p>'+esc(i.summary)+'</p>':'')+'<div class="tags">'+i.tags.map(t=>'<span class="chip">'+esc(t)+'</span>').join("")+'</div></div></article>').join(""):'<div class="pg-card"><p>No updates match this filter yet.</p></div>';
 const ok=data.sources.filter(s=>s.ok).map(s=>s.name),bad=data.sources.filter(s=>!s.ok).map(s=>s.name);
 $("sources").textContent="Sources: "+ok.join(", ")+(bad.length?" · temporarily unavailable: "+bad.join(", "):"")+". Updated "+ago(data.updatedAt).toLowerCase()+". Headlines link to the original articles.";
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-tag]");if(b){filter=b.dataset.tag;render();return}if(e.target.closest("[data-official]")){official=!official;render()}});
fetch("/api/meta-updates",{signal:AbortSignal.timeout(60000)}).then(r=>r.ok?r.json():Promise.reject()).then(d=>{data=d;render()}).catch(()=>{$("feed").innerHTML='<div class="pg-card"><h3>Couldn’t load updates</h3><p>Please refresh in a minute.</p></div>'});
})();
