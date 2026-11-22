/* Fusion VR Studio - biblioteca de materiales PBR v1.
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
 stainless:{label:'Acero inoxidable satinado',metalness:.83,roughness:.38,size:512},
 steel:{label:'Acero',metalness:.72,roughness:.57,size:512},
 blacksteel:{label:'Acero pintado negro',metalness:.34,roughness:.48,size:512},
 paint:{label:'Pintura',metalness:.03,roughness:.55,size:512},
 plastic:{label:'Plástico',metalness:0,roughness:.54,size:512}
};
function normalize(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function identify(name){
 const s=normalize(name);
 if(!s)return null;
 if(/concrete|hormigon|cement|cemento|mortero|microcemento/.test(s))return 'concrete';
 if(/inox|stainless|acier inox|316l|304 steel|acero inoxidable/.test(s))return 'stainless';
 if(/metallic.*black|metal.*negro|metalizado.*negro|black.*steel|steel.*black|acero.*negro|pintura.*negra.*metal/.test(s))return 'blacksteel';
 if(/pine|pino|pinus/.test(s))return 'pine';
 if(/oak|roble/.test(s))return 'oak';
 if(/wood|madera|timber|caoba|cerezo|bambu|bamboo|nogal|walnut|cherry|mahogany|beech|haya/.test(s))return 'wood';
 if(/steel|acero|hierro|iron|metal|galvanizad/.test(s))return 'steel';
 if(/paint|pintura|lacado|lacquer|powder coat|recubrimiento/.test(s))return 'paint';
 if(/abs|plastic|plastico|polimero|polymer|pvc/.test(s))return 'plastic';
 return null;
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
async function prepare(){
 await Promise.all(['pine','oak','wood','concrete'].map(async kind=>{
  if(prepared.has(kind))return;
  if(pending.has(kind))return pending.get(kind);
  const set=photos[kind==='concrete'?'concrete':'pine'];
  const promise=(async()=>{
   const [color,normal,rough]=await Promise.all([set.color,set.normal,set.rough].map(fetchPhoto));
   const col=photoCanvas(color);calibrate(col,kind);
   const spec=specs[kind],value={
    kind,color:col,normal:photoCanvas(normal),roughness:photoCanvas(rough),
    metalness:spec.metalness,roughnessFactor:spec.roughness,
    tileMeters:kind==='concrete'?1.6:1.15,label:spec.label,photographic:true
   };
   prepared.set(kind,value);return value;
  })();
  pending.set(kind,promise);
  try{await promise;}finally{pending.delete(kind);}
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
root.FusionMaterialLib={version:2,specs,identify,getMaps,prepare};
})(globalThis);
