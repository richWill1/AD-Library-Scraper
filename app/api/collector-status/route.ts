import {NextResponse} from 'next/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
let cached:{until:number;data:{status:string;code:string}}|null=null;
export async function GET(){
  const now=Date.now();
  if(cached&&cached.until>now)return NextResponse.json(cached.data,{headers:{'Cache-Control':'private, max-age=45'}});
  let data:{status:string;code:string}={status:'unavailable',code:'UNREACHABLE'};
  try {
    const response=await fetch('https://ad-library-owned-collector.onrender.com/health',{
      cache:'no-store',signal:AbortSignal.timeout(12000)
    });
    data=response.ok?{status:'reachable',code:'OK'}:response.status===429?{status:'rate-limited',code:'HOST_RATE_LIMITED'}:{status:'unavailable',code:'HTTP_'+response.status};
  }catch{data={status:'unavailable',code:'UNREACHABLE'};}
  cached={until:now+60000,data};
  return NextResponse.json(data,{headers:{'Cache-Control':'private, max-age=45'}});
}
