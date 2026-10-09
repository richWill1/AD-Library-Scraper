import {NextRequest,NextResponse} from 'next/server';
import {authorisedMaintenance} from '@/lib/meta-oauth';
import {checkMetaConnection} from '@/lib/meta-connection';
import {saveConnectionCheck} from '@/lib/meta-token-store';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 if(!authorisedMaintenance(req.headers.get('authorization')))return NextResponse.json({error:'Not authorised.'},{status:401});
 try{const connection=await checkMetaConnection(true);if(process.env.META_DATABASE_URL)await saveConnectionCheck(connection.state);return NextResponse.json({connection,action:['expired','reconnect','access-denied','not-configured','renew-soon'].includes(connection.state)?'owner-login-required':'none',automaticExchange:'on-owner-login'},{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'Connection check could not be saved.'},{status:503});}
}
