/* Fusion VR Studio - biblioteca de materiales PBR v4.
   Materiales propios: identifica por nombre, aplica un único material por cuerpo.
   Los mapas se generan localmente en el navegador y se incrustan al exportar FBX->GLB.
*/
(function(root){
'use strict';
const specs={
 pine:{label:'Pino natural',metalness:0,roughness:.80,size:768},
 oak:{label:'Roble',metalness:0,roughness:.70,size:768},
 wood:{label:'Madera',metalness:0,roughness:.75,size:768},
 concrete:{label:'Hormigón',metalness:0,roughness:.93,size:768},
 stainless:{label:'Acero inoxidable satinado',metalness:.93,roughness:.31,size:512},
 steel:{label:'Acero',metalness:.85,roughness:.50,size:512},
 blacksteel:{label:'Acero pintado negro',metalness:.34,roughness:.48,size:512},
 paint:{label:'Pintura',metalness:.03,roughness:.55,size:512},
 plastic:{label:'Plástico',metalness:0,roughness:.54,size:512}
};
function normalize(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
// Reglas de nombres COMPARTIDAS por todos los modelos y todas las conversiones.
const aliases=Object.freeze({
 'pine':'pine','pino':'pine','pino natural':'pine','pino silvestre':'pine',
 'oak':'oak','roble':'oak','roble natural':'oak',
 'wood':'wood','madera':'wood','madera natural':'wood',
 'concrete':'concrete','hormigon':'concrete','hormigon gris':'concrete',
 'cement':'concrete','cemento':'concrete',
 'stainless steel':'stainless','stainless steel satin':'stainless',
 'acero inoxidable':'stainless','acero inoxidable satinado':'stainless',
 'inox':'stainless','inoxidable':'stainless',
 'steel':'steel','acero':'steel','hierro':'steel',
 'paint':'paint','pintura':'paint','lacado':'paint',
 'abs':'plastic','plastic':'plastic','plastico':'plastic'
});
const rules=[
 {kind:'concrete',test:/\b(concrete|hormigon|cemento?|mortero|microcemento|cementitious)\b/},
 {kind:'stainless',test:/\b(inox|inoxidable|stainless|ss\s?(304|316)|aisi\s?(304|316)|304l|316l)\b|acero[\s_-]*inoxidable/},
 {kind:'blacksteel',test:/\b(steel|acero|metal|metallic|hierro)\b.*\b(black|negro|negra|antracita)\b|\b(black|negro)\b.*\b(steel|acero|metal|metallic|hierro)\b/},
 {kind:'pine',test:/\b(pino|pine|pinus)\b/},
 {kind:'oak',test:/\b(roble|oak)\b/},
 {kind:'wood',test:/\b(wood|madera|timber|caoba|cerezo|bambu|bamboo|nogal|walnut|cherry|mahogany|beech|haya|plywood|contrachapado|mdf|melamina|teca|teak|cedro|cedar|birch|abedul)\b/},
 {kind:'paint',test:/\b(pintura|paint|lacado|lacquer|powder[\s_-]?coat|epoxy[\s_-]?coat|recubrimiento)\b/},
 {kind:'steel',test:/\b(steel|acero|hierro|iron|metal|galvanizad[oa]?|aluminio|aluminium|aluminum)\b/},
 {kind:'plastic',test:/\b(abs|plastic|plastico|polimero|polymer|pvc|acrilico|acrylic|polycarbonate|policarbonato)\b/}
];
function identify(name){
 const normalized=normalize(name)
   .replace(/[_/()+.,;:\[\]{}-]+/g,' ').replace(/\s+/g,' ').trim();
 if(!normalized)return null;
 if(Object.prototype.hasOwnProperty.call(aliases,normalized))return aliases[normalized];
 for(const rule of rules)if(rule.test.test(normalized))return rule.kind;
 return null;
}
function describe(names){
 const found=[],unmatched=[];
 for(const value of names){
  const name=String(value||'').trim()||'(sin nombre)';
  const kind=identify(name);
  (kind?found:unmatched).push({name,kind});
 }
 return {found,unmatched};
}
function clamp(v){return Math.max(0,Math.min(255,Math.round(v)));}
function hash(x,y,seed){let n=Math.imul(x+133,374761393)+Math.imul(y+17,668265263)+Math.imul(seed,1442695041);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
function noise(x,y,grid,seed){
 const a=x*grid,b=y*grid,ix=Math.floor(a),iy=Math.floor(b),fx=a-ix,fy=b-iy;
 const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
 const n=(p,q)=>hash((p%grid+grid)%grid,(q%grid+grid)%grid,seed);
 return (n(ix,iy)*(1-sx)+n(ix+1,iy)*sx)*(1-sy)+(n(ix,iy+1)*(1-sx)+n(ix+1,iy+1)*sx)*sy;
}
// Materiales fotográficos CC0 guardados en este mismo repositorio.
// Se cargan antes de usar el visor o exportar un nuevo GLB.
const photos={
  pine:{color:'assets/materiales/pino_color.jpg',normal:'assets/materiales/pino_normal.webp',rough:'assets/materiales/pino_rough.jpg'},
  concrete:{color:'assets/materiales/hormigon_color.jpg',normal:'assets/materiales/hormigon_normal.jpg',rough:'assets/materiales/hormigon_rough.jpg'}
};
const prepared=new Map(),photoLoads=new Map(),pending=new Map();
function fetchPhoto(path){
 if(photoLoads.has(path))return photoLoads.get(path);
 const work=new Promise((resolve,reject)=>{
   if(typeof Image==='undefined')return reject(Error('Se necesita un navegador para cargar materiales.'));
   const img=new Image();
   img.onload=()=>resolve(img);
   img.onerror=()=>reject(Error('No se pudo cargar textura: '+path));
   if(/^https:\/\//.test(path))img.crossOrigin='anonymous';
   img.src=new URL(path,document.baseURI).href;
 });
 photoLoads.set(path,work);return work;
}
function photoCanvas(img){
 const canvas=document.createElement('canvas');
 canvas.width=1024;canvas.height=1024;
 const c=canvas.getContext('2d',{willReadFrequently:true});
 c.drawImage(img,0,0,canvas.width,canvas.height);
 return canvas;
}
function calibrate(canvas,kind){
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 const im=ctx.getImageData(0,0,canvas.width,canvas.height),px=im.data;
 // La fotografía original es madera oscura: se ajusta a pino claro
 // conservando la veta, los nudos y las variaciones fotográficas.
 if(kind!=='concrete'){
  const color=kind==='pine'?[200,159,103]:kind==='oak'?[155,117,79]:[170,131,91];
  for(let i=0;i<px.length;i+=4){
   const l=.2126*px[i]+.7152*px[i+1]+.0722*px[i+2];
   const variation=(l-82)*.87;
   px[i]=clamp(color[0]+variation+(px[i]-l)*.13);
   px[i+1]=clamp(color[1]+variation*.80+(px[i+1]-l)*.13);
   px[i+2]=clamp(color[2]+variation*.60+(px[i+2]-l)*.13);
  }
 }else{
  for(let i=0;i<px.length;i+=4){
   px[i]=clamp(px[i]*.89);
   px[i+1]=clamp(px[i+1]*.90);
   px[i+2]=clamp(px[i+2]*.92);
  }
 }
 ctx.putImageData(im,0,0);
}
// Materiales CC0 de Poly Haven. Los nombres siguen siendo universales para
// cualquier GLB de Fusion; solo cambia la fuente de las fotografías PBR.
// Si no hay red, falla CORS o se supera el tiempo, conservar la biblioteca local.
const remoteAssets={
 pine:{slug:'coated_pine',meters:1.4},
 oak:{slug:'oak_veneer_01',meters:1.8},
 wood:{slug:'white_oak_veneer',meters:1.8},
 concrete:{slug:'rough_concrete',meters:1.8}
};
let remoteLoaded=0;
const limited=(promise,ms)=>Promise.race([
 promise,
 new Promise((_,reject)=>setTimeout(()=>reject(Error('Se agotó el tiempo de descarga PBR')),ms))
]);
async function remotePBR(kind){
 const info=remoteAssets[kind];
 if(!info||typeof fetch!=='function')return null;
 const response=await limited(fetch('https://api.polyhaven.com/files/'+info.slug,{mode:'cors'}),7000);
 if(!response.ok)throw Error('Catálogo PBR HTTP '+response.status);
 const index=await response.json();
 // Poly Haven ofrece un árbol: tipo de mapa -> resolución -> formato -> url.
 const pick=(keys)=>{
   for(const key of keys){
     const group=index[key]||index[Object.keys(index).find(k=>k.toLowerCase()===key.toLowerCase())];
     const variant=group?.['1k'];
     const entry=variant?.jpg||variant?.jpeg||variant?.png;
     if(entry?.url && new URL(entry.url).hostname==='dl.polyhaven.org')return entry.url;
   }
   return null;
 };
 const paths=[pick(['Diffuse','diffuse']),pick(['nor_gl']),pick(['Rough','rough'])];
 if(paths.some(x=>!x))throw Error('Mapas PBR incompletos');
 const [albedo,normal,roughness]=await limited(Promise.all(paths.map(fetchPhoto)),9000);
 const spec=specs[kind];
 return {kind,color:photoCanvas(albedo),normal:photoCanvas(normal),
   roughness:photoCanvas(roughness),metalness:spec.metalness,
   roughnessFactor:spec.roughness,tileMeters:info.meters,
   label:spec.label,photographic:true,source:'Poly Haven · '+info.slug};
}
async function prepare(){
 await Promise.all(['pine','oak','wood','concrete'].map(async kind=>{
  if(prepared.has(kind))return;
  if(pending.has(kind))return pending.get(kind);
  const promise=(async()=>{
    try{
      const asset=await remotePBR(kind);
      if(asset){
        prepared.set(kind,asset);
        remoteLoaded++;
        return asset;
      }
    }catch(error){
      // No bloquear ningún modelo si no hay internet o falla un servidor.
      console.info('PBR remoto no disponible para '+kind+', se usa respaldo local:',error.message);
    }
    const set=photos[kind==='concrete'?'concrete':'pine'];
    try{
      const [color,normal,rough]=await Promise.all([set.color,set.normal,set.rough].map(fetchPhoto));
      const col=photoCanvas(color);calibrate(col,kind);
      const spec=specs[kind],value={
        kind,color:col,normal:photoCanvas(normal),roughness:photoCanvas(rough),
        metalness:spec.metalness,roughnessFactor:spec.roughness,
        tileMeters:kind==='concrete'?1.6:1.15,label:spec.label,
        photographic:true,source:'Respaldo local'
      };
      prepared.set(kind,value);
      return value;
    }catch(error){
      // Último recurso: mapas procedurales existentes.
      console.warn('No hay fotos locales de '+kind, error);
      return getMaps(kind);
    }
  })();
  pending.set(kind,promise);
  try{await promise}finally{pending.delete(kind)}
 }));
}

const cache=new Map();
function getMaps(kind){
 if(prepared.has(kind))return prepared.get(kind);
 if(cache.has(kind))return cache.get(kind);
 const spec=specs[kind];if(!spec)return null;
 if(typeof document==='undefined')return null;
 const n=spec.size,total=n*n,wood=['pine','oak','wood'].includes(kind),metal=['stainless','steel','blacksteel'].includes(kind);
 const color=document.createElement('canvas'),normal=document.createElement('canvas'),rough=document.createElement('canvas');
 for(const c of [color,normal,rough]){c.width=n;c.height=n;}
 const colorCtx=color.getContext('2d'),normalCtx=normal.getContext('2d'),roughCtx=rough.getContext('2d');
 const colorPixels=colorCtx.createImageData(n,n),normalPixels=normalCtx.createImageData(n,n),roughPixels=roughCtx.createImageData(n,n),height=new Float32Array(total);
 const base=kind==='pine'?[179,126,72]:kind==='oak'?[143,105,68]:kind==='wood'?[150,110,74]:kind==='concrete'?[139,139,131]:kind==='stainless'?[194,199,203]:kind==='steel'?[123,132,141]:kind==='blacksteel'?[43,48,54]:kind==='paint'?[183,186,189]:[160,164,169];
 for(let y=0;y<n;y++){const v=y/n;
  for(let x=0;x<n;x++){
   const u=x/n,i=y*n+x,k=i*4;
   const large=noise(u,v,8,4),fine=noise(u,v,64,29),grain=noise(u,v,128,83);
   let variation=0,h=.5,r=spec.roughness;
   if(wood){
     const lines=2*Math.PI*(25*v+.40*Math.sin(2*Math.PI*u)+.17*Math.sin(6*Math.PI*u)+.10*Math.sin(12*Math.PI*u));
     const knots=Math.exp(-Math.pow((u-.32)/.075,2)-Math.pow((v-.43)/.11,2))+
                 Math.exp(-Math.pow((u-.74)/.045,2)-Math.pow((v-.78)/.075,2));
     const ring=Math.sin(lines+knots*17);
     const fibre=Math.sin(2*Math.PI*85*v+Math.sin(2*Math.PI*u*2))*0.5;
     variation=19*ring+10*(large-.5)+8*(fine-.5)+4*fibre-14*knots;
     h=.5+ring*.12+(fine-.5)*.10+knots*.14;
     r+=.055*(grain-.5)+.06*Math.abs(ring);
   }else if(kind==='concrete'){
     const pores=grain<.14?-.17:0;
     const clouds=(large-.5)*2,stain=Math.sin(2*Math.PI*(u*1.4+v*.7))*.08;
     variation=36*clouds+17*(fine-.5)+15*(grain-.5)+17*stain+pores*95;
     h=.5+clouds*.13+(fine-.5)*.09+pores;
     r+=.07*(grain-.5)+.035*(large-.5);
   }else if(metal){
     const brushed=Math.sin(2*Math.PI*(v*170+noise(u,v,8,7)*.3));
     variation=7*brushed+9*(fine-.5)+7*(large-.5);
     h=.5+brushed*.035+(fine-.5)*.025;
     r+=.09*(fine-.5);
   }else{
     variation=3*(large-.5)+3*(fine-.5);
     h=.5+(grain-.5)*.018;r+=.035*(grain-.5);
   }
   const c=wood?[1.1,.83,.60]:kind==='concrete'?[1,1.01,1.04]:[1,1,1];
   for(let t=0;t<3;t++)colorPixels.data[k+t]=clamp(base[t]+variation*c[t]);
   colorPixels.data[k+3]=255;
   const rc=clamp(r*255);roughPixels.data[k]=rc;roughPixels.data[k+1]=rc;roughPixels.data[k+2]=rc;roughPixels.data[k+3]=255;
   height[i]=h;
  }
 }
 const power=wood?.75:kind==='concrete'?1.2:metal?.33:.09;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const i=y*n+x,k=4*i,left=height[y*n+(x+n-1)%n],right=height[y*n+(x+1)%n],
   above=height[((y+n-1)%n)*n+x],below=height[((y+1)%n)*n+x];
  let nx=(left-right)*power,ny=(above-below)*power,nz=1;
  const length=Math.hypot(nx,ny,nz);nx/=length;ny/=length;nz/=length;
  normalPixels.data[k]=clamp(127.5*(nx+1));
  normalPixels.data[k+1]=clamp(127.5*(ny+1));
  normalPixels.data[k+2]=clamp(127.5*(nz+1));
  normalPixels.data[k+3]=255;
 }
 colorCtx.putImageData(colorPixels,0,0);
 normalCtx.putImageData(normalPixels,0,0);
 roughCtx.putImageData(roughPixels,0,0);
 const data={kind,color,normal,roughness:rough,metalness:spec.metalness,roughnessFactor:spec.roughness,label:spec.label};
 cache.set(kind,data);return data;
}
root.FusionMaterialLib={version:4,specs,aliases,identify,describe,getMaps,prepare,get remoteLoaded(){return remoteLoaded}};
})(globalThis);
