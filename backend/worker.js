// Cloudflare Worker: D1 + private R2. Never publish the R2 bucket.
const schema=[
"CREATE TABLE IF NOT EXISTS designs (id TEXT PRIMARY KEY, meta TEXT NOT NULL, status TEXT NOT NULL)",
"CREATE TABLE IF NOT EXISTS shares (token TEXT PRIMARY KEY, id TEXT NOT NULL, created INTEGER NOT NULL)"
];
export default {async fetch(req,env){
 const origin=req.headers.get('Origin'), allowed=env.APP_ORIGIN;
 const cors={'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,OPTIONS','Vary':'Origin','Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
 const response=(body,status=200,headers={})=>new Response(body,{status,headers:{...cors,...headers}});
 const json=(obj,status=200)=>response(JSON.stringify(obj),status,{'Content-Type':'application/json'});
 if(origin&&origin!==allowed)return response('Origen no autorizado',403);
 if(req.method==='OPTIONS')return response(null,204);
 const parts=new URL(req.url).pathname.split('/').filter(Boolean).map(decodeURIComponent), [role,resource,id,action]=parts;
 const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(x);
 const authorize=r=>{const secret=r==='admin'?env.ADMIN_SECRET:env.DIRECTOR_SECRET;return typeof secret==='string'&&secret.length>=24&&req.headers.get('Authorization')==='Bearer '+secret;};
 try{
  await env.DB.batch(schema.map(q=>env.DB.prepare(q)));
  if(role==='session'&&req.method==='GET'&&['admin','director'].includes(resource))return authorize(resource)?json({ok:true}):response('Clave incorrecta',401);
  if(role==='guest'){
   if(req.method!=='GET'||!resource||!/^[a-f0-9]{64}$/.test(resource))return response('Enlace inválido',404);
   const row=await env.DB.prepare("SELECT d.* FROM shares s JOIN designs d ON d.id=s.id WHERE s.token=? AND d.status='active'").bind(resource).first();
   if(!row)return response('Enlace retirado o no disponible',404);
   if(id==='file'){const file=await env.MODELS.get(row.id);return file?response(file.body,200,{'Content-Type':'model/gltf-binary'}):response('Archivo no disponible',404)}
   if(!id)return json(JSON.parse(row.meta));return response('Ruta no válida',404);
  }
  if(!['admin','director'].includes(role)||!authorize(role))return response('No autorizado',401);
  if(resource!=='designs')return response('Ruta no válida',404);
  if(!id&&req.method==='GET'){const result=await env.DB.prepare(role==='admin'?'SELECT * FROM designs':"SELECT * FROM designs WHERE status='active'").all();return json({designs:result.results.map(r=>({...JSON.parse(r.meta),status:r.status}))})}
  if(!validId(id))return response('Identificador no válido',400);
  const row=await env.DB.prepare('SELECT * FROM designs WHERE id=?').bind(id).first();
  if(role==='admin'&&req.method==='PUT'&&action==='file'){if(!req.body)return response('Archivo vacío',400);await env.MODELS.put(id,req.body);return json({ok:true})}
  if(role==='admin'&&req.method==='PUT'&&!action){const m=await req.json();if(m.id!==id||typeof m.nombre!=='string'||!await env.MODELS.head(id))return response('Modelo incompleto',400);const meta={id,nombre:m.nombre.slice(0,200),descripcion:String(m.descripcion||'').slice(0,2000),categoria:String(m.categoria||'').slice(0,200)};await env.DB.prepare("INSERT INTO designs(id,meta,status) VALUES(?,?,'active') ON CONFLICT(id) DO UPDATE SET meta=excluded.meta,status='active'").bind(id,JSON.stringify(meta)).run();return json({ok:true})}
  if(!row||row.status!=='active'&&role==='director')return response('Diseño no disponible',404);
  if(req.method==='PATCH'&&!action){const {status}=await req.json();if(role==='director'&&status!=='inactive'||role==='admin'&&!['inactive','active','revoked'].includes(status))return response('Acción no permitida',403);
    if(status==='revoked'){await env.DB.batch([env.DB.prepare('DELETE FROM shares WHERE id=?').bind(id),env.DB.prepare('DELETE FROM designs WHERE id=?').bind(id)]);await env.MODELS.delete(id)}
    else{await env.DB.batch([env.DB.prepare('UPDATE designs SET status=? WHERE id=?').bind(status,id),...(status==='inactive'?[env.DB.prepare('DELETE FROM shares WHERE id=?').bind(id)]:[])])}return json({ok:true})}
  if(role==='director'&&req.method==='POST'&&action==='share'){const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');await env.DB.prepare('INSERT INTO shares(token,id,created) VALUES(?,?,?)').bind(token,id,Date.now()).run();return json({token})}
  if(req.method==='GET'&&!action)return json(JSON.parse(row.meta));
  if(req.method==='GET'&&action==='file'){const file=await env.MODELS.get(id);return file?response(file.body,200,{'Content-Type':'model/gltf-binary'}):response('Archivo no disponible',404)}
  return response('Acción no permitida',405);
 }catch(e){console.error(e);return response('Error del servidor de distribución',500)}
}};
