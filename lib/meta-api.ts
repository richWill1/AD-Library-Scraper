import {createHash} from 'node:crypto';
// Process-local protection. A shared queue is still needed before horizontal scaling.
const cooldowns=new Map<string,number>();
export async function metaFetch(url:string,options:RequestInit,request=fetch):Promise<Response>{
 const bearer=new Headers(options.headers).get('Authorization')||'';
 const key=createHash('sha256').update(bearer).digest('hex');const now=Date.now();
 if((cooldowns.get(key)||0)>now)return Response.json({error:{code:4}},{status:429});
 const response=await request(url,options);
 let throttled=response.status===429;
 if(!response.ok)try{const body=await response.clone().json();throttled ||= [4,17,32,613].includes(body.error?.code);}catch{}
 // Stop adding load when Meta reports that the current usage window is full.
 try{const usage=JSON.parse(response.headers.get('x-app-usage')||'null');throttled ||= !!usage&&['call_count','total_cputime','total_time'].some(k=>Number(usage[k])>=100);}catch{}
 if(throttled){const seconds=Number(response.headers.get('retry-after'));const delay=Number.isFinite(seconds)&&seconds>0?Math.min(seconds,3600):60;if(cooldowns.size>=100)cooldowns.clear();cooldowns.set(key,now+delay*1000);}
 return response;
}
