/* ESKALA Taller · Firestore comun con Gestion Taller (gestion-taller-v2). */
(()=>{
 const raw='https://raw.githubusercontent.com/romanfreebiker/fusion-vr-studio/main/';
 const phases=['Pendiente','En fabricación','Fabricado','En instalación','Finalizado'];
 const firebaseConfig={
   apiKey:'AIzaSyDXKRAam6e8dlHFajtzMNueIo2hUMW-Gkg',
   authDomain:'gestion-taller-v2.firebaseapp.com',
   projectId:'gestion-taller-v2',
   storageBucket:'gestion-taller-v2.firebasestorage.app',
   messagingSenderId:'888590823508',
   appId:'1:888590823508:web:6dfd420a3e7ac17d647dc1'
 };
 const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
 const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
 async function read(file){const r=await fetch(raw+file+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('No se pudo cargar '+file);return r.json()}
 let cloudPromise=null;
 function normalize(d){
   d=d&&typeof d==='object'?d:{};
   return {
     version:Number(d.version)||2,
     workers:Array.isArray(d.workers)?d.workers:[],
     jobs:Array.isArray(d.jobs)?d.jobs:[],
     tablet:d.tablet||d.central||null,
     tabletJobs:Array.isArray(d.tabletJobs)?d.tabletJobs:[],
     updatedAtMs:Number(d.updatedAtMs)||0,
     updatedAtISO:String(d.updatedAtISO||''),
     source:String(d.source||'')
   };
 }
 async function cloud(){
   if(cloudPromise)return cloudPromise;
   cloudPromise=(async()=>{
     const {initializeApp,getApps}=await import('https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js');
     const {getFirestore,doc,getDoc,setDoc,onSnapshot,runTransaction}=await import('https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js');
     let app=getApps().find(a=>a.options&&a.options.projectId===firebaseConfig.projectId);
     if(!app)app=initializeApp(firebaseConfig,'eskala-taller-v1');
     const db=getFirestore(app), ref=doc(db,'taller_data','eskala');
     return {db,ref,getDoc,setDoc,onSnapshot,runTransaction};
   })();
   return cloudPromise;
 }
 async function ensureCloud(){
   const C=await cloud();
   const snap=await C.getDoc(C.ref);
   if(snap.exists())return normalize(snap.data());
   const legacy=normalize(await read('taller.json'));
   const seed={...legacy,version:2,updatedAtMs:Date.now(),updatedAtISO:new Date().toISOString(),source:'eskala_migration_taller_json'};
   await C.setDoc(C.ref,seed,{merge:false});
   return normalize(seed);
 }
 async function data(){
   try{return await ensureCloud()}
   catch(error){
     console.warn('[ESKALA Taller] Firestore no disponible; lectura legacy',error);
     return normalize(await read('taller.json'));
   }
 }
 async function change(_token,fn){
   const C=await cloud();
   await ensureCloud();
   let result=null;
   await C.runTransaction(C.db,async tx=>{
     const snap=await tx.get(C.ref);
     if(!snap.exists())throw Error('No existe taller_data/eskala');
     const d=normalize(snap.data());
     await fn(d);
     d.version=2;
     d.updatedAtMs=Date.now();
     d.updatedAtISO=new Date().toISOString();
     d.source='eskala';
     tx.set(C.ref,d,{merge:false});
     result=d;
   });
   return result;
 }
 function subscribe(fn,onError){
   let stop=()=>{},cancelled=false;
   (async()=>{
     try{
       const C=await cloud();await ensureCloud();
       if(cancelled)return;
       stop=C.onSnapshot(C.ref,s=>{if(s.exists())fn(normalize(s.data()))},e=>onError?.(e));
     }catch(e){onError?.(e)}
   })();
   return ()=>{cancelled=true;try{stop()}catch{}};
 }
 async function withCatalog(d){
   const c=await read('catalogo.json'),workers=d.workers||[];
   const assigned=(d.jobs||[]).map(j=>({...j,tabletOnly:false,workerInfo:workers.find(w=>w.id===j.worker)||null,model:c.modelos.find(m=>m.id===j.design)})).filter(j=>j.model&&j.workerInfo);
   const assignedIds=new Set(assigned.map(j=>j.design));
   const tabletJobs=(d.tabletJobs||[]).filter(j=>!assignedIds.has(j.design)).map(j=>({...j,tabletOnly:true,worker:null,workerInfo:null,model:c.modelos.find(m=>m.id===j.design)})).filter(j=>j.model);
   return {tablet:d.tablet||null,workers,assignedJobs:assigned,tabletJobs,jobs:[...tabletJobs,...assigned]};
 }
 async function worker(key){
   if(!/^[a-f0-9]{48}$/.test(key||''))throw Error('Enlace de operario no válido');
   const [d,h,c]=await Promise.all([data(),hash(key),read('catalogo.json')]);
   const w=d.workers.find(x=>x.hash===h&&x.active);if(!w)throw Error('Acceso de operario retirado');
   const jobs=d.jobs.filter(j=>j.worker===w.id).map(j=>({...j,model:c.modelos.find(m=>m.id===j.design)})).filter(j=>j.model);
   return {w,jobs};
 }
 async function tablet(key){
   if(!/^[a-f0-9]{48}$/.test(key||''))throw Error('Enlace de Terminal Taller no válido');
   const [d,h]=await Promise.all([data(),hash(key)]);
   const access=d.tablet;if(!access?.active||access.hash!==h)throw Error('Acceso de Terminal Taller retirado');
   return withCatalog(d);
 }
 const central=tablet;
 async function adminTablet(){return withCatalog(await data())}
 async function adminWorker(id){
   const d=await data(),w=d.workers.find(x=>x.id===id&&x.active);
   if(!w)throw Error('Operario no disponible');
   const c=await read('catalogo.json');
   return {w,jobs:d.jobs.filter(j=>j.worker===id).map(j=>({...j,model:c.modelos.find(m=>m.id===j.design)})).filter(j=>j.model)};
 }
 function link(key){const u=new URL('taller.html',location.href);u.hash=key;return u.href}
 function tabletLink(key){const u=new URL('tablet-taller.html',location.href);u.hash=key;return u.href}
 const centralLink=tabletLink;
 function viewer(key,id){const u=new URL('visor-taller.html',location.href);u.searchParams.set('modo','presentacion');u.searchParams.set('acceso','taller');u.searchParams.set('v','146');u.searchParams.set('diseno',id);u.hash=key;return u.href}
 function tabletViewer(key,id){const u=new URL('visor-taller.html',location.href);u.searchParams.set('modo','presentacion');u.searchParams.set('acceso','tablet');u.searchParams.set('v','146');u.searchParams.set('diseno',id);u.hash=key;return u.href}
 const centralViewer=tabletViewer;
 async function tabletAction(key,payload){
   const h=await hash(key||''),d=await data();
   if(!d.tablet?.active||d.tablet.hash!==h)throw Error('Acceso de Terminal Taller retirado');
   const design=String(payload?.design||'');
   return change('',x=>{
     if(payload.action==='assign'){
       if(!x.workers.some(w=>w.id===payload.worker&&w.active))throw Error('Operario no disponible');
       const prev=x.jobs.find(j=>j.design===design)||{};
       x.jobs=x.jobs.filter(j=>j.design!==design);x.tabletJobs=x.tabletJobs.filter(j=>j.design!==design);
       x.jobs.push({worker:payload.worker,design,type:payload.type||prev.type||'Fabricación e instalación',priority:payload.priority||prev.priority||'Normal',phase:payload.phase||prev.phase||'Pendiente',note:String(payload.note??prev.note??'').slice(0,500)});
     }else if(payload.action==='update'){
       const row=x.jobs.find(j=>j.design===design);if(!row)throw Error('Trabajo no asignado');
       if(payload.worker&&x.workers.some(w=>w.id===payload.worker&&w.active))row.worker=payload.worker;
       if(phases.includes(payload.phase))row.phase=payload.phase;
       if(['Normal','Alta','Urgente'].includes(payload.priority))row.priority=payload.priority;
       if(payload.type)row.type=payload.type;
       if(payload.note!==undefined)row.note=String(payload.note).slice(0,500);
     }else if(payload.action==='unassign'){
       x.jobs=x.jobs.filter(j=>j.design!==design);
       if(!x.tabletJobs.some(j=>j.design===design))x.tabletJobs.push({design,addedAt:new Date().toISOString()});
     }else if(payload.action==='remove'){
       x.jobs=x.jobs.filter(j=>j.design!==design);x.tabletJobs=x.tabletJobs.filter(j=>j.design!==design);
     }else throw Error('Acción no permitida');
   });
 }
 async function tabletApiBase(){return 'firestore://gestion-taller-v2/taller_data/eskala'}
 window.EskalaTaller={data,worker,tablet,central,adminTablet,adminWorker,link,tabletLink,centralLink,viewer,tabletViewer,centralViewer,change,subscribe,tabletAction,tabletApiBase,hash,secret,phases};
})();
