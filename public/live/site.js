/* Shared behaviour for AdSnoop content pages: header glass on scroll (same thresholds as the homepage). */
(function(){
 "use strict";
 let on=false;
 const update=()=>{const y=scrollY;if(!on&&y>40){on=true;document.body.classList.add("scrolled")}else if(on&&y<8){on=false;document.body.classList.remove("scrolled")}};
 addEventListener("scroll",update,{passive:true});update();
})();
