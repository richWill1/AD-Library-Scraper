import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
import {Pool} from 'pg';

export type MetaCredential={token:string;expiresAt:string;dataAccessExpiresAt:string;verifiedAt:string};
let active:MetaCredential|null=null;
let loadedAt=0;
let pool:Pool|undefined;
let schema:Promise<void>|undefined;
export function encryptionKey(){const key=process.env.META_TOKEN_ENCRYPTION_KEY||'';if(!/^[a-f0-9]{64}$/i.test(key))throw Error('Private token storage is not configured.');return Buffer.from(key,'hex');}
export function seal(value:unknown,purpose:string){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);cipher.setAAD(Buffer.from(purpose));const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url');}
export function unseal<T>(value:string,purpose:string):T{if(value.length>20000)throw Error('Invalid protected data.');const raw=Buffer.from(value,'base64url');if(raw.length<29)throw Error('Invalid protected data.');const cipher=createDecipheriv('aes-256-gcm',encryptionKey(),raw.subarray(0,12));cipher.setAAD(Buffer.from(purpose));cipher.setAuthTag(raw.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(raw.subarray(28)),cipher.final()]).toString('utf8')) as T;}
function database(){if(!process.env.META_DATABASE_URL)throw Error('Durable token storage is not configured.');if(!pool){pool=new Pool({connectionString:process.env.META_DATABASE_URL,max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:10000,statement_timeout:5000,application_name:'ad-library-meta-connection'});pool.on('error',()=>{});}return pool;}
export async function prepareStore(){if(!schema){schema=(async()=>{await database().query(`CREATE TABLE IF NOT EXISTS adlibrary_meta_token (id integer PRIMARY KEY CHECK(id=1), encrypted_token text NOT NULL, connected_at timestamptz NOT NULL); CREATE TABLE IF NOT EXISTS adlibrary_meta_oauth (state_hash text PRIMARY KEY, created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL); CREATE TABLE IF NOT EXISTS adlibrary_meta_check (id integer PRIMARY KEY CHECK(id=1), checked_at timestamptz NOT NULL, state text NOT NULL);`);})();}try{await schema;}catch{schema=undefined;throw Error('Private token storage could not be reached.');}}
export function credentialsView():MetaCredential{return active||{token:process.env.META_ACCESS_TOKEN||'',expiresAt:process.env.META_TOKEN_EXPIRES_AT||'',dataAccessExpiresAt:process.env.META_DATA_ACCESS_EXPIRES_AT||'',verifiedAt:''};}
export async function getMetaCredential(){
 if(!process.env.META_DATABASE_URL)return credentialsView();
 if(active&&Date.now()-loadedAt<30000)return active;
 try{await prepareStore();const result=await database().query('SELECT encrypted_token FROM adlibrary_meta_token WHERE id=1');active=result.rows[0]?unseal<MetaCredential>(result.rows[0].encrypted_token,'meta-token-v1'):null;loadedAt=Date.now();return credentialsView();}catch{throw Error('Private token storage could not be reached.');}
}
export async function saveMetaCredential(value:MetaCredential,startedAt:number){
 if(!value.token||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=Date.now())throw Error('A verified replacement is required.');
 try{await prepareStore();const result=await database().query(`INSERT INTO adlibrary_meta_token(id,encrypted_token,connected_at) VALUES(1,$1,$2) ON CONFLICT(id) DO UPDATE SET encrypted_token=EXCLUDED.encrypted_token,connected_at=EXCLUDED.connected_at WHERE adlibrary_meta_token.connected_at <= EXCLUDED.connected_at RETURNING id`,[seal(value,'meta-token-v1'),new Date(startedAt)]);if(!result.rowCount)throw Error('newer');active=value;loadedAt=Date.now();}catch{throw Error('The replacement could not be saved. The previous connection was preserved.');}
}
const stateHash=(state:string)=>createHash('sha256').update(state).digest('hex');
export async function createLoginState(state:string,createdAt:number){await prepareStore();await database().query('DELETE FROM adlibrary_meta_oauth WHERE expires_at < NOW()');await database().query('INSERT INTO adlibrary_meta_oauth(state_hash,created_at,expires_at) VALUES($1,$2,$3)',[stateHash(state),new Date(createdAt),new Date(createdAt+600000)]);}
export async function consumeLoginState(state:string){await prepareStore();const result=await database().query('DELETE FROM adlibrary_meta_oauth WHERE state_hash=$1 AND expires_at>NOW() RETURNING created_at',[stateHash(state)]);return result.rows[0]?new Date(result.rows[0].created_at).getTime():null;}
export async function saveConnectionCheck(state:string){await prepareStore();await database().query('INSERT INTO adlibrary_meta_check(id,checked_at,state) VALUES(1,NOW(),$1) ON CONFLICT(id) DO UPDATE SET checked_at=EXCLUDED.checked_at,state=EXCLUDED.state',[state]);}
