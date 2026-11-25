(function(root){
"use strict";
// Supplied category benchmarks, November 2026. Spend is modelled from ad-level
// reach; the frequency's reporting period and aggregation level are unverified.
const categories=[
 {id:"fashion",label:"Fashion (UK & ROW)",currency:"GBP",cpm:5.23,frequency:8.25},
 {id:"fashion-us",label:"Fashion (US)",currency:"USD",cpm:13.05,frequency:6.99},
 {id:"mobility",label:"Mobility & independent living",currency:"GBP",cpm:7.14,frequency:3.85},
 {id:"furniture",label:"Furniture & beds",currency:"GBP",cpm:12.86,frequency:3.80},
 {id:"kitchens",label:"Kitchens",currency:"GBP",cpm:15.65,frequency:4.05},
 {id:"other",label:"Other",currency:"GBP",cpm:7.76,frequency:2.77}
].map(c=>Object.freeze({...c,perThousand:c.cpm*c.frequency}));
const gbp=categories.filter(c=>c.currency==="GBP");
categories.unshift(Object.freeze({id:"average",label:"All GBP categories (rough average)",currency:"GBP",cpm:null,frequency:null,perThousand:gbp.reduce((s,c)=>s+c.perThousand,0)/gbp.length}));
Object.freeze(categories);
const category=id=>categories.find(c=>c.id===id)||categories[0];
const rollingBenchmark=Object.freeze({...category("average"),label:"30-day UK benchmark",perThousand:22});
const validReach=n=>typeof n==="number"&&Number.isFinite(n)&&n>=0;
const DAY=86400000;
const dayStart=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s?Date.parse(s):NaN;
function estimate(data,categoryId,selectedCoverage="GB",window={}){
 const benchmark=window.last30&&categoryId==="average"?rollingBenchmark:category(categoryId),meta=data?.meta||{};
 const unavailable=reason=>({eligible:false,reason,benchmark});
 if(!data||data.status!=="ready")return unavailable(data?.status==="error"?"Ad data unavailable":"Waiting for ad data");
 if(selectedCoverage!=="GB"||meta.coverage!=="GB")return unavailable("Choose UK coverage for a UK spend estimate");
 if(benchmark.currency!=="GBP")return unavailable("US benchmark requires US reach data");
 if(meta.complete!==true)return unavailable("Full ad collection needed");
 const rows=[...new Map((data.rows||[]).filter(a=>a&&a.id).map(a=>[a.id,a])).values()];
 if(!rows.length)return unavailable("No active ads to estimate");
 const observed=rows.filter(a=>validReach(a.reach)),coverage=observed.length/rows.length;
 if(coverage<0.7)return {...unavailable("Reach available for fewer than 70% of ads"),coverage,total:rows.length,reported:observed.length};
 const at=Date.parse(meta.generatedAt);
 if(!Number.isFinite(at))return unavailable("Collection date unavailable");
 const checked=new Date(at).toISOString().slice(0,10);
 const dates=rows.map(a=>a.start).filter(s=>Number.isFinite(dayStart(s))&&s<=checked);
 if(dates.length!==rows.length)return unavailable("Valid ad launch dates needed");
 let reach=0;
 const end=dayStart(window.through||checked),start=end-29*DAY;
 if(window.last30&&(!Number.isFinite(end)||end>dayStart(checked)))return unavailable("Collection date mismatch");
 for(const ad of observed){
  if(!window.last30){reach+=ad.reach;continue}
  const first=dayStart(ad.start);
  const stop=dayStart(ad.stop);
  const last=Number.isFinite(stop)&&stop>=first?Math.min(stop,dayStart(checked)):dayStart(checked);
  const overlappingDays=Math.max(0,Math.min(end,last)-Math.max(start,first)+DAY);
  reach+=ad.reach*overlappingDays/(last-first+DAY);
 }
 const value=reach/1000*benchmark.perThousand;
 if(!Number.isFinite(value))return unavailable("Reach data unavailable");
 return {eligible:true,benchmark,value,low:value*0.5,high:value*1.5,reach,coverage,total:rows.length,reported:observed.length,earliest:dates.sort()[0],checked,at};
}
function compare30Days(brands,coverage){
 const initial=brands.map(brand=>({...brand,estimate:estimate(brand.d,"average",coverage,{last30:true})}));
 const checked=initial.filter(brand=>brand.estimate.eligible).map(brand=>brand.estimate.checked);
 const through=checked.sort()[0];
 // Keep both sides on the same calendar dates when cached snapshots cross midnight.
 const aligned=initial.map(brand=>brand.estimate.eligible&&brand.estimate.checked!==through
  ?{...brand,estimate:estimate(brand.d,"average",coverage,{last30:true,through})}:brand);
 return {own:aligned.find(brand=>brand.mine)?.estimate,avg:average(aligned),through,
  from:through?new Date(dayStart(through)-29*DAY).toISOString().slice(0,10):null};
}
// Equal advertiser weighting. Missing/partial datasets and the user's own brand
// never enter the competitor average; missing reach is never extrapolated.
function average(items){
 const rivals=[...new Map(items.filter(c=>!c.mine).map(c=>[c.id,c])).values()];
 const usable=rivals.filter(c=>c.estimate?.eligible&&c.estimate.benchmark.currency==="GBP");
 if(!usable.length)return {count:0,total:rivals.length,value:null,low:null,high:null};
 const value=usable.reduce((s,c)=>s+c.estimate.value,0)/usable.length;
 return {count:usable.length,total:rivals.length,value,low:value*0.5,high:value*1.5};
}
root.AdSnoopSpend=Object.freeze({categories,category,estimate,average,compare30Days,rollingBenchmark});
})(globalThis);
