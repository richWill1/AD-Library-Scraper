import {createInterface} from 'node:readline';
import {Writable} from 'node:stream';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const origin='https://graph.facebook.com/v26.0';
const minimumLifetime=7*86400;
// Use only from an operator terminal. There is deliberately no public token-setting API.
export async function extendMetaToken({appId,appSecret,token},request=fetch,now=Date.now()){
 if(!/^\d{1,30}$/.test(appId||'')||!appSecret||!token||/[\r\n]/.test(appSecret+token))throw Error('Enter the app ID, app secret and a fresh user token.');
 const appToken=`${appId}|${appSecret}`;
 async function get(path,params,bearer){
  try{
   const response=await request(`${origin}/${path}?${new URLSearchParams(params)}`,{headers:bearer?{Authorization:`Bearer ${bearer}`}:{},signal:AbortSignal.timeout(20000)});
   const body=await response.json();
   if(!response.ok||body.error)throw Error('rejected');
   return body;
  }catch{throw Error(`Meta could not complete ${path}. Check the credentials and Ad Library access. No replacement was saved.`);}
 }
 function validate(data){
  if(!data?.is_valid||data.type!=='USER'||String(data.app_id)!==appId)throw Error('Meta requires a valid user token belonging to this app. Generate a fresh token in Graph API Explorer.');
 }
 const initial=await get('debug_token',{input_token:token},appToken);validate(initial.data);
 const exchanged=await get('oauth/access_token',{grant_type:'fb_exchange_token',client_id:appId,client_secret:appSecret,fb_exchange_token:token});
 if(typeof exchanged.access_token!=='string'||!exchanged.access_token||/[\r\n]/.test(exchanged.access_token))throw Error('Meta did not return a usable replacement token.');
 const verified=await get('debug_token',{input_token:exchanged.access_token},appToken);validate(verified.data);
 const expires=Number(verified.data.expires_at);
 const dataExpires=Number(verified.data.data_access_expires_at)||0;
 const effective=dataExpires>0?Math.min(expires,dataExpires):expires;
 if(!Number.isFinite(expires)||expires<=0||effective-now/1000<minimumLifetime)throw Error('The replacement has less than seven days of verified access. It was not saved. Reconnect in Meta first.');
 const probe=await get('ads_archive',{ad_reached_countries:'["GB"]',ad_type:'ALL',ad_active_status:'ACTIVE',search_page_ids:'["280531915302272"]',fields:'id',limit:'1'},exchanged.access_token);
 if(!Array.isArray(probe.data))throw Error('Meta did not confirm Ad Library access. No replacement was saved.');
 return {token:exchanged.access_token,expiresAt:new Date(expires*1000).toISOString(),dataAccessExpiresAt:dataExpires>0?new Date(dataExpires*1000).toISOString():'',verifiedAt:new Date(now).toISOString()};
}

async function hiddenPrompt(label){
 if(!process.stdin.isTTY)throw Error('Use an interactive owner terminal; credentials are not accepted as command-line arguments.');
 process.stdout.write(label);
 const silent=new Writable({write(_chunk,_encoding,done){done();}});
 const input=createInterface({input:process.stdin,output:silent,terminal:true});
 try{return await new Promise((resolve,reject)=>{input.once('SIGINT',()=>reject(Error('Cancelled.')));input.question('',answer=>resolve(answer.trim()));});}
 finally{input.close();process.stdout.write('\n');}
}
async function main(){
 const appId=process.env.META_APP_ID||await hiddenPrompt('Meta app ID: ');
 const appSecret=process.env.META_APP_SECRET||await hiddenPrompt('Meta app secret (hidden): ');
 const token=process.env.META_FRESH_TOKEN||await hiddenPrompt('Fresh Meta user token (hidden): ');
 const result=await extendMetaToken({appId,appSecret,token});
 const filename=`.env.meta-renewal-${Date.now()}`;
 await writeFile(filename,`META_ACCESS_TOKEN=${result.token}\nMETA_TOKEN_EXPIRES_AT=${result.expiresAt}\nMETA_DATA_ACCESS_EXPIRES_AT=${result.dataAccessExpiresAt}\n`,{mode:0o600,flag:'wx'});
 console.log(`Ad Library access verified. Token expires ${result.expiresAt}.`);
 if(result.dataAccessExpiresAt)console.log(`Data access expires ${result.dataAccessExpiresAt}.`);
 console.log(`Private replacement saved to ${filename}. Import these three values into the main Render service, then remove the local file. The app secret was not saved.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
