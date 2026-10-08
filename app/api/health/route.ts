import collection from '@/data/collected-media.json';
import {collectionItems} from '@/lib/collected-media';
export function GET() { const count=new Set(collection.records.filter(r=>collectionItems(collection,r.id).length).map(r=>r.id)).size;return Response.json({status:'ok',mediaConfigured:true,mediaMode:'direct-meta-collected-batch',mediaAds:count,mediaCollectedAt:collection.collectedAt,mode:process.env.META_ACCESS_TOKEN?'live-api-configured':'awaiting-meta-connection'}); }
