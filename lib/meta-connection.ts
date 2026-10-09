// Server-only connection observations; no credentials or raw Meta errors are returned.
export type ConnectionState = 'not-configured'|'connected'|'renew-soon'|'expired'|'reconnect'|'access-denied'|'unavailable';
type Observation = {state:ConnectionState;checkedAt:string};
let observation:Observation|null=null;
let observedToken='';
let pending:Promise<ReturnType<typeof connectionSummary>>|null=null;
const messages:Record<ConnectionState,string>={
 'not-configured':'Live research is awaiting a Meta connection. Your research board and sample remain available.',
 connected:'Meta Ad Library connection checked.',
 'renew-soon':'The Meta connection needs renewal soon. Live research is available.',
 expired:'The Meta connection has expired. The site owner needs to reconnect. Your research board remains available.',
 reconnect:'Meta rejected the connection. The site owner needs to reconnect. Your research board remains available.',
 'access-denied':'Meta Ad Library access needs attention from the site owner. Your research board remains available.',
 unavailable:'Meta is temporarily unavailable. Please try again later. Your research board remains available.',
};
function expiry(value:string|undefined){const time=Date.parse(value||'');return Number.isFinite(time)?time:null;}
export function connectionSummary(now=Date.now()){
 const token=process.env.META_ACCESS_TOKEN||'';
 const times=[expiry(process.env.META_TOKEN_EXPIRES_AT),expiry(process.env.META_DATA_ACCESS_EXPIRES_AT)].filter((v):v is number=>v!==null);
 const expiresAt=times.length?Math.min(...times):null;
 const daysRemaining=expiresAt===null?null:Math.max(0,Math.ceil((expiresAt-now)/86400000));
 let state:ConnectionState=!token?'not-configured':expiresAt!==null&&expiresAt<=now?'expired':observation&&observedToken===token?observation.state:'unavailable';
 if(state==='connected'&&daysRemaining!==null&&daysRemaining<=7)state='renew-soon';
 return {state,message:messages[state],checkedAt:observedToken===token?observation?.checkedAt||null:null,expiresAt:expiresAt===null?null:new Date(expiresAt).toISOString(),daysRemaining,expiryKnown:expiresAt!==null};
}
export function metaFailure(error:{code?:number;error_subcode?:number}|undefined){
 const state:ConnectionState=error?.code===190?(error.error_subcode===463?'expired':'reconnect'):[10,200].includes(error?.code||0)?'access-denied':'unavailable';
 const code=state==='expired'?'META_EXPIRED':state==='reconnect'?'META_RECONNECT':state==='access-denied'?'META_ACCESS_DENIED':'META_UNAVAILABLE';
 return {state,code,error:messages[state]};
}
export function recordMetaConnection(state:ConnectionState){observedToken=process.env.META_ACCESS_TOKEN||'';observation={state,checkedAt:new Date().toISOString()};}
export async function checkMetaConnection(){
 const token=process.env.META_ACCESS_TOKEN;
 const summary=connectionSummary();
 if(!token||summary.state==='expired')return summary;
 if(observation&&observedToken===token&&Date.now()-Date.parse(observation.checkedAt)<120000)return summary;
 if(pending)return pending;
 pending=(async()=>{
  try{
   const params=new URLSearchParams({ad_reached_countries:'["GB"]',ad_type:'ALL',ad_active_status:'ACTIVE',search_page_ids:'["280531915302272"]',fields:'id',limit:'1'});
   const response=await fetch(`https://graph.facebook.com/v26.0/ads_archive?${params}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000),cache:'no-store'});
   const body=await response.json();
   recordMetaConnection(response.ok&&!body.error&&Array.isArray(body.data)?'connected':metaFailure(body.error).state);
  }catch{recordMetaConnection('unavailable');}
  return connectionSummary();
 })();
 try{return await pending;}finally{pending=null;}
}
