export type AdvertiserIdentity={pageId:string;pageName:string;handle?:string;aliases:string[]};
// Previously verified advertiser identities, not a source of current ad data.
export const knownAdvertisers:AdvertiserIdentity[]=[
 // Page-specific Ad Library link confirmed by the site owner. Identity only.
 {pageId:'182455928490394',pageName:'My Pension Expert',aliases:['my pension expert','mypensionexpert']},
 // CareCo's own site links to this handle. The public Facebook Page card
 // links to this numeric ID, which ads_archive independently names CareCo.
 {pageId:'107666748486424',pageName:'CareCo',handle:'CareCoMobilityExperts',aliases:['careco','CareCoMobilityExperts','careco.co.uk']},
 {pageId:'179100528779193',pageName:'Silentnight',handle:'Silentnightbeds',aliases:['silentnight','silentnightbeds','silentnight.co.uk']},
 {pageId:'94971738769',pageName:'Next',handle:'nextofficial',aliases:['next','nextofficial','next.co.uk']},
 {pageId:'112850788732826',pageName:'boohoo.com',aliases:['boohoo','boohoo.com']},
 {pageId:'280531915302272',pageName:'Sharps Fitted Furniture',aliases:['sharps','sharps.co.uk']},
 {pageId:'384841908531592',pageName:'Neville Johnson',aliases:['neville johnson','nevillejohnson','nevillejohnson.co.uk']},
 {pageId:'180833751931315',pageName:'Hammonds',aliases:['hammonds','hammonds furniture','hammonds-uk.com']},
];
const compact=(value:string)=>value.toLowerCase().replace(/[^a-z\d]/g,'');
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
 const known=knownAdvertisers.find(a=>a.aliases.some(alias=>compact(alias)===compact(term))||compact(a.pageName)===compact(term));
 return {term:(known?.aliases[0]||term).toLowerCase(),pageId};
}
export function matchingAdvertisers(input:string,additional:AdvertiserIdentity[]=[]):AdvertiserIdentity[]{
 let parsed;try{parsed=brandQuery(input);}catch{return [];}
 const key=compact(parsed.term);if(!parsed.pageId&&key.length<2)return [];
 return Array.from(new Map([...knownAdvertisers,...additional].map(a=>[a.pageId,a])).values()).filter(a=>parsed.pageId?a.pageId===parsed.pageId:[a.pageName,...a.aliases].some(name=>compact(name).includes(key))).sort((a,b)=>advertiserScore(b.pageName,input)-advertiserScore(a.pageName,input));
}
export function librarySearchUrl(input:string,coverage='GB',pageId=''){
 let parsed;try{parsed=brandQuery(input);}catch{parsed={term:input.trim().slice(0,100),pageId:''};}
 const params=new URLSearchParams({active_status:'all',ad_type:'all',country:coverage==='GB'?'GB':'ALL'});
 const id=pageId||parsed.pageId;if(/^\d{1,30}$/.test(id))params.set('view_all_page_id',id);else{params.set('q',parsed.term);params.set('search_type','keyword_unordered');}
 return `https://www.facebook.com/ads/library/?${params}`;
}
export function advertiserScore(name:string,input:string){
 let term=input;try{term=brandQuery(input).term;}catch{}
 const compact=(s:string)=>s.toLowerCase().replace(/[^a-z\d]/g,'');const a=compact(name),b=compact(term);
 return a===b?3:a.startsWith(b)&&b.length>1?2:a.includes(b)&&b.length>1?1:0;
}

export function facebookIdentity(input:string):{id?:string;handle?:string;invalid?:boolean}|null{
 const q=input.trim();
 if(q.startsWith('@'))return /^@[a-z0-9.]{1,80}$/i.test(q)?{handle:q.slice(1)}:{invalid:true};
 if(!/^(?:https?:\/\/)?(?:(?:www|m|web)\.)?facebook\.com(?:[/?#]|$)/i.test(q))return null;
 try{
  const url=new URL(/^https?:/i.test(q)?q:'https://'+q);
  const path=url.pathname.split('/').filter(Boolean);
  const id=(path[0]==='profile.php'?url.searchParams.get('id'):path[0]==='ads'&&path[1]==='library'?url.searchParams.get('view_all_page_id'):path.length===1?path[0]:['people','pages'].includes(path[0])?path[2]:null);
  if(id&&/^\d{1,30}$/.test(id))return {id};
  if(path.length===1&&/^[a-z0-9.]{1,80}$/i.test(path[0])&&!/^(ads|pages|groups|events|watch|reel|share|people|profile\.php|login\.php)$/i.test(path[0]))return {handle:path[0]};
 }catch{}
 return {invalid:true};
}
