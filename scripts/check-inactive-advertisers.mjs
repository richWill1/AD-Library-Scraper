import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {moduleLoader} from './test-module.mjs';
const esm = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const compile = (file, imports = {}) => esm(ts.transpileModule(fs.readFileSync(file, 'utf8').replace(/from ['"]([^'"]+)['"]/g, (all, name) => imports[name] ? 'from ' + JSON.stringify(imports[name]) : all), {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText);
const brand = compile('lib/brand-search.ts');
const directory = compile('lib/advertiser-directory.ts', {
 './brand-search': brand,
 './creative-store': esm('export const storeReady=false; export async function readSnapshot(){return null} export async function readDirectoryObject(){} export async function writeDirectoryObject(){}'),
 '@/content/seasonal/brands.json': esm('export default {brands:[]}'),
});
const discovery = compile('lib/advertiser-discovery.ts', {'./brand-search': brand, './meta-api': esm('export const metaFetch=(...args)=>fetch(...args)')});
const {directorySearch, directoryPage, observePage} = await import(directory);
const {exactIdentity} = await import(discovery);
assert.equal((await directorySearch('My Pension Expert'))[0].id, '182455928490394');
assert.equal((await directorySearch('mypensionexpert'))[0].id, '182455928490394');
assert.equal((await directoryPage('182455928490394')).name, 'My Pension Expert');
observePage('777777', 'Dormant Brand', [], 'dormantbrand.co.uk');
assert.equal((await directorySearch('Dormant Brand'))[0].adCount, 0);
assert.equal(exactIdentity('dormantbrand.co.uk', await directorySearch('dormantbrand.co.uk')).id, '777777');
const mockDiscovery = esm(`export {exactIdentity,safeAlias} from ${JSON.stringify(discovery)};
 export async function discoverTradingName(){return {advertisers:[],status:'not_found',resolved:false,message:'Not found',source:'test'}}
 export async function resolvePageReference({url}){return url?.endsWith('/888888')?{status:'resolved',id:'888888',name:'Metadata Only Brand',handle:'metadataonly'}:{status:'denied'}}`);
const {GET} = await moduleLoader({
 '@/lib/brand-search': brand,
 '@/lib/advertiser-directory': directory,
 '@/lib/advertiser-discovery': mockDiscovery,
 '@/lib/meta-token-store': esm("export async function getMetaCredential(){return {token:'test'}}"),
})('app/api/advertisers/route.ts');
const search = async (q, suggest = false) => {
 const response = await GET({nextUrl: new URL('http://localhost/api/advertisers?' + new URLSearchParams({q, ...(suggest ? {suggest:'1'} : {})})), headers: new Headers()});
 assert.equal(response.status, 200);
 return response.json();
};
for (const q of ['My Pension Expert','182455928490394','https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=GB&is_targeted_country=false&media_type=all&search_type=page&sort_data[direction]=desc&sort_data[mode]=total_impressions&view_all_page_id=182455928490394']) {
 const result = await search(q);
 assert.equal(result.status, 'resolved');
 assert.equal(result.advertisers[0].name, 'My Pension Expert');
 assert.equal(result.advertisers[0].activeAds, null);
}
assert.equal((await search('Dormant Brand')).advertisers[0].id, '777777');
assert.equal((await search('Dormant Brand',true)).advertisers[0].id, '777777');
assert.equal((await search('Newly Learned Brand')).status, 'not_found');
observePage('999999', 'Newly Learned Brand');
assert.equal((await search('Newly Learned Brand')).status, 'resolved');
assert.equal((await search('https://facebook.com/888888')).advertisers[0].name, 'Metadata Only Brand');
assert.equal((await search('Metadata Only Brand')).advertisers[0].id, '888888');
assert.equal((await search('https://facebook.com/666666')).advertisers[0].name, 'Facebook Page 666666');
assert.equal(await directoryPage('666666'), null); // Do not persist invented names.
console.log('Inactive advertiser checks passed: saved identities, zero-ad suggestions, full Ad Library URL, metadata-only persistence, alias matching and recovery from cached misses.');
