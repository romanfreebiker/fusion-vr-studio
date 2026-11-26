/* Distribución sincronizada por GitHub. No constituye control de acceso a archivos públicos. */
(()=>{
 const repo='romanfreebiker/fusion-vr-studio',api='https://api.github.com/repos/'+repo;
 const path='distribucion.json', branch='main';
 const readHeaders={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 let cached=null,pending=null,readAt=0,adminToken=()=>null;
 const safe=m=>({id:m.id,nombre:m.nombre||'Diseño',descripcion:m.descripcion||'',categoria:m.categoria||'',archivo:m.archivo,miniatura:m.miniatura||''});
 const decode=s=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g,'')),c=>c.charCodeAt(0))));
 const encode=o=>{const bytes=new TextEncoder().encode(JSON.stringify(o,null,2)+'\n');let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)};
 async function request(url,options={}){const r=await fetch(url,{cache:'no-store',...options});if(!r.ok){const e=Error('GitHub '+r.status);e.status=r.status;throw e}return r.json()}
 async function read(force=false,token=null){
   if(!force&&cached&&Date.now()-readAt<12000)return cached;
   if(!force&&pending)return pending;
   const task=(async()=>{const f=await request(api+'/contents/'+path+'?ref='+branch+'&_='+Date.now(),{headers:{...readHeaders,...(token?{Authorization:'Bearer '+token}:{})}});const data=decode(f.content);if(!Array.isArray(data.modelos))throw Error('Catálogo de distribución no válido');cached={sha:f.sha,data};readAt=Date.now();return cached})();
   if(!force)pending=task;
   try{return await task}finally{if(pending===task)pending=null}
 }
 function configureAdmin(getToken){adminToken=getToken}
 async function write(change){const token=adminToken();if(!token)throw Error('Conecta tu cuenta de GitHub en Configuración para gestionar la distribución.');
   for(let i=0;i<3;i++){const {sha,data}=await read(true,token);change(data.modelos);try{await request(api+'/contents/'+path,{method:'PUT',headers:{...readHeaders,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sha,branch,message:'Actualizar distribución de diseños',content:encode(data)})});cached={sha:null,data};readAt=Date.now();return}catch(e){if(e.status!==409||i===2)throw e}}
 }
 const hiddenKey='fusion-direction-hidden-v2';
 function hidden(){try{return JSON.parse(localStorage.getItem(hiddenKey)||'{}')}catch{return {}}}
 function hide(m){try{const h=hidden();h[m.id]=m.updated;localStorage.setItem(hiddenKey,JSON.stringify(h))}catch{}}
 function isHidden(m){return Object.prototype.hasOwnProperty.call(hidden(),m.id)&&hidden()[m.id]===m.updated}
 async function list(role,force=false){const {data}=await read(force);return role==='director'?data.modelos.filter(m=>m.status==='active'&&!isHidden(m)):data.modelos}
 async function send(m){await write(rows=>{const next={...safe(m),status:'active',updated:new Date().toISOString()};const i=rows.findIndex(x=>x.id===m.id);if(i<0)rows.push(next);else rows[i]=next})}
 async function setStatus(id,status,role){if(role!=='admin')throw Error('La retirada global debe confirmarse desde la central.');await write(rows=>{const i=rows.findIndex(x=>x.id===id);if(i<0)return;if(status==='revoked')rows.splice(i,1);else rows[i]={...rows[i],status,updated:new Date().toISOString()}})}
 function viewer(id,role){const u=new URL('visor.html',location.href);u.searchParams.set('modo','presentacion');u.searchParams.set('diseno',id);u.searchParams.set('acceso',role);u.searchParams.set('v','91');return u}
 async function share(id){const rows=await list('admin',true);if(!rows.some(m=>m.id===id&&m.status==='active'))throw Error('Diseño retirado de dirección');const short=new URL('v/'+id.split('-').at(-1)+'/',location.href);try{const r=await fetch(short,{method:'HEAD',cache:'no-store'});if(r.ok)return short.href}catch{}return viewer(id,'invitado').href}
 async function loadViewer(access,id){if(!['director','invitado','demo-invitado'].includes(access))throw Error('Acceso no válido');const m=(await list(access==='director'?'director':'admin',true)).find(x=>x.id===id&&x.status==='active');if(!m)throw Error('Este diseño ya no está disponible.');return {meta:m,url:new URL(m.archivo,location.href).href}}
 function removalUrl(m){const u=new URL('https://github.com/'+repo+'/issues/new');u.searchParams.set('title','[Dirección] Retirar diseño '+m.id);u.searchParams.set('body','Solicito retirar de la biblioteca de dirección el diseño '+m.nombre+'.\n\nIdentificador: '+m.id+'\nVersión: '+m.updated);return u.href}
 window.FusionDistribution={version:3,demo:false,publicFiles:true,configureAdmin,list,send,setStatus,viewer,share,loadViewer,hide,removalUrl};
})();