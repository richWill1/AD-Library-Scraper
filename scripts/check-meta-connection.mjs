import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {extendMetaToken} from './meta-token.mjs';
const source=ts.transpileModule(fs.readFileSync('lib/meta-connection.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {connectionSummary,checkMetaConnection,recordMetaConnection,metaFailure}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
delete process.env.META_ACCESS_TOKEN;
assert.equal(connectionSummary().state,'not-configured');
process.env.META_ACCESS_TOKEN='private-test';
let probes=0;
globalThis.fetch=async(url,options)=>{probes++;assert.ok(!url.includes('private-test'));assert.equal(options.headers.Authorization,'Bearer private-test');return Response.json({data:[]});};
await Promise.all([checkMetaConnection(),checkMetaConnection(),checkMetaConnection()]);assert.equal(probes,1);
assert.equal(connectionSummary().state,'connected');assert.equal(connectionSummary().expiryKnown,false);
process.env.META_TOKEN_EXPIRES_AT=new Date(Date.now()+6*86400000).toISOString();assert.equal(connectionSummary().state,'renew-soon');
process.env.META_DATA_ACCESS_EXPIRES_AT=new Date(Date.now()-1000).toISOString();assert.equal(connectionSummary().state,'expired');await checkMetaConnection();assert.equal(probes,1);
delete process.env.META_TOKEN_EXPIRES_AT;delete process.env.META_DATA_ACCESS_EXPIRES_AT;
recordMetaConnection('reconnect');assert.equal(connectionSummary().state,'reconnect');
assert.equal(metaFailure({code:190,error_subcode:463}).code,'META_EXPIRED');assert.equal(metaFailure({code:190,error_subcode:460}).code,'META_RECONNECT');assert.equal(metaFailure({code:200}).code,'META_ACCESS_DENIED');
assert.ok(!JSON.stringify(connectionSummary()).includes('private-test'));

const now=Date.now();const expiry=Math.floor(now/1000)+60*86400;
const credentials={appId:'123',appSecret:'secret-input',token:'fresh-input'};
function responder(overrides={}){let calls=0;return async(url,options)=>{calls++;const u=new URL(url);
 if(u.pathname.endsWith('/debug_token')){assert.equal(options.headers.Authorization,'Bearer 123|secret-input');return Response.json({data:{is_valid:true,type:'USER',app_id:'123',expires_at:expiry,data_access_expires_at:expiry+86400,...overrides}});}
 if(u.pathname.endsWith('/oauth/access_token')){assert.equal(u.searchParams.get('grant_type'),'fb_exchange_token');return Response.json({access_token:'long-lived-output',expires_in:60*86400});}
 assert.ok(u.pathname.endsWith('/ads_archive'));assert.equal(options.headers.Authorization,'Bearer long-lived-output');return Response.json({data:[]});};}
const connected=await extendMetaToken(credentials,responder(),now);assert.equal(connected.token,'long-lived-output');assert.equal(connected.expiresAt,new Date(expiry*1000).toISOString());
await assert.rejects(extendMetaToken(credentials,responder({is_valid:false}),now),/valid user token/);
await assert.rejects(extendMetaToken(credentials,responder({app_id:'999'}),now),/valid user token/);
await assert.rejects(extendMetaToken(credentials,responder({type:'PAGE'}),now),/valid user token/);
await assert.rejects(extendMetaToken(credentials,responder({expires_at:Math.floor(now/1000)+3600}),now),/less than seven days/);
await assert.rejects(extendMetaToken(credentials,responder({data_access_expires_at:Math.floor(now/1000)+3600}),now),/less than seven days/);
await assert.rejects(extendMetaToken(credentials,async()=>{throw Error('secret-input');},now),error=>!error.message.includes('secret-input')&&error.message.includes('No replacement'));
console.log('Meta connection checks passed: real API probe, shared requests, expiry/data-access warnings, safe errors, app validation and verified long-lived exchange.');
