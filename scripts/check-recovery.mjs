import assert from 'node:assert/strict';
import {moduleLoader} from './test-module.mjs';
const {fetchResearch,needsLogin,validRecoveryRequest}=await moduleLoader()('lib/recovery.ts');
let calls=0;let waits=[];const signal=new AbortController().signal;
let result=await fetchResearch('q=example',signal,async()=>{calls++;return calls<3?Response.json({code:'META_UNAVAILABLE'},{status:502}):Response.json({ads:[{id:'1'}]});},async ms=>{waits.push(ms);});assert.equal(result.ok,true);assert.equal(calls,3);assert.deepEqual(waits,[1000,3000]);
for(const code of ['META_EXPIRED','META_RECONNECT','META_ACCESS_DENIED','NOT_CONFIGURED','RATE_LIMITED']){calls=0;waits=[];result=await fetchResearch('q=example',signal,async()=>{calls++;return Response.json({code},{status:code==='RATE_LIMITED'?429:502});},async ms=>{waits.push(ms);});assert.equal(calls,1);assert.equal(waits.length,0);assert.equal(result.ok,false);}
calls=0;result=await fetchResearch('q=example',signal,async()=>{calls++;return Response.json({code:'META_UNAVAILABLE'},{status:503});},async()=>{});assert.equal(calls,3);assert.equal(result.ok,false);
const cancelled=new AbortController();await assert.rejects(fetchResearch('q=old',cancelled.signal,async()=>Response.json({code:'META_UNAVAILABLE'},{status:502}),async()=>{cancelled.abort();}),error=>error.name==='AbortError');
assert.equal(needsLogin('META_EXPIRED'),true);assert.equal(needsLogin('META_UNAVAILABLE'),false);
assert.equal(validRecoveryRequest({query:'Sharps',page:'',after:'',coverage:'GB'}),true);assert.equal(validRecoveryRequest({query:'Sharps',page:'invalid',after:'',coverage:'GB'}),false);assert.equal(validRecoveryRequest({query:'Sharps',page:'',after:'',coverage:'US'}),false);
console.log('Recovery checks passed: bounded transient retries, no authentication/quota retry loops, abort handling and validated resume requests.');
