import collection from '@/data/collected-media.json';
import {collectionItems} from '@/lib/collected-media';
import {checkMetaConnection} from '@/lib/meta-connection';
import {oauthConfiguration} from '@/lib/meta-oauth';
import {creativeCacheStatus} from '@/lib/meta-creative';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET() { const connection=await checkMetaConnection();const count=new Set(collection.records.filter(r=>collectionItems(collection,r.id).length).map(r=>r.id)).size;return Response.json({status:'ok',connection,recovery:{ready:oauthConfiguration().ready,url:'/connection'},mediaConfigured:true,mediaMode:creativeCacheStatus().configured?'owned-meta-snapshot':'direct-meta-collected-batch',mediaCollector:creativeCacheStatus(),mediaAds:count,mediaCollectedAt:collection.collectedAt,mode:['connected','renew-soon'].includes(connection.state)?'live-api-verified':'meta-connection-needs-attention'},{headers:{'Cache-Control':'no-store'}}); }
