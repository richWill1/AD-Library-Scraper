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

// A 60-day ad contributes half its reach. A five-day ad contributes all its reach.
const dates=data([row('1',60000,'2026-09-27'),row('2',5000,'2026-11-21')]);
const rolling=model.estimate(dates,'average','GB',{last30:true});
assert.equal(rolling.reach,35000);
assert.equal(rolling.value,770);
assert.equal(model.estimate(data([row('1',60000,'2026-11-01')]),'average','GB',{last30:true}).reach,60000);
assert.equal(model.estimate(data([{...row('1',60000,'2026-09-27'),stop:'2026-10-10'}]),'average','GB',{last30:true}).reach,0);
const aligned=model.compare30Days([
 {id:'mine',mine:true,d:data([row('1',31000,'2026-10-27')],{generatedAt:'2026-11-26T01:00:00Z'})},
 {id:'rival',d:data([row('2',30000,'2026-10-27')])}
],'GB');
assert.equal(aligned.through,'2026-11-25');
assert.equal(aligned.from,'2026-10-27');
assert.equal(aligned.own.reach,30000);
assert.equal(aligned.avg.value,660);

const app=fs.readFileSync('public/live/app.js','utf8');
Object.assign(context,{state:{coverage:'GB'},esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')});
vm.runInContext(app.slice(app.indexOf('const spendMoney='),app.indexOf('function overviewHTML(')),context);
const own={id:'10',mine:true,d:data([row('1',100000,'2026-11-01')])};
const rival={id:'20',name:'CareCo <test>',spendCategory:'furniture',d:data([row('1',730600,'2026-11-01')])};
const html=context.spendHTML([own,rival]);
assert.ok(html.includes('≈£16.1k'));
assert.ok(html.includes('≈£2.2k'));
assert.ok(html.includes('below CareCo &lt;test&gt;'));
assert.ok(html.includes('27 Oct'));
assert.ok(!html.includes('<select'));
assert.ok(context.spendHTML([own,rival,{id:'30',d:data(strachan.rows,{complete:false})}]).includes('1 of 2 competitors'));
assert.ok(context.spendHTML([{id:'20',d:data([row('1',0)])}]).includes('≈£0'));
assert.ok(context.spendHTML([{id:'20',d:{status:'running'}}]).includes('Collecting ads'));
assert.ok(context.spendHTML([{id:'20',d:data([row('1',null)])}]).includes('Insufficient data'));
assert.equal(context.spendHTML([own]),'');
context.state.coverage='EU_UK';
assert.ok(context.spendHTML([own,rival]).includes('Choose UK coverage'));
assert.ok(!context.spendHTML([own,rival]).includes('≈£16.1k'));

// Round-trip the real account sanitizer without contacting Clerk.
const account=fs.readFileSync('app/api/account/route.ts','utf8');
vm.runInContext(stripTypeScriptTypes(account.slice(account.indexOf('const KEY='),account.indexOf('const rates='))),context);
const clean=context.clean({active:'10',brands:[{id:'10',name:'Mine',spendCategory:'furniture',competitors:[{id:'20',name:'Strachan',spendCategory:'kitchens'},{id:'30',name:'Invalid',spendCategory:'fashion-us'}]}]});
assert.equal(clean.brands[0].spendCategory,'furniture');
assert.equal(clean.brands[0].competitors[0].spendCategory,'kitchens');
assert.equal('spendCategory' in clean.brands[0].competitors[1],false);
assert.equal('spendCategory' in context.clean({brands:[{id:'10',name:'Legacy'}]}).brands[0],false);
console.log('Spend checks passed: Strachan calibration, category maths, missing/zero reach, deduplication, coverage, dates, currency separation, competitor averages, 30-day window, aligned snapshots, comparison rendering and legacy account settings.');
