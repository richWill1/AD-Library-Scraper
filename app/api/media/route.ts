import {NextRequest,NextResponse} from 'next/server';
import collection from '@/data/collected-media.json';
import {collectionItems} from '@/lib/collected-media';
import {fetchCreative} from '@/lib/meta-creative';
export const runtime='nodejs';
const rates=new Map<string,{at:number;count:number}>();
export async function GET(req:NextRequest){
 const id=req.nextUrl.searchParams.get('id')||'';
 if(!/^\d{1,30}$/.test(id))return NextResponse.json({error:'Invalid ad ID.'},{status:400});
 const key=req.headers.get('x-forwarded-for')?.split(',')[0]||'shared';const now=Date.now();const previous=rates.get(key);if(previous&&now-previous.at<60000){if(previous.count>=80)return NextResponse.json({items:[],code:'RATE_LIMITED',retryAfter:60},{status:429});previous.count++;}else rates.set(key,{at:now,count:1});if(rates.size>1000)for(const [k,v]of rates)if(now-v.at>60000)rates.delete(k);
 const refresh=req.nextUrl.searchParams.get('refresh')==='1';const items=refresh?[]:collectionItems(collection,id);
 if(!items.length){const result=await fetchCreative(id,refresh);return NextResponse.json(result,{status:result.code==='BUSY'?429:200,headers:{'Cache-Control':'no-store'}});}
 return NextResponse.json({items,source:collection.source,collectedAt:items.length?collection.collectedAt:null,code:items.length?'COLLECTED':'NOT_COLLECTED'},{headers:{'Cache-Control':'no-store'}});
}
