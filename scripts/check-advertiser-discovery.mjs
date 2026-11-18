import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adsnoop-discovery-'));
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText.replaceAll("from './meta-api'", "from './meta-api.mjs'").replaceAll("from './brand-search'", "from './brand-search.mjs'");
fs.writeFileSync(path.join(dir, 'meta-api.mjs'), compile('lib/meta-api.ts'));
fs.writeFileSync(path.join(dir, 'brand-search.mjs'), compile('lib/brand-search.ts'));
fs.writeFileSync(path.join(dir, 'advertiser-discovery.mjs'), compile('lib/advertiser-discovery.ts'));
const lib = await import(path.join(dir, 'advertiser-discovery.mjs'));
const {candidateHosts, slugForms, searchTerms, nameMatch, exactIdentity, safeAlias, decide, readOfficialSite, discoverTradingName, parseFacebookUrl} = lib;

assert.ok(candidateHosts('Complete Care Shop').includes('completecareshop.co.uk'));
assert.ok(candidateHosts('Good Move').includes('goodmove.co.uk'));
assert.ok(candidateHosts('Goodmove').includes('goodmove.org.uk'));
assert.ok(candidateHosts('The White Company').includes('thewhitecompany.com'));
assert.ok(candidateHosts('Marks & Spencer').includes('marksandspencer.co.uk'));
assert.ok(!candidateHosts('B&Q').includes('diy.com'));
assert.deepEqual(candidateHosts('https://victorianplumbing.co.uk/baths'), ['victorianplumbing.co.uk']);
assert.ok(slugForms('Good Move Ltd').includes('goodmove'));
assert.equal(nameMatch('Goodmove', 'GoodMove UK'), 'variant');
assert.equal(nameMatch('Good Move', 'GoodMove'), 'exact');
assert.equal(nameMatch('Complete Care Shop', 'CareCo'), 'none');
assert.equal(nameMatch('Complete Care Shop', 'Complete Care Shop'), 'exact');
assert.ok(searchTerms('Good Move').includes('goodmove'));
assert.ok(searchTerms('Complete Care Shop').includes('completecareshop'));
assert.ok(searchTerms('victorianplumbing.co.uk').includes('victorianplumbing.co.uk'));

const care = exactIdentity('CareCo');
assert.equal(care.id, '107666748486424');
assert.equal(care.name, 'CareCo');
assert.equal(exactIdentity('Silentnight').name, 'Silentnight');
assert.equal(exactIdentity('Next').name, 'Next');
assert.equal(exactIdentity('boohoo').name, 'boohoo.com');
assert.equal(exactIdentity('Complete Care Shop'), null);
assert.equal(exactIdentity('Goodmove'), null);
assert.equal(exactIdentity('Victorian Plumbing'), null);
assert.equal(safeAlias('Goodmove', {name: 'GoodMove UK'}), undefined);
assert.equal(safeAlias('Goodmove', {name: 'GoodMove Moving Storage Ltd', website: 'https://goodmove.org.uk/'}), 'goodmove.org.uk');

const ccsHtml = `<title>Complete Care Shop – Mobility &amp; Daily Living Aids UK</title><meta property="og:site_name" content="Complete Care Shop"><a href="https://www.facebook.com/CompleteCareShopHelp/">Facebook</a><a href="https://www.facebook.com/sharer/sharer.php?u=https://completecareshop.co.uk/">share</a>`;
const ccs = readOfficialSite(ccsHtml, 'completecareshop.co.uk', 'completecareshop.co.uk', 'Complete Care Shop');
assert.equal(ccs.pages[0].handle, 'CompleteCareShopHelp');
assert.equal(readOfficialSite(ccsHtml, 'careco.co.uk', 'completecareshop.co.uk', 'Complete Care Shop'), null);
assert.equal(parseFacebookUrl('https://www.facebook.com/GoodMove-Moving-Storage-Ltd-967121163478292').id, '967121163478292');

const resolved = decide('Complete Care Shop', {
  adsOk: true, sitesAttempted: 1, sitesReached: 1,
  ads: [{id: '111', name: 'CareCo', adCount: 40, ownDomain: false}, {id: '222', name: 'Complete Care Shop', adCount: 12, ownDomain: true}],
  sites: [ccs],
});
assert.equal(resolved.status, 'resolved');
assert.equal(resolved.advertisers.length, 1);
assert.equal(resolved.advertisers[0].id, '222');
assert.notEqual(resolved.advertisers[0].id, '111');

const choice = decide('Goodmove', {
  adsOk: true, sitesAttempted: 2, sitesReached: 2,
  ads: [{id: '408', name: 'GoodMove UK', adCount: 30, ownDomain: false}],
  sites: [{host: 'goodmove.org.uk', names: ['GoodMove'], category: 'Colchester Removals Company', domainConfirmed: true, pages: [{id: '967', handle: 'GoodMove-Moving-Storage-Ltd-967'}]}],
});
assert.equal(choice.status, 'choose');
assert.equal(choice.resolved, false);
assert.deepEqual(choice.advertisers.map(a => a.id).sort(), ['408', '967']);

const samePage = decide('Dunelm', {adsOk: true, sitesAttempted: 1, sitesReached: 1, ads: [{id: '199', name: 'Dunelm', adCount: 3, ownDomain: false}], sites: [{host: 'dunelm.com', names: ['Dunelm'], domainConfirmed: true, pages: [{handle: 'DunelmUK'}]}]});
assert.equal(samePage.status, 'resolved');
assert.equal(samePage.advertisers.length, 1);
assert.equal(samePage.advertisers[0].id, '199');
assert.equal(samePage.advertisers[0].handle, 'DunelmUK');
const probable = decide('Goodmove', {adsOk: true, sitesAttempted: 1, sitesReached: 1, ads: [{id: '408', name: 'GoodMove UK', adCount: 4, ownDomain: false}], sites: []});
assert.equal(probable.status, 'choose');
assert.equal(probable.resolved, false);

const missing = decide('No Such Brand', {adsOk: true, sitesAttempted: 1, sitesReached: 1, ads: [{id: '9', name: 'Unrelated', adCount: 3, ownDomain: false}], sites: []});
assert.equal(missing.status, 'not_found');
assert.equal(missing.mentions[0].id, '9');

const failed = decide('No Such Brand', {adsOk: false, sitesAttempted: 2, sitesReached: 0, ads: [], sites: []});
assert.equal(failed.status, 'lookup_failed');
assert.equal(failed.code, 'LOOKUP_FAILED');

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
}
const mock = async url => {
  const u = String(url);
  if (u.includes('/api/ads')) {
    if (u.includes('page=222')) return json({ads: [{id: 'a1', pageId: '222', pageName: 'Example Brand'}]});
    return json({ads: [{id: 'm1', pageId: '111', pageName: 'CareCo'}, {id: 'a1', pageId: '222', pageName: 'Example Brand'}]});
  }
  if (u.includes('examplebrand.co.uk')) return new Response(ccsHtml.replaceAll('Complete Care Shop', 'Example Brand').replaceAll('completecareshop', 'examplebrand').replace('CompleteCareShopHelp', 'ExampleBrandHelp'), {status: 200, headers: {'content-type': 'text/html'}});
  if (u.startsWith('https://')) return new Response('', {status: 404, headers: {'content-type': 'text/html'}});
  throw new Error('down');
};
const live = await discoverTradingName('Example Brand', {fetch: mock});
assert.equal(live.status, 'resolved');
assert.equal(live.advertisers[0].id, '222');
assert.equal(live.advertisers[0].handle, 'ExampleBrandHelp');
assert.notEqual(live.advertisers[0].id, '111');

const down = await discoverTradingName('Example Brand', {fetch: async () => { throw new Error('down'); }});
assert.equal(down.status, 'lookup_failed');

console.log('Advertiser discovery checks passed: general names and domains, no cross-brand auto-open, picker when ambiguous, lookup failure kept separate.');
