chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(message?.type!=='READ_CREATIVE'||!/^\d{1,30}$/.test(message.id))return;
 const safe=input=>{try{const u=new URL(input);return u.protocol==='https:'&&u.hostname.endsWith('.fbcdn.net')&&!u.username&&!u.password&&!u.searchParams.has('access_token')?u.href:null;}catch{return null;}};
 const items=[];
 for(const el of document.querySelectorAll('video,img')){
  if(el.tagName==='IMG'&&(el.naturalWidth<250||el.naturalHeight<200))continue;
  let p=el.parentElement,id='';
  while(p){const ids=[...new Set((p.innerText||'').match(/Library ID:\s*\d+/g)||[])];if(ids.length===1){id=ids[0].replace(/\D/g,'');break;}if(ids.length>1)break;p=p.parentElement;}
  if(id!==message.id)continue;const url=safe(el.currentSrc||el.src);if(url&&!items.some(v=>v.url===url))items.push({kind:el.tagName==='VIDEO'?'video':'image',url,poster:el.tagName==='VIDEO'?safe(el.poster)||undefined:undefined});
 }
 const login=!!document.querySelector('input[name="email"],input[name="pass"]');
 respond({code:items.length?'COLLECTED':login?'LOGIN_REQUIRED':'WAITING',items,collectedAt:items.length?new Date().toISOString():null});
});
