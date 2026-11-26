/* Distribución sincronizada por GitHub. No constituye control de acceso a archivos públicos. */
(()=>{
 const repo='romanfreebiker/fusion-vr-studio',api='https://api.github.com/repos/'+repo;
 const path='distribucion.json', thirdPath='terceros.json', branch='main';
 const readHeaders={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 const refreshInterval=20000;
 const raw='https://raw.githubusercontent.com/'+repo+'/'+branch+'/';
 const snapshots=new Map(), pending=new Map();
 let adminToken=()=>null;
 const safe=m=>({id:m.id,nombre:m.nombre||'Diseño',descripcion:m.descripcion||'',categoria:m.categoria||'',archivo:m.archivo,miniatura:m.miniatura||''});
 const decode=s=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g,'')),c=>c.charCodeAt(0))));
 const encode=o=>{const bytes=new TextEncoder().encode(JSON.stringify(o,null,2)+'\n');let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)};
 async function request(url,options={}){const r=await fetch(url,{cache:'no-store',...options});if(!r.ok){const e=Error('GitHub '+r.status);e.status=r.status;throw e}return r.json()}
 async function publicRead(file,force=false){
   const now=Date.now(),snapshot=snapshots.get(file);
   if(!force&&snapshot&&now-snapshot.at<12000)return snapshot.data;
   if(pending.has(file))return pending.get(file);
   const task=(async()=>{
     let data;
     try{data=await request(raw+file+'?revision='+Math.floor(now/10000))}
     catch{
       const result=await request(api+'/contents/'+file+'?ref='+branch+'&_='+now,{headers:readHeaders});
       data=decode(result.content);
     }
     if(!Array.isArray(data?.modelos))throw Error('Catálogo no válido: '+file);
     snapshots.set(file,{at:now,data});
     return data;
   })();
   pending.set(file,task);
   try{return await task}finally{pending.delete(file)}
 }
 async function readForWrite(token){
   const f=await request(api+'/contents/'+path+'?ref='+branch+'&_='+Date.now(),{headers:{...readHeaders,Authorization:'Bearer '+token}});
   const data=decode(f.content);
   if(!Array.isArray(data?.modelos))throw Error('Catálogo de distribución no válido');
   return {sha:f.sha,data};
 }
 async function readThird(force=false){
   const now=Date.now(),key='third:'+thirdPath,snapshot=snapshots.get(key);
   if(!force&&snapshot&&now-snapshot.at<5000)return snapshot.data;
   let data;
   try{data=await request(raw+thirdPath+'?revision='+Math.floor(now/5000))}
   catch{
     const result=await request(api+'/contents/'+thirdPath+'?ref='+branch+'&_='+now,{headers:readHeaders});
     data=decode(result.content);
   }
   if(data?.version!==1||!Array.isArray(data?.accesses))throw Error('Registro de accesos a terceros no válido');
   snapshots.set(key,{at:now,data});
   return data;
 }
 async function readThirdForWrite(token){
   const f=await request(api+'/contents/'+thirdPath+'?ref='+branch+'&_='+Date.now(),{headers:{...readHeaders,Authorization:'Bearer '+token}});
   const data=decode(f.content);
   if(data?.version!==1||!Array.isArray(data?.accesses))throw Error('Registro de accesos a terceros no válido');
   return {sha:f.sha,data};
 }
 async function writeThird(change){
   const token=adminToken();
   if(!token)throw Error('Conecta GitHub en la central para gestionar accesos a terceros.');
   for(let i=0;i<3;i++){
     const {sha,data}=await readThirdForWrite(token);
     change(data);
     data.updated=new Date().toISOString();
     try{
       await request(api+'/contents/'+thirdPath,{method:'PUT',headers:{...readHeaders,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sha,branch,message:'Actualizar accesos ESKALA a terceros',content:encode(data)})});
       snapshots.delete('third:'+thirdPath);
       return data;
     }catch(e){if(e.status!==409||i===2)throw e}
   }
 }
 async function published(force){
   const [distribution,catalog]=await Promise.all([publicRead(path,force),publicRead('catalogo.json',force)]);
   const present=new Set(catalog.modelos.map(model=>model.id));
   return distribution.modelos.filter(model=>present.has(model.id));
 }
 async function catalogModel(id,force=false){
   const catalog=await publicRead('catalogo.json',force);
   return catalog.modelos.find(model=>model.id===id)||null;
 }
 function shareVersion(model){return String(model&&(model.fecha||model.updated)||'')}
 function storedAdminToken(){
   const key='fusion-vr-studio-auth-v1';
   for(const storage of [sessionStorage,localStorage]){
     try{
       const entry=JSON.parse(storage.getItem(key)||'null');
       if(entry&&typeof entry.token==='string'&&entry.token.length>=20&&Number(entry.expiresAt)>Date.now()&&entry.owner==='romanfreebiker'&&entry.repo==='fusion-vr-studio')return entry.token;
     }catch{}
   }
   return '';
 }
 function configureAdmin(getToken){adminToken=getToken}
 function configureStoredAdmin(){adminToken=storedAdminToken;return !!storedAdminToken()}
 function maskContact(value){
   const raw=String(value||'').trim().slice(0,120);
   if(!raw)return '';
   if(raw.includes('@')){
     const [left,domain='']=raw.split('@');
     return (left?left[0]:'')+'***@'+domain;
   }
   const digits=raw.replace(/\D/g,'');
   if(digits.length>=6)return '••• '+digits.slice(-4);
   return raw;
 }
 async function tokenHash(token){
   const bytes=new TextEncoder().encode(String(token||''));
   const digest=await crypto.subtle.digest('SHA-256',bytes);
   return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 }
 function randomToken(){
   const bytes=crypto.getRandomValues(new Uint8Array(24));
   let s='';for(const b of bytes)s+=String.fromCharCode(b);
   return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 }
 async function shareBase(id){
   const [model,manifest]=await Promise.all([
     catalogModel(id,true),
     fetch(new URL('social/shares.json',location.href),{cache:'no-store'}).then(response=>response.ok?response.json():null).catch(()=>null)
   ]);
   if(!model)throw Error('Este diseño ya no está disponible para compartir.');
   const entry=manifest?.version===1&&manifest.designs?.[id];
   if(!entry||entry.updated!==shareVersion(model))throw Error('La tarjeta ESKALA de este diseño aún no está publicada.');
   if(typeof entry.shortPath==='string'&&/^s\/[a-z2-7]{8}\/$/.test(entry.shortPath))return new URL(entry.shortPath,location.href);
   const prefix='p/'+id.split('-').at(-1)+'/';
   if(typeof entry.path==='string'&&entry.path.startsWith(prefix)&&/^[a-f0-9]{12}\/$/.test(entry.path.slice(prefix.length)))return new URL(entry.path,location.href);
   throw Error('No se encuentra el enlace ESKALA publicado.');
 }
 async function listThirdParty(designId,force=false){
   const data=await readThird(force);
   return data.accesses.filter(a=>a&&a.designId===designId).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
 }
 function automaticRecipient(channel){
   const now=new Date();
   const date=now.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'});
   const time=now.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
   const label=channel==='whatsapp'?'WhatsApp':channel==='email'?'Correo':'Enlace';
   return label+' · '+date+' '+time;
 }
 async function createThirdPartyAccess(designId,recipient='',contact='',channel='link'){
   const clean=String(recipient||automaticRecipient(channel)).trim().slice(0,80);
   const base=await shareBase(designId);
   const secret=randomToken(),hash=await tokenHash(secret),now=new Date().toISOString();
   const access={id:'acc_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8),designId,recipient:clean,contact:maskContact(contact),channel,tokenHash:hash,status:'active',createdAt:now,updatedAt:now};
   await writeThird(data=>data.accesses.push(access));
   base.searchParams.set('share',secret);
   return {access,url:base.href};
 }
 async function setThirdPartyStatus(accessId,status){
   if(!['active','revoked'].includes(status))throw Error('Estado de acceso no válido');
   let updated=null;
   await writeThird(data=>{
     const row=data.accesses.find(a=>a.id===accessId);
     if(!row)throw Error('Ese acceso ya no existe.');
     row.status=status;row.updatedAt=new Date().toISOString();
     if(status==='revoked')row.revokedAt=row.updatedAt;else delete row.revokedAt;
     updated={...row};
   });
   return updated;
 }
 async function deleteThirdPartyAccess(accessId){
   await writeThird(data=>{
     const i=data.accesses.findIndex(a=>a.id===accessId);
     if(i<0)throw Error('Ese acceso ya no existe.');
     data.accesses.splice(i,1);
   });
 }
 async function verifyThirdParty(designId,secret,force=false){
   if(!secret)return null;
   const hash=await tokenHash(secret),data=await readThird(force),now=Date.now();
   return data.accesses.find(a=>a.designId===designId&&a.tokenHash===hash&&a.status==='active'&&(!a.expiresAt||Date.parse(a.expiresAt)>now))||null;
 }
 async function write(change){const token=adminToken();if(!token)throw Error('Conecta tu cuenta de GitHub en Configuración para gestionar la distribución.');
   for(let i=0;i<3;i++){const {sha,data}=await readForWrite(token);change(data.modelos);try{await request(api+'/contents/'+path,{method:'PUT',headers:{...readHeaders,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sha,branch,message:'Actualizar distribución de diseños',content:encode(data)})});snapshots.delete(path);return}catch(e){if(e.status!==409||i===2)throw e}}
 }
 const hiddenKey='fusion-direction-hidden-v2';
 function hidden(){try{return JSON.parse(localStorage.getItem(hiddenKey)||'{}')}catch{return {}}}
 function hide(m){try{const h=hidden();h[m.id]=m.updated;localStorage.setItem(hiddenKey,JSON.stringify(h))}catch{}}
 function isHidden(m){return Object.prototype.hasOwnProperty.call(hidden(),m.id)&&hidden()[m.id]===m.updated}
 async function list(role,force=false){const rows=await published(force);return role==='director'?rows.filter(m=>m.status==='active'&&!isHidden(m)):rows}
 async function send(m){await write(rows=>{const next={...safe(m),status:'active',updated:new Date().toISOString()};const i=rows.findIndex(x=>x.id===m.id);if(i<0)rows.push(next);else rows[i]=next})}
 async function setStatus(id,status,role){if(role!=='admin')throw Error('La retirada global debe confirmarse desde la central.');await write(rows=>{const i=rows.findIndex(x=>x.id===id);if(i<0)return;if(status==='revoked')rows.splice(i,1);else rows[i]={...rows[i],status,updated:new Date().toISOString()}})}
 function viewer(id,role){const u=new URL('visor.html',location.href);u.searchParams.set('modo','presentacion');u.searchParams.set('diseno',id);u.searchParams.set('acceso',role);u.searchParams.set('v','108');return u}
 async function share(id){
   return (await createThirdPartyAccess(id,'','', 'link')).url;
 }
 async function shareWhatsApp(id,name){
   const page=window.open('about:blank','_blank');
   try{
     const {url}=await createThirdPartyAccess(id,'','', 'whatsapp');
     const message='ESKALA Studio · '+(name||'Diseño 3D')+'\n'+url;
     const target='https://wa.me/?text='+encodeURIComponent(message);
     if(page){page.opener=null;page.location.replace(target);}else window.location.assign(target);
     return url;
   }catch(error){if(page)page.close();throw error}
 }
 async function shareEmail(id,name){
   const {url}=await createThirdPartyAccess(id,'','', 'email');
   const title=name||'Diseño 3D';
   const subject='ESKALA Studio · '+title;
   const body='Te comparto «'+title+'» para que puedas verlo y recorrerlo en 3D con ESKALA Studio.\n\n'+url;
   location.href='mailto:?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
   return url;
 }
 async function activeViewerDesign(access,id,shareSecret=''){
   if(!['director','invitado','demo-invitado'].includes(access))throw Error('Acceso no válido');
   if(access==='director')return (await list('director',true)).find(m=>m.id===id&&m.status==='active')||null;
   if(access==='demo-invitado')return await catalogModel(id,true);
   if(!await verifyThirdParty(id,shareSecret,true))return null;
   return await catalogModel(id,true);
 }
 async function loadViewer(access,id,shareSecret=''){
   const model=await activeViewerDesign(access,id,shareSecret);
   if(!model)throw Object.assign(Error('Este enlace ya no está disponible o ha sido revocado.'),{code:'DESIGN_WITHDRAWN'});
   return {meta:model,url:new URL(model.archivo,location.href).href};
 }
 function watchViewer(access,id,shareSecret,onWithdrawn){
   let checking=false, stopped=false;
   async function check(){
     if(checking||stopped||document.hidden)return;
     checking=true;
     try{
       if(await activeViewerDesign(access,id,shareSecret))return;
       stopped=true;
       clearInterval(timer);
       document.removeEventListener('visibilitychange',check);
       window.removeEventListener('focus',check);
       window.removeEventListener('pageshow',check);
       onWithdrawn();
     }catch(error){
       // Un fallo de conexión no equivale a retirar el diseño.
       console.warn('No se pudo comprobar la disponibilidad del diseño.',error);
     }finally{checking=false}
   }
   const timer=setInterval(check,refreshInterval);
   document.addEventListener('visibilitychange',check);
   window.addEventListener('focus',check);
   window.addEventListener('pageshow',check);
 }
 function removalUrl(m){const u=new URL('https://github.com/'+repo+'/issues/new');u.searchParams.set('title','[Dirección] Retirar diseño '+m.id);u.searchParams.set('body','Solicito retirar de la biblioteca de dirección el diseño '+m.nombre+'.\n\nIdentificador: '+m.id+'\nVersión: '+m.updated);return u.href}
 window.FusionDistribution={version:7,demo:false,publicFiles:true,configureAdmin,configureStoredAdmin,list,send,setStatus,viewer,share,shareWhatsApp,shareEmail,listThirdParty,createThirdPartyAccess,setThirdPartyStatus,deleteThirdPartyAccess,loadViewer,watchViewer,refreshInterval,hide,removalUrl};
})();