import {randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {seal,unseal} from '@/lib/meta-token-store';
import {extendMetaToken} from '@/scripts/meta-token.mjs';

export const loginCookie='adlibrary-meta-login';
export function oauthConfiguration(){
 const appId=process.env.META_APP_ID||'';const appSecret=process.env.META_APP_SECRET||'';const ownerId=process.env.META_OWNER_USER_ID||'';const origin=process.env.META_SITE_URL||'';
 let safeOrigin=false;try{const url=new URL(origin);safeOrigin=url.origin===origin&&(url.protocol==='https:'||(process.env.NODE_ENV!=='production'&&url.protocol==='http:'&&url.hostname==='localhost'));}catch{}
 const missing=[!/^\d{1,30}$/.test(appId)&&'Meta app ID',!appSecret&&'Meta app secret',!/^\d{1,30}$/.test(ownerId)&&'Authorised owner account',!safeOrigin&&'Website callback URL',!process.env.META_DATABASE_URL&&'Durable token database',!/^[a-f0-9]{64}$/i.test(process.env.META_TOKEN_ENCRYPTION_KEY||'')&&'Private encryption key'].filter(Boolean) as string[];
 return {ready:!missing.length,missing,appId,appSecret,ownerId,origin,callback:`${origin}/api/meta/callback`};
}
export function loginTicket(now=Date.now()){const state=randomBytes(32).toString('base64url');return {state,createdAt:now,cookie:seal({state,createdAt:now},'meta-login-v1')};}
export function readLoginTicket(cookie:string,state:string,now=Date.now()){
 try{const ticket=unseal<{state:string;createdAt:number}>(cookie,'meta-login-v1');if(typeof ticket.state!=='string'||!Number.isFinite(ticket.createdAt)||ticket.createdAt>now||now-ticket.createdAt>600000)return null;const a=Buffer.from(ticket.state);const b=Buffer.from(state);return a.length===b.length&&timingSafeEqual(a,b)?ticket:null;}catch{return null;}
}
export function loginUrl(state:string){const config=oauthConfiguration();if(!config.ready)throw Error('Meta connection setup is incomplete.');return `https://www.facebook.com/v26.0/dialog/oauth?${new URLSearchParams({client_id:config.appId,redirect_uri:config.callback,state,response_type:'code',scope:'public_profile'})}`;}
export async function completeMetaLogin(code:string,request=fetch){
 const config=oauthConfiguration();if(!config.ready||!code||code.length>4000)throw Error('Meta connection setup is incomplete.');
 async function get(path:string,params:Record<string,string>,bearer=''){
  try{const response=await request(`https://graph.facebook.com/v26.0/${path}?${new URLSearchParams(params)}`,{headers:bearer?{Authorization:`Bearer ${bearer}`}:{},signal:AbortSignal.timeout(20000),cache:'no-store'});const body=await response.json();if(!response.ok||body.error)throw Error('rejected');return body;}catch{throw Error('Meta login could not be verified. The previous connection was preserved.');}
 }
 const initial=await get('oauth/access_token',{client_id:config.appId,client_secret:config.appSecret,redirect_uri:config.callback,code});
 if(typeof initial.access_token!=='string')throw Error('Meta did not provide a usable connection.');
 const info=await get('debug_token',{input_token:initial.access_token},`${config.appId}|${config.appSecret}`);
 if(!info.data?.is_valid||info.data.type!=='USER'||String(info.data.app_id)!==config.appId||String(info.data.user_id)!==config.ownerId)throw Error('Only the configured owner can reconnect Meta. The previous connection was preserved.');
 const extended=await extendMetaToken({appId:config.appId,appSecret:config.appSecret,token:initial.access_token},request);
 // Inspect the replacement owner too; credentials never reach page props or responses.
 const final=await get('debug_token',{input_token:extended.token},`${config.appId}|${config.appSecret}`);
 if(String(final.data?.user_id)!==config.ownerId)throw Error('Meta could not confirm the owner of the replacement.');
 return extended;
}
export function authorisedMaintenance(header:string|null){const secret=process.env.META_MAINTENANCE_SECRET||'';if(secret.length<32||!header?.startsWith('Bearer '))return false;const a=createHash('sha256').update(secret).digest();const b=createHash('sha256').update(header.slice(7)).digest();return timingSafeEqual(a,b);}
