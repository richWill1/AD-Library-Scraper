const SITE='https://ad-library-scraper-94t0.onrender.com';
window.addEventListener('message',event=>{
 if(event.source!==window||event.origin!==SITE)return;const message=event.data;
 if(message?.type==='AD_LIBRARY_COMPANION_PING')window.postMessage({type:'AD_LIBRARY_COMPANION_READY',requestId:message.requestId},SITE);
 if(message?.type==='AD_LIBRARY_REQUEST_CREATIVE'&&typeof message.requestId==='string'&&/^\d{1,30}$/.test(message.id)&&/^\d{1,30}$/.test(message.page)){
  chrome.runtime.sendMessage({type:'COLLECT_CREATIVE',id:message.id,page:message.page}).then(result=>window.postMessage({type:'AD_LIBRARY_CREATIVE_RESULT',requestId:message.requestId,result},SITE)).catch(()=>window.postMessage({type:'AD_LIBRARY_CREATIVE_RESULT',requestId:message.requestId,result:{code:'COMPANION_ERROR',items:[]}},SITE));
 }
});
