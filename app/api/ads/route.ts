import {NextRequest, NextResponse} from 'next/server';
import {brandQuery} from '@/lib/brand-search';
import {connectionSummary,metaFailure,recordMetaConnection} from '@/lib/meta-connection';
import {getMetaCredential} from '@/lib/meta-token-store';
import {createHash} from 'node:crypto';
export const runtime='nodejs';
const buckets=new Map<string,{at:number,count:number}>();
const cache=new Map<string,{at:number,data:unknown}>();
export async function GET(req:NextRequest){
 let token:string;try{token=(await getMetaCredential()).token;}catch{return NextResponse.json({error:'The research connection is temporarily unavailable. Your research board remains available.',code:'META_STORAGE_UNAVAILABLE'},{status:503});}
 if(!token)return NextResponse.json({error:'Live Meta search is awaiting connection. You can still explore the verified sample.',code:'NOT_CONFIGURED'},{status:503});
 const connection=connectionSummary();if(connection.state==='expired'&&connection.expiresAt)return NextResponse.json({error:connection.message,code:'META_EXPIRED'},{status:503});
 const key=req.headers.get('x-forwarded-for')?.split(',')[0]||'shared';const now=Date.now();
 if(buckets.size>1000)for(const [k,v]of buckets)if(now-v.at>60000)buckets.delete(k);
 const bucket=buckets.get(key);if(bucket&&now-bucket.at<60000){if(bucket.count>=20)return NextResponse.json({error:'Please wait a minute before searching again.',code:'RATE_LIMITED'},{status:429,headers:{'Retry-After':'60'}});bucket.count++;}else buckets.set(key,{at:now,count:1});
 const coverage=req.nextUrl.searchParams.get('coverage')||'GB';if(!['GB','EU_UK'].includes(coverage))return NextResponse.json({error:'Choose United Kingdom or UK + EU coverage.'},{status:400});
 const countries=coverage==='EU_UK'?['GB','AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE']:['GB'];
 const discovering=req.nextUrl.searchParams.get('discover')==='1';
 const q=(req.nextUrl.searchParams.get('q')||'').trim();const page=req.nextUrl.searchParams.get('page')||'';const after=req.nextUrl.searchParams.get('after')||'';
 if((!q&&!page)||q.length>200||(page&&!/^\d{1,30}$/.test(page))||after.length>2000)return NextResponse.json({error:'Enter a brand, website URL or valid advertiser Page ID.'},{status:400});
 let parsed;try{parsed=brandQuery(q);}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Please check the website URL.'},{status:400});}
 const term=parsed.term;const pageId=page||parsed.pageId||(/^(sharps|sharps fitted furniture)$/i.test(term)?'280531915302272':'');
 const params=new URLSearchParams({ad_reached_countries:JSON.stringify(countries),ad_type:'ALL',ad_active_status:'ACTIVE',limit:'50',fields:'id,page_id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_delivery_start_time,ad_delivery_stop_time,publisher_platforms,impressions,total_reach_by_location,target_locations,target_ages'});
 if(discovering){params.set('fields','id,page_id,page_name');params.set('limit','100');}
 if(pageId)params.set('search_page_ids',JSON.stringify([pageId]));else params.set('search_terms',term);
 if(after)params.set('after',after);
 const cacheKey=createHash('sha256').update(token).digest('hex')+params.toString()+String(discovering);const hit=cache.get(cacheKey);if(hit&&now-hit.at<300000)return NextResponse.json(hit.data);
 try{
 const response=await fetch(`https://graph.facebook.com/v26.0/ads_archive?${params}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000),cache:'no-store'});const body=await response.json();
 if(!response.ok||body.error){const failure=metaFailure(body.error);recordMetaConnection(failure.state);return NextResponse.json({error:failure.error,code:failure.code},{status:502});}
 recordMetaConnection('connected');
 const rows=(body.data||[]).map((a:any)=>{const copy=Array.from(new Set<string>(a.ad_creative_bodies||[])).join('\n\n');const offer=/sale|discount|% off|book|free design/i.test(copy);const product=/collection|wardrobe|storage/i.test(copy);return {id:String(a.id),pageId:String(a.page_id),pageName:a.page_name||'Advertiser',title:a.ad_creative_link_titles?.[0]||'Ad creative',copy:copy||'No ad copy provided by Meta.',start:a.ad_delivery_start_time?.slice(0,10)||'',stop:a.ad_delivery_stop_time?.slice(0,10)||null,impressions:a.impressions||null,format:'Unknown',angle:offer?'Offer':product?'Product':'Brand',image:'',source:'Meta API',analysis:'Funnel stage is an editorial estimate based on the ad copy. It is not a Meta metric or a measure of performance.',funnel:offer?'BOFU':product?'MOFU':'TOFU',platforms:a.publisher_platforms||[],reach:a.total_reach_by_location?.find((r:any)=>(r.key??r.location)==='GB')?.value??a.total_reach_by_location?.find((r:any)=>r.location==='GB')?.reach??null,locations:a.target_locations||[],ages:a.target_ages||[]};});
 const result={ads:rows,pageId:discovering?null:pageId||null,discovery:discovering||!pageId,capturedAt:new Date().toISOString(),nextCursor:body.paging?.next?body.paging?.cursors?.after||null:null};
 if(cache.size>100)cache.clear();cache.set(cacheKey,{at:now,data:result});return NextResponse.json(result);
 }catch{return NextResponse.json({error:'Meta is taking too long to respond. Please try again.',code:'META_UNAVAILABLE'},{status:502});}
}
