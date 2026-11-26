/* Distribución sincronizada por GitHub. No constituye control de acceso a archivos públicos. */
(()=>{
 const repo='romanfreebiker/fusion-vr-studio',api='https://api.github.com/repos/'+repo;
 const path='distribucion.json', branch='main';
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
 async function published(force){
   const [distribution,catalog]=await Promise.all([publicRead(path,force),publicRead('catalogo.json',force)]);
   const present=new Set(catalog.modelos.map(model=>model.id));
   return distribution.modelos.filter(model=>present.has(model.id));
 }
 function configureAdmin(getToken){adminToken=getToken}
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
   const manifestUrl=new URL('social/shares.json',location.href);
   const [rows,manifest]=await Promise.all([
     list('admin',true),
     fetch(manifestUrl,{cache:'no-store'}).then(response=>response.ok?response.json():null).catch(()=>null),
   ]);
   const model=rows.find(item=>item.id===id&&item.status==='active');
   if(!model)throw Error('Este diseño ya no está disponible para compartir.');
   const entry=manifest?.version===1&&manifest.designs?.[id];
   if(entry&&entry.updated===model.updated){
     if(typeof entry.shortPath==='string'&&/^s\/[a-z2-7]{8}\/$/.test(entry.shortPath)){
       if(typeof entry.shortUrl==='string'&&/^https:\/\/is\.gd\/[a-zA-Z0-9_]{5,10}$/.test(entry.shortUrl)){
         return entry.shortUrl;
       }
       return new URL(entry.shortPath,location.href).href;
     }
     const prefix='p/'+id.split('-').at(-1)+'/';
     if(typeof entry.path==='string'&&entry.path.startsWith(prefix)&&/^[a-f0-9]{12}\/$/.test(entry.path.slice(prefix.length))){
       return new URL(entry.path,location.href).href;
     }
   }
   throw Error('La tarjeta ESKALA de este diseño aún no está publicada. Vuelve a intentarlo cuando esté disponible.');
 }
 async function shareWhatsApp(id,name){
   const page=window.open('about:blank','_blank');
   try{
     const url=await share(id);
     const message='ESKALA Studio · '+(name||'Diseño 3D')+'\n'+url;
     const target='https://wa.me/?text='+encodeURIComponent(message);
     if(page){page.opener=null;page.location.replace(target);}else window.location.assign(target);
   }catch(error){if(page)page.close();throw error}
 }
 async function shareEmail(id,name){
   const url=await share(id);
   const title=name||'Diseño 3D';
   const subject='ESKALA Studio · '+title;
   const body='Te comparto «'+title+'» para que puedas verlo y recorrerlo en 3D con ESKALA Studio.\n\n'+url;
   location.href='mailto:?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
 }
 async function activeViewerDesign(access,id){
   if(!['director','invitado','demo-invitado'].includes(access))throw Error('Acceso no válido');
   const role=access==='director'?'director':'admin';
   return (await list(role,true)).find(m=>m.id===id&&m.status==='active');
 }
 async function loadViewer(access,id){
   const model=await activeViewerDesign(access,id);
   if(!model)throw Object.assign(Error('Este diseño ya no está disponible.'),{code:'DESIGN_WITHDRAWN'});
   return {meta:model,url:new URL(model.archivo,location.href).href};
 }
 function watchViewer(access,id,onWithdrawn){
   let checking=false, stopped=false;
   async function check(){
     if(checking||stopped||document.hidden)return;
     checking=true;
     try{
       if(await activeViewerDesign(access,id))return;
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
 window.FusionDistribution={version:4,demo:false,publicFiles:true,configureAdmin,list,send,setStatus,viewer,share,shareWhatsApp,shareEmail,loadViewer,watchViewer,refreshInterval,hide,removalUrl};
})();