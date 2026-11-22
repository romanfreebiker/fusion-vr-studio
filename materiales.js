/* Fusion VR Studio - biblioteca de materiales PBR v15.
   Materiales propios: identifica por nombre, aplica un único material por cuerpo.
   Los mapas se generan localmente en el navegador y se incrustan al exportar FBX->GLB.
*/
(function(root){
'use strict';
const specs={
 pineBoard:{label:'Pino natural continuo para peldaños',metalness:0,roughness:.78,size:1024},
 cladding:{label:'Revestimiento pino claro 200 × 2000 mm',metalness:0,roughness:.78,size:1024},
 anthracite:{label:'Pintura antracita satinada · RAL 7016 aproximado',metalness:.10,roughness:.39,size:512},
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
 'revestimiento':'cladding','revestimiento de madera':'cladding','revestimiento de pino':'cladding',
 'friso':'cladding','friso madera':'cladding','panelado madera':'cladding','tablones horizontales':'cladding',
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
 'antracita':'anthracite','gris antracita':'anthracite','anthracite':'anthracite',
 'pintura antracita':'anthracite','pintura gris antracita':'anthracite',
 'ral 7016':'anthracite','ral7016':'anthracite',
 'abs':'plastic','plastic':'plastic','plastico':'plastic'
});
const rules=[
 {kind:'anthracite',test:/\b(antracita|anthracite|ral\s*7016)\b|\b7016\b/},
 {kind:'cladding',test:/\b(revestimiento|friso|panelado|cladding|siding|entablado|lambriz|tablones?)\b/},
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
  const color=kind==='pine'||kind==='cladding'?[224,198,157]:kind==='oak'?[186,157,119]:[199,172,135];
  for(let i=0;i<px.length;i+=4){
   const l=.2126*px[i]+.7152*px[i+1]+.0722*px[i+2];
   // Conservar el contraste fotográfico de nudos/vetas; sólo neutralizar el tinte rojo.
   // La versión anterior aplicaba un contraste .45 y borraba los nudos.
   const variation=(l-128)*.96;
   px[i]=clamp(color[0]+variation+(px[i]-l)*.10);
   px[i+1]=clamp(color[1]+variation*.95+(px[i+1]-l)*.10);
   px[i+2]=clamp(color[2]+variation*.87+(px[i+2]-l)*.08);
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
 cladding:{slug:'stained_pine',meters:1},
 pine:{slug:'coated_pine',meters:.55},
 oak:{slug:'oak_veneer_01',meters:.70},
 wood:{slug:'white_oak_veneer',meters:.85},
 concrete:{slug:'rough_concrete',meters:1.10}
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
 const spec=specs[kind],col=photoCanvas(albedo);
 // Color constante y claro; conservar la información de veta, eliminar el tinte rojizo.
 if(kind==='pine'||kind==='wood'||kind==='oak'||kind==='cladding')calibrate(col,kind);
 return {kind,color:col,normal:photoCanvas(normal),
   roughness:photoCanvas(roughness),metalness:spec.metalness,
   roughnessFactor:spec.roughness,tileMeters:info.meters,
   label:spec.label,photographic:true,source:'Poly Haven · '+info.slug};
}

const localPBR={
 cladding:{
   color:'assets/materiales/pino_revestimiento_8x2m_color.jpg',
   normal:'assets/materiales/pino_revestimiento_8x2m_normal.jpg',
   rough:'assets/materiales/pino_revestimiento_8x2m_rough.jpg',
   tileMetersX:8,tileMetersY:2,
   source:'Fusion VR · imagen aprobada · atlas fotográfico 8 × 2 m'
 },
 concrete:{
   color:'assets/materiales/hormigon_arquitectonico_color.jpg',
   normal:'assets/materiales/hormigon_arquitectonico_normal.jpg',
   rough:'assets/materiales/hormigon_arquitectonico_rough.jpg',
   tileMeters:1.15,
   source:'Fusion VR · hormigón gris fotográfico local'
 }
};
function canvasNative(image){
 const c=document.createElement('canvas');
 c.width=image.naturalWidth||image.width;
 c.height=image.naturalHeight||image.height;
 c.getContext('2d').drawImage(image,0,0,c.width,c.height);
 return c;
}
// La fotografía aprobada incluye algunas juntas casi negras (2-3 píxeles).
// Sólo se suavizan filas oscuras que cruzan casi todo el atlas, nunca nudos
// ni vetas locales. Conserva una sombra fina, sin borrar la separación.
// Atlas aprobado 8 x 2 m: las juntas de la fotografía original se oscurecieron
// al componer las 10 filas (y algunas franjas quedaron dentro de los recortes).
// Reparar la franja completa, NO solamente su píxel central: interpolación
// fotográfica desde los dos lados + una sombra de separación muy tenue.
// Trabajar sobre tiras pequeñas para no duplicar 16 MB en Quest 2.
// Revestimiento real 8 x 2 m: diez hiladas de 200 mm y juntas a 2 m.
// La fotografía aprobada contiene unas líneas muy negras dibujadas al crear
// el atlas. Se reconstruyen los bordes y se sustituyen por juntas de madera
// CLARAS pero nítidas; cada tabla conserva sus propias vetas y nudos.
function softenCladdingSeams(colorCanvas,normalCanvas){
 const w=colorCanvas.width,h=colorCanvas.height;
 const ctx=colorCanvas.getContext('2d',{willReadFrequently:true});
 const nm=normalCanvas.getContext('2d',{willReadFrequently:true});
 const color=ctx.getImageData(0,0,w,h),normal=nm.getImageData(0,0,w,h);
 const p=color.data,n=normal.data;
 // Reparación fotográfica previa: el atlas original lleva bandas negras
 // AL MARGEN de las juntas nominales, incluso en mitad de algunas tablas.
 // Detectar bandas largas comparando luminancia de cada fila con sus
 // vecinas a +/- 8 px. Los nudos individuales no oscurecen una fila entera.
 const scan=new Float32Array(h);
 for(let y=0;y<h;y++){
   let sum=0,nSamples=0;
   for(let x=0;x<w;x+=16){
     const k=(y*w+x)*4;
     sum+=p[k]*.2126+p[k+1]*.7152+p[k+2]*.0722;
     nSamples++;
   }
   scan[y]=sum/nSamples;
 }
 const bad=new Uint8Array(h);
 for(let y=9;y<h-9;y++){
   const adjacent=(scan[y-8]+scan[y+8])/2;
   if(adjacent-scan[y]>22 && scan[y]<175){
     for(let q=Math.max(1,y-2);q<=Math.min(h-2,y+2);q++)bad[q]=1;
   }
 }
 // Leer una sola copia intacta; la interpolación no vuelve a utilizar
 // píxeles ya reparados. Se conserva el detalle longitudinal del pino.
 const before=p.slice();
 for(let y=1;y<h-1;){
   if(!bad[y]){y++;continue}
   const start=y;
   while(y<h-1&&bad[y])y++;
   const end=y-1,top=Math.max(0,start-9),bottom=Math.min(h-1,end+9);
   for(let yy=start;yy<=end;yy++){
     const t=(yy-top)/Math.max(1,bottom-top);
     for(let x=0;x<w;x++){
       const k=(yy*w+x)*4,a=(top*w+x)*4,b=(bottom*w+x)*4;
       for(let c=0;c<3;c++)p[k+c]=Math.round(before[a+c]*(1-t)+before[b+c]*t);
       n[k]=128;n[k+1]=128;n[k+2]=255;
     }
   }
 }
 const rowHeight=h/10,boardWidth=w/4;
 // Diferencias de tono discretas entre piezas, sin blanquear la fotografía.
 const drift=new Float32Array(10*6);
 for(let row=0;row<10;row++)for(let board=0;board<6;board++){
   const t=Math.sin((row+1)*81.73+(board+3)*47.17)*43758.5453;
   drift[row*6+board]=((t-Math.floor(t))-.5)*18;
 }
 for(let y=0;y<h;y++){
   const row=Math.min(9,Math.floor(y/rowHeight));
   const localY=y-row*rowHeight;
   const edgeY=Math.min(localY,rowHeight-localY);
   const shift=row%2?boardWidth*.5:0;
   for(let x=0;x<w;x++){
     const u=x+shift;
     const col=Math.floor(u/boardWidth);
     const localX=u-col*boardWidth;
     const edgeX=Math.min(localX,boardWidth-localX);
     const i=(y*w+x)*4;
     // Juntas pintadas originalmente: hasta 2 px, demasiado oscuras.
     // Reconstruir una banda de ~4 px usando el interior limpio de la tabla.
     const seamY=edgeY<5, seamX=edgeX<4;
     const near=seamY||seamX;
     if(near){
       let sx=x,sy=y;
       if(seamX)sx=Math.max(0,Math.min(w-1,Math.round(x+(localX<boardWidth/2?9:-9))));
       if(seamY)sy=Math.max(0,Math.min(h-1,Math.round(y+(localY<rowHeight/2?10:-10))));
       const k=(sy*w+sx)*4;
       // Junta estrecha, visible a escala real (~2 mm): sombra marrón
       // templada + un borde iluminado muy leve, nunca negro puro.
       // Separación vertical y horizontal siguen sus dimensiones reales.
       const core=edgeY<2.1||edgeX<2.1;
       const feather=edgeY<4.1||edgeX<3.6;
       const highlight=(!core&&feather&&
         ((edgeY>=2.1&&edgeY<3.1)||(edgeX>=2.1&&edgeX<3.0)));
       const shadow=core?30:feather?13:0;
       const light=highlight?7:0;
       for(let c=0;c<3;c++){
         const original=p[k+c];
         const warm= c===2?3:0;
         p[i+c]=Math.max(0,Math.min(255,original-shadow-warm+light));
       }
       // Bisel visual suave, sin normal extrema que produzca raya negra.
       n[i]=128;n[i+1]=128;n[i+2]=core?243:255;
     }else{
       const variation=drift[row*6+Math.min(5,Math.max(0,col))];
       for(let c=0;c<3;c++)p[i+c]=Math.max(0,Math.min(255,p[i+c]+variation));
     }
   }
 }
 ctx.putImageData(color,0,0);
 nm.putImageData(normal,0,0);
}
async function prepareLocalPBR(kind){
 if(prepared.has(kind))return prepared.get(kind);
 const set=localPBR[kind],spec=specs[kind];
 const files=[set.color,set.normal,set.rough];
 const [c,n,r]=await Promise.all(files.map(fetchPhoto));
 const asset={
  kind,color:canvasNative(c),normal:canvasNative(n),roughness:canvasNative(r),
  metalness:spec.metalness,roughnessFactor:spec.roughness,
  tileMeters:set.tileMeters||1,tileMetersX:set.tileMetersX,tileMetersY:set.tileMetersY,
  label:spec.label,photographic:true,source:set.source
 };
 if(kind==='cladding')softenCladdingSeams(asset.color,asset.normal);
 prepared.set(kind,asset);
 return asset;
}

async function prepare(){
 await Promise.all(['pine','oak','wood'].map(async kind=>{
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
    const set=photos.pine;
    try{
      const [color,normal,rough]=await Promise.all([set.color,set.normal,set.rough].map(fetchPhoto));
      const col=photoCanvas(color);calibrate(col,kind);
      const spec=specs[kind],value={
        kind,color:col,normal:photoCanvas(normal),roughness:photoCanvas(rough),
        metalness:spec.metalness,roughnessFactor:spec.roughness,
        tileMeters:kind==='concrete'?1.10:kind==='pine'?.55:kind==='oak'?.70:.85,label:spec.label,
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
 // Estos dos mapas son recursos propios, subidos a GitHub con el proyecto.
 // No requieren Poly Haven ni generar el atlas al abrir el diseño.
 await Promise.all(['cladding','concrete'].map(async kind=>{
  try{await prepareLocalPBR(kind)}
  catch(error){
   console.warn('Material local '+kind+' no disponible; uso respaldo:',error.message);
   if(kind==='cladding'){
    try{prepared.set('cladding',await createPhotoCladding())}
    catch(e){console.warn('No se pudo crear el respaldo fotográfico:',e.message)}
   }
  }
 }));
}


/*
 * Dos materiales PBR sin descarga externa:
 *  - Cladding: atlas 8 x 2 m, 10 hiladas de 200 mm y juntas a 2 m
 *    alternadas. 40 tramos diferentes, vetas horizontales finas.
 *  - Concrete: gris arquitectónico de poro fino (sin manchas de tierra).
 * Un solo material por cuerpo, como en los modelos originales.
 */
const generatedMaps=new Map();
function mapsFromHeight(kind,w,h,paint,normalPower,tileX,tileY){
 const color=document.createElement('canvas'),normal=document.createElement('canvas'),
       rough=document.createElement('canvas');
 for(const c of [color,normal,rough]){c.width=w;c.height=h}
 const col=color.getContext('2d'),norm=normal.getContext('2d'),rg=rough.getContext('2d');
 const cd=col.createImageData(w,h),nd=norm.createImageData(w,h),rd=rg.createImageData(w,h);
 const heights=new Float32Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=y*w+x,p=i*4,entry=paint(x,y,w,h);
   cd.data[p]=clamp(entry.r);cd.data[p+1]=clamp(entry.g);cd.data[p+2]=clamp(entry.b);cd.data[p+3]=255;
   const v=clamp(entry.rough*255);
   rd.data[p]=v;rd.data[p+1]=v;rd.data[p+2]=v;rd.data[p+3]=255;
   heights[i]=entry.height;
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=y*w+x,p=i*4;
   const left=heights[y*w+(x+w-1)%w],right=heights[y*w+(x+1)%w];
   const up=heights[((y+h-1)%h)*w+x],down=heights[((y+1)%h)*w+x];
   let nx=(left-right)*normalPower,ny=(up-down)*normalPower,nz=1;
   const l=Math.hypot(nx,ny,nz);nx/=l;ny/=l;nz/=l;
   nd.data[p]=clamp(127.5*(nx+1));nd.data[p+1]=clamp(127.5*(ny+1));
   nd.data[p+2]=clamp(127.5*(nz+1));nd.data[p+3]=255;
 }
 col.putImageData(cd,0,0);norm.putImageData(nd,0,0);rg.putImageData(rd,0,0);
 return {kind,color,normal,roughness:rough,metalness:0,
   roughnessFactor:specs[kind].roughness,tileMetersX:tileX,tileMetersY:tileY,
   tileMeters:1,label:specs[kind].label,source:'Fusion VR · atlas PBR local'};
}
// Atlas fotográfico: 8 metros de ancho x 2 de alto, 10 hiladas de 200 mm
// y cuatro tablones de 2 m por fila (40 piezas distintas).
// Cada tablón usa una franja diferente de la fotografía REAL y su normal PBR,
// sin la trama procedural de ladrillos de la versión anterior.
async function createPhotoCladding(pbrSource=null){
 const photosUsed=pbrSource||prepared.get('pine');
 let photo,photoNormal,photoRough;
 if(photosUsed){
   // La fuente son los tres mapas PBR originales, no una veta sintetizada.
   photo=photosUsed.color;photoNormal=photosUsed.normal;
   photoRough=photosUsed.roughness;
 }else{
   [photo,photoNormal,photoRough]=await Promise.all(
     [photos.pine.color,photos.pine.normal,photos.pine.rough].map(fetchPhoto));
 }
 const w=2048,h=512,rowH=h/10,plankW=w/4;
 const sourceCanvases=[photo,photoNormal,photoRough].map(image=>{
   const c=document.createElement('canvas');
   c.width=1024;c.height=1024;
   c.getContext('2d').drawImage(image,0,0,1024,1024);
   return c;
 });
 // Detectar la dirección de veta más marcada para alinear su longitud
 // horizontalmente, sin deformar nudos ni líneas de crecimiento.
 const ref=sourceCanvases[0].getContext('2d').getImageData(0,0,1024,1024).data;
 let gx=0,gy=0;
 for(let y=12;y<1000;y+=12)for(let x=12;x<1000;x+=12){
   const k=(y*1024+x)*4,dx=(((ref[k+4]-ref[k])+(ref[k+5]-ref[k+1])+(ref[k+6]-ref[k+2]))/3);
   const dy=(((ref[k+4096]-ref[k])+(ref[k+4097]-ref[k+1])+(ref[k+4098]-ref[k+2]))/3);
   gx+=Math.abs(dx);gy+=Math.abs(dy);
 }
 if(gx>gy*1.10){
   for(let i=0;i<sourceCanvases.length;i++){
     const rotated=document.createElement('canvas');rotated.width=1024;rotated.height=1024;
     const rc=rotated.getContext('2d');rc.translate(1024,0);rc.rotate(Math.PI/2);
     rc.drawImage(sourceCanvases[i],0,0);
     sourceCanvases[i]=rotated;
   }
 }
 const canvases=sourceCanvases.map(()=>{
   const c=document.createElement('canvas');c.width=w;c.height=h;return c;
 });
 const contexts=canvases.map(c=>c.getContext('2d'));
 // Un recorte largo y estrecho puede dejar fuera todos los nudos.
 // Se localizan las zonas fotográficas de mayor contraste, priorizando las
 // vetas y nudos existentes en la fuente; nunca se dibujan nudos falsos.
 const srcW=850,srcH=Math.round(srcW*rowH/plankW);
 const sample=sourceCanvases[0].getContext('2d').getImageData(0,0,1024,1024).data;
 const candidates=[];
 for(let y=0;y<=1024-srcH;y+=Math.max(16,Math.floor(srcH/2))){
   for(let x=0;x<=1024-srcW;x+=45){
     let dark=0,range=0;
     for(let yy=y;yy<y+srcH;yy+=6)for(let xx=x;xx<x+srcW;xx+=8){
       const k=(yy*1024+xx)*4;
       const v=(sample[k]*.2126+sample[k+1]*.7152+sample[k+2]*.0722);
       if(v<155)dark++;
       range+=Math.abs(v-190);
     }
     candidates.push({x,y,score:dark*8+range*.03});
   }
 }
 candidates.sort((a,b)=>b.score-a.score);
 const selected=candidates.slice(0,Math.max(10,Math.floor(candidates.length*.32)));
 for(let row=0;row<10;row++){
   const y=row*rowH;
   const offset=(row%2)?plankW/2:0; // juntas a 1 m, 3 m, 5 m... en filas alternas
   for(let column=-1;column<5;column++){
     const key=row*19+column+3;
     const x=column*plankW-offset;
     const selectedPatch=selected[Math.min(selected.length-1,Math.floor(hash(key,17,30)*selected.length))];
     const sourceX=selectedPatch?.x??0;
     const sourceY=selectedPatch?.y??0;
     for(let k=0;k<3;k++){
       const ctx=contexts[k];
       ctx.save();ctx.beginPath();ctx.rect(Math.max(0,x),y,Math.min(plankW,w-x),rowH);ctx.clip();
       ctx.drawImage(sourceCanvases[k],sourceX,sourceY,srcW,srcH,x,y,plankW,rowH);
       ctx.restore();
     }
     // Mínima variación del tono entre tablones; sin bloques uniformes.
     const drift=(hash(key,28,92)-.5)*.10;
     const ctx=contexts[0];
     ctx.save();ctx.beginPath();ctx.rect(x,y,plankW,rowH);ctx.clip();
     ctx.fillStyle=drift>=0?'rgba(255,240,211,'+drift.toFixed(3)+')':
       'rgba(105,99,83,'+(-drift).toFixed(3)+')';
     ctx.fillRect(x,y,plankW,rowH);ctx.restore();
   }
 }
 // Cambiar el color del pino oscuro rojizo manteniendo intacta la fotografía:
 // su luminancia produce las vetas y nudos reales, no ondas dibujadas.
 // Ya se calibró la fotografía original, no volver a blanquear el atlas.
 if(!photosUsed)calibrate(canvases[0],'pine');
 const color=contexts[0],normal=contexts[1],roughness=contexts[2];
 // Juntas de 2-3 mm muy discretas: separación de tablas de madera,
 // no mortero ni líneas de ladrillo negras.
 for(let row=0;row<10;row++){
   const y=row*rowH;
   color.fillStyle='rgba(84,76,63,.24)';
   color.fillRect(0,y,2048,Math.max(.8,rowH*.010));
   normal.fillStyle='rgb(128,128,245)';
   normal.fillRect(0,y,2048,1);
   const offset=(row%2)?plankW/2:0;
   for(let col=-1;col<5;col++){
     const x=col*plankW-offset;
     color.fillStyle='rgba(85,78,66,.25)';
     color.fillRect(x,y,1,Math.ceil(rowH));
     normal.fillStyle='rgb(128,128,245)';
     normal.fillRect(x,y,1,Math.ceil(rowH));
   }
 }
 return {kind:'cladding',color:canvases[0],normal:canvases[1],roughness:canvases[2],
  metalness:0,roughnessFactor:.78,tileMetersX:8,tileMetersY:2,tileMeters:1,
  label:'Pino natural · tablas fotográficas de 200 × 2000 mm',
  source:(pbrSource?'Poly Haven · stained_pine con nudos':photosUsed?.source||'Fotografía PBR local')+' · atlas 2m'};
}
function makeCladding(){
 // Sólo si falló la fotografía local: evitar volver al patrón de ladrillos.
 // La madera continua se ve más natural que una cuadrícula sintética.
 if(generatedMaps.has('cladding'))return generatedMaps.get('cladding');
 const base=getMaps('pine');
 return {...base,kind:'cladding',tileMetersX:8,tileMetersY:2,
   label:'Revestimiento de pino',source:'Madera PBR de respaldo'};
}
function makeArchitecturalConcrete(){
 if(generatedMaps.has('concrete'))return generatedMaps.get('concrete');
 const data=mapsFromHeight('concrete',768,768,(x,y,w,h)=>{
   const u=x/w,v=y/h;
   const fine=noise(u,v,150,12)-.5,medium=noise(u,v,38,32)-.5;
   const soft=noise(u,v,6,71)-.5;
   const pores=hash(x,y,81)<.014?-1:0;
   const shade=medium*9+soft*6+fine*10+pores*12;
   return {r:184+shade,g:187+shade,b:189+shade,
     rough:.88+fine*.06,height:.51+medium*.018+fine*.024+pores*.055};
 },3.1,1.15,1.15);
 generatedMaps.set('concrete',data);return data;
}

// Los peldaños utilizan la MISMA madera fotográfica aprobada que las
// paredes, pero sólo el interior de una tabla, sin ninguna junta horizontal
// ni vertical. No mezclar distintas fotografías ni volver al pino rojizo.
let plainBoard=null;
function makePineBoard(){
 if(plainBoard)return plainBoard;
 const source=prepared.get('cladding');
 if(!source){
   const fallback=prepared.get('pine')||getMaps('pine');
   if(!fallback)return null;
   return {...fallback,kind:'pineBoard',source:'Respaldo pino sin atlas'};
 }
 const w=source.color.width,h=source.color.height;
 // Tomar la zona interna de una pieza horizontal (sin sus bordes).
 // Las coordenadas son relativas para conservarlas a cualquier resolución.
 const crop={x:Math.round(w*.265),y:Math.round(h*.618),
   width:Math.round(w*.21),height:Math.round(h*.058)};
 const create=(input)=>{
   const dst=document.createElement('canvas');
   dst.width=1024;dst.height=128;
   dst.getContext('2d').drawImage(input,crop.x,crop.y,crop.width,crop.height,
                                   0,0,1024,128);
   return dst;
 };
 plainBoard={
   kind:'pineBoard',color:create(source.color),normal:create(source.normal),
   roughness:create(source.roughness),metalness:0,roughnessFactor:.78,
   tileMeters:1,label:specs.pineBoard.label,
   source:'Mismo atlas aprobado, interior fotográfico sin juntas'
 };
 return plainBoard;
}
const cache=new Map();
function getMaps(kind){
 if(prepared.has(kind))return prepared.get(kind);
 if(kind==='pineBoard')return makePineBoard();
 if(kind==='cladding')return makeCladding();
 if(kind==='concrete')return makeArchitecturalConcrete();
 if(cache.has(kind))return cache.get(kind);
 const spec=specs[kind];if(!spec)return null;
 if(typeof document==='undefined')return null;
 const n=spec.size,total=n*n,wood=['pine','oak','wood'].includes(kind),metal=['stainless','steel','blacksteel'].includes(kind);
 const color=document.createElement('canvas'),normal=document.createElement('canvas'),rough=document.createElement('canvas');
 for(const c of [color,normal,rough]){c.width=n;c.height=n;}
 const colorCtx=color.getContext('2d'),normalCtx=normal.getContext('2d'),roughCtx=rough.getContext('2d');
 const colorPixels=colorCtx.createImageData(n,n),normalPixels=normalCtx.createImageData(n,n),roughPixels=roughCtx.createImageData(n,n),height=new Float32Array(total);
 const base=kind==='anthracite'?[54,57,60]:kind==='pine'?[179,126,72]:kind==='oak'?[143,105,68]:kind==='wood'?[150,110,74]:kind==='concrete'?[139,139,131]:kind==='stainless'?[194,199,203]:kind==='steel'?[123,132,141]:kind==='blacksteel'?[43,48,54]:kind==='paint'?[183,186,189]:[160,164,169];
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
   }else if(kind==='anthracite'){
     // Polvo/lacado satinado: acabado fino, sin rayas cepilladas ni brillo metálico.
     variation=2.8*(large-.5)+2.4*(fine-.5)+1.3*(grain-.5);
     h=.5+(fine-.5)*.006+(grain-.5)*.009;
     r+=.018*(fine-.5)+.012*(grain-.5);
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
 const power=wood?.75:kind==='concrete'?1.2:metal?.33:kind==='anthracite'?.045:.09;
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
 const data={kind,color,normal,roughness:rough,metalness:spec.metalness,roughnessFactor:spec.roughness,tileMeters:kind==='concrete'?1.10:kind==='pine'?.55:kind==='oak'?.70:kind==='wood'?.85:1,label:spec.label,source:'Procedural'};
 cache.set(kind,data);return data;
}
root.FusionMaterialLib={version:15,specs,aliases,identify,describe,getMaps,prepare,get remoteLoaded(){return remoteLoaded},getSource(kind){return getMaps(kind)?.source||'Desconocida'}};
})(globalThis);
