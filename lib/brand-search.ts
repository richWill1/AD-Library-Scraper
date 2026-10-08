export function brandQuery(input:string):{term:string;pageId:string}{
 const q=input.trim();if(/^\d{1,30}$/.test(q))return {term:q,pageId:q};
 let term=q,pageId='';
 if(/^(https?:\/\/|www\.)/i.test(q)||/^(?:[\w-]+\.)+[a-z]{2,}(\/.*)?$/i.test(q)){
  const url=new URL(/^https?:/i.test(q)?q:`https://${q}`);const host=url.hostname.replace(/^www\./,'');
  if(host==='facebook.com'||host==='m.facebook.com'){
   const id=url.searchParams.get('view_all_page_id')||url.searchParams.get('id')||url.pathname.split('/').filter(Boolean).find(s=>/^\d{1,30}$/.test(s));
   if(id&&/^\d{1,30}$/.test(id))pageId=id;
   term=decodeURIComponent(url.pathname.split('/').filter(Boolean).find(s=>!['pages','profile.php','ads','library'].includes(s))||'').replace(/[-_.]/g,' ');
   if(!pageId&&!term)throw Error('Enter the brand name or its Facebook Page URL.');
  }else{
   const parts=host.split('.');const suffix=parts.slice(-2).join('.');
   const multipart=['co.uk','org.uk','com.au','co.nz','co.za','com.br','co.jp','co.in','com.sg'];
   term=(parts[parts.length-(multipart.includes(suffix)?3:2)]||parts[0]).replace(/[-_]/g,' ');
  }
 }
 if(term.length>100&&!pageId)throw Error('Use a shorter brand name (up to 100 characters).');
 return {term:term.toLowerCase(),pageId};
}
export function advertiserScore(name:string,input:string){
 let term=input;try{term=brandQuery(input).term;}catch{}
 const compact=(s:string)=>s.toLowerCase().replace(/[^a-z\d]/g,'');const a=compact(name),b=compact(term);
 return a===b?3:a.startsWith(b)&&b.length>1?2:a.includes(b)&&b.length>1?1:0;
}
