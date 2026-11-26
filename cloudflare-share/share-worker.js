// ESKALA: server-side WhatsApp/email previews. Publish on Cloudflare Workers.
const RAW="https://raw.githubusercontent.com/romanfreebiker/fusion-vr-studio/main/";
const VIEWER="https://romanfreebiker.github.io/fusion-vr-studio/visor.html";
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const meta=(property,value)=>'<meta property="'+property+'" content="'+esc(value)+'">';
async function lookup(slug){
  const r=await fetch(RAW+"distribucion.json",{cf:{cacheTtl:60,cacheEverything:true}});
  if(!r.ok)throw Error("Catalog: "+r.status);
  const data=await r.json();
  if(!Array.isArray(data.modelos))throw Error("Catalog format");
  return data.modelos.find(x=>x&&x.status==="active"&&typeof x.id==="string"&&x.id.split("-").at(-1)===slug)||null;
}
function render(model,slug,origin){
  const name=String(model.nombre||"Diseno 3D").trim().slice(0,120);
  const title="ESKALA | "+name;
  const desc="Visita "+name+" en 3D. Un recorrido virtual de ESKALA by Roman.";
  const page=origin+"/p/"+slug+"/",image=origin+"/i/"+slug+".jpg";
  const viewer=VIEWER+"?modo=presentacion&diseno="+encodeURIComponent(model.id)+"&acceso=invitado&v=102";
  const metas=[
    meta("og:type","website"),meta("og:locale","es_ES"),
    meta("og:site_name","ESKALA Studio"),meta("og:title",title),
    meta("og:description",desc),meta("og:url",page),
    meta("og:image",image),meta("og:image:secure_url",image),
    meta("og:image:type","image/jpeg"),meta("og:image:width","1200"),
    meta("og:image:height","630"),meta("og:image:alt",title),
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="'+esc(title)+'">',
    '<meta name="twitter:description" content="'+esc(desc)+'">',
    '<meta name="twitter:image" content="'+esc(image)+'">'
  ].join("");
  const css="body{margin:0;min-height:100vh;display:grid;place-items:center;background:#151e26;color:#eef7fa;font:16px system-ui,sans-serif}main{width:min(830px,94vw);text-align:center;padding:20px}img{display:block;width:100%;border:1px solid #167b96;border-radius:14px}h1{font-size:clamp(21px,4vw,32px)}p{color:#afc8d3}a{display:inline-block;padding:12px 22px;border-radius:9px;background:#176f89;color:white;text-decoration:none;font-weight:700}";
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+esc(title)+'</title><meta name="description" content="'+esc(desc)+'">'+
    '<link rel="canonical" href="'+esc(page)+'">'+metas+'<style>'+css+'</style></head>'+
    '<body><main><img src="/i/'+slug+'.jpg" alt="'+esc(title)+'" width="1200" height="630">'+
    '<h1>'+esc(name)+'</h1><p>ESKALA · Preparando visita 3D...</p>'+
    '<a href="'+esc(viewer)+'">Abrir visor 3D</a></main>'+
    '<script>setTimeout(function(){location.replace('+JSON.stringify(viewer)+')},900)</script></body></html>';
}
const error=(msg,status)=>new Response('<!doctype html><html lang="es"><meta charset="utf-8"><title>ESKALA</title><body style="background:#151e26;color:white;font:16px system-ui;padding:40px">'+esc(msg)+'</body></html>',{status,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
export default {
  async fetch(request){
    const url=new URL(request.url),path=url.pathname,method=request.method;
    if(!["GET","HEAD"].includes(method))return new Response(null,{status:405,headers:{"allow":"GET, HEAD"}});
    if(path==="/health")return new Response('{"service":"ESKALA previews","ready":true}',{headers:{"content-type":"application/json"}});
    if(path==="/robots.txt")return new Response("User-agent: *\nAllow: /\n",{headers:{"content-type":"text/plain; charset=utf-8"}});
    const p=path.match(/^\/p\/([a-z0-9]{8,20})\/?$/i),img=path.match(/^\/i\/([a-z0-9]{8,20})\.jpg$/i);
    if(!p&&!img)return error("Enlace ESKALA no encontrado.",404);
    const slug=(p||img)[1].toLowerCase();
    let item;
    try{item=await lookup(slug)}catch{return error("La biblioteca ESKALA no responde.",503)}
    if(!item)return error("Diseno ESKALA no disponible.",404);
    if(img){
      let res;
      try{res=await fetch(RAW+"social/"+slug+".jpg",{cf:{cacheTtl:1800,cacheEverything:true}})}
      catch{return new Response(null,{status:503})}
      if(!res.ok)return new Response(null,{status:502});
      return new Response(method==="HEAD"?null:res.body,{headers:{
        "content-type":"image/jpeg","cache-control":"public, max-age=1800",
        "x-content-type-options":"nosniff"
      }});
    }
    return new Response(method==="HEAD"?null:render(item,slug,url.origin),{headers:{
      "content-type":"text/html; charset=utf-8","cache-control":"public, max-age=90",
      "x-content-type-options":"nosniff"
    }});
  }
};
