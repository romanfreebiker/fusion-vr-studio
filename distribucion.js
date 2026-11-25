/* Distribution API: set api to your deployed Worker URL. Empty = local demo only. */
(() => {
 const api=''; // e.g. https://fusion-distribution.example.workers.dev
 const demo=!api, key='fusion-distribution-demo-v1', authKey='fusion-distribution-session-v1';
 const read=()=>{try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return {}}};
 const save=d=>{localStorage.setItem(key,JSON.stringify(d));window.dispatchEvent(new Event('fusion-distribution-change'))};
 const session=()=>{try{return JSON.parse(sessionStorage.getItem(authKey)||'null')}catch{return null}};
 async function call(path,{method='GET',body,role,raw=false}={}){
   const headers={};const s=session();
   if(role){if(!s||s.role!==role)throw Error('Inicia sesión como '+(role==='admin'?'administrador':'dirección'));headers.Authorization='Bearer '+s.secret;}
   if(body&&!raw)headers['Content-Type']='application/json';
   const r=await fetch(api.replace(/\/$/,'')+path,{method,headers,body:raw?body:body?JSON.stringify(body):undefined,cache:'no-store'});
   if(!r.ok)throw Error((await r.text()).slice(0,300)||'Error de conexión');return r;
 }
 async function login(role){if(demo)return;const s=session();if(s?.role===role)return;const secret=prompt(role==='admin'?'Clave de administración':'Clave de dirección');if(!secret)throw Error('Sesión cancelada');sessionStorage.setItem(authKey,JSON.stringify({role,secret}));try{await call('/session/'+role,{role})}catch(e){sessionStorage.removeItem(authKey);throw e}}
 const safe=m=>({id:m.id,nombre:m.nombre||'Diseño',descripcion:m.descripcion||'',categoria:m.categoria||'',archivo:m.archivo,miniatura:m.miniatura||''});
 async function list(role){if(demo){const rows=Object.values(read());return role==='director'?rows.filter(x=>x.status==='active'):rows}await login(role);return (await (await call('/'+role+'/designs',{role})).json()).designs}
 async function send(m){if(demo){const d=read();d[m.id]={...safe(m),status:'active'};save(d);return}await login('admin');const r=await fetch(new URL(m.archivo,location.href));if(!r.ok)throw Error('No se pudo leer el GLB');await call('/admin/designs/'+encodeURIComponent(m.id)+'/file',{method:'PUT',body:await r.blob(),raw:true,role:'admin'});await call('/admin/designs/'+encodeURIComponent(m.id),{method:'PUT',body:safe(m),role:'admin'})}
 async function setStatus(id,status,role){if(demo){const d=read();if(!d[id])return;if(status==='revoked')delete d[id];else d[id].status=status;save(d);return}await login(role);await call('/'+role+'/designs/'+encodeURIComponent(id),{method:'PATCH',body:{status},role})}
 function viewer(id,role){const u=new URL('visor.html',location.href);u.searchParams.set('modo','presentacion');u.searchParams.set('diseno',id);u.searchParams.set('acceso',role);u.searchParams.set('v','83');return u}
 async function share(id){if(demo)return viewer(id,'demo-invitado').href;await login('director');const r=await (await call('/director/designs/'+encodeURIComponent(id)+'/share',{method:'POST',role:'director'})).json();const u=new URL('visor.html',location.href);u.searchParams.set('modo','presentacion');u.searchParams.set('acceso','invitado');u.searchParams.set('token',r.token);u.searchParams.set('v','83');return u.href}
 async function loadViewer(access,id,token){if(demo){if(access==='director'){const m=read()[id];if(!m||m.status!=='active')throw Error('Diseño no disponible en dirección');return {meta:m,url:new URL(m.archivo,location.href).href}}if(access==='demo-invitado'){const r=await fetch('catalogo.json',{cache:'no-store'});const m=(await r.json()).modelos.find(x=>x.id===id);if(!m)throw Error('Diseño no disponible');return {meta:m,url:new URL(m.archivo,location.href).href}}throw Error('Acceso no configurado')}
   if(access==='director'){await login('director');const p='/director/designs/'+encodeURIComponent(id);const meta=await (await call(p,{role:'director'})).json();const file=await call(p+'/file',{role:'director'});return {meta,url:URL.createObjectURL(await file.blob())}}
   if(access==='invitado'){if(!token)throw Error('Enlace inválido');const p='/guest/'+encodeURIComponent(token);const meta=await (await call(p)).json();return {meta,url:api.replace(/\/$/,'')+p+'/file'}}
   throw Error('Acceso no válido')
 }
 window.FusionDistribution={demo,list,send,setStatus,viewer,share,loadViewer,login};
})();
