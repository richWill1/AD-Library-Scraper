import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';

const context=vm.createContext({Intl,Date,Map,Set});
vm.runInContext(fs.readFileSync('public/live/spend.js','utf8'),context);
const model=context.AdSnoopSpend;
const row=(id,reach,start='2026-10-26')=>({id,reach,start});
const data=(rows,meta={})=>({status:'ready',rows,meta:{coverage:'GB',complete:true,generatedAt:'2026-11-25T11:11:51Z',...meta}});
const strachan=data([row('1',118514),row('2',56004)]);
const estimate=model.estimate(strachan,'furniture');
assert.equal(estimate.eligible,true);
assert.equal(estimate.reach,174518);
assert.ok(Math.abs(estimate.value-8528.345624)<0.000001);
assert.equal(estimate.earliest,'2026-10-26');
assert.equal(estimate.checked,'2026-11-25');
assert.ok(Math.abs(model.category('average').perThousand-40.87644)<0.000001);
assert.equal(model.category('unknown').id,'average');
assert.equal(model.estimate(strachan,'fashion-us').eligible,false);
assert.equal(model.estimate(data(strachan.rows,{coverage:'EU_UK'}),'furniture').eligible,false);
assert.equal(model.estimate(strachan,'furniture','EU_UK').eligible,false); // A cached UK dataset cannot override the selected scope.
assert.equal(model.estimate(data(strachan.rows,{complete:false}),'furniture').eligible,false);
assert.equal(model.estimate({status:'running'},'furniture').eligible,false);
assert.equal(model.estimate({status:'error'},'furniture').eligible,false);
assert.equal(model.estimate(data([]),'furniture').eligible,false);
assert.equal(model.estimate(data([row('1',null)]),'furniture').eligible,false);
assert.equal(model.estimate(data([row('1',0)]),'furniture').value,0);
assert.equal(model.estimate(data([row('1',-10)]),'furniture').eligible,false);
assert.equal(model.estimate(data([row('1',NaN)]),'furniture').eligible,false);
assert.equal(model.estimate(data([row('1',Infinity)]),'furniture').eligible,false);
assert.equal(model.estimate(data([row('1',100),row('1',100)]),'furniture').reach,100);
const missing=Array.from({length:10},(_,i)=>row(String(i),i<7?100:null));
const covered=model.estimate(data(missing),'furniture');
assert.equal(covered.eligible,true);
assert.equal(covered.coverage,0.7);
assert.equal(covered.reach,700); // No extrapolation for the three missing ads.
assert.equal(model.estimate(data([...missing,row('10',null)]),'furniture').eligible,false);
for(const date of ['',null,'2026-02-30','2026-12-01'])assert.equal(model.estimate(data([row('1',100,date)]),'furniture').eligible,false);
assert.equal(model.estimate(data([row('1',100)],{generatedAt:'invalid'}),'furniture').eligible,false);
const rivals=[{id:'me',mine:true,estimate:{...estimate,value:100000}},{id:'a',estimate},{id:'a',estimate},{id:'b',estimate:model.estimate(data([row('1',0)]),'other')},{id:'missing',estimate:{eligible:false}}];
const avg=model.average(rivals);
assert.equal(avg.total,3);
assert.equal(avg.count,2);
assert.equal(avg.value,estimate.value/2);
assert.equal(model.average([{id:'me',mine:true,estimate}]).value,null);
assert.equal(model.average([{id:'us',estimate:{...estimate,benchmark:model.category('fashion-us')}}]).count,0);

// The tracker uses the same blended benchmark even for legacy selections with saved categories.
const app=fs.readFileSync('public/live/app.js','utf8');
context.state={coverage:'GB'};
vm.runInContext(app.slice(app.indexOf('const spendMoney='),app.indexOf('function overviewHTML(')),context);
const html=context.spendHTML([
 {id:'10',mine:true,d:data([row('1',900000)])},
 {id:'20',name:'Strachan',spendCategory:'furniture',d:strachan},
 {id:'30',d:data(strachan.rows,{complete:false})}
]);
assert.ok(html.includes('≈£7.1k'));
assert.ok(html.includes('1 of 2 competitors'));
assert.ok(!html.includes('Strachan'));
assert.ok(!html.includes('<select'));
assert.ok(context.spendHTML([{id:'20',d:data([row('1',0)])}]).includes('≈£0'));
assert.ok(context.spendHTML([{id:'20',d:{status:'running'}}]).includes('Collecting ad data'));
assert.ok(context.spendHTML([{id:'20',d:data([row('1',null)])}]).includes('Insufficient reach data'));
assert.equal(context.spendHTML([{id:'10',mine:true,d:strachan}]),'');
context.state.coverage='EU_UK';
assert.ok(context.spendHTML([{id:'20',d:strachan}]).includes('Choose UK coverage'));
assert.ok(!context.spendHTML([{id:'20',d:strachan}]).includes('≈£7.1k'));

// Round-trip the real account sanitizer without contacting Clerk.
const account=fs.readFileSync('app/api/account/route.ts','utf8');
vm.runInContext(stripTypeScriptTypes(account.slice(account.indexOf('const KEY='),account.indexOf('const rates='))),context);
const clean=context.clean({active:'10',brands:[{id:'10',name:'Mine',spendCategory:'furniture',competitors:[{id:'20',name:'Strachan',spendCategory:'kitchens'},{id:'30',name:'Invalid',spendCategory:'fashion-us'}]}]});
assert.equal(clean.brands[0].spendCategory,'furniture');
assert.equal(clean.brands[0].competitors[0].spendCategory,'kitchens');
assert.equal('spendCategory' in clean.brands[0].competitors[1],false);
assert.equal('spendCategory' in context.clean({brands:[{id:'10',name:'Legacy'}]}).brands[0],false);
console.log('Spend checks passed: Strachan calibration, category maths, missing/zero reach, deduplication, coverage, dates, currency separation, competitor averages, compact tile rendering and legacy account settings.');
