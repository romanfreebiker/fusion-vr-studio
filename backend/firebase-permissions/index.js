import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {validId,validSecret,state,canShare,canManage,ttl,visibleToDirection,accessView} from './policy.js';

initializeApp();
const db=getFirestore(), root=db.collection('eskala_permissions_v1').doc('state');
const grants=root.collection('grants'),shares=root.collection('shares');
const origin='https://romanfreebiker.github.io';
const catalogUrl='https://raw.githubusercontent.com/romanfreebiker/fusion-vr-studio/main/catalogo.json';
const fail=(code,message)=>{throw new HttpsError(code,message)};
const hash=secret=>createHash('sha256').update(secret).digest('hex');
const checkedId=id=>{if(!validId(id))fail('invalid-argument','Diseño o acceso no válido.');return id};
const clean=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
async function actor(req){
 if(!req.auth)fail('unauthenticated','Inicia sesión en ESKALA.');
 const user=await getAuth().getUser(req.auth.uid);
 const role=user.customClaims?.eskalaRole;
 if(user.disabled||!user.emailVerified||!['central','direction'].includes(role))fail('permission-denied','Cuenta sin permisos ESKALA.');
 const validAfter=Date.parse(user.tokensValidAfterTime||'');
 if(Number.isFinite(validAfter)&&req.auth.token.auth_time*1000<validAfter)fail('unauthenticated','Sesión revocada.');
 return {uid:user.uid,role};
}
function requireCentral(a){if(a.role!=='central')fail('permission-denied','Operación exclusiva de Central.')}
async function catalog(){
 const r=await fetch(catalogUrl,{cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!r.ok)fail('unavailable','Catálogo temporalmente no disponible.');
 const j=await r.json();if(!Array.isArray(j.modelos))fail('unavailable','Catálogo no válido.');
 return j.modelos;
}
async function model(id){const m=(await catalog()).find(m=>m.id===id);if(!m)fail('not-found','Diseño no disponible.');return m}
const row=s=>s.exists?s.data():null;
export const eskalaPermissions=onCall({region:'europe-west1',cors:[origin],timeoutSeconds:30,maxInstances:5},async req=>{
 const d=req.data||{},op=d.op;
 // A guest has only the individual bearer link; never sees the registry.
 if(op==='verify'){
   const id=checkedId(d.designId);
   if(!validSecret(d.secret))return {valid:false};
   const snap=await shares.doc(hash(d.secret)).get(),s=row(snap),now=Date.now();
   if(!s||s.designId!==id||state(s,now)!=='active')return {valid:false,serverNow:now};
   const m=await model(id);
   return {valid:true,serverNow:now,expiresAtMs:s.expiresAtMs,model:m};
 }
 const a=await actor(req);
 if(op==='session')return {uid:a.uid,role:a.role};
 if(op==='listDirection'){
   const [g,c]=await Promise.all([grants.get(),catalog()]);
   const map=new Map(g.docs.map(x=>[x.id,x.data()]));
   return {models:c.filter(m=>a.role==='central'?map.has(m.id):visibleToDirection(map.get(m.id))).map(m=>({...m,status:map.get(m.id).status}))};
 }
 if(op==='directionModel'||op==='preview'){
   const id=checkedId(d.designId);
   if(op==='preview')requireCentral(a);
   else if(!visibleToDirection(row(await grants.doc(id).get())))fail('permission-denied','Diseño retirado de Dirección.');
   return {model:await model(id)};
 }
 if(op==='grant'){
   requireCentral(a);const id=checkedId(d.designId);await model(id);
   await grants.doc(id).set({designId:id,status:'active',updatedAtMs:Date.now(),updatedBy:a.uid},{merge:true});return {ok:true};
 }
 if(op==='withdraw'){
   const id=checkedId(d.designId);
   // Preserve the established Direction action: remove from its own library.
   await grants.doc(id).set({designId:id,status:'inactive',updatedAtMs:Date.now(),updatedBy:a.uid},{merge:true});return {ok:true};
 }
 if(op==='create'){
   const id=checkedId(d.designId);await model(id);
   let duration;try{duration=ttl(d.hours)}catch(e){fail('invalid-argument',e.message)}
   const secret=randomBytes(32).toString('base64url'),tokenHash=hash(secret),ref=shares.doc(tokenHash);
   const created=await db.runTransaction(async tx=>{
     const g=row(await tx.get(grants.doc(id)));
     if(!canShare(a,g))fail('permission-denied','Diseño no autorizado para Dirección.');
     const now=Date.now();
     const s={id:randomUUID(),designId:id,origin:a.role,createdBy:a.uid,recipient:clean(d.recipient,80),channel:['link','whatsapp','email'].includes(d.channel)?d.channel:'link',createdAtMs:now,expiresAtMs:now+duration,status:'active',tokenHash};
     tx.create(ref,s);return accessView(s,now);
   });
   return {access:created,secret};
 }
 if(op==='listShares'){
   const id=checkedId(d.designId);
   let q=shares.where('designId','==',id);
   if(a.role==='direction'){if(!visibleToDirection(row(await grants.doc(id).get())))fail('permission-denied','Diseño retirado de Dirección.');q=q.where('createdBy','==',a.uid)}
   const snap=await q.get(),now=Date.now();
   return {serverNow:now,accesses:snap.docs.map(x=>x.data()).filter(s=>canManage(a,s)).map(s=>accessView(s,now)).sort((x,y)=>y.createdAtMs-x.createdAtMs)};
 }
 if(op==='revoke'){
   const id=checkedId(d.accessId),snap=await shares.where('id','==',id).limit(2).get();
   if(snap.size!==1)fail('not-found','Acceso no disponible.');
   await db.runTransaction(async tx=>{const ref=snap.docs[0].ref,s=row(await tx.get(ref));if(!canManage(a,s))fail('permission-denied','No puedes revocar este acceso.');tx.update(ref,{status:'revoked',revokedAtMs:Date.now(),revokedBy:a.uid})});
   return {ok:true};
 }
 if(op==='retireDesign'){
   requireCentral(a);const id=checkedId(d.designId);
   // Revoke the Direction grant and all temporary links in a transaction.
   await db.runTransaction(async tx=>{const snap=await tx.get(shares.where('designId','==',id));if(snap.size>450)fail('failed-precondition','Demasiados accesos; revoca por lotes antes de retirar.');tx.set(grants.doc(id),{designId:id,status:'inactive',updatedAtMs:Date.now(),updatedBy:a.uid},{merge:true});for(const doc of snap.docs)tx.update(doc.ref,{status:'revoked',revokedAtMs:Date.now(),revokedBy:a.uid})});
   return {ok:true};
 }
 fail('invalid-argument','Operación desconocida.');
});
