import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {moduleLoader} from './test-module.mjs';
const esm=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const {GET}=await moduleLoader({
 '@/lib/advertiser-directory':esm('export function observeAds(){}'),
 '@/lib/meta-token-store':esm("export async function getMetaCredential(){return {token:'test'}}"),
 '@/lib/meta-connection':esm("export function connectionSummary(){return {state:'connected'}} export function recordMetaConnection(){} export function metaFailure(){return {state:'unavailable',error:'Unavailable',code:'META_UNAVAILABLE'}}"),
 '@/lib/meta-api':esm('export const metaFetch=(...args)=>fetch(...args)'),
})('app/api/ads/route.ts');
const req=params=>({nextUrl:new URL('http://localhost/api/ads?'+new URLSearchParams({q:'123456',page:'123456',...params})),headers:new Headers()});
const calls=[];
globalThis.fetch=async input=>{const u=new URL(input);calls.push(u);return Response.json({data:[{id:'1',page_id:'123456',page_name:'Dormant Brand',ad_delivery_start_time:'2026-01-01',ad_delivery_stop_time:'2026-02-01'}],paging:{next:'redacted',cursors:{after:'next'}}})};
for(const status of ['ACTIVE','INACTIVE','ALL']){
 const result=await(await GET(req({status}))).json();assert.equal(result.status,status);assert.equal(calls.at(-1).searchParams.get('ad_active_status'),status);assert.equal(result.ads[0].stop,'2026-02-01');
}
assert.equal(calls.length,3);await GET(req({status:'INACTIVE'}));assert.equal(calls.length,3);
await GET(req({status:'INACTIVE',after:'next'}));assert.equal(calls.at(-1).searchParams.get('after'),'next');assert.equal(calls.at(-1).searchParams.get('ad_active_status'),'INACTIVE');
assert.equal((await GET(req({status:'invalid'}))).status,400);
const source=fs.readFileSync('public/live/app.js','utf8');
let requests=[],rendered=0;
const ctx=vm.createContext({URLSearchParams,AbortSignal,Date,Set,document:{addEventListener(){}},state:{coverage:'GB'},compareBrands:()=>[{id:'123456',name:'Dormant Brand'}],renderCards:()=>rendered++,request:async url=>{requests.push(url);return {ads:[{id:'1',pageId:'123456',copy:'old ad'},{id:'2',pageId:'999999'}],nextCursor:'next'}}});
vm.runInContext(source.slice(source.indexOf('const adHistory='),source.indexOf('function compareHTML(')),ctx);
await vm.runInContext('loadAdHistory()',ctx);
assert.equal(new URLSearchParams(requests[0].split('?')[1]).get('status'),'ALL');
assert.equal(vm.runInContext('adHistory.rows.length',ctx),1);
await vm.runInContext("adHistory.status='INACTIVE';loadAdHistory()",ctx);
await vm.runInContext('loadAdHistory(true)',ctx);
assert.equal(vm.runInContext('adHistory.rows.length',ctx),1); // Deduplicate pages.
assert.equal(new URLSearchParams(requests.at(-1).split('?')[1]).get('after'),'next');
assert.equal(new URLSearchParams(requests.at(-1).split('?')[1]).get('status'),'INACTIVE');
ctx.request=async()=>{throw Error('Meta unavailable')};await vm.runInContext('loadAdHistory()',ctx);
assert.equal(vm.runInContext('adHistory.error',ctx),'Meta unavailable');
assert.equal(vm.runInContext('adHistory.loading',ctx),false);
// A slow response for a previous status must not overwrite a newer selection.
let release;ctx.request=()=>new Promise(resolve=>{release=resolve});
const stale=vm.runInContext('loadAdHistory()',ctx);
ctx.request=async()=>({ads:[{id:'new',pageId:'123456'}]});
await vm.runInContext("adHistory.status='ACTIVE';loadAdHistory()",ctx);
release({ads:[{id:'old',pageId:'123456'}]});await stale;
assert.equal(vm.runInContext('adHistory.rows[0].id',ctx),'new');
console.log('Ad history checks passed: status validation and forwarding, isolated caches, pagination, page filtering, deduplication, errors and stale-response protection.');

// Exact directory results must render without waiting for category research.
let callback,categoryCalls=0;const renders=[];
const searchCtx=vm.createContext({clearTimeout(){},setTimeout(fn){callback=fn},canonicalName:s=>s.toLowerCase().replace(/[^a-z0-9]/g,''),$ :()=>({value:'My Pension Expert'}),suggest:{items:[],cache:new Map()},localSuggestions:()=>[],suggestRank:(_q,list)=>list,mergeSuggestions:(a,b)=>[...a,...b],renderSuggest:state=>renders.push(state),fetchSuggestions:async()=>[{id:'182455928490394',name:'My Pension Expert'}],fetchCategorySuggestions:async()=>{categoryCalls++;return []}});
vm.runInContext(source.slice(source.indexOf('function onSearchInput('),source.indexOf('function chooseSuggestion(')),searchCtx);
searchCtx.onSearchInput();await callback();
assert.equal(searchCtx.suggest.items[0].id,'182455928490394');assert.equal(categoryCalls,0);assert.ok(renders.includes(''));
console.log('Main search shows exact zero-ad brands immediately, without category lookup.');
