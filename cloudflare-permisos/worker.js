// ESKALA permission service. Credentials are never stored in public GitHub files.
const origin='https://romanfreebiker.github.io';
const raw='https://raw.githubusercontent.com/romanfreebiker/fusion-vr-studio/main/';
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const equal=async(a,b)=>{if(!a||!b)return false;const x=await hash(a),y=await hash(b);let d=0;for(let i=0;i<x.length;i++)d|=x.charCodeAt(i)^y.charCodeAt(i);return d===0};
const schema=[
'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
'CREATE TABLE IF NOT EXISTS shares (id TEXT PRIMARY KEY, designId TEXT NOT NULL, origin TEXT NOT NULL, recipient TEXT, channel TEXT, tokenHash TEXT UNIQUE NOT NULL, createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL, revokedAt INTEGER)',
'CREATE INDEX IF NOT EXISTS shares_design ON shares(designId,origin)',
'CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL)',
'CREATE TABLE IF NOT EXISTS hidden (designId TEXT PRIMARY KEY, revision TEXT NOT NULL)',
'CREATE TABLE IF NOT EXISTS pending_send (id TEXT PRIMARY KEY, hours REAL NOT NULL, deadline INTEGER NOT NULL)'
];
const shortToken=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pages=origin+'/fusion-vr-studio/';
const iso=n=>new Date(n).toISOString();
const view=r=>({id:r.id,designId:r.designId,origin:r.origin,recipient:r.recipient,channel:r.channel,createdAt:iso(r.createdAt),expiresAt:iso(r.expiresAt),status:r.revokedAt?'revoked':'active',effectiveStatus:r.revokedAt?'revoked':r.expiresAt<=Date.now()?'expired':'active'});
async function jsonFile(name){const r=await fetch(raw+name+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('catalog unavailable');return r.json()}
export default {async fetch(request,env){
 const url=new URL(request.url),path=url.pathname,method=request.method;
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Vary':'Origin'};
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(method==='OPTIONS')return new Response(null,{status:204,headers}); 
 // Public preview is independent of database and credentials. It contains only the
 // approved generic branding; actual viewer access is verified on /open and /verify.
 const publicToken=/^\/(?:[A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22})$/.test(path);
 if((method==='GET'||method==='HEAD')&&publicToken){
   const image=esc(url.origin+'/card-wa.jpg');
   const dest=esc(url.origin+'/open'+path);
   const canonical=esc(url.origin+path);
   const html='<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta property="og:title" content="ESKALA · Visor 3D"><meta property="og:description" content="Acceso temporal al diseño interactivo"><meta property="og:url" content="'+canonical+'"><meta property="og:image" content="'+image+'"><meta property="og:image:secure_url" content="'+image+'"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1672"><meta property="og:image:height" content="941"><meta property="og:type" content="website"><meta property="og:site_name" content="ESKALA"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="ESKALA · Visor 3D"><meta name="twitter:image" content="'+image+'"><title>ESKALA · Visor 3D</title></head><body style="background:#151e26;color:white;font:16px system-ui;text-align:center;padding:30px"><a id="open" style="color:#8ee9fd" href="'+dest+'">Abrir visor ESKALA</a><script>location.replace(document.getElementById("open").href)</script></body></html>';
   return new Response(method==='HEAD'?null:html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
 }
 if((method==='GET'||method==='HEAD')&&path==='/card-wa.jpg'){
   try{
     const img=await fetch(raw+'social/acceso-eskala-wa.jpg',{method,cf:{cacheTtl:3600,cacheEverything:true}});
     if(!img.ok)return new Response(null,{status:503,headers:{'Cache-Control':'no-store'}});
     return new Response(method==='HEAD'?null:img.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'}});
   }catch{return new Response(null,{status:503,headers:{'Cache-Control':'no-store'}});}
 }

 if(request.headers.get('Origin')&&request.headers.get('Origin')!==origin)return reply({error:'Origen no autorizado'},403);
 try{
 if(!env.DB||!env.ADMIN_SECRET||!env.DIRECTOR_SECRET)return reply({error:'Configuración incompleta'},503);
 if(await equal(env.ADMIN_SECRET,env.DIRECTOR_SECRET))return reply({error:'Claves deben ser diferentes'},503);
 if(path==='/health'&&method==='GET'){await env.DB.prepare('SELECT 1').first();await env.DB.batch(schema.map(s=>env.DB.prepare(s)));const active=await env.DB.prepare("SELECT value FROM settings WHERE key='legacy_imported'").first();return reply({service:'eskala-permisos',version:171,ready:!!active,database:true})}
 await env.DB.batch(schema.map(s=>env.DB.prepare(s)));
 if(method==='GET'&&/^\/open\/(?:[A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22})$/.test(path)){
 const token=path.slice('/open/'.length),r=await env.DB.prepare('SELECT * FROM shares WHERE tokenHash=? AND revokedAt IS NULL AND expiresAt>?').bind(await hash(token),Date.now()).first();
 const retired=()=>Response.redirect(pages+'retirado.html',302);
 if(!r)return retired();
 const [catalog,manifest]=await Promise.all([jsonFile('catalogo.json'),jsonFile('social/shares.json').catch(()=>null)]);
 const m=catalog.modelos.find(x=>x.id===r.designId);if(!m)return retired();
 const entry=manifest?.designs?.[r.designId];const short=entry?.shortPath;
 const validPath=typeof short==='string'&&/^s\/[a-z2-7]{8}\/$/.test(short);
 const target=new URL(validPath?short:'visor.html',pages);
 if(validPath)target.hash='share='+token;else{target.searchParams.set('modo','presentacion');target.searchParams.set('diseno',r.designId);target.searchParams.set('acceso','invitado');target.searchParams.set('share',token);}
 const image=new URL('social/acceso-eskala.png',pages).href;
 const title=esc('ESKALA · Visor 3D'),dest=esc(target.href);
 const html='<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta property="og:title" content="'+title+'"><meta property="og:description" content="Acceso temporal · '+esc(m.nombre||'Diseño interactivo')+'"><meta property="og:image" content="'+esc(image)+'"><meta property="og:image:secure_url" content="'+esc(image)+'"><meta property="og:url" content="'+esc(url.origin+path)+'"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1672"><meta property="og:image:height" content="941"><meta property="og:type" content="website"><meta property="og:site_name" content="ESKALA Studio"><meta name="twitter:card" content="summary_large_image"><title>'+title+' · ESKALA Studio</title></head><body style="background:#151e26;color:white;font:16px system-ui;text-align:center;padding:30px"><p>Abriendo ESKALA Studio…</p><a id="open" style="color:#8ee9fd" href="'+dest+'">Abrir diseño 3D</a><script>location.replace(document.getElementById("open").href)</script></body></html>';
 return new Response(html,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
 }
 const bearer=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
 const key=await env.DB.prepare("SELECT value FROM settings WHERE key='direction_hash'").first();
 const bh=bearer?await hash(bearer):'';const session=bh?await env.DB.prepare('SELECT hash FROM sessions WHERE hash=? AND expires>?').bind(bh,Date.now()).first():null;
 const role=session?'central':bearer&&key&&bh===key.value?'direction':null;
 const body=method==='POST'?await request.json():{};
 if(path==='/login'&&method==='POST'){
 if(!await equal(String(body.password||''),env.ADMIN_SECRET))return reply({error:'Clave incorrecta'},403);
 const token=random();await env.DB.prepare('INSERT INTO sessions VALUES(?,?)').bind(await hash(token),Date.now()+30*86400000).run();return reply({token});
 }
 if(path==='/direction/rotate'&&method==='POST'){
 if(role!=='central')return reply({error:'Acceso denegado'},403);
 const token=random();await env.DB.prepare("INSERT INTO settings(key,value) VALUES('direction_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(await hash(token)).run();return reply({token});
 }
 if(path==='/direction/revoke'&&method==='POST'){if(role!=='central')return reply({error:'Acceso denegado'},403);await env.DB.prepare("DELETE FROM settings WHERE key='direction_hash'").run();return reply({ok:true})}
 if(path==='/direction/list'&&method==='GET'){
 if(role!=='direction'&&role!=='central')return reply({error:'Enlace de Dirección no autorizado'},403);
 const [d,c,h]=await Promise.all([jsonFile('distribucion.json'),jsonFile('catalogo.json'),env.DB.prepare('SELECT * FROM hidden').all()]);
 return reply({modelos:d.modelos.filter(m=>m.status==='active'&&c.modelos.some(x=>x.id===m.id)&&!h.results.some(x=>x.designId===m.id&&x.revision===String(m.updated||'')))});
 }
 if(path==='/direction/hide'&&method==='POST'){
 if(role!=='direction')return reply({error:'Acceso denegado'},403);
 const d=await jsonFile('distribucion.json'),m=d.modelos.find(x=>x.id===body.designId);if(!m)return reply({error:'Diseño inexistente'},404);
 await env.DB.prepare('INSERT INTO hidden VALUES(?,?) ON CONFLICT(designId) DO UPDATE SET revision=excluded.revision').bind(m.id,String(m.updated||'')).run();return reply({ok:true});
 }
 if(path==='/session'&&method==='GET')return role?reply({role}):reply({error:'Acceso denegado'},403);
 if(path==='/initialize'&&method==='POST'){
 if(role!=='central')return reply({error:'Acceso denegado'},403);
 const marker=await env.DB.prepare("SELECT value FROM settings WHERE key='legacy_imported'").first();if(marker)return reply({imported:true});
 const legacy=await jsonFile('terceros.json');
 if(!Array.isArray(legacy.accesses))throw Error('invalid legacy registry');
 const statements=legacy.accesses.filter(a=>a.id&&a.designId&&/^[a-f0-9]{64}$/.test(a.tokenHash)&&Number.isFinite(Date.parse(a.expiresAt))&&Number.isFinite(Date.parse(a.createdAt))).map(a=>env.DB.prepare('INSERT OR IGNORE INTO shares VALUES(?,?,?,?,?,?,?,?,?)').bind(a.id,a.designId,a.origin==='direction'?'direction':'central',String(a.recipient||''),String(a.channel||'link'),a.tokenHash,Date.parse(a.createdAt),Date.parse(a.expiresAt),a.status==='revoked'?Date.parse(a.revokedAt)||Date.now():null));
 statements.push(env.DB.prepare("INSERT OR IGNORE INTO settings VALUES('legacy_imported','1')"));await env.DB.batch(statements);return reply({imported:true});
 }
 const initialized=await env.DB.prepare("SELECT value FROM settings WHERE key='legacy_imported'").first();if(!initialized)return reply({error:'Migración pendiente'},503);
 if(path==='/verify'&&method==='POST'){
 if(typeof body.token!=='string'||body.token.length>128)return reply({valid:false});
 const r=await env.DB.prepare('SELECT * FROM shares WHERE designId=? AND tokenHash=? AND revokedAt IS NULL AND expiresAt>? AND NOT EXISTS (SELECT 1 FROM pending_send p WHERE p.id=shares.id)').bind(String(body.designId||''),await hash(body.token),Date.now()).first();
 const catalog=r?await jsonFile('catalogo.json'):null;return reply({valid:!!r&&catalog.modelos.some(m=>m.id===r.designId)});
 }
 if(!role)return reply({error:'Acceso denegado'},403);
 if(path==='/shares/list'&&method==='POST'){
 const id=String(body.designId||'');
 if(role==='direction'){const d=await jsonFile('distribucion.json');const h=await env.DB.prepare('SELECT revision FROM hidden WHERE designId=?').bind(id).first();if(!id||!d.modelos.some(m=>m.id===id&&m.status==='active'&&(!h||h.revision!==String(m.updated||''))))return reply({error:'Diseño no autorizado'},403);}
 const result=await env.DB.prepare('SELECT * FROM shares WHERE (? = \'\' OR designId=?) AND NOT EXISTS (SELECT 1 FROM pending_send p WHERE p.id=shares.id) ORDER BY createdAt DESC').bind(id,id).all();return reply({accesses:result.results.map(r=>role==='direction'&&r.origin==='central'?{...view(r),recipient:'Acceso de Central'}:view(r))});
 }
 if(path==='/shares/create'&&method==='POST'){
 const designId=String(body.designId||''),hours=Number(body.hours);
 if(!designId||!Number.isFinite(hours)||hours<1||hours>720)return reply({error:'Datos no válidos'},400);
 const catalog=await jsonFile('catalogo.json');if(!catalog.modelos.some(m=>m.id===designId))return reply({error:'Diseño no disponible'},404);
 if(role==='direction'){const d=await jsonFile('distribucion.json');const h=await env.DB.prepare('SELECT revision FROM hidden WHERE designId=?').bind(designId).first();if(!d.modelos.some(m=>m.id===designId&&m.status==='active'&&(!h||h.revision!==String(m.updated||''))))return reply({error:'Diseño no autorizado'},403)}
 const token=shortToken(),now=Date.now(),id=crypto.randomUUID(),recipient=String(body.recipient||'').slice(0,80),channel=String(body.channel||'link').slice(0,20);
 const draft=body.pending===true;
 const row={id,designId,origin:role,recipient,channel,createdAt:now,expiresAt:now+(draft?24:hours)*3600000,revokedAt:null};
 const insert=env.DB.prepare('INSERT INTO shares VALUES(?,?,?,?,?,?,?,?,NULL)').bind(id,designId,role,recipient,channel,await hash(token),now,row.expiresAt);
 if(draft)await env.DB.batch([insert,env.DB.prepare('INSERT INTO pending_send VALUES(?,?,?)').bind(id,hours,row.expiresAt)]);else await insert.run();
 return reply({access:view(row),pending:draft,token,shortUrl:url.origin+'/'+token});
 }
 if(path==='/shares/confirm'&&method==='POST'){
 const id=String(body.id||''),now=Date.now();
 const result=await env.DB.batch([
 env.DB.prepare("UPDATE shares SET createdAt=?,expiresAt=?+(SELECT hours*3600000 FROM pending_send WHERE id=shares.id) WHERE id=? AND revokedAt IS NULL AND (?='central' OR origin='direction') AND EXISTS(SELECT 1 FROM pending_send WHERE id=shares.id AND deadline>?)").bind(now,now,id,role,now),
 env.DB.prepare("DELETE FROM pending_send WHERE id=? AND deadline>? AND EXISTS(SELECT 1 FROM shares WHERE id=pending_send.id AND revokedAt IS NULL AND createdAt=? AND (?='central' OR origin='direction'))").bind(id,now,now,role)
 ]);
 if(!result[0].meta.changes){const existing=await env.DB.prepare("SELECT id FROM shares WHERE id=? AND revokedAt IS NULL AND expiresAt>? AND (?='central' OR origin='direction') AND NOT EXISTS(SELECT 1 FROM pending_send WHERE id=shares.id)").bind(id,now,role).first();if(!existing)return reply({error:'Envío pendiente caducado o no autorizado'},409)}
 return reply({ok:true});
 }
 if(path==='/shares/revoke'&&method==='POST'){
 const result=await env.DB.prepare("UPDATE shares SET revokedAt=COALESCE(revokedAt,?) WHERE id=? AND (?='central' OR origin='direction')").bind(Date.now(),String(body.id||''),role).run();return result.meta.changes?reply({ok:true}):reply({error:'Acceso inexistente o no autorizado'},404);
 }
 return reply({error:'Ruta no disponible'},404);
 }catch(e){console.error('ESKALA permission operation failed',e?.name);return reply({error:'Servicio de permisos no disponible'},503)}
}};
