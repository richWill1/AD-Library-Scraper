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
const {candidateHosts, slugForms, searchTerms, nameMatch, leadMatch, exactIdentity, safeAlias, decide, readOfficialSite, discoverTradingName, parseFacebookUrl} = lib;

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
assert.match(care.picture, /107666748486424\/picture/);
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
assert.equal(choice.advertisers.find(a => a.id === '408').website, undefined);
assert.equal(choice.advertisers.find(a => a.id === '967').website, 'https://goodmove.org.uk/');
assert.equal(choice.status, 'choose');
assert.equal(choice.resolved, false);
assert.deepEqual(choice.advertisers.map(a => a.id).sort(), ['408', '967']);

const samePage = decide('Dunelm', {adsOk: true, sitesAttempted: 1, sitesReached: 1, ads: [{id: '199', name: 'Dunelm', adCount: 3, ownDomain: false}], sites: [{host: 'dunelm.com', names: ['Dunelm'], domainConfirmed: true, pages: [{handle: 'DunelmUK'}]}]});
assert.equal(samePage.status, 'resolved');
assert.equal(samePage.advertisers.length, 1);
assert.equal(samePage.advertisers[0].id, '199');
assert.equal(samePage.advertisers[0].handle, 'DunelmUK');
const cardHtml = '<title>Welcome To cardfactory | Cards, Gifts &amp; Party Supplies</title><link rel="apple-touch-icon" href="/images/apple-touch-icon.png">';
const cardSite = readOfficialSite(cardHtml, 'cardfactory.co.uk', 'cardfactory.co.uk', 'Card Factory');
assert.equal(cardSite.image, 'https://cardfactory.co.uk/images/apple-touch-icon.png');
assert.match(cardSite.category, /Cards, Gifts/);
const card = decide('Card Factory', {adsOk: true, sitesAttempted: 1, sitesReached: 1, ads: [{id: '846468658732156', name: 'Card Factory', adCount: 45, ownDomain: false}], sites: [cardSite]});
assert.equal(card.status, 'resolved');
assert.equal(card.advertisers[0].website, 'https://cardfactory.co.uk/');
assert.equal(card.advertisers[0].logo, cardSite.image);
assert.equal(card.advertisers[0].picture, 'https://graph.facebook.com/846468658732156/picture?type=square&width=128&height=128');
assert.match(card.advertisers[0].category, /Cards/);
const probable = decide('Goodmove', {adsOk: true, sitesAttempted: 1, sitesReached: 1, ads: [{id: '408', name: 'GoodMove UK', adCount: 4, ownDomain: false}], sites: []});
assert.equal(probable.status, 'choose');
assert.equal(probable.resolved, false);

const missing = decide('No Such Brand', {adsOk: true, sitesAttempted: 1, sitesReached: 1, ads: [{id: '9', name: 'Unrelated', adCount: 3, ownDomain: false}], sites: []});
assert.equal(missing.status, 'not_found');
assert.equal(missing.mentions[0].id, '9');

const failed = decide('No Such Brand', {adsOk: false, sitesAttempted: 2, sitesReached: 0, ads: [], sites: []});
assert.equal(failed.status, 'lookup_failed');
assert.equal(failed.code, 'LOOKUP_FAILED');

// A Page name that leads with the trading name ("247 Blinds and Curtains") is a candidate,
// verified when its ads point at the brand's domain; a name that only contains it is not.
assert.equal(leadMatch('247blinds.co.uk', '247 Blinds and Curtains'), true);
assert.equal(leadMatch('247 Blinds', '247 Blinds and Curtains'), true);
assert.equal(leadMatch('strachan.co.uk', 'Strachan Fitted Furniture'), true);
assert.equal(leadMatch('strachan.co.uk', 'Cameron Strachan Golf'), false);
assert.equal(leadMatch('247blinds.co.uk', '247 Curtains'), false);
assert.equal(leadMatch('Box', 'Box Hill School'), false);
const blinds = decide('247blinds.co.uk', {adsOk: true, sitesAttempted: 1, sitesReached: 0, sites: [], ads: [
  {id: '292094400803364', name: '247 Blinds and Curtains', adCount: 55, ownDomain: true},
  {id: '106916301968469', name: 'Trend Blinds', adCount: 19, ownDomain: true},
  {id: '843409002194246', name: '247 Curtains', adCount: 2, ownDomain: true}]});
assert.equal(blinds.status, 'resolved');
assert.equal(blinds.advertisers[0].id, '292094400803364');
const strachan = decide('strachan.co.uk', {adsOk: true, sitesAttempted: 1, sitesReached: 0, sites: [], ads: [
  {id: '118158294985536', name: 'Strachan Fitted Furniture', adCount: 43, ownDomain: true},
  {id: '268932890658619', name: 'Cameron Strachan Golf', adCount: 34, ownDomain: true}]});
assert.equal(strachan.status, 'resolved');
assert.equal(strachan.advertisers[0].name, 'Strachan Fitted Furniture');
const spaced = decide('247 Blinds', {adsOk: true, sitesAttempted: 1, sitesReached: 0, sites: [], ads: [{id: '292094400803364', name: '247 Blinds and Curtains', adCount: 55, ownDomain: false}]});
assert.equal(spaced.status, 'choose');
assert.equal(spaced.advertisers[0].confidence, 'probable');
const exactWins = decide('boots.com', {adsOk: true, sitesAttempted: 1, sitesReached: 0, sites: [], ads: [
  {id: '1', name: 'Boots', adCount: 40, ownDomain: true}, {id: '2', name: 'Boots Repair Shop', adCount: 9, ownDomain: true}]});
assert.equal(exactWins.advertisers.find(a => a.id === '2').confidence, 'probable');
assert.equal(exactWins.advertisers[0].id, '1');
// Curated tracked brands match by their brand name, even when the Page name differs.
assert.equal(exactIdentity('currys.co.uk', [{id: '282722695080974', name: 'Currys', curated: 'Currys'}]).id, '282722695080974');
assert.equal(exactIdentity('John Lewis', [{id: '145210795501787', name: 'John Lewis & Partners', curated: 'John Lewis'}]).id, '145210795501787');

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

const handleHtml = '<title>Victorian Plumbing | Bathrooms</title><a href="https://www.facebook.com/VictorianPlumbing/">Facebook</a><link rel="apple-touch-icon" href="/icon.png">';
function graphMock(mode) {
  return async url => {
    const u = String(url);
    if (u.includes('graph.facebook.com') && u.includes('pages/search')) {
      if (mode === 'search-granted') return json({data: [{id: '555', name: 'Example Brand'}]});
      if (mode === 'denied') return json({error: {code: 10, message: '(#10) Page Public Metadata Access is required'}}, 400);
      return json({data: []});
    }
    if (u.includes('graph.facebook.com') && u.includes('id=')) {
      if (mode === 'granted') return json({id: '424242', name: 'Victorian Plumbing', username: 'VictorianPlumbing', category: 'Bathroom Supply Store'});
      if (mode === 'mismatch') return json({id: '999', name: 'Someone Else', username: 'SomeoneElse'});
      return json({error: {code: 10, message: '(#10) Page Public Metadata Access is required'}}, 400);
    }
    if (u.includes('/api/ads')) return json({ads: []});
    if (u.includes('victorianplumbing.co.uk')) return new Response(handleHtml, {status: 200, headers: {'content-type': 'text/html'}});
    if (u.includes('examplebrand.co.uk')) return new Response('<title>Example Brand</title>', {status: 200, headers: {'content-type': 'text/html'}});
    return new Response('', {status: 404, headers: {'content-type': 'text/html'}});
  };
}
const granted = await discoverTradingName('Victorian Plumbing', {token: 'granted-token', fetch: graphMock('granted')});
assert.equal(granted.status, 'resolved');
assert.equal(granted.advertisers[0].id, '424242');
assert.equal(granted.advertisers[0].handle, 'VictorianPlumbing');
assert.match(granted.advertisers[0].picture, /424242\/picture/);
assert.equal(granted.code, undefined);

const denied = await discoverTradingName('Victorian Plumbing', {token: 'denied-token', fetch: graphMock('denied')});
assert.notEqual(denied.advertisers[0]?.id, '424242');
assert.equal(denied.advertisers.find(a => a.id === '424242'), undefined);
assert.equal(denied.code, 'PAGE_METADATA_PERMISSION');
assert.match(denied.message, /Facebook Page found/);
assert.match(denied.message, /Page Public Metadata Access/);

const mismatch = await discoverTradingName('Victorian Plumbing', {token: 'mismatch-token', fetch: graphMock('mismatch')});
assert.equal(mismatch.advertisers.find(a => a.id === '999'), undefined);

const named = await discoverTradingName('Example Brand', {token: 'search-token', fetch: graphMock('search-granted')});
assert.equal(named.advertisers.find(a => a.id === '555')?.name, 'Example Brand');
assert.match(named.advertisers.find(a => a.id === '555').picture, /555\/picture/);

console.log('Advertiser discovery checks passed: general names and domains, no cross-brand auto-open, picker when ambiguous, lookup failure kept separate.');
