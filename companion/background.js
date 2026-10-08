const SITE='https://ad-library-scraper-94t0.onrender.com';
let active=false;
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(message?.type!=='COLLECT_CREATIVE')return;
 let origin;try{origin=new URL(sender.url).origin;}catch{return;}
 if(origin!==SITE||!/^\d{1,30}$/.test(message.id)||!/^\d{1,30}$/.test(message.page)){respond({code:'INVALID_REQUEST',items:[]});return;}
 if(active){respond({code:'BUSY',items:[]});return;}
 active=true;
 (async()=>{let tab;try{
  const params=new URLSearchParams({active_status:'active',ad_type:'all',country:'GB',media_type:'all',search_type:'page',view_all_page_id:message.page,id:message.id});
  tab=await chrome.tabs.create({url:'https://www.facebook.com/ads/library/?'+params,active:false});
  let result={code:'META_PREVIEW_UNAVAILABLE',items:[]};
  for(let attempt=0;attempt<40;attempt++){
   await new Promise(resolve=>setTimeout(resolve,500));
   try{const value=await chrome.tabs.sendMessage(tab.id,{type:'READ_CREATIVE',id:message.id});if(value?.items?.length){result=value;break;}if(value?.code==='LOGIN_REQUIRED'){result=value;break;}}catch{}
  }
  respond(result);
 }catch{respond({code:'COMPANION_ERROR',items:[]});}finally{if(tab?.id)try{await chrome.tabs.remove(tab.id);}catch{}active=false;}})();
 return true;
});
