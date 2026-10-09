import {NextRequest,NextResponse} from 'next/server';
import {oauthConfiguration,loginTicket,loginUrl,loginCookie} from '@/lib/meta-oauth';
import {createLoginState} from '@/lib/meta-token-store';
export const runtime='nodejs';
const attempts=new Map<string,{at:number;count:number}>();
export async function POST(req:NextRequest){
 const config=oauthConfiguration();
 if(!config.ready)return NextResponse.json({error:'Private Meta setup must be completed before connecting.'},{status:503});
 if(req.headers.get('origin')!==config.origin)return NextResponse.json({error:'Open the connection page on this website.'},{status:403});
 const now=Date.now();const ip=req.headers.get('x-forwarded-for')?.split(',')[0]||'shared';
 if(attempts.size>1000)for(const[k,v]of attempts)if(now-v.at>600000)attempts.delete(k);
 const old=attempts.get(ip);if(old&&now-old.at<600000){if(old.count>=5)return NextResponse.json({error:'Please wait before reconnecting again.'},{status:429});old.count++;}else attempts.set(ip,{at:now,count:1});
 try{const ticket=loginTicket(now);await createLoginState(ticket.state,now);const response=NextResponse.redirect(loginUrl(ticket.state),303);response.cookies.set(loginCookie,ticket.cookie,{httpOnly:true,secure:config.origin.startsWith('https:'),sameSite:'lax',path:'/api/meta',maxAge:600});response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');return response;}catch{return NextResponse.json({error:'Private connection storage is unavailable. The existing connection has not changed.'},{status:503});}
}
