/* ESKALA Taller: assignment routing only; private storage/auth pending. */
(()=>{
 const repo='romanfreebiker/fusion-vr-studio', api='https://api.github.com/repos/'+repo+'/contents/taller.json';
 const raw='https://raw.githubusercontent.com/'+repo+'/main/';
 const phases=['Pendiente','En fabricación','Fabricado','En instalación','Finalizado'];
 const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
 const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
 async function read(file){const r=await fetch(raw+file+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('No se pudo cargar '+file);return r.json()}
 async function data(){const d=await read('taller.json');if(!Array.isArray(d.workers)||!Array.isArray(d.jobs))throw Error('Datos de taller no válidos');return d}
 async function worker(key){if(!/^[a-f0-9]{48}$/.test(key||''))throw Error('Enlace de operario no válido');const [d,h,c]=await Promise.all([data(),hash(key),read('catalogo.json')]);const w=d.workers.find(x=>x.hash===h&&x.active);if(!w)throw Error('Acceso de operario retirado');const jobs=d.jobs.filter(j=>j.worker===w.id).map(j=>({...j,model:c.modelos.find(m=>m.id===j.design)})).filter(j=>j.model);return {w,jobs}}
 function link(key){const u=new URL('taller.html',location.href);u.hash=key;return u.href}
 function viewer(key,id){const u=new URL('visor-taller.html',location.href);u.searchParams.set('modo','presentacion');u.searchParams.set('acceso','taller');u.searchParams.set('diseno',id);u.hash=key;return u.href}
 async function change(token,fn){if(!token)throw Error('Conecta GitHub en Gestión');for(let i=0;i<3;i++){const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json'};const r=await fetch(api+'?ref=main',{headers,cache:'no-store'});if(!r.ok)throw Error('GitHub '+r.status);const f=await r.json();const d=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(f.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));await fn(d);const bytes=new TextEncoder().encode(JSON.stringify(d,null,2)+'\n');let str='';for(let j=0;j<bytes.length;j+=8192)str+=String.fromCharCode(...bytes.subarray(j,j+8192));const put=await fetch(api,{method:'PUT',headers,body:JSON.stringify({message:'ESKALA: actualizar taller',branch:'main',sha:f.sha,content:btoa(str)})});if(put.ok)return d;if(put.status!==409)throw Error('GitHub '+put.status)}throw Error('Cambios simultáneos: reintenta')}
 window.EskalaTaller={data,worker,link,viewer,change,hash,secret,phases};
})();