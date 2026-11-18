import {readDirectoryObject,writeDirectoryObject,storeReady} from './creative-store';
import {knownAdvertisers} from './brand-search';

type Page = {id:string; name:string; alias?:string; category?:string; seen:string[]; lastSeen:number};
const LIMIT = 1500, SAMPLE = 100;
let pages = new Map<string,Page>(), pending = new Map<string,Page>();
let refreshed = 0, task:Promise<void>|undefined, timer:ReturnType<typeof setTimeout>|undefined;
const idOK = (s:unknown) => typeof s==='string' && /^\d{1,30}$/.test(s);
function merge(map:Map<string,Page>, p:Page) {
 const old=map.get(p.id);
 const latest=old && old.lastSeen>p.lastSeen ? old : p;
 map.set(p.id,{...latest, alias:latest.alias||old?.alias||p.alias, category:latest.category||old?.category||p.category,
  seen:[...new Set([...(old?.seen||[]),...p.seen])].slice(-SAMPLE)});
 if(map.size>LIMIT){
  const oldest=[...map.values()].sort((a,b)=>a.lastSeen-b.lastSeen)[0];
  map.delete(oldest.id);
 }
}
async function sync() {
 const response=await readDirectoryObject();
 if(!response.ok && response.status!==404)throw Error('Directory unavailable');
 const etag=response.headers.get('etag');
 if(response.ok&&!etag)throw Error('Missing directory revision');
 const saved:Page[]=response.ok?await response.json():[];
 if(!Array.isArray(saved))throw Error('Invalid directory');
 const merged=new Map<string,Page>();
 for(const p of saved.slice(0,LIMIT))if(p&&idOK(p.id)&&typeof p.name==='string'&&Array.isArray(p.seen))merge(merged,p);
 const batch=new Map(pending);
 for(const p of batch.values())merge(merged,p);
 if(batch.size){
  const result=await writeDirectoryObject(JSON.stringify([...merged.values()]),etag);
  if(!result.ok)throw Error('Directory update deferred');
  for(const [id,p] of batch)if(pending.get(id)===p)pending.delete(id);
 }
 for(const p of pending.values())merge(merged,p);
 pages=merged;refreshed=Date.now();
}
function schedule(delay:number){
 if(!storeReady||timer)return;
 timer=setTimeout(()=>{timer=undefined;void refresh();},delay);
 timer.unref();
}
function refresh(){
 if(!storeReady)return Promise.resolve();
 if(!task)task=sync().catch(()=>{}).finally(()=>{task=undefined;if(pending.size)schedule(5000);});
 return task;
}
export function observePage(id:string,name:string,seen:string[]=[],alias?:string,category?:string){
 if(!idOK(id)||!name||name.length>160)return;
 const p={id,name,alias,category,seen:seen.filter(idOK).slice(0,SAMPLE),lastSeen:Date.now()};
 merge(pages,p);
 if(storeReady){merge(pending,p);schedule(1000);}
}
export function observeAds(rows:{id:string;page_id:string;page_name:string}[]){
 const grouped=new Map<string,{name:string;ids:string[]}>();
 for(const row of rows){
  if(!idOK(row.page_id)||!row.page_name)continue;
  const group=grouped.get(row.page_id)||{name:row.page_name,ids:[]};
  group.ids.push(String(row.id));grouped.set(row.page_id,group);
 }
 for(const [id,g] of grouped)observePage(id,g.name,g.ids);
}
const words=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function score(input:string,name:string){
 const q=words(input),n=words(name);if(!q||!n)return 0;
 if(n===q)return 5;
 if((' '+n+' ').includes(' '+q+' '))return 4;
 const a=q.replace(/ /g,''),b=n.replace(/ /g,'');if(a===b)return 3;
 // One insertion, deletion or substitution, restricted to longer names.
 if(a.length<5||Math.abs(a.length-b.length)>1)return 0;
 let i=0,j=0,errors=0;
 while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++errors>1)return 0;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}
 return errors+a.length-i+b.length-j<=1?1:0;
}
export async function directorySearch(q:string,handle=false){
 if(Date.now()-refreshed>60000)await refresh();
 const combined=new Map(pages);
 for(const p of knownAdvertisers)if(!combined.has(p.pageId))combined.set(p.pageId,{id:p.pageId,name:p.pageName,lastSeen:0,seen:[]});
 return [...combined.values()].map(p=>({id:p.id,name:p.name,alias:p.alias,category:p.category,adCount:p.seen.length,lastSeen:p.lastSeen,
  score:handle?Number(p.alias?.toLowerCase()===q.toLowerCase()):Math.max(score(q,p.name),p.alias?score(q,p.alias):0)}))
 .filter(p=>p.score).sort((a,b)=>b.score-a.score||b.lastSeen-a.lastSeen).slice(0,12);
}
