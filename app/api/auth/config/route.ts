import {NextResponse} from 'next/server';
import {PUBLISHABLE,clerkEnabled} from '@/lib/clerk-auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// The publishable key is public by design; the secret key never leaves the server.
export async function GET(){
 if(!clerkEnabled())return NextResponse.json({enabled:false},{headers:{'Cache-Control':'no-store'}});
 const pk=PUBLISHABLE();let frontendApi='';
 try{frontendApi=Buffer.from(pk.split('_')[2]||'','base64').toString('utf8').replace(/\$$/,'');}catch{}
 if(!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(frontendApi))return NextResponse.json({enabled:false},{headers:{'Cache-Control':'no-store'}});
 return NextResponse.json({enabled:true,publishableKey:pk,frontendApi},{headers:{'Cache-Control':'no-store'}});
}
