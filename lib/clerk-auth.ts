// Clerk sign-in, verified without extra packages.
// The browser sends its Clerk session token as "Authorization: Bearer <jwt>".
// We check the RS256 signature against Clerk's published keys (JWKS), the
// expiry and the authorised origin, then use the user ID ("sub").
import {createPublicKey,verify,type JsonWebKey} from 'node:crypto';

const SECRET=()=>process.env.CLERK_SECRET_KEY?.trim()||'';
export const PUBLISHABLE=()=>process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()||'';
export const clerkEnabled=()=>/^pk_(test|live)_/.test(PUBLISHABLE())&&/^sk_(test|live)_/.test(SECRET());
// Pages allowed to use a session token (protects against cross-site requests).
const ORIGINS=new Set(['https://adsnoop.co.uk','https://www.adsnoop.co.uk','https://preview.adsnoop.co.uk','https://ad-library-scraper-94t0.onrender.com','http://localhost:3000']);

let jwks:{at:number;keys:(JsonWebKey&{kid?:string})[]}|null=null;
async function keys(force=false){
 if(!force&&jwks&&Date.now()-jwks.at<3600e3)return jwks.keys;
 const r=await fetch('https://api.clerk.com/v1/jwks',{headers:{Authorization:`Bearer ${SECRET()}`},cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error('jwks');
 const body=await r.json();jwks={at:Date.now(),keys:Array.isArray(body.keys)?body.keys:[]};return jwks.keys;
}
const b64=(s:string)=>Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/'),'base64');
export async function sessionUser(req:Request):Promise<string|null>{
 if(!clerkEnabled())return null;
 const m=(req.headers.get('authorization')||'').match(/^Bearer ([\w-]+)\.([\w-]+)\.([\w-]+)$/);if(!m)return null;
 let head:any,claims:any;try{head=JSON.parse(b64(m[1]).toString('utf8'));claims=JSON.parse(b64(m[2]).toString('utf8'));}catch{return null;}
 if(head.alg!=='RS256'||typeof head.kid!=='string')return null;
 let list=await keys().catch(()=>[]);let jwk=list.find(k=>k.kid===head.kid);
 if(!jwk){list=await keys(true).catch(()=>[]);jwk=list.find(k=>k.kid===head.kid);}
 if(!jwk)return null;
 let ok=false;try{ok=verify('RSA-SHA256',Buffer.from(m[1]+'.'+m[2]),createPublicKey({key:jwk,format:'jwk'}),b64(m[3]));}catch{return null;}
 if(!ok)return null;
 const now=Math.floor(Date.now()/1000);
 if(typeof claims.exp!=='number'||claims.exp<now-5)return null;
 if(typeof claims.nbf==='number'&&claims.nbf>now+5)return null;
 if(claims.azp&&!ORIGINS.has(String(claims.azp)))return null;
 return typeof claims.sub==='string'&&/^user_[A-Za-z0-9]+$/.test(claims.sub)?claims.sub:null;
}
// Small per-user data lives on the Clerk user (private metadata, max 8 KB).
export async function readPrivate(userId:string):Promise<Record<string,unknown>>{
 const r=await fetch(`https://api.clerk.com/v1/users/${userId}`,{headers:{Authorization:`Bearer ${SECRET()}`},cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error('user');
 const u=await r.json();return u&&typeof u.private_metadata==='object'&&u.private_metadata?u.private_metadata:{};
}
export async function writePrivate(userId:string,patch:Record<string,unknown>){
 const r=await fetch(`https://api.clerk.com/v1/users/${userId}/metadata`,{method:'PATCH',headers:{Authorization:`Bearer ${SECRET()}`,'Content-Type':'application/json'},body:JSON.stringify({private_metadata:patch}),cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error('metadata');
}
