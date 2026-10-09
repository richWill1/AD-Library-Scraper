import assert from 'node:assert/strict';import {moduleLoader} from './test-module.mjs';
const {requestCreative}=await moduleLoader()('lib/creative-requests.ts');let running=0,max=0;const release=[];const started=[];
const request=(url)=>new Promise(resolve=>{running++;max=Math.max(max,running);started.push(url);release.push(()=>{running--;resolve(Response.json({url}));});});
const controllers=Array.from({length:5},()=>new AbortController());
const jobs=controllers.map((controller,i)=>requestCreative(String(i),controller.signal,request).catch(e=>e.name));
assert.deepEqual(started,['0','1']);controllers[2].abort();release.shift()();await jobs[0];await new Promise(r=>setTimeout(r,0));assert.deepEqual(started,['0','1','3']);release.shift()();await jobs[1];await new Promise(r=>setTimeout(r,0));assert.deepEqual(started,['0','1','3','4']);while(release.length)release.shift()();await Promise.all(jobs);assert.equal(max,2);assert.equal(await jobs[2],'AbortError');console.log('Creative queue passed: two active requests maximum and cancelled off-screen jobs never start.');
