/* Interactive hero backgrounds for AdSnoop content pages.
   data-fx="tiles" (Black Friday), "snow" (Christmas), "signals" (Meta updates).
   Visual only: pointer positions are never stored or sent anywhere. */
(function(){
"use strict";
const hero=document.querySelector("[data-fx]");if(!hero)return;
const kind=hero.dataset.fx,canvas=hero.querySelector("canvas.fx-canvas");if(!canvas)return;
const ctx=canvas.getContext("2d");if(!ctx)return;
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
let W=0,H=0,dpr=1,visible=true,raf=0,last=performance.now();
const pointer={x:-9999,y:-9999,active:false};
const rand=(a,b)=>a+Math.random()*(b-a);
function resize(){
 const r=hero.getBoundingClientRect();dpr=Math.min(2,devicePixelRatio||1);
 W=Math.max(1,r.width);H=Math.max(1,r.height);
 canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);canvas.style.width=W+"px";canvas.style.height=H+"px";
 ctx.setTransform(dpr,0,0,dpr,0,0);fx.resize&&fx.resize();
 if(reduce){fx.draw(0);fx.draw(0)}
}
hero.addEventListener("pointermove",e=>{const r=hero.getBoundingClientRect();pointer.x=e.clientX-r.left;pointer.y=e.clientY-r.top;pointer.active=true},{passive:true});
hero.addEventListener("pointerleave",()=>{pointer.active=false;pointer.x=pointer.y=-9999});
hero.addEventListener("pointerdown",e=>{if(e.target.closest("a,button"))return;const r=hero.getBoundingClientRect();fx.tap&&fx.tap(e.clientX-r.left,e.clientY-r.top)});

// ---------- Black Friday: a storm with lightning you can call down ----------
function lightning(){
 const drops=[],bolts=[];let flash=0,nextBolt=900;
 function bolt(x0,y1){
  // Midpoint displacement for a jagged main path, plus a few forks.
  const seg=(ax,ay,bx,by,depth,spread)=>{if(depth===0)return [[ax,ay],[bx,by]];const mx=(ax+bx)/2+rand(-spread,spread),my=(ay+by)/2+rand(-spread/4,spread/4);const l=seg(ax,ay,mx,my,depth-1,spread/2),r=seg(mx,my,bx,by,depth-1,spread/2);return l.concat(r.slice(1))};
  const x1=x0+rand(-W*.12,W*.12),main=seg(x0,-10,x1,y1,7,Math.min(140,W*.12)),forks=[];
  for(let i=0;i<3;i++){const p=main[Math.floor(rand(main.length*.2,main.length*.8))];forks.push(seg(p[0],p[1],p[0]+rand(-120,120),p[1]+rand(40,160),5,50))}
  bolts.push({main,forks,life:1});flash=Math.min(1,flash+.75);
 }
 return {
  resize(){drops.length=0;const n=Math.round(W*H/5200);for(let i=0;i<n;i++)drops.push({x:rand(0,W),y:rand(0,H),l:rand(8,22),v:rand(420,760),a:rand(.08,.28)})},
  tap(x,y){bolt(x,Math.max(y,H*.55))},
  draw(dt){
   ctx.clearRect(0,0,W,H);
   if(flash>0){ctx.fillStyle="rgba(255,236,170,"+(flash*.22).toFixed(3)+")";ctx.fillRect(0,0,W,H)}
   // Rain, nudged sideways around the pointer.
   ctx.lineWidth=1;
   for(const d of drops){
    d.y+=d.v*dt;d.x+=d.v*dt*.18;
    if(pointer.active){const dx=d.x-pointer.x,dy=d.y-pointer.y,q=dx*dx+dy*dy;if(q<9000){d.x+=dx/Math.sqrt(q+1)*60*dt*6}}
    if(d.y>H+20){d.y=-20;d.x=rand(-W*.2,W)}
    ctx.strokeStyle="rgba(200,210,255,"+d.a+")";ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.lineTo(d.x-d.l*.18,d.y-d.l);ctx.stroke();
   }
   for(let i=bolts.length-1;i>=0;i--){
    const b=bolts[i],a=Math.max(0,b.life);
    const path=pts=>{ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(const p of pts)ctx.lineTo(p[0],p[1]);ctx.stroke()};
    ctx.shadowColor="rgba(255,214,90,.9)";ctx.shadowBlur=24;
    ctx.strokeStyle="rgba(255,226,120,"+(a*.55)+")";ctx.lineWidth=5;path(b.main);
    ctx.strokeStyle="rgba(255,252,235,"+a+")";ctx.lineWidth=1.8;path(b.main);
    ctx.lineWidth=1;ctx.strokeStyle="rgba(255,236,170,"+(a*.7)+")";for(const f of b.forks)path(f);
    ctx.shadowBlur=0;
    b.life-=dt*(b.life>.6?1.6:2.6);if(b.life<=0)bolts.splice(i,1);
   }
   flash=Math.max(0,flash-dt*2.4);
   if(!reduce){nextBolt-=dt*1000;if(nextBolt<=0){bolt(rand(W*.15,W*.95),rand(H*.55,H*.95));if(Math.random()<.35)setTimeout(()=>bolt(rand(W*.2,W*.9),rand(H*.5,H*.9)),140);nextBolt=rand(2200,5200)}}
   else if(!bolts.length){bolt(W*.78,H*.85);flash=0}
  }
 };
}
// ---------- Christmas: snowfall that drifts around the pointer, under fairy lights ----------
function snow(){
 const flakes=[],bulbs=[];let t=0;
 const colours=["#ff5a5f","#ffd25a","#5ad1ff","#8dff8a","#ff9ad5"];
 return {
  resize(){
   flakes.length=0;const n=Math.round(W*H/2600);
   for(let i=0;i<n;i++){const z=Math.random();flakes.push({x:rand(0,W),y:rand(0,H),z,r:.8+z*2.6,v:14+z*42,s:rand(0,6.28),vx:0})}
   bulbs.length=0;const count=Math.max(8,Math.round(W/70));
   for(let i=0;i<=count;i++)bulbs.push({x:i/count*W,c:colours[i%colours.length],p:rand(0,6.28)});
  },
  tap(x,y){for(const f of flakes){const dx=f.x-x,dy=f.y-y,q=Math.sqrt(dx*dx+dy*dy);if(q<160){f.vx+=dx/q*140;f.y+=dy/q*6}}},
  draw(dt){
   t+=dt;ctx.clearRect(0,0,W,H);
   // Fairy-light wire sagging between pins, bulbs twinkling.
   const sag=x=>18+Math.sin((x/W)*Math.PI*Math.max(2,Math.round(W/260)))*-10+12;
   ctx.strokeStyle="rgba(255,255,255,.18)";ctx.lineWidth=1.2;ctx.beginPath();
   for(let x=0;x<=W;x+=8){const y=sag(x);x?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke();
   for(const b of bulbs){
    const y=sag(b.x)+6,tw=reduce?.85:.55+.45*Math.sin(t*2.2+b.p),near=pointer.active&&Math.abs(pointer.x-b.x)<60&&pointer.y<90?1:0;
    const glow=ctx.createRadialGradient(b.x,y,0,b.x,y,16+near*10);glow.addColorStop(0,b.c);glow.addColorStop(1,"rgba(0,0,0,0)");
    ctx.globalAlpha=Math.min(1,tw*.55+near*.4);ctx.fillStyle=glow;ctx.beginPath();ctx.arc(b.x,y,16+near*10,0,6.28);ctx.fill();
    ctx.globalAlpha=Math.min(1,.5+tw*.5);ctx.fillStyle=b.c;ctx.beginPath();ctx.ellipse(b.x,y,3.2,4.6,0,0,6.28);ctx.fill();ctx.globalAlpha=1;
   }
   for(const f of flakes){
    f.s+=dt*(.6+f.z);f.y+=f.v*dt;f.x+=Math.sin(f.s)*(6+f.z*10)*dt+f.vx*dt;f.vx*=.96;
    if(pointer.active){const dx=f.x-pointer.x,dy=f.y-pointer.y,q=dx*dx+dy*dy;if(q<8100){const d=Math.sqrt(q)+1;f.vx+=dx/d*90*dt*(1+f.z)}}
    if(f.y>H+6){f.y=-6;f.x=rand(0,W)}if(f.x<-10)f.x=W+10;if(f.x>W+10)f.x=-10;
    ctx.fillStyle="rgba(255,255,255,"+(.35+f.z*.55).toFixed(2)+")";ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,6.28);ctx.fill();
   }
  }
 };
}
// ---------- Meta updates: a live network with pulses travelling between nodes ----------
function signals(){
 const nodes=[],pulses=[];let next=0;
 const LINK=130;
 return {
  resize(){nodes.length=0;const n=Math.round(Math.min(110,W*H/7800));for(let i=0;i<n;i++)nodes.push({x:rand(0,W),y:rand(0,H),vx:rand(-12,12),vy:rand(-12,12),r:rand(1.2,2.6)})},
  tap(x,y){const near=nodes.filter(n=>(n.x-x)**2+(n.y-y)**2<LINK*LINK*1.6);for(const n of near)pulses.push({a:{x,y},b:n,t:0,v:rand(1.4,2.2)})},
  draw(dt){
   ctx.clearRect(0,0,W,H);
   for(const n of nodes){
    n.x+=n.vx*dt;n.y+=n.vy*dt;if(n.x<0||n.x>W)n.vx*=-1;if(n.y<0||n.y>H)n.vy*=-1;
    if(pointer.active){const dx=pointer.x-n.x,dy=pointer.y-n.y,q=dx*dx+dy*dy;if(q<40000){n.x+=dx*dt*.35;n.y+=dy*dt*.35}}
   }
   ctx.lineWidth=1;
   for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
    const a=nodes[i],b=nodes[j],dx=a.x-b.x,dy=a.y-b.y,q=dx*dx+dy*dy;
    if(q<LINK*LINK){ctx.strokeStyle="rgba(120,170,255,"+((1-Math.sqrt(q)/LINK)*.28).toFixed(3)+")";ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}
   }
   if(pointer.active)for(const n of nodes){const dx=pointer.x-n.x,dy=pointer.y-n.y,q=dx*dx+dy*dy;if(q<LINK*LINK*1.4){ctx.strokeStyle="rgba(100,210,255,"+((1-Math.sqrt(q)/(LINK*1.2))*.5).toFixed(3)+")";ctx.beginPath();ctx.moveTo(pointer.x,pointer.y);ctx.lineTo(n.x,n.y);ctx.stroke()}}
   for(const n of nodes){ctx.fillStyle="rgba(170,205,255,.8)";ctx.beginPath();ctx.arc(n.x,n.y,n.r,0,6.28);ctx.fill()}
   if(!reduce){next-=dt;if(next<=0&&nodes.length>1){const a=nodes[Math.floor(rand(0,nodes.length))];const b=nodes.filter(n=>n!==a&&(n.x-a.x)**2+(n.y-a.y)**2<LINK*LINK)[0];if(b)pulses.push({a,b,t:0,v:rand(.9,1.6)});next=rand(.06,.18)}}
   for(let i=pulses.length-1;i>=0;i--){
    const p=pulses[i];p.t+=dt*p.v;if(p.t>=1){pulses.splice(i,1);continue}
    const x=p.a.x+(p.b.x-p.a.x)*p.t,y=p.a.y+(p.b.y-p.a.y)*p.t;
    const g=ctx.createRadialGradient(x,y,0,x,y,9);g.addColorStop(0,"rgba(100,210,255,.95)");g.addColorStop(1,"rgba(100,210,255,0)");
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,9,0,6.28);ctx.fill();
   }
  }
 };
}
// ---------- Black Friday: a grid of tiles that light up under the pointer ----------
function tiles(){
 const SIZE=34,GAP=5;let cols=0,rows=0,ox=0,oy=0,lit=[],ripples=[],next=0;
 const cell=(c,r)=>r*cols+c;
 function energise(x,y,radius,power){
  const c0=Math.max(0,Math.floor((x-ox-radius)/SIZE)),c1=Math.min(cols-1,Math.ceil((x-ox+radius)/SIZE));
  const r0=Math.max(0,Math.floor((y-oy-radius)/SIZE)),r1=Math.min(rows-1,Math.ceil((y-oy+radius)/SIZE));
  for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++){
   const cx=ox+c*SIZE+SIZE/2,cy=oy+r*SIZE+SIZE/2,d=Math.hypot(cx-x,cy-y);
   if(d<radius){const v=power*(1-d/radius);const i=cell(c,r);if(v>lit[i])lit[i]=v}
  }
 }
 return {
  resize(){cols=Math.ceil(W/SIZE)+1;rows=Math.ceil(H/SIZE)+1;ox=(W-cols*SIZE)/2;oy=(H-rows*SIZE)/2;lit=new Float32Array(cols*rows)},
  tap(x,y){ripples.push({x,y,r:0})},
  draw(dt){
   ctx.clearRect(0,0,W,H);
   if(pointer.active)energise(pointer.x,pointer.y,110,1);
   for(let i=ripples.length-1;i>=0;i--){
    const p=ripples[i];p.r+=dt*620;
    // A ring of light moving outwards.
    const c0=Math.max(0,Math.floor((p.x-ox-p.r)/SIZE)),c1=Math.min(cols-1,Math.ceil((p.x-ox+p.r)/SIZE)),r0=Math.max(0,Math.floor((p.y-oy-p.r)/SIZE)),r1=Math.min(rows-1,Math.ceil((p.y-oy+p.r)/SIZE));
    for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++){const d=Math.abs(Math.hypot(ox+c*SIZE+SIZE/2-p.x,oy+r*SIZE+SIZE/2-p.y)-p.r);if(d<SIZE){const v=(1-d/SIZE)*Math.max(0,1-p.r/Math.max(W,H));const k=cell(c,r);if(v>lit[k])lit[k]=v}}
    if(p.r>Math.max(W,H)*1.1)ripples.splice(i,1);
   }
   if(!reduce){next-=dt;if(next<=0){const k=Math.floor(Math.random()*lit.length);lit[k]=Math.max(lit[k],rand(.35,.75));next=rand(.04,.14)}}
   else if(!lit.some(v=>v>0))for(let k=0;k<lit.length;k+=7)lit[k]=rand(.1,.5);
   const decay=reduce?0:dt*1.25;
   for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const k=cell(c,r),v=lit[k],x=ox+c*SIZE+GAP/2,y=oy+r*SIZE+GAP/2,s=SIZE-GAP;
    // Fade tiles towards the edges of the banner.
    const edge=Math.min(1,(y+s)/(H*.25),(H-y)/(H*.35),(x+s)/(W*.08),(W-x)/(W*.08));
    ctx.fillStyle="rgba(255,255,255,"+(0.028*edge).toFixed(3)+")";
    ctx.beginPath();ctx.roundRect?ctx.roundRect(x,y,s,s,5):ctx.rect(x,y,s,s);ctx.fill();
    if(v>0.01){
     ctx.fillStyle="rgba(255,206,64,"+(v*.62*Math.max(.35,edge)).toFixed(3)+")";
     ctx.shadowColor="rgba(255,190,40,.9)";ctx.shadowBlur=v*22;
     ctx.beginPath();ctx.roundRect?ctx.roundRect(x,y,s,s,5):ctx.rect(x,y,s,s);ctx.fill();ctx.shadowBlur=0;
     lit[k]=Math.max(0,v-decay);
    }
   }
  }
 };
}
// ---------- Legal pages: calm aurora ribbons that lean toward the pointer ----------
function aurora(){
 let t=0,lean=0;
 const bands=[{c:"100,140,255",y:.35,a:.16,f:.9},{c:"120,90,220",y:.55,a:.13,f:1.3},{c:"80,200,220",y:.7,a:.1,f:.7}];
 return {
  draw(dt){
   t+=dt*(reduce?0:1);ctx.clearRect(0,0,W,H);
   lean+=(((pointer.active?pointer.x/W:.5)-.5)-lean)*Math.min(1,dt*2);
   for(const b of bands){
    const g=ctx.createLinearGradient(0,0,W,0);g.addColorStop(0,"rgba("+b.c+",0)");g.addColorStop(.5+lean*.4,"rgba("+b.c+","+b.a+")");g.addColorStop(1,"rgba("+b.c+",0)");
    ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(0,H);
    for(let x=0;x<=W;x+=16){const y=H*b.y+Math.sin(x/W*6.28*b.f+t*.5*b.f)*H*.08+Math.sin(x/W*14+t*.8)*H*.02;ctx.lineTo(x,y)}
    ctx.lineTo(W,H);ctx.closePath();ctx.fill();
   }
  }
 };
}
const fx=kind==="tiles"?tiles():kind==="lightning"?lightning():kind==="snow"?snow():kind==="aurora"?aurora():signals();
function loop(now){
 const dt=Math.min(.05,(now-last)/1000);last=now;
 if(visible&&!document.hidden)fx.draw(dt);
 raf=requestAnimationFrame(loop);
}
new ResizeObserver(resize).observe(hero);resize();
if(!reduce){
 new IntersectionObserver(e=>{visible=e[0].isIntersecting}).observe(hero);
 raf=requestAnimationFrame(loop);
}
})();
