import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {moduleLoader} from './test-module.mjs';
import {NextRequest} from 'next/server.js';

const dir=await mkdtemp(join(tmpdir(),'adlibrary-meta-test-'));
let db=new PGlite(dir);
globalThis.metaDatabaseQuery=async(sql,values)=>{if(!values&&sql.includes(';'))return db.exec(sql);const result=await db.query(sql,values);return {...result,rowCount:result.affectedRows??result.rows.length};};
const pg='data:text/javascript;base64,'+Buffer.from('export class Pool {on(){} query(sql,values){return globalThis.metaDatabaseQuery(sql,values)}}').toString('base64');
const load=moduleLoader({pg});
process.env.META_APP_ID='123';process.env.META_APP_SECRET='private-app-secret';process.env.META_OWNER_USER_ID='456';process.env.META_SITE_URL='https://example.com';process.env.META_DATABASE_URL='postgres://test-only';process.env.META_TOKEN_ENCRYPTION_KEY='ab'.repeat(32);process.env.META_MAINTENANCE_SECRET='cd'.repeat(32);
const store=await load('lib/meta-token-store.ts');const oauth=await load('lib/meta-oauth.ts');
try{
 const now=Date.now();const ticket=oauth.loginTicket(now);
 assert.ok(oauth.readLoginTicket(ticket.cookie,ticket.state,now));assert.equal(oauth.readLoginTicket(ticket.cookie,'wrong',now),null);assert.equal(oauth.readLoginTicket(ticket.cookie,ticket.state,now+600001),null);
 const protectedToken=store.seal({token:'private-token'},'meta-token-v1');assert.ok(!protectedToken.includes('private-token'));assert.throws(()=>store.unseal(protectedToken,'meta-login-v1'));assert.throws(()=>store.unseal(protectedToken.slice(0,-4)+'AAAA','meta-token-v1'));
 await store.createLoginState(ticket.state,now);assert.equal(await store.consumeLoginState(ticket.state),now);assert.equal(await store.consumeLoginState(ticket.state),null);
 const expiry=Math.floor(now/1000)+60*86400;let user='456';let exchanges=0;
 const meta=async(url)=>{const u=new URL(url);if(u.pathname.endsWith('/debug_token'))return Response.json({data:{is_valid:true,type:'USER',app_id:'123',user_id:user,expires_at:expiry,data_access_expires_at:expiry+86400}});if(u.pathname.endsWith('/ads_archive'))return Response.json({data:[]});if(u.searchParams.has('code'))return Response.json({access_token:'fresh-private-token'});exchanges++;return Response.json({access_token:'extended-private-token'});};
 const credential=await oauth.completeMetaLogin('code',meta);assert.equal(credential.token,'extended-private-token');assert.equal(exchanges,1);
 user='999';await assert.rejects(oauth.completeMetaLogin('code',meta),/Only the configured owner/);assert.equal(exchanges,1);user='456';
 await store.saveMetaCredential(credential,now);const raw=await db.query('SELECT encrypted_token FROM adlibrary_meta_token');assert.ok(!raw.rows[0].encrypted_token.includes('extended-private-token'));assert.equal((await store.getMetaCredential()).token,credential.token);
 await assert.rejects(store.saveMetaCredential({...credential,token:'older-token'},now-1000),/previous connection was preserved/);assert.equal((await store.getMetaCredential()).token,credential.token);
 await db.close();db=new PGlite(dir);const freshStore=await moduleLoader({pg})('lib/meta-token-store.ts');assert.equal((await freshStore.getMetaCredential()).token,credential.token);
 const callback=await load('app/api/meta/callback/route.ts');let response=await callback.GET(new NextRequest('https://example.com/api/meta/callback?state=forged&code=private-code'));assert.equal(response.headers.get('location'),'https://example.com/connection?result=invalid-session');assert.ok(!response.headers.get('location').includes('private-code'));
 const next=oauth.loginTicket();await store.createLoginState(next.state,next.createdAt);globalThis.fetch=meta;
 response=await callback.GET(new NextRequest(`https://example.com/api/meta/callback?state=${next.state}&code=private-code`,{headers:{cookie:`${oauth.loginCookie}=${next.cookie}`}}));assert.equal(response.headers.get('location'),'https://example.com/connection?result=connected');assert.ok(!await response.text());
 response=await callback.GET(new NextRequest(`https://example.com/api/meta/callback?state=${next.state}&code=private-code`,{headers:{cookie:`${oauth.loginCookie}=${next.cookie}`}}));assert.equal(response.headers.get('location'),'https://example.com/connection?result=invalid-session');
 const start=await load('app/api/meta/start/route.ts');assert.equal((await start.POST(new NextRequest('https://example.com/api/meta/start',{method:'POST',headers:{origin:'https://attacker.example'}}))).status,403);
 const denied=oauth.loginTicket();await store.createLoginState(denied.state,denied.createdAt);user='999';response=await callback.GET(new NextRequest(`https://example.com/api/meta/callback?state=${denied.state}&code=private-code`,{headers:{cookie:`${oauth.loginCookie}=${denied.cookie}`}}));assert.equal(response.headers.get('location'),'https://example.com/connection?result=not-connected');assert.equal((await store.getMetaCredential()).token,credential.token);
 const maintenance=await load('app/api/meta/maintenance/route.ts');assert.equal((await maintenance.POST(new NextRequest('https://example.com/api/meta/maintenance',{method:'POST'}))).status,401);
 assert.equal(oauth.authorisedMaintenance('Bearer wrong'),false);assert.equal(oauth.authorisedMaintenance(`Bearer ${process.env.META_MAINTENANCE_SECRET}`),true);
 console.log('Meta OAuth checks passed: owner-only exchange, encrypted Postgres persistence across restart, one-use state, CSRF, replay rejection, safe redirects, older-login protection and failed-login preservation.');
}finally{await db.close();await rm(dir,{recursive:true,force:true});delete globalThis.metaDatabaseQuery;}
