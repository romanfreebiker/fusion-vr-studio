const REPO='romanfreebiker/fusion-vr-studio';
const BRANCH='main';
const RAW='https://raw.githubusercontent.com/'+REPO+'/'+BRANCH+'/';

const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...extra}});
const cors=origin=>({
  'access-control-allow-origin':origin||'https://romanfreebiker.github.io',
  'access-control-allow-methods':'GET,POST,OPTIONS',
  'access-control-allow-headers':'authorization,content-type',
  'vary':'Origin'
});
const sha256=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(v);

async function publicJson(path){
  const r=await fetch(RAW+path+'?t='+Date.now(),{cache:'no-store'});
  if(!r.ok)throw Error(path+' '+r.status);
  return r.json();
}
async function validateTablet(request){
  const auth=request.headers.get('authorization')||'';
  const key=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!/^[a-f0-9]{48}$/.test(key))return null;
  const d=await publicJson('taller.json');
  const access=d.tablet||d.central;
  if(!access?.active)return null;
  const h=await sha256(key);
  return h===access.hash?{key,data:d}:null;
}
async function githubRead(env){
  const r=await fetch('https://api.github.com/repos/'+REPO+'/contents/taller.json?ref='+BRANCH,{
    headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json','User-Agent':'ESKALA-Taller-API'},
    cache:'no-store'
  });
  if(!r.ok)throw Error('GitHub read '+r.status);
  const f=await r.json();
  const text=decodeURIComponent(escape(atob(f.content.replace(/\s/g,''))));
  return {sha:f.sha,data:JSON.parse(text)};
}
async function githubWrite(env,sha,data){
  const bytes=new TextEncoder().encode(JSON.stringify(data,null,2)+'\n');
  let bin=''; for(let i=0;i<bytes.length;i+=8192)bin+=String.fromCharCode(...bytes.subarray(i,i+8192));
  const r=await fetch('https://api.github.com/repos/'+REPO+'/contents/taller.json',{
    method:'PUT',
    headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'ESKALA-Taller-API'},
    body:JSON.stringify({message:'ESKALA: actualizar Taller desde Tablet',branch:BRANCH,sha,content:btoa(bin)})
  });
  if(!r.ok){const e=new Error('GitHub write '+r.status);e.status=r.status;throw e}
  return r.json();
}
function ensureArrays(d){if(!Array.isArray(d.workers))d.workers=[];if(!Array.isArray(d.jobs))d.jobs=[];if(!Array.isArray(d.tabletJobs))d.tabletJobs=[]}
function activeWorker(d,id){return d.workers.find(w=>w.id===id&&w.active)}
function normalizeJob(body,existing={}){
  const types=['Fabricación','Instalación','Fabricación e instalación'];
  const priorities=['Normal','Alta','Urgente'];
  const phases=['Pendiente','En fabricación','Fabricado','En instalación','Finalizado'];
  return {
    type:types.includes(body.type)?body.type:(existing.type||'Fabricación e instalación'),
    priority:priorities.includes(body.priority)?body.priority:(existing.priority||'Normal'),
    phase:phases.includes(body.phase)?body.phase:(existing.phase||'Pendiente'),
    note:String(body.note??existing.note??'').trim().slice(0,500)
  };
}
async function applyAction(env,body){
  for(let attempt=0;attempt<3;attempt++){
    const {sha,data:d}=await githubRead(env);ensureArrays(d);
    const design=String(body.design||'');
    if(!validId(design))return {error:'Diseño no válido',status:400};
    const catalog=await publicJson('catalogo.json');
    if(!catalog.modelos?.some(m=>m.id===design))return {error:'Diseño no disponible',status:404};

    if(body.action==='assign'){
      if(!activeWorker(d,body.worker))return {error:'Operario no disponible',status:400};
      const prev=d.jobs.find(j=>j.design===design);
      const meta=normalizeJob(body,prev||{});
      d.jobs=d.jobs.filter(j=>j.design!==design);
      d.tabletJobs=d.tabletJobs.filter(j=>j.design!==design);
      d.jobs.push({worker:body.worker,design,...meta});
    }else if(body.action==='update'){
      const row=d.jobs.find(j=>j.design===design);
      if(!row)return {error:'Trabajo no asignado',status:404};
      if(body.worker&&body.worker!==row.worker){
        if(!activeWorker(d,body.worker))return {error:'Operario no disponible',status:400};
        row.worker=body.worker;
      }
      Object.assign(row,normalizeJob(body,row));
    }else if(body.action==='unassign'){
      const current=d.jobs.find(j=>j.design===design);
      if(!current)return {error:'Trabajo no asignado',status:404};
      d.jobs=d.jobs.filter(j=>j.design!==design);
      if(!d.tabletJobs.some(j=>j.design===design))d.tabletJobs.push({design,addedAt:new Date().toISOString()});
    }else if(body.action==='remove'){
      d.jobs=d.jobs.filter(j=>j.design!==design);
      d.tabletJobs=d.tabletJobs.filter(j=>j.design!==design);
    }else{
      return {error:'Acción no permitida',status:400};
    }
    try{await githubWrite(env,sha,d);return {data:d,status:200}}
    catch(e){if(e.status!==409||attempt===2)throw e}
  }
}
export default {
 async fetch(request,env){
  const origin=request.headers.get('Origin')||'';
  const allowed=origin===''||origin==='https://romanfreebiker.github.io'||origin==='https://romanfreebiker.github.io/';
  const headers=cors(origin||'https://romanfreebiker.github.io');
  if(!allowed)return json({error:'Origen no autorizado'},403,headers);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  const url=new URL(request.url);
  if(url.pathname==='/health')return json({service:'ESKALA Taller API',ready:true},200,headers);
  if(url.pathname!=='/api/taller/action'||request.method!=='POST')return json({error:'Ruta no válida'},404,headers);
  if(!env.GITHUB_TOKEN)return json({error:'Servicio sin configurar'},503,headers);
  let auth;
  try{auth=await validateTablet(request)}catch{return json({error:'No se pudo validar la Tablet'},503,headers)}
  if(!auth)return json({error:'Acceso de Tablet no válido'},401,headers);
  let body;try{body=await request.json()}catch{return json({error:'Solicitud no válida'},400,headers)}
  try{const result=await applyAction(env,body);return json(result.error?{error:result.error}:{ok:true},result.status,headers)}
  catch(e){console.error(e);return json({error:'No se pudo guardar el cambio'},500,headers)}
 }
};
