/* Premium cursor-following eyes. Visual only; no mouse data is sent or stored. */
(function(){
"use strict";
function init(){
 const logo=document.querySelector("svg.as-interactive-wordmark");
 const pupils=logo&&logo.querySelector(".as-pupils");
 if(!logo||!pupils||!window.matchMedia)return;
 const reduce=window.matchMedia("(prefers-reduced-motion: reduce)");
 const fine=window.matchMedia("(hover: hover) and (pointer: fine)");
 if(reduce.matches||!fine.matches)return;
 let x=3.5,y=0,targetX=3.5,targetY=0,frame=0;
 const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
 function step(){
  x+=(targetX-x)*.24;
  y+=(targetY-y)*.24;
  pupils.setAttribute("transform","translate("+x.toFixed(2)+" "+y.toFixed(2)+")");
  frame=(Math.abs(x-targetX)+Math.abs(y-targetY)>.05)?requestAnimationFrame(step):0;
 }
 function refresh(){if(!frame)frame=requestAnimationFrame(step);}
 function reset(){targetX=3.5;targetY=0;refresh();}
 function onMove(e){
  if(e.pointerType&&e.pointerType!=="mouse")return;
  const r=logo.getBoundingClientRect(),midX=r.left+r.width*179/252,midY=r.top+r.height*34/66;
  targetX=clamp((e.clientX-midX)/140,-1,1)*4.25;
  targetY=clamp((e.clientY-midY)/110,-1,1)*3.3;
  refresh();
 }
 document.addEventListener("pointermove",onMove,{passive:true});
 document.addEventListener("pointerout",e=>{if(!e.relatedTarget)reset()},{passive:true});
 window.addEventListener("blur",reset);
 document.addEventListener("visibilitychange",()=>{if(document.hidden)reset()});
 if(reduce.addEventListener)reduce.addEventListener("change",()=>{if(reduce.matches)reset()});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
else init();
})();
