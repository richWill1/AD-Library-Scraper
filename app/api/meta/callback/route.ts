import {NextRequest,NextResponse} from 'next/server';
import {oauthConfiguration,readLoginTicket,loginCookie,completeMetaLogin} from '@/lib/meta-oauth';
import {consumeLoginState,saveMetaCredential} from '@/lib/meta-token-store';
import {recordMetaConnection} from '@/lib/meta-connection';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const config=oauthConfiguration();if(!config.ready)return NextResponse.json({error:'Private Meta setup is incomplete.'},{status:503});
 function finish(result:string){const response=NextResponse.redirect(`${config.origin}/connection?result=${result}`,303);response.cookies.set(loginCookie,'',{httpOnly:true,secure:config.origin.startsWith('https:'),sameSite:'lax',path:'/api/meta',maxAge:0});response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');return response;}
 const state=req.nextUrl.searchParams.get('state')||'';const ticket=readLoginTicket(req.cookies.get(loginCookie)?.value||'',state);
 if(!ticket)return finish('invalid-session');
 try{const startedAt=await consumeLoginState(state);if(startedAt===null)return finish('invalid-session');if(req.nextUrl.searchParams.has('error'))return finish('cancelled');const credential=await completeMetaLogin(req.nextUrl.searchParams.get('code')||'');await saveMetaCredential(credential,startedAt);recordMetaConnection('connected');return finish('connected');}catch{return finish('not-connected');}
}
