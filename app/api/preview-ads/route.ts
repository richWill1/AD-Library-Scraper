import {NextRequest,NextResponse} from 'next/server';
import {observeAds} from '@/lib/advertiser-directory';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 if(process.env.RENDER_SERVICE_ID==='srv-db3ufoad0e5s73f5dudg'||process.env.META_ACCESS_TOKEN?.trim())return NextResponse.json({error:'This route is for the credential-free preview.'},{status:404});
  const url=new URL('/api/ads','https://ad-library-scraper-94t0.onrender.com');
  for(const key of ['q','page','after','coverage','discover','status']){
   const v=req.nextUrl.searchParams.get(key);if(v!==null)url.searchParams.set(key,v);
  }
  try{
   const upstream=await fetch(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(25000)});
   const data=await upstream.json();
   if(upstream.ok&&Array.isArray(data.ads))observeAds(data.ads.map((a:{id:string;pageId:string;pageName:string})=>({id:a.id,page_id:a.pageId,page_name:a.pageName})));
   return NextResponse.json(data,{status:upstream.status});
  }catch{return NextResponse.json({error:'The preview ad connection is temporarily unavailable.'},{status:502});}
}
