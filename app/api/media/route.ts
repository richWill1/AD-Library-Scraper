import {NextRequest,NextResponse} from 'next/server';
import collection from '@/data/collected-media.json';
import {collectionItems} from '@/lib/collected-media';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const id=req.nextUrl.searchParams.get('id')||'';
 if(!/^\d{1,30}$/.test(id))return NextResponse.json({error:'Invalid ad ID.'},{status:400});
 const items=collectionItems(collection,id);
 return NextResponse.json({items,source:collection.source,collectedAt:items.length?collection.collectedAt:null,code:items.length?'COLLECTED':'NOT_COLLECTED'},{headers:{'Cache-Control':'no-store'}});
}
