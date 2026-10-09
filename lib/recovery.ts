import type {Ad} from '@/lib/research';
export type ResearchSnapshot={view:string;coverage:string;query:string;submitted:string;rows:Ad[];live:boolean;at:string;page:string;discovery:boolean;cursor:string|null;sort:string;tab:string;platform:string;funnel:string;period:string;minReach:string;term:string;group:boolean;selectedId:string|null};
export type RecoveryRequest={query:string;page:string;after:string;coverage:string};
export function validSnapshot(value:unknown):value is ResearchSnapshot{const v=value as ResearchSnapshot;return !!v&&Array.isArray(v.rows)&&v.rows.every(a=>a&&typeof a.id==='string'&&typeof a.copy==='string')&&typeof v.at==='string';}
export function validRecoveryRequest(value:unknown):value is RecoveryRequest{const v=value as RecoveryRequest;return !!v&&typeof v.query==='string'&&v.query.length<=200&&typeof v.page==='string'&&(!v.page||/^\d{1,30}$/.test(v.page))&&!!(v.query.trim()||v.page)&&typeof v.after==='string'&&v.after.length<=2000&&['GB','EU_UK'].includes(v.coverage);}
export function needsLogin(code:string){return ['META_EXPIRED','META_RECONNECT','NOT_CONFIGURED','expired','reconnect','not-configured','renew-soon'].includes(code);}
function pause(ms:number,signal:AbortSignal){return new Promise<void>((resolve,reject)=>{if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return;}const cancel=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},ms);signal.addEventListener('abort',cancel,{once:true});});}
export async function fetchResearch(params:string,signal:AbortSignal,request=fetch,wait=pause):Promise<{ok:boolean;status:number;data:any}>{
 for(let attempt=0;attempt<3;attempt++){
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  try{const response=await request(`/api/ads?${params}`,{signal});const data=await response.json();const temporary=[502,503,504].includes(response.status)&&['META_UNAVAILABLE','META_STORAGE_UNAVAILABLE'].includes(data.code);if(!temporary||attempt===2)return {ok:response.ok,status:response.status,data};}
  catch{if(signal.aborted)throw new DOMException('Aborted','AbortError');if(attempt===2)throw Error('The search could not reach the server. Please try again.');}
  await wait(attempt===0?1000:3000,signal);
 }
 throw Error('Search did not complete.');
}
