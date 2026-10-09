const origin=process.env.META_SITE_URL||'';
const secret=process.env.META_MAINTENANCE_SECRET||'';
try{
 const url=new URL(origin);if(url.origin!==origin||url.protocol!=='https:'||secret.length<32)throw Error('Configure the site URL and private maintenance secret.');
 const response=await fetch(`${origin}/api/meta/maintenance`,{method:'POST',headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(120000),redirect:'error'});
 if(!response.ok)throw Error('The private connection check failed.');
 const body=await response.json();
 console.log(JSON.stringify({state:body.connection?.state,daysRemaining:body.connection?.daysRemaining,checkedAt:body.connection?.checkedAt,action:body.action}));
 if(body.action==='owner-login-required'||body.connection?.state==='unavailable')process.exitCode=1;
}catch{console.error('Connection check did not complete. Review the private scheduler settings and connection page.');process.exitCode=1;}
