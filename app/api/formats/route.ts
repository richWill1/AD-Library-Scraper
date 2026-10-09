import {NextRequest,NextResponse} from 'next/server';
import {getMetaCredential} from '@/lib/meta-token-store';
import {adFormats} from '@/lib/ad-formats';
export const runtime='nodejs';
const buckets=new Map<string,{at:number,count:number}>();
export async function POST(req:NextRequest){
 const now=Date.now(),key=req.headers.get('x-forwarded-for')?.split(',')[0]||'shared';
 if(buckets.size>1000)for(const [k,v]of buckets)if(now-v.at>60000)buckets.delete(k);
 const bucket=buckets.get(key);if(bucket&&now-bucket.at<60000){if(bucket.count>=20)return NextResponse.json({code:'RATE_LIMITED'},{status:429});bucket.count++;}else buckets.set(key,{at:now,count:1});
 let body;try{const text=await req.text();if(text.length>10000)throw Error();body=JSON.parse(text);}catch{return NextResponse.json({code:'INVALID_REQUEST'},{status:400});}
 const {page,coverage,ids}=body||{};
 if(typeof page!=='string'||!/^\d{1,30}$/.test(page)||!['GB','EU_UK'].includes(coverage)||!Array.isArray(ids)||!ids.length||ids.length>200||!ids.every(id=>typeof id==='string'&&/^\d{1,30}$/.test(id)))return NextResponse.json({code:'INVALID_REQUEST'},{status:400});
 let token;try{token=(await getMetaCredential()).token;}catch{return NextResponse.json({code:'META_STORAGE_UNAVAILABLE'},{status:503});}
 if(!token)return NextResponse.json({code:'NOT_CONFIGURED'},{status:503});
 const countries=coverage==='GB'?['GB']:['GB','AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'];
 const formats=await adFormats(token,page,countries,ids);
 return NextResponse.json({formats:Object.fromEntries(formats)},{headers:{'Cache-Control':'no-store'}});
}
