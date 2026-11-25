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
const validReach=n=>typeof n==="number"&&Number.isFinite(n)&&n>=0;
function estimate(data,categoryId,selectedCoverage="GB"){
 const benchmark=category(categoryId),meta=data?.meta||{};
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
 const dates=rows.map(a=>a.start).filter(s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s&&s<=checked);
 if(dates.length!==rows.length)return unavailable("Valid ad launch dates needed");
 const reach=observed.reduce((s,a)=>s+a.reach,0),value=reach/1000*benchmark.perThousand;
 if(!Number.isFinite(value))return unavailable("Reach data unavailable");
 return {eligible:true,benchmark,value,low:value*0.5,high:value*1.5,reach,coverage,total:rows.length,reported:observed.length,earliest:dates.sort()[0],checked,at};
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
root.AdSnoopSpend=Object.freeze({categories,category,estimate,average});
})(globalThis);
