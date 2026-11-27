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
   const pendingKey=(force?'fresh:':'')+file;
   if(pending.has(pendingKey))return pending.get(pendingKey);
   const task=(async()=>{
     let data;
     const token=adminToken?.()||storedAdminToken();
     if(force||token){
       try{
         const headers=token?{...readHeaders,Authorization:'Bearer '+token}:readHeaders;
         const result=await request(api+'/contents/'+file+'?ref='+branch+'&_='+now,{headers});
         data=decode(result.content);
       }catch(error){
         console.warn('ESKALA: lectura API no disponible; se usa lectura pública directa.',error);
       }
     }
     if(!data){
       try{data=await request(raw+file+'?revision='+now)}
       catch{
         const result=await request(api+'/contents/'+file+'?ref='+branch+'&_='+now,{headers:readHeaders});
         data=decode(result.content);
       }
     }
     if(!Array.isArray(data?.modelos))throw Error('Catálogo no válido: '+file);
     snapshots.set(file,{at:now,data});
     return data;
   })();
   pending.set(pendingKey,task);
   try{return await task}finally{pending.delete(pendingKey)}
 }
 async function readForWrite(token){
   const f=await request(api+'/contents/'+path+'?ref='+branch+'&_='+Date.now(),{headers:{...readHeaders,Authorization:'Bearer '+token}});
   const data=decode(f.content);
   if(!Array.isArray(data?.modelos))throw Error('Catálogo de distribución no válido');
   return {sha:f.sha,data};
 }
 async function readThird(force=false){
   const now=Date.now(),key='third:'+thirdPath,snapshot=snapshots.get(key);
   if(snapshot&&now-snapshot.at<5000)return snapshot.data;
   let data;
   const token=adminToken?.()||storedAdminToken();
   if(token){
     try{
       const result=await request(api+'/contents/'+thirdPath+'?ref='+branch+'&_='+now,{headers:{...readHeaders,Authorization:'Bearer '+token}});
       data=decode(result.content);
     }catch(error){
       console.warn('ESKALA: lectura autenticada de terceros no disponible; se usa lectura pública.',error);
     }
   }
   if(!data){
     try{data=await request(raw+thirdPath+'?revision='+now)}
     catch{
       const result=await request(api+'/contents/'+thirdPath+'?ref='+branch+'&_='+now,{headers:readHeaders});
       data=decode(result.content);
     }
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
       snapshots.set('third:'+thirdPath,{at:Date.now(),data:JSON.parse(JSON.stringify(data))});
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
   // 48 bits aleatorios: compacto para accesos temporales y suficientemente robusto.
   const bytes=crypto.getRandomValues(new Uint8Array(6));
   let s='';for(const b of bytes)s+=String.fromCharCode(b);
   return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 }
 function shortenExternal(longUrl){
   return new Promise((resolve,reject)=>{
     const callback='eskalaShort_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
     const script=document.createElement('script');
     const timer=setTimeout(()=>finish(null,Error('El acortador no respondió.')),9000);
     function finish(value,error){
       clearTimeout(timer);
       try{delete window[callback]}catch{}
       script.remove();
       if(error)reject(error);else resolve(value);
     }
     window[callback]=data=>{
       const short=data&&typeof data.shorturl==='string'?data.shorturl:'';
       if(/^https:\/\/is\.gd\/[A-Za-z0-9_]{5,30}$/.test(short))finish(short);
       else finish(null,Error(data?.errormessage||'No se pudo crear el enlace corto.'));
     };
     script.onerror=()=>finish(null,Error('No se pudo conectar con el acortador.'));
     script.src='https://is.gd/create.php?format=json&callback='+encodeURIComponent(callback)+'&url='+encodeURIComponent(longUrl);
     document.head.append(script);
   });
 }
 async function shareBase(id){
   const [model,manifest]=await Promise.all([
     catalogModel(id,true),
     fetch(new URL('social/shares.json',location.href),{cache:'no-store'}).then(response=>response.ok?response.json():null).catch(()=>null)
   ]);
   if(!model)throw Error('Este diseño ya no está disponible para compartir.');
   const entry=manifest?.version===1&&manifest.designs?.[id];
   if(!entry||entry.updated!==shareVersion(model))throw Error('La tarjeta ESKALA de este diseño aún no está publicada.');
   let base=null;
   if(typeof entry.shortPath==='string'&&/^s\/[a-z2-7]{8}\/$/.test(entry.shortPath))base=new URL(entry.shortPath,location.href);
   if(!base){
     const prefix='p/'+id.split('-').at(-1)+'/';
     if(typeof entry.path==='string'&&entry.path.startsWith(prefix)&&/^[a-f0-9]{12}\/$/.test(entry.path.slice(prefix.length)))base=new URL(entry.path,location.href);
   }
   if(!base)throw Error('No se encuentra el enlace ESKALA publicado.');
   const shortUrl=typeof entry.shortUrl==='string'&&/^https:\/\/is\.gd\/[A-Za-z0-9_]{5,30}$/.test(entry.shortUrl)?entry.shortUrl:'';
   return {base,shortUrl};
 }
 function thirdPartyState(row,now=Date.now()){
   if(!row)return 'expired';
   if(row.status==='revoked')return 'revoked';
   const expiry=Date.parse(row.expiresAt||'');
   if(Number.isFinite(expiry)&&expiry<=now)return 'expired';
   return 'active';
 }
 function thirdPartyRemaining(row,now=Date.now()){
   if(thirdPartyState(row,now)!=='active')return '';
   const expiry=Date.parse(row.expiresAt||'');
   if(!Number.isFinite(expiry))return '';
   const ms=Math.max(0,expiry-now),minutes=Math.ceil(ms/60000);
   if(minutes<60)return minutes+' min';
   const hours=Math.floor(minutes/60),mins=minutes%60;
   if(hours<24)return hours+' h'+(mins?' '+mins+' min':'');
   const days=Math.floor(hours/24),rest=hours%24;
   return days+' d'+(rest?' '+rest+' h':'');
 }
 async function listThirdParty(designId,force=false,scope='all'){
   const data=await readThird(force),now=Date.now();
   return data.accesses
     .filter(a=>a&&a.designId===designId&&thirdPartyState(a,now)==='active')
     .filter(a=>scope==='direction'?a.origin==='direction':true)
     .map(a=>({...a,effectiveStatus:'active',remaining:thirdPartyRemaining(a,now)}))
     .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
 }
 async function thirdPartySettings(force=false){
   const data=await readThird(force);
   const hours=Number(data.defaultTtlHours);
   return {defaultTtlHours:Number.isFinite(hours)&&hours>0?hours:24};
 }
 async function setThirdPartyTtlHours(hours){
   const value=Math.max(1,Math.min(24*30,Math.round(Number(hours)||24)));
   await writeThird(data=>{data.defaultTtlHours=value});
   return value;
 }
 function automaticRecipient(channel){
   const now=new Date();
   const date=now.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'});
   const time=now.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
   const label=channel==='whatsapp'?'WhatsApp':channel==='email'?'Correo':'Enlace';
   return label+' · '+date+' '+time;
 }
 async function createThirdPartyAccess(designId,recipient='',contact='',channel='link',ttlHours=24,origin='central'){
   const clean=String(recipient||automaticRecipient(channel)).trim().slice(0,80);
   const published=await shareBase(designId);
   const base=published.base;
   const secret=randomToken(),hash=await tokenHash(secret),nowMs=Date.now(),now=new Date(nowMs).toISOString();
   base.searchParams.set('share',secret);
   const longUrl=base.href;
   // Cada acceso recibe su propio is.gd corto, como en las versiones que
   // mostraban correctamente la miniatura en WhatsApp. El token queda oculto
   // en el destino del acortador y la pagina ESKALA conserva sus metadatos OG.
   let shareUrl;
   try{shareUrl=await shortenExternal(longUrl)}
   catch(error){throw Error('No se pudo crear el enlace corto de ESKALA. Vuelve a intentarlo.')}
   const hours=Math.max(1,Math.min(24*30,Number(ttlHours)||24));
   const access={id:'acc_'+nowMs.toString(36)+'_'+Math.random().toString(36).slice(2,8),designId,recipient:clean,contact:maskContact(contact),channel,origin:origin==='direction'?'direction':'central',tokenHash:hash,status:'active',createdAt:now,updatedAt:now,expiresAt:new Date(nowMs+hours*3600000).toISOString()};
   await writeThird(data=>data.accesses.push(access));
   return {access:{...access,effectiveStatus:'active',remaining:thirdPartyRemaining(access)},url:shareUrl};
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
 async function deactivateThirdPartyAccess(accessId,actor='central'){
   if(actor!=='direction')return deleteThirdPartyAccess(accessId);
   await writeThird(data=>{
     const i=data.accesses.findIndex(a=>a.id===accessId);
     if(i<0)throw Error('Ese acceso ya no existe.');
     if(data.accesses[i].origin!=='direction')throw Error('Dirección solo puede desactivar accesos creados desde Dirección.');
     data.accesses.splice(i,1);
   });
 }
 async function verifyThirdParty(designId,secret,force=false){
   if(!secret)return null;
   const hash=await tokenHash(secret),data=await readThird(force),now=Date.now();
   return data.accesses.find(a=>a.designId===designId&&a.tokenHash===hash&&thirdPartyState(a,now)==='active')||null;
 }
 async function write(change){const token=adminToken();if(!token)throw Error('Conecta tu cuenta de GitHub en Configuración para gestionar la distribución.');
   for(let i=0;i<3;i++){const {sha,data}=await readForWrite(token);change(data.modelos);try{await request(api+'/contents/'+path,{method:'PUT',headers:{...readHeaders,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sha,branch,message:'Actualizar distribución de diseños',content:encode(data)})});snapshots.delete(path);return}catch(e){if(e.status!==409||i===2)throw e}}
 }
 const hiddenKey='fusion-direction-hidden-v2';
 function hidden(){try{return JSON.parse(localStorage.getItem(hiddenKey)||'{}')}catch{return {}}}
 function clearHidden(){try{localStorage.removeItem(hiddenKey)}catch{}}
 function clearHiddenDesign(id){
   try{
     const h=hidden();
     if(Object.prototype.hasOwnProperty.call(h,id)){
       delete h[id];
       if(Object.keys(h).length)localStorage.setItem(hiddenKey,JSON.stringify(h));
       else localStorage.removeItem(hiddenKey);
     }
   }catch{}
 }
 async function list(role,force=false){const rows=await published(force);return role==='director'?rows.filter(m=>m.status==='active'):rows}
 async function send(m){
   await write(rows=>{const next={...safe(m),status:'active',updated:new Date().toISOString()};const i=rows.findIndex(x=>x.id===m.id);if(i<0)rows.push(next);else rows[i]=next});
   clearHiddenDesign(m.id);
   snapshots.delete(path);
 }
 async function setStatus(id,status,role){
   if(role==='director'&&status!=='inactive')throw Error('Dirección solo puede retirar diseños de su biblioteca.');
   if(!['admin','director'].includes(role))throw Error('Permiso de distribución no válido.');
   await write(rows=>{
     const i=rows.findIndex(x=>x.id===id);if(i<0)return;
     if(status==='revoked'&&role==='admin')rows.splice(i,1);
     else rows[i]={...rows[i],status,updated:new Date().toISOString()};
   });
 }
 async function migrateLegacyDirectionHidden(){
   const legacy=hidden(),ids=Object.keys(legacy||{});
   if(!ids.length)return 0;
   await write(rows=>{
     const now=new Date().toISOString();
     for(const id of ids){
       const i=rows.findIndex(x=>x.id===id);
       if(i>=0&&rows[i].status==='active')rows[i]={...rows[i],status:'inactive',updated:now};
     }
   });
   clearHidden();
   return ids.length;
 }
 function viewer(id,role){const u=new URL('visor.html',location.href);u.searchParams.set('modo','presentacion');u.searchParams.set('diseno',id);u.searchParams.set('acceso',role);u.searchParams.set('v','139');return u}
 async function share(id,origin='central'){
   return (await createThirdPartyAccess(id,'','', 'link',24,origin)).url;
 }
 async function shareWhatsApp(id,name,ttlHours=24,origin='central',recipient=''){
   const page=window.open('about:blank','_blank');
   try{
     const {url}=await createThirdPartyAccess(id,recipient,'', 'whatsapp',ttlHours,origin);
     const message='ESKALA Studio · '+(name||'Diseño 3D')+'\n'+url;
     const target='https://wa.me/?text='+encodeURIComponent(message);
     if(page){page.opener=null;page.location.replace(target);}else window.location.assign(target);
     return url;
   }catch(error){if(page)page.close();throw error}
 }
 async function shareEmail(id,name,origin='central'){
   const {url}=await createThirdPartyAccess(id,'','', 'email',24,origin);
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
 window.FusionDistribution={version:26,demo:false,publicFiles:true,configureAdmin,configureStoredAdmin,list,send,setStatus,viewer,share,shareWhatsApp,shareEmail,listThirdParty,thirdPartySettings,setThirdPartyTtlHours,createThirdPartyAccess,setThirdPartyStatus,deleteThirdPartyAccess,deactivateThirdPartyAccess,loadViewer,watchViewer,refreshInterval,migrateLegacyDirectionHidden};
})();