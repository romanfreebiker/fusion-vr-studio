import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldPath} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {validId,validSecret,validLegacySecret,state,epochOf,canShare,canManage,ttl,visibleToDirection,accessView} from './policy.js';

initializeApp();
const db=getFirestore(),root=db.collection('eskala_permissions_v1').doc('state');
const grants=root.collection('grants'),shares=root.collection('shares'),tokens=root.collection('tokens');
const settings=root.collection('settings').doc('global');
const origin='https://romanfreebiker.github.io',base=origin+'/fusion-vr-studio/';
const catalogUrl='https://raw.githubusercontent.com/romanfreebiker/fusion-vr-studio/main/catalogo.json';
const emulator=process.env.FUNCTIONS_EMULATOR==='true'&&String(process.env.GCLOUD_PROJECT||'').startsWith('demo-');
const fail=(code,message)=>{throw new HttpsError(code,message)};
const hash=secret=>createHash('sha256').update(secret).digest('hex');
const checkedId=id=>{if(!validId(id))fail('invalid-argument','Diseño o acceso no válido.');return id};
const clean=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const row=s=>s.exists?s.data():null;
async function actor(req){
 if(!req.auth)fail('unauthenticated','Inicia sesión en ESKALA.');
 const user=await getAuth().getUser(req.auth.uid).catch(()=>fail('unauthenticated','Cuenta no disponible.'));
 const role=user.customClaims?.eskalaRole;
 if(user.disabled||!user.emailVerified||!['central','direction'].includes(role))fail('permission-denied','Cuenta sin permisos ESKALA.');
 const validAfter=Date.parse(user.tokensValidAfterTime||'');
 if(!Number.isFinite(req.auth.token.auth_time)||(Number.isFinite(validAfter)&&req.auth.token.auth_time*1000<validAfter))fail('unauthenticated','Sesión revocada.');
 return {uid:user.uid,role};
}
function requireCentral(a){if(a.role!=='central')fail('permission-denied','Operación exclusiva de Central.')}
let catalogCache=null;
async function catalog(){
 if(emulator)return JSON.parse(await readFile(new URL('./test-catalog.json',import.meta.url),'utf8')).modelos;
 if(catalogCache&&Date.now()-catalogCache.at<5000)return catalogCache.rows;
 let j;
 try{
   const r=await fetch(catalogUrl+'?eskala='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(!r.ok)throw Error('catalog');
   j=await r.json();
 }catch{fail('unavailable','Catálogo temporalmente no disponible.')}
 if(!Array.isArray(j?.modelos))fail('unavailable','Catálogo no válido.');
 const rows=j.modelos.filter(m=>validId(m?.id)&&typeof m.archivo==='string'&&/^modelos\/[A-Za-z0-9_.-]+\.glb$/i.test(m.archivo));
 catalogCache={at:Date.now(),rows};return rows;
}
async function model(id){const m=(await catalog()).find(m=>m.id===id);if(!m)fail('not-found','Diseño no disponible.');return m}
function viewerModel(m){
 // Single file-access resolver for a later migration to private storage.
 // Public GitHub files are NOT made confidential by this authorization service.
 return {model:m,fileUrl:new URL(m.archivo,base).href,fileAccess:'public-github'};
}
function contactHint(value){const s=clean(value,120);if(!s)return '';if(s.includes('@'))return s[0]+'***@'+s.split('@').at(-1);const digits=s.replace(/\D/g,'');return digits.length>=6?'••• '+digits.slice(-4):''}
async function verify(d){
 const id=checkedId(d.designId),legacy=validLegacySecret(d.secret);
 if(!validSecret(d.secret)&&!legacy)return {valid:false,serverNow:Date.now()};
 const snapshot=await db.runTransaction(async tx=>{
   const token=row(await tx.get(tokens.doc(hash(d.secret))));
   if(!token||!validId(token.accessId))return null;
   const access=row(await tx.get(shares.doc(token.accessId)));
   if(!access||access.designId!==id||(legacy&&access.legacy!==true))return null;
   const grant=row(await tx.get(grants.doc(id)));
   return {access,grant};
 });
 const now=Date.now();
 if(!snapshot||state(snapshot.access,now,snapshot.grant)!=='active')return {valid:false,serverNow:now};
 let m;try{m=await model(id)}catch(e){if(e.code==='not-found')return {valid:false,serverNow:Date.now()};throw e;}
 const serverNow=Date.now();
 if(state(snapshot.access,serverNow,snapshot.grant)!=='active')return {valid:false,serverNow};
 return {valid:true,serverNow,expiresAtMs:snapshot.access.expiresAtMs,...viewerModel(m)};
}
export const eskalaPermissions=onCall({region:'europe-west1',cors:emulator?[origin,/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/]:[origin],timeoutSeconds:30,minInstances:0,maxInstances:5},async req=>{
 const d=req.data||{},op=d.op;
 if(op==='verify')return verify(d);
 const a=await actor(req);
 if(op==='session')return {uid:a.uid,role:a.role};
 if(op==='listDirection'){
   const [g,c]=await Promise.all([grants.get(),catalog()]);
   const map=new Map(g.docs.map(x=>[x.id,x.data()]));
   return {models:c.filter(m=>a.role==='central'?map.has(m.id)&&!map.get(m.id).retired:visibleToDirection(map.get(m.id))).map(m=>({...m,status:map.get(m.id).status}))};
 }
 if(op==='directionModel'||op==='preview'){
   const id=checkedId(d.designId);
   if(op==='preview')requireCentral(a);
   else if(!visibleToDirection(row(await grants.doc(id).get())))fail('permission-denied','Diseño retirado de Dirección.');
   return viewerModel(await model(id));
 }
 if(op==='grant'){
   requireCentral(a);const id=checkedId(d.designId);await model(id);
   await db.runTransaction(async tx=>{const ref=grants.doc(id),g=row(await tx.get(ref));tx.set(ref,{designId:id,status:'active',retired:false,epoch:epochOf(g),updatedAtMs:Date.now(),updatedBy:a.uid},{merge:true})});
   return {ok:true};
 }
 if(op==='withdraw'){
   const id=checkedId(d.designId);
   await db.runTransaction(async tx=>{
     const ref=grants.doc(id),g=row(await tx.get(ref));
     if(!g||g.retired)return;
     // Keep the existing Direction action: remove from the Direction library.
     // Existing independent third-party links are not changed by this action.
     if(a.role==='direction'&&!visibleToDirection(g))fail('permission-denied','Diseño no activo en Dirección.');
     tx.update(ref,{status:'inactive',updatedAtMs:Date.now(),updatedBy:a.uid});
   });return {ok:true};
 }
 if(op==='create'){
   const id=checkedId(d.designId),m=await model(id);
   let duration;try{duration=ttl(d.hours)}catch(e){fail('invalid-argument',e.message)}
   const secret=randomBytes(32).toString('base64url'),accessId=randomUUID(),ref=shares.doc(accessId),tokenRef=tokens.doc(hash(secret));
   const created=await db.runTransaction(async tx=>{
     const g=row(await tx.get(grants.doc(id)));
     if(!canShare(a,g))fail('permission-denied','Diseño no autorizado o retirado.');
     const now=Date.now(),channel=['link','whatsapp','email'].includes(d.channel)?d.channel:'link';
     const s={id:accessId,designId:id,designName:clean(m.nombre,200)||'Diseño',origin:a.role,createdBy:a.uid,recipient:clean(d.recipient,80)||'Destinatario sin identificar',contact:contactHint(d.contact),channel,createdAtMs:now,expiresAtMs:now+duration,status:'active',epoch:epochOf(g)};
     tx.create(ref,s);tx.create(tokenRef,{accessId});return accessView(s,now,g);
   });
   return {access:created,secret,serverNow:Date.now()};
 }
 if(op==='listShares'){
   const id=d.designId?checkedId(d.designId):null;
   // Query by creator for Direction. No grant is required to revoke its own
   // previous shares, even when Central has removed the design from its library.
   let q=a.role==='direction'?shares.where('createdBy','==',a.uid):(id?shares.where('designId','==',id):shares);
   q=q.orderBy(FieldPath.documentId()).limit(100);
   if(d.cursor)q=q.startAfter(checkedId(d.cursor));
   const snap=await q.get(),now=Date.now();
   const records=snap.docs.map(x=>x.data()).filter(s=>canManage(a,s)&&(!id||s.designId===id));
   const ids=[...new Set(records.map(s=>s.designId))];
   const grantDocs=ids.length?await db.getAll(...ids.map(i=>grants.doc(i))):[];
   const map=new Map(grantDocs.map(x=>[x.id,row(x)]));
   return {serverNow:now,accesses:records.map(s=>accessView(s,now,map.get(s.designId))),cursor:snap.size===100?snap.docs.at(-1).id:null};
 }
 if(op==='revoke'){
   const id=checkedId(d.accessId),ref=shares.doc(id);
   await db.runTransaction(async tx=>{const s=row(await tx.get(ref));if(!s)fail('not-found','Acceso no disponible.');if(!canManage(a,s))fail('permission-denied','No puedes revocar este acceso.');if(s.status!=='revoked')tx.update(ref,{status:'revoked',revokedAtMs:Date.now(),revokedBy:a.uid})});
   return {ok:true};
 }
 if(op==='retireDesign'){
   requireCentral(a);const id=checkedId(d.designId);
   // One transactional epoch/tombstone invalidates every link, without a batch
   // size limit. Restoring the design does not reactivate previous links.
   await db.runTransaction(async tx=>{const ref=grants.doc(id),g=row(await tx.get(ref));if(g?.retired)return;tx.set(ref,{designId:id,status:'inactive',retired:true,epoch:epochOf(g)+1,retiredAtMs:Date.now(),updatedAtMs:Date.now(),updatedBy:a.uid},{merge:true})});
   return {ok:true};
 }
 if(op==='settings'){
   const s=row(await settings.get());return {defaultTtlHours:Number(s?.defaultTtlHours)||24};
 }
 if(op==='setSettings'){
   requireCentral(a);let duration;try{duration=ttl(d.hours)}catch(e){fail('invalid-argument',e.message)}
   await settings.set({defaultTtlHours:duration/3600000,updatedBy:a.uid,updatedAtMs:Date.now()},{merge:true});return {defaultTtlHours:duration/3600000};
 }
 fail('invalid-argument','Operación desconocida.');
});
