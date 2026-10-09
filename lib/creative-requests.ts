// Keep rapid scrolling from starting dozens of browser-collection requests at once.
type Job={signal:AbortSignal;run:()=>Promise<void>;reject:(error:unknown)=>void};
let active=0;const pending:Job[]=[];
function pump(){while(active<2&&pending.length){const job=pending.shift()!;if(job.signal.aborted){job.reject(new DOMException('Aborted','AbortError'));continue;}active++;void job.run().finally(()=>{active--;pump();});}}
export function requestCreative(url:string,signal:AbortSignal,request=fetch):Promise<Response>{return new Promise((resolve,reject)=>{if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return;}const job:Job={signal,reject,run:async()=>{try{resolve(await request(url,{signal}));}catch(error){reject(error);}}};const cancel=()=>{const at=pending.indexOf(job);if(at>=0){pending.splice(at,1);reject(new DOMException('Aborted','AbortError'));}};signal.addEventListener('abort',cancel,{once:true});pending.push(job);pump();});}
