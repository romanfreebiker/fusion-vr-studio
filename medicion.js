// ESKALA — motor único de medición v148
export function createMeasurement(ctx){
const {THREE,renderer,scene,controls,presentation,setPresentationMode,standardView,worldPerPixel,zoomAt}=ctx;
let technicalMode=false,technicalOriginals=[],technicalEdges=[],technicalMaterial=null,technicalLineMaterial=null,dimensionLayer=null,dimensions=[],previousMeasureBackground=null;
let measureMode=false,measurePoints=[],measureMarks=null,measureLabel=null,measureHover=null,measureEvent=null,measureFrame=0, snapLayer=null, provisionalLine=null, provisionalLabel=null, elasticCursor=null, elasticSVG=null, elasticStroke=null;
const featureCache=new WeakMap();
const measurementRay=new THREE.Raycaster(),measurementPointer=new THREE.Vector2();
const SNAP_RADIUS=15, PREVIEW_RADIUS=22;
function setTechnicalMode(active){
 if(active===technicalMode||!ctx.model)return;
 technicalMode=active;document.body.classList.toggle('technical',active);
 const b=[...document.querySelectorAll('#presentationBar button')].find(b=>b.textContent==='Modo papel'||b.textContent==='Realista');
 if(b){b.textContent=active?'Realista':'Modo papel';b.setAttribute('aria-pressed',String(active))}
 if(active){previousMeasureBackground=scene.background?.clone();scene.background.set(0xf2f1ed)}else if(previousMeasureBackground){scene.background=previousMeasureBackground;previousMeasureBackground=null}
 if(active){
 technicalMaterial=new THREE.MeshStandardMaterial({color:0xd7d9da,roughness:.95,metalness:0,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
 technicalLineMaterial=new THREE.LineBasicMaterial({color:0x48545e,transparent:true,opacity:.65});
 const meshes=[];ctx.model.traverse(o=>{if(o.isMesh&&o.geometry)meshes.push(o)});
 for(const mesh of meshes){technicalOriginals.push([mesh,mesh.material]);mesh.material=technicalMaterial;const edge=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry,15),technicalLineMaterial);edge.raycast=()=>{};mesh.add(edge);technicalEdges.push(edge)}
 }else{
 for(const [mesh,material] of technicalOriginals)mesh.material=material;
 for(const edge of technicalEdges){edge.removeFromParent();edge.geometry.dispose()}
 technicalOriginals=[];technicalEdges=[];technicalMaterial?.dispose();technicalLineMaterial?.dispose();technicalMaterial=null;technicalLineMaterial=null;
 }
}

function addDimension(a,b,value){
 if(!dimensionLayer){dimensionLayer=document.createElement('div');dimensionLayer.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:22';document.body.append(dimensionLayer)}
 const label=document.createElement('span');label.className='dimension-label';label.textContent=value.replace(/ \(proy\.\)$/,'')+' mm'+(value.endsWith(' (proy.)')?' (proy.)':'');dimensionLayer.append(label);
 dimensions.push({a:a.clone(),b:b.clone(),label});
}
function updateDimensions(){
 if(!dimensions.length)return;
 const r=renderer.domElement.getBoundingClientRect();
 ctx.camera.updateMatrixWorld(true);
 for(const d of dimensions){
 const a=projectMeasure(d.a,r),b=projectMeasure(d.b,r);
 const x=(a.x+b.x)/2,y=(a.y+b.y)/2;
 d.label.hidden=a.z<-1||a.z>1||b.z<-1||b.z>1||x<0||x>innerWidth||y<0||y>innerHeight;
 d.label.style.left=x+'px';d.label.style.top=(y-10)+'px';
 }
}
function clearMeasures(){
 clearProvisional();
 if(dimensionLayer)dimensionLayer.replaceChildren();dimensions=[];
 if(measureMarks){scene.remove(measureMarks);measureMarks.traverse(o=>{o.geometry?.dispose();o.material?.dispose()});measureMarks=null}
 measurePoints=[];if(measureLabel)measureLabel.textContent=measureMode?'Selecciona dos puntos. Acerca el cursor a una arista o vértice.':'';
}
let displayedSnap=null;
function hideMeasureHover(){displayedSnap=null;if(measureHover)measureHover.hidden=true;if(snapLayer)snapLayer.replaceChildren();measureEvent=null;clearProvisional()}
function setMeasureMode(active,btn){
 measureMode=active;controls.enabled=!ctx.walkingMode;btn?.setAttribute('aria-pressed',String(active));
 document.body.classList.toggle('measuring',active);renderer.domElement.style.setProperty('cursor',active?'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2721%27 height=%2721%27 viewBox=%270 0 21 21%27%3E%3Cpath d=%27M3 3L8 8M13 13L18 18M18 3L13 8M8 13L3 18%27 stroke=%27white%27 stroke-width=%273%27 fill=%27none%27/%3E%3Cpath d=%27M3 3L8 8M13 13L18 18M18 3L13 8M8 13L3 18%27 stroke=%27%230c2638%27 stroke-width=%271%27 fill=%27none%27/%3E%3C/svg%3E") 10 10, crosshair':'','important');if(!active)renderer.domElement.style.removeProperty('cursor');setTechnicalMode(active);
 if(!measureLabel){measureLabel=document.createElement('div');measureLabel.style.cssText='position:fixed;bottom:12px;left:12px;z-index:30;max-width:calc(100% - 24px);background:#142034ed;color:#7eeaff;padding:10px;border-radius:8px;pointer-events:none;font:13px system-ui';document.body.append(measureLabel)}
 if(!measureHover){measureHover=document.createElement('div');measureHover.className='measure-snap';measureHover.hidden=true;document.body.append(measureHover)}
 if(!snapLayer){snapLayer=document.createElement('div');snapLayer.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:24';document.body.append(snapLayer)}
 measureLabel.hidden=!active;measureLabel.textContent=ctx.touchGuide?'Mango: mover mira · Un dedo: girar · Toque: fijar · Doble toque: reiniciar':'Clic: medir · Arrastrar: girar · Derecho: panear · Rueda: zoom';
 if(!active){cancelTouchMeasure();touchNavigation.clear();clearMeasures();hideMeasureHover()}
}
function toggleMeasure(btn){
 if(!ctx.model)return;
 if(!measureMode&&ctx.walkingMode)setPresentationMode(false);
 setMeasureMode(!measureMode,btn);
}
function featureEdges(geometry){
 if(featureCache.has(geometry))return featureCache.get(geometry);
 const edges=new THREE.EdgesGeometry(geometry,15);
 const array=edges.attributes.position.array.slice();edges.dispose();featureCache.set(geometry,array);return array;
}
function projectMeasure(p,r){
 const q=p.clone().project(ctx.camera);return {x:r.left+(q.x+1)*r.width/2,y:r.top+(1-q.y)*r.height/2,z:q.z};
}
function measureTarget(x,y,pointerType){
 if(!ctx.model)return null;
 const r=renderer.domElement.getBoundingClientRect(), radius=pointerType==='touch'?22:SNAP_RADIUS;
 ctx.camera.updateMatrixWorld(true);ctx.model.updateMatrixWorld(true);
 const cast=(px,py)=>{measurementPointer.set((px-r.left)/r.width*2-1,-(py-r.top)/r.height*2+1);measurementRay.setFromCamera(measurementPointer,ctx.camera);return measurementRay.intersectObject(ctx.model,true).find(h=>h.object.visible&&h.face)};
 const hit=cast(x,y);
 const axisRadius=pointerType==='touch'?30:25;
 // Probe near the pointer as well, so exposed corners can be snapped from outside the silhouette.
 const hits=[hit];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])hits.push(cast(x+dx*radius*.8,y+dy*radius*.8));
 const candidates=new Map();for(const h of hits)if(h&&!candidates.has(h.object))candidates.set(h.object,h);
 let best=null;const picks=[];
 function offer(p,kind,penalty=0){
 const q=projectMeasure(p,r);if(q.z<-1||q.z>1)return;
 const d=Math.hypot(q.x-x,q.y-y);if(d>Math.max(PREVIEW_RADIUS,measurePoints.length===1?axisRadius:radius))return;
 const score=d+penalty, candidate={p:p.clone(),kind,score,x:q.x,y:q.y};
 
 if(d<=(measurePoints.length===1?axisRadius:radius))picks.push(candidate);
 }
 for(const [mesh,h] of candidates){
 const edges=featureEdges(mesh.geometry),a=new THREE.Vector3(),b=new THREE.Vector3();
 // Only actual feature edges, not the internal diagonals of triangulated faces.
 for(let i=0;i<edges.length;i+=6){
 a.fromArray(edges,i).applyMatrix4(mesh.matrixWorld);b.fromArray(edges,i+3).applyMatrix4(mesh.matrixWorld);
 const u=projectMeasure(a,r),v=projectMeasure(b,r);
 if(Math.min(u.x,v.x)>x+Math.max(PREVIEW_RADIUS,axisRadius)||Math.max(u.x,v.x)<x-Math.max(PREVIEW_RADIUS,axisRadius)||Math.min(u.y,v.y)>y+Math.max(PREVIEW_RADIUS,axisRadius)||Math.max(u.y,v.y)<y-Math.max(PREVIEW_RADIUS,axisRadius))continue;
 offer(a,'Vértice');offer(b,'Vértice');
 const mid=a.clone().lerp(b,.5);offer(mid,'Punto medio',3);
 // Find actual intersections of feature segments with the three global axis lines.
 if(measurePoints.length===1){
   const origin=measurePoints[0],ab=b.clone().sub(a),tol=0.00005;
   for(const axis of ['x','y','z']){
     const other=['x','y','z'].filter(k=>k!==axis);
     const den=other.reduce((n,k)=>n+ab[k]*ab[k],0);
     if(den<1e-16)continue;
     const t=other.reduce((n,k)=>n+(origin[k]-a[k])*ab[k],0)/den;
     if(t<0||t>1)continue;
     const p=a.clone().addScaledVector(ab,t);
     if(Math.hypot(...other.map(k=>p[k]-origin[k]))<=tol)offer(p,'Arista',1);
   }
 }
 const dx=v.x-u.x,dy=v.y-u.y,den=dx*dx+dy*dy;
 if(den>0){const t=THREE.MathUtils.clamp(((x-u.x)*dx+(y-u.y)*dy)/den,0,1);
 // Convert screen interpolation to perspective-correct world interpolation.
 const da=-a.clone().applyMatrix4(ctx.camera.matrixWorldInverse).z,db=-b.clone().applyMatrix4(ctx.camera.matrixWorldInverse).z;
 const k=(1-t)*db+t*da;if(ctx.camera.isOrthographicCamera)offer(a.clone().lerp(b,t),'Arista',7);else if(k>0)offer(a.clone().lerp(b,t*da/k),'Arista',7);}
 }
 }
 const visible=c=>{const f=cast(c.x,c.y);return !f||f.point.clone().sub(c.p).dot(ctx.camera.getWorldDirection(new THREE.Vector3()))>=-Math.max(.002,f.distance*.0001)};
 best=picks.sort((a,b)=>a.score-b.score).filter(c=>Math.hypot(c.x-x,c.y-y)<=radius).slice(0,24).find(visible)||null;
 // No free surface picks: a measurement always requires a geometric feature.
 // Alignment is a property of an actual geometric point, never a virtual projection.
 if(measurePoints.length===1){
   const origin=measurePoints[0],tol=0.00005;
   const aligned=picks.filter(c=>c.p.distanceToSquared(origin)>1e-12).map(c=>{
     const d=c.p.clone().sub(origin);
     const axis=['x','y','z'].find(k=>Math.abs(d[k])>tol&&Math.hypot(...['x','y','z'].filter(j=>j!==k).map(j=>d[j]))<=tol);
     return axis?{...c,alignment:axis==='y'?'Vertical':'Horizontal'}:null;
   }).filter(Boolean).sort((a,b)=>a.score-b.score).find(visible);
   // Exact intersections of a global axis with actual mesh surfaces.
   // A ray hit is a real point, not the projection of a nearby feature.
   const axisRay=new THREE.Raycaster(),axisHits=[];
   for(const axis of ['x','y','z'])for(const sign of [-1,1]){
     const direction=new THREE.Vector3();direction[axis]=sign;
     axisRay.set(origin,direction);axisRay.near=tol;axisRay.far=Infinity;
     for(const h of axisRay.intersectObject(ctx.model,true)){
       if(!h.face||!h.object.visible||h.distance<=tol)continue;
       const q=projectMeasure(h.point,r),pixels=Math.hypot(q.x-x,q.y-y);
       if(q.z<-1||q.z>1||pixels>axisRadius)continue;
       const candidate={p:h.point.clone(),kind:'Intersección de eje',alignment:axis==='y'?'Vertical':'Horizontal',x:q.x,y:q.y,score:pixels+2};
       axisHits.push(candidate);
     }
   }
   const realAxis=axisHits.sort((a,b)=>a.score-b.score).find(visible);
   if(aligned||realAxis)best=aligned&&(!realAxis||aligned.score<=realAxis.score+3)?aligned:realAxis;
 }
 return best;
}
function clearProvisional(){
 if(elasticSVG)elasticSVG.style.display='none';elasticCursor=null;
 if(provisionalLine){scene.remove(provisionalLine);provisionalLine.geometry.dispose();provisionalLine.material.dispose();provisionalLine=null}
 if(provisionalLabel){provisionalLabel.remove();provisionalLabel=null}
}
function updateElastic(){
 if(!elasticCursor||measurePoints.length!==1||!measureMode){if(elasticSVG)elasticSVG.style.display='none';return}
 const r=renderer.domElement.getBoundingClientRect(),a=projectMeasure(measurePoints[0],r);
 const b=elasticCursor.target?projectMeasure(elasticCursor.target.p,r):elasticCursor;
 if(!elasticSVG){
 const ns='http://www.w3.org/2000/svg';elasticSVG=document.createElementNS(ns,'svg');elasticSVG.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:23;overflow:hidden';
 elasticStroke=document.createElementNS(ns,'line');elasticStroke.setAttribute('stroke','#0078b8');elasticStroke.setAttribute('stroke-width','1.3');elasticStroke.setAttribute('stroke-dasharray','5 3');elasticSVG.append(elasticStroke);document.body.append(elasticSVG);
 }
 const valid=a.z>=-1&&a.z<=1;
 elasticSVG.style.display=valid?'block':'none';
 elasticStroke.setAttribute('stroke',elasticCursor.target?.alignment?'#16a34a':'#0078b8');elasticStroke.setAttribute('x1',a.x);elasticStroke.setAttribute('y1',a.y);elasticStroke.setAttribute('x2',b.x);elasticStroke.setAttribute('y2',b.y);
 if(provisionalLabel){
 provisionalLabel.hidden=!valid||!elasticCursor.target;
 provisionalLabel.style.left=(a.x+b.x)/2+'px';provisionalLabel.style.top=((a.y+b.y)/2-10)+'px';
 }
}
function previewMeasure(target,x,y){
 if(!measureHover)return;
 if(snapLayer)snapLayer.replaceChildren();
 const same=target?.p&&measurePoints.length===1&&target.p.distanceToSquared(measurePoints[0])<1e-12;
 measureHover.hidden=!target?.p||same;displayedSnap=measureHover.hidden?null:{target,x,y};
 if(target?.p&&!same){measureHover.style.left=target.x+'px';measureHover.style.top=target.y+'px';measureHover.dataset.kind=target.sourceKind||target.kind;measureHover.dataset.aligned=String(!!target.alignment);measureHover.textContent='';measureHover.classList.remove('free')}
 if(measurePoints.length!==1){clearProvisional();return}
 if(!Number.isFinite(x)||!Number.isFinite(y))return;
 elasticCursor={x,y,target:target?.p&&!same?target:null};
 if(!provisionalLabel){provisionalLabel=document.createElement('span');provisionalLabel.className='dimension-label';provisionalLabel.style.cssText='position:fixed;z-index:24;pointer-events:none;opacity:.85';document.body.append(provisionalLabel)}
 if(!elasticCursor.target){provisionalLabel.hidden=true;}if(elasticCursor.target)provisionalLabel.textContent=Math.round(measurePoints[0].distanceTo(target.p)*1000).toLocaleString('es-ES')+' mm'+(target.alignment?' · '+target.alignment+' ✓'+(target.projected?' (proyección)':''):'');
 updateElastic();
}
const measureTouches=new Set();let measurePress=null, desktopOrbit=null;
let touchMeasure=null,touchLoupe=null,loupeCanvas=null,loupeCaption=null,loupeRenderer=null,loupeCamera=null;
const touchNavigation=new Map();let touchMulti=false;
let loupePosition=null,loupeDrag=null;
function positionMobileLoupe(){if(!touchLoupe)return;const w=touchLoupe.offsetWidth||180,h=touchLoupe.offsetHeight||180;const p=loupePosition||{x:innerWidth-w-10,y:Math.max(65,(document.getElementById('presentationBar')?.getBoundingClientRect().bottom||55)+8)};const x=Math.max(0,Math.min(Math.max(0,innerWidth-w),p.x)),y=Math.max(0,Math.min(Math.max(0,innerHeight-h),p.y));touchLoupe.style.left=x+'px';touchLoupe.style.top=y+'px';touchLoupe.style.right='auto';}
function endLoupeDrag(){
 if(!loupeDrag)return;
 const id=loupeDrag.id;loupeDrag=null;
 touchLoupe.style.cursor='grab';
 if(touchLoupe.hasPointerCapture(id))touchLoupe.releasePointerCapture(id);
}
function enableLoupeDrag(){
 touchLoupe.style.pointerEvents='auto';touchLoupe.style.touchAction='none';touchLoupe.style.cursor='grab';
 // Only the visible magnifier owns a drag started inside its bounds.
 loupeCanvas.style.pointerEvents='none';
 touchLoupe.addEventListener('pointerdown',e=>{
   e.preventDefault();e.stopImmediatePropagation();
   if(loupeDrag)return;
   const r=touchLoupe.getBoundingClientRect();
   loupeDrag={id:e.pointerId,x:e.clientX-r.left,y:e.clientY-r.top};
   touchLoupe.setPointerCapture(e.pointerId);touchLoupe.style.cursor='grabbing';
 });
 touchLoupe.addEventListener('pointermove',e=>{
   if(loupeDrag?.id!==e.pointerId)return;
   e.preventDefault();e.stopImmediatePropagation();
   loupePosition={x:e.clientX-loupeDrag.x,y:e.clientY-loupeDrag.y};positionMobileLoupe();
 });
 for(const type of ['pointerup','pointercancel','lostpointercapture'])touchLoupe.addEventListener(type,e=>{
   if(loupeDrag?.id!==e.pointerId)return;
   e.stopImmediatePropagation();endLoupeDrag();
 });
 window.addEventListener('blur',endLoupeDrag);
 // A new gesture outside the magnifier always belongs to the underlying viewer.
 renderer.domElement.addEventListener('pointerdown',e=>{
   if(loupeDrag&&loupeDrag.id===e.pointerId)endLoupeDrag();
 },true);
}
function hideLoupe(){if(touchLoupe){endLoupeDrag();touchLoupe.hidden=true}}
function cancelTouchMeasure(){if(touchMeasure)clearTimeout(touchMeasure.timer);touchMeasure=null;cancelMobileTap();hideLoupe()}
// Fixed real-world field of view, independent of the main ctx.camera zoom.
const LOUPE_FIELD_MM=100;
let loupeReticle=null;
function openLoupe(){
 if(touchLoupe)return;
 touchLoupe=document.createElement('div');touchLoupe.style.cssText='position:fixed;z-index:45;pointer-events:none;width:180px;height:180px;background:#f2f1ed;border:3px solid #0078b8;border-radius:50%;overflow:hidden;box-shadow:0 3px 16px #0006;box-sizing:border-box';
 loupeCanvas=document.createElement('canvas');loupeCanvas.style.cssText='width:174px;height:174px;display:block';touchLoupe.append(loupeCanvas);
 loupeRenderer=new THREE.WebGLRenderer({canvas:loupeCanvas,antialias:true});loupeRenderer.setPixelRatio(Math.min(3,Math.max(2,devicePixelRatio||1)));loupeRenderer.setSize(174,174,false);loupeRenderer.outputColorSpace=renderer.outputColorSpace;loupeRenderer.toneMapping=renderer.toneMapping;loupeRenderer.toneMappingExposure=renderer.toneMappingExposure;
 const half=LOUPE_FIELD_MM/2000;loupeCamera=new THREE.OrthographicCamera(-half,half,half,-half,.00001,2000);
 loupeReticle=document.createElement('div');loupeReticle.style.cssText='position:absolute;left:50%;top:50%;width:18px;height:18px;transform:translate(-50%,-50%);border:1px solid #16a34a;border-radius:50%;background:linear-gradient(#16a34a,#16a34a) center/18px 1px no-repeat,linear-gradient(#16a34a,#16a34a) center/1px 18px no-repeat;pointer-events:none;box-shadow:0 0 2px white';touchLoupe.append(loupeReticle);
 loupeCaption=document.createElement('div');loupeCaption.style.cssText='position:absolute;bottom:15px;left:8px;right:8px;text-align:center;font:600 10px system-ui;color:#005d91;background:#fffffff0;border-radius:8px;padding:3px;pointer-events:none';touchLoupe.append(loupeCaption);document.body.append(touchLoupe);enableLoupeDrag();
}
function updateTouchAim(x,y){
 if(!touchMeasure)return;
 touchMeasure.x=x;touchMeasure.y=y;touchMeasure.target=measureTarget(x,y,'touch');previewMeasure(touchMeasure.target,x,y);
}
function renderLoupe(){
 if(!touchMeasure?.aim||!measureMode){hideLoupe();return}
 openLoupe();const d=touchMeasure,t=d.target;
 // A projected measurement retains the originating geometric reference.
 const point=t?.sourcePoint||t?.p;
 if(!point){
   loupeRenderer.clear();loupeCanvas.style.visibility='hidden';loupeReticle.hidden=true;
   loupeCaption.textContent='Sin enganche';
 }else{
   loupeCanvas.style.visibility='visible';loupeReticle.hidden=false;
   ctx.camera.updateMatrixWorld(true);
   const quaternion=ctx.camera.getWorldQuaternion(new THREE.Quaternion());
   const direction=ctx.camera.getWorldDirection(new THREE.Vector3());
   const eye=ctx.camera.getWorldPosition(new THREE.Vector3());
   const depth=Math.max(.001,point.clone().sub(eye).dot(direction));
   // Preserve the main viewing direction and depth plane, while centring
   // the actual 3D feature with a constant orthographic field of 100 mm.
   loupeCamera.position.copy(point).addScaledVector(direction,-depth);
   loupeCamera.quaternion.copy(quaternion);
   loupeCamera.near=.00001;loupeCamera.far=Math.max(2000,depth+100);
   loupeCamera.updateProjectionMatrix();loupeCamera.updateMatrixWorld(true);
   loupeRenderer.render(scene,loupeCamera);
   loupeCaption.textContent=(t.sourceKind||t.kind)+(t.projected?' · Proyección':' · Enganche');
 }
 touchLoupe.hidden=false;positionMobileLoupe();
}
function touchSnapshotMeasure(){const v=[...touchNavigation.values()];return v.length<2?null:{x:(v[0].x+v[1].x)/2,y:(v[0].y+v[1].y)/2,span:Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y)}}
function panTouchMeasure(dx,dy){ctx.camera.updateMatrixWorld(true);const shift=new THREE.Vector3().setFromMatrixColumn(ctx.camera.matrixWorld,0).multiplyScalar(-dx*worldPerPixel()).addScaledVector(new THREE.Vector3().setFromMatrixColumn(ctx.camera.matrixWorld,1),dy*worldPerPixel());ctx.camera.position.add(shift);controls.target.add(shift);controls.update()}
let mobileResult=null;let mobilePanel=null,mobileCross=null,mobileFix=null,mobileStatus=null,mobileNav='move',mobileFine=true,mobileAim=null,mobileLastAim=0,mobileDirty=true,mobilePivot=null,mobileView=null,mobileNudge=null,mobileLoupeOn=true,mobileLastFrame=0;
let mobileTapTimer=0,mobilePendingTap=null;const MOBILE_DOUBLE_MS=300;
function cancelMobileTap(){clearTimeout(mobileTapTimer);mobileTapTimer=0;mobilePendingTap=null}
function mobileTap(){const now=performance.now();if(mobilePendingTap&&now-mobilePendingTap.time<=MOBILE_DOUBLE_MS){cancelMobileTap();clearMeasures();hideMeasureHover();mobileDirty=true;mobileUpdate(true);return;}cancelMobileTap();const c=mobileCenter(),t=measureTarget(c.x,c.y,'touch');mobilePendingTap={time:now,target:t?.p?{...t,p:t.p.clone()}:null};mobileTapTimer=setTimeout(()=>{const pending=mobilePendingTap;cancelMobileTap();if(measureMode&&mobileActive()&&pending?.target){selectMeasurePoint(pending.target);mobileDirty=true;mobileUpdate(true)}else if(measureMode&&mobileActive()&&pending){mobileDirty=true;mobileUpdate(true);if(mobileStatus)mobileStatus.textContent='Sin enganche · Busca una arista o un punto';}},MOBILE_DOUBLE_MS);}
let aimOffsetX=0,aimOffsetY=0,miraHandleDrag=null;function mobileCenter(){const r=renderer.domElement.getBoundingClientRect();return {x:r.left+r.width/2+aimOffsetX,y:r.top+r.height/2+aimOffsetY}} function moveAim(dx,dy){const r=renderer.domElement.getBoundingClientRect();aimOffsetX=THREE.MathUtils.clamp(aimOffsetX+dx,-r.width/2+15,r.width/2-15);aimOffsetY=THREE.MathUtils.clamp(aimOffsetY+dy,-r.height/2+15,r.height/2-15);mobileDirty=true;}
function mobileActive(){return presentation&&!ctx.walkingMode&&measureMode&&ctx.touchGuide}
function mobileUpdate(force=false){
 if(!mobileActive()){if(measureLabel)measureLabel.hidden=!measureMode;if(ctx.presentationHint)ctx.presentationHint.hidden=false;document.body.classList.remove('taller-mobile');if(mobilePanel)mobilePanel.hidden=true;if(mobileCross)mobileCross.hidden=true;hideLoupe();return}
 if(!mobilePanel){
 document.body.classList.add('taller-mobile');mobilePanel=document.createElement('div');mobilePanel.id='mobileCAD';mobilePanel.style.cssText='position:fixed;bottom:max(10px,env(safe-area-inset-bottom));left:8px;right:8px;z-index:40;background:#142034f5;color:white;border:1px solid #52647b;border-radius:12px;padding:8px;display:flex;flex-wrap:wrap;justify-content:center;gap:6px;font:13px system-ui';
 const make=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.style.cssText='font:600 13px system-ui;color:white;background:#304459;border:1px solid #7690a6;border-radius:6px;padding:9px 12px;touch-action:manipulation';b.onclick=fn;mobilePanel.append(b);return b};
 make('+',()=>{const c=mobileCenter();zoomAt(c.x,c.y,-180);mobileDirty=true});
 make('−',()=>{const c=mobileCenter();zoomAt(c.x,c.y,180);mobileDirty=true});
 const fine=make('Precisión ✓',()=>{mobileFine=!mobileFine;fine.textContent=mobileFine?'Precisión ✓':'Precisión';fine.style.background=mobileFine?'#0078b8':'#304459'});fine.style.background='#0078b8';
 make('Encuadrar',()=>{standardView(1,1,1);mobilePivot=null;mobileDirty=true});
 make('Centrar',()=>{const c=mobileCenter(),p=localOrbitPivot(c.x,c.y);if(p){const dir=ctx.camera.getWorldDirection(new THREE.Vector3());const depth=p.clone().sub(ctx.camera.position).dot(dir);if(depth>0)controls.target.copy(ctx.camera.position).addScaledVector(dir,depth);mobilePivot=p;controls.update()}mobileDirty=true});
 mobileView=document.createElement('select');mobileView.setAttribute('aria-label','Orientación');for(const [n,v] of [['Vistas',''],['Frontal','0,0,1'],['Posterior','0,0,-1'],['Izquierda','-1,0,0'],['Derecha','1,0,0'],['Superior','0,1,0'],['Inferior','0,-1,0'],['Isométrica','1,1,1']])mobileView.add(new Option(n,v));mobileView.onchange=()=>{if(mobileView.value){standardView(...mobileView.value.split(',').map(Number));mobilePivot=null;mobileDirty=true}mobileView.value=''};mobilePanel.append(mobileView);
 const loupeToggle=make('Lupa ✓',()=>{mobileLoupeOn=!mobileLoupeOn;loupeToggle.textContent=mobileLoupeOn?'Lupa ✓':'Lupa';mobileDirty=true;if(!mobileLoupeOn)hideLoupe()});
 const measureToggle=make('Medir',()=>{const b=[...document.querySelectorAll('#presentationBar button')].find(b=>b.textContent==='Medir');if(b)toggleMeasure(b);mobileDirty=true});measureToggle.id='mobileMeasureToggle';
 mobileStatus=document.createElement('span');mobileStatus.style.cssText='width:100%;text-align:center;font-size:12px';mobilePanel.append(mobileStatus);mobileResult=document.createElement('output');mobileResult.className='eskala-measure-result';mobileResult.setAttribute('aria-live','polite');mobileResult.hidden=true;mobilePanel.append(mobileResult);document.body.append(mobilePanel);
 mobileCross=document.createElement('div');mobileCross.style.cssText='position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:24px;height:24px;border:1px solid #0078b8;border-radius:50%;pointer-events:none;z-index:26;background:linear-gradient(#0078b8,#0078b8) center/24px 1px no-repeat,linear-gradient(#0078b8,#0078b8) center/1px 24px no-repeat';const handle=document.createElement('div');handle.setAttribute('aria-label','Mango para arrastrar la mira');handle.style.cssText='position:absolute;left:19px;top:19px;width:78px;height:40px;transform:rotate(45deg);transform-origin:0 50%;margin-top:-20px;pointer-events:auto;touch-action:none;cursor:grab;display:flex;align-items:center;justify-content:center;';const shaft=document.createElement('div');shaft.style.cssText='width:68px;height:6px;border-radius:4px;background:#0078b8;border:1px solid #d5f3ff;box-shadow:0 1px 3px #0007;pointer-events:none';handle.append(shaft);const grip=document.createElement('div');grip.style.cssText='position:absolute;right:4px;width:34px;height:16px;border-radius:7px;background:#0078b8;border:2px solid #cceeff;box-shadow:0 1px 4px #0006;pointer-events:none';handle.append(grip);mobileCross.append(handle);
 handle.addEventListener('pointerdown',e=>{if(!measureMode||miraHandleDrag)return;e.preventDefault();e.stopPropagation();miraHandleDrag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,drag:false};handle.setPointerCapture(e.pointerId);handle.style.cursor='grabbing'});
 handle.addEventListener('pointermove',e=>{if(miraHandleDrag?.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();if(!miraHandleDrag.drag&&Math.hypot(e.clientX-miraHandleDrag.startX,e.clientY-miraHandleDrag.startY)>7)miraHandleDrag.drag=true;if(!miraHandleDrag.drag)return;moveAim(e.clientX-miraHandleDrag.x,e.clientY-miraHandleDrag.y);miraHandleDrag.x=e.clientX;miraHandleDrag.y=e.clientY;mobileUpdate(true)});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(type,e=>{if(miraHandleDrag?.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();const d=miraHandleDrag;miraHandleDrag=null;if(type==='pointerup'&&!d.drag&&Math.hypot(e.clientX-d.startX,e.clientY-d.startY)<=7)mobileTap();handle.style.cursor='grab';if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId)});
 document.body.append(mobileCross);
 }
 document.body.classList.add('taller-mobile');mobilePanel.hidden=false;mobileCross.hidden=!measureMode||!ctx.touchGuide;const mt=document.getElementById('mobileMeasureToggle');if(mt){mt.textContent=measureMode?'Salir de medir':'Medir';mt.setAttribute('aria-pressed',String(measureMode))}
 if(ctx.presentationHint)ctx.presentationHint.hidden=true;
 if(measureLabel)measureLabel.hidden=ctx.touchGuide;
 if(!measureMode){if(mobileResult)mobileResult.hidden=true;hideLoupe();mobileStatus.textContent='Un dedo: girar · Dos dedos: desplazar y zoom';return}
 if(!ctx.touchGuide){if(mobileResult)mobileResult.hidden=true;hideLoupe();mobileStatus.textContent='Clic: fijar · Arrastrar: girar · Rueda: zoom';return}
 const c=mobileCenter(),now=performance.now();mobileCross.style.left=c.x+'px';mobileCross.style.top=c.y+'px';
 if(force||(mobileDirty&&now-mobileLastAim>65)||now-mobileLastAim>400){mobileLastAim=now;mobileDirty=false;mobileAim=measureTarget(c.x,c.y,'touch');previewMeasure(mobileAim,c.x,c.y)}
 mobileStatus.textContent=(measurePoints.length===1?'Segundo punto':'Primer punto')+' · '+(mobileAim?.p?(mobileAim.alignment?mobileAim.alignment+' ✓'+(mobileAim.projected?' (proyección)':'')+' · ':'')+'Toca para fijar · Doble toque: reiniciar':'Sin enganche · Busca una arista o un punto');
 if(mobileResult){const done=dimensions.at(-1),pending=measurePoints.length===1&&mobileAim?.p&&mobileAim.p.distanceToSquared(measurePoints[0])>1e-12;const result=done?'Medida: '+done.label.textContent:pending?'Provisional: '+Math.round(measurePoints[0].distanceTo(mobileAim.p)*1000).toLocaleString('es-ES')+' mm':'';if(mobileResult.textContent!==result)mobileResult.textContent=result;mobileResult.hidden=!result;if(done)mobileStatus.textContent='Medida fijada · Toca para empezar otra';}
 // Reuse the magnifier after the WebGL frame, with a fixed aim rather than a finger.
 if(mobileLoupeOn){if(force||now-mobileLastFrame>100){mobileLastFrame=now;const saved=touchMeasure;touchMeasure={aim:true,x:c.x,y:c.y,target:mobileAim};renderLoupe();touchMeasure=saved;}if(touchLoupe)positionMobileLoupe()}else hideLoupe();
}
function touchMeasureDown(e){
 e.preventDefault();e.stopImmediatePropagation();renderer.domElement.setPointerCapture(e.pointerId);
 touchNavigation.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(touchNavigation.size>1){touchMulti=true;touchMeasure=null;return}
 touchMulti=false;touchMeasure={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,started:performance.now(),drag:false,pivot:touchOrbitPivot(e.clientX,e.clientY)};
}
function touchMeasureMove(e){
 e.preventDefault();e.stopImmediatePropagation();const prev=touchNavigation.get(e.pointerId);if(!prev)return;
 const before=touchSnapshotMeasure();touchNavigation.set(e.pointerId,{x:e.clientX,y:e.clientY});const after=touchSnapshotMeasure();
 if(touchMulti&&touchNavigation.size>=2){if(before&&after){panTouchMeasure(after.x-before.x,after.y-before.y);if(before.span>2&&after.span>2){const c=mobileCenter();zoomAt(c.x,c.y,-Math.log(after.span/before.span)/.0018)}mobileDirty=true}return}
 let d=touchMeasure;if(!d||d.id!==e.pointerId){if(touchNavigation.size!==1)return;touchMulti=false;d=touchMeasure={id:e.pointerId,x:prev.x,y:prev.y,startX:prev.x,startY:prev.y,started:performance.now(),drag:true,pivot:touchOrbitPivot(prev.x,prev.y)};}
 if(!d.drag&&Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>7)d.drag=true;
 if(!d.drag)return;
 const f=mobileFine?.45:1,dx=(e.clientX-d.x)*f,dy=(e.clientY-d.y)*f;
 rotateDesktop(-dx,-dy,d.pivot);
 d.x=e.clientX;d.y=e.clientY;mobileDirty=true;
}
function touchMeasureUp(e,cancel=false){
 e.preventDefault();e.stopImmediatePropagation();touchNavigation.delete(e.pointerId);
 const d=touchMeasure?.id===e.pointerId?touchMeasure:null;
 if(d){touchMeasure=null;if(!cancel&&!touchMulti&&measureMode&&!d.drag&&Math.hypot(e.clientX-d.startX,e.clientY-d.startY)<=7)mobileTap();}
 if(!touchNavigation.size)touchMulti=false;
 if(renderer.domElement.hasPointerCapture(e.pointerId))renderer.domElement.releasePointerCapture(e.pointerId);mobileDirty=true;
}
function touchOrbitPivot(x,y){
 const hit=localOrbitPivot(x,y);
 if(hit)return hit;
 // Empty background: intersect the viewing ray with the plane through the
 // current orbit target, perpendicular to the ctx.camera. The pivot stays under
 // the finger rather than jumping back to the centre or an older target.
 const r=renderer.domElement.getBoundingClientRect();
 const ray=new THREE.Raycaster();
 ctx.camera.updateMatrixWorld(true);
 ray.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2),ctx.camera);
 const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(ctx.camera.getWorldDirection(new THREE.Vector3()),controls.target);
 return ray.ray.intersectPlane(plane,new THREE.Vector3())||controls.target.clone();
}
function localOrbitPivot(x,y){
 ctx.camera.updateMatrixWorld(true);
 const r=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();
 ray.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2),ctx.camera);
 const hit=ctx.model&&ray.intersectObject(ctx.model,true).find(h=>h.object.visible&&h.face);
 return hit?.point.clone()||null;
}
function rotateDesktop(dx,dy,pivot){
 // Rotate ctx.camera AND its look target around the local surface point.
 // This preserves the pivot's screen position, even away from screen centre.
 const p=pivot||controls.target.clone(),offset=ctx.camera.position.clone().sub(p),viewOffset=controls.target.clone().sub(p);
 const scale=worldPerPixel()*innerHeight;
 const sensitivity=THREE.MathUtils.clamp(scale/Math.max(ctx.distance,.01),.22,1);
 const theta=dx*2*Math.PI/Math.max(1,innerHeight)*sensitivity;
 const phi=dy*2*Math.PI/Math.max(1,innerHeight)*sensitivity;
 const direction=ctx.camera.getWorldDirection(new THREE.Vector3());
 const polar=Math.acos(THREE.MathUtils.clamp(-direction.y,-1,1));
 const pitch=THREE.MathUtils.clamp(phi,.005-polar,Math.PI-.005-polar);
 const yawQ=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),theta);
 const right=new THREE.Vector3().setFromMatrixColumn(ctx.camera.matrixWorld,0).normalize().applyQuaternion(yawQ);
 const pitchQ=new THREE.Quaternion().setFromAxisAngle(right,-pitch);
 const q=pitchQ.multiply(yawQ);
 ctx.camera.position.copy(p).add(offset.applyQuaternion(q));
 controls.target.copy(p).add(viewOffset.applyQuaternion(q));
 ctx.camera.lookAt(controls.target);ctx.camera.updateMatrixWorld(true);controls.update();
}
renderer.domElement.addEventListener('pointerdown',e=>{
 if(measureMode&&presentation&&!ctx.walkingMode&&e.pointerType==='touch'){if(loupeDrag)endLoupeDrag();ctx.touchGuide=true;touchMeasureDown(e);return;}
 if(presentation&&!ctx.walkingMode&&e.pointerType!=='touch'&&e.button===0){e.preventDefault();e.stopImmediatePropagation();desktopOrbit={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,drag:false,snap:measureMode&&measureHover&&!measureHover.hidden?displayedSnap:null,pivot:localOrbitPivot(e.clientX,e.clientY)||localOrbitPivot(innerWidth/2,innerHeight/2)||controls.target.clone()};renderer.domElement.setPointerCapture(e.pointerId);hideMeasureHover();return;}
 if(!measureMode)return;
 if(e.pointerType==='touch'){measureTouches.add(e.pointerId);if(measureTouches.size>1){measurePress=null;hideMeasureHover();return}}
 if(e.button!==0){measurePress=null;hideMeasureHover();return}
 measurePress={id:e.pointerId,x:e.clientX,y:e.clientY,drag:false,type:e.pointerType,snap:measureHover&&!measureHover.hidden?displayedSnap:null};hideMeasureHover();
},true);
renderer.domElement.addEventListener('pointermove',e=>{
 if(e.pointerType==='touch'&&touchNavigation.has(e.pointerId)){touchMeasureMove(e);return;}
 if(desktopOrbit?.id===e.pointerId){e.preventDefault();e.stopImmediatePropagation();const d=desktopOrbit;if(!d.drag&&Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>4)d.drag=true;if(d.drag){rotateDesktop(e.clientX-d.x,e.clientY-d.y,d.pivot);d.x=e.clientX;d.y=e.clientY}hideMeasureHover();if(measureMode&&measurePoints.length===1)previewMeasure(null,e.clientX,e.clientY);return;}
 if(!measureMode)return;
 if(measurePress&&measurePress.id===e.pointerId&&Math.hypot(e.clientX-measurePress.x,e.clientY-measurePress.y)>5){measurePress.drag=true;hideMeasureHover()}
 if(e.pointerType==='touch'||e.buttons)return;
 measureEvent={x:e.clientX,y:e.clientY,type:e.pointerType};
 if(!measureFrame)measureFrame=requestAnimationFrame(()=>{measureFrame=0;if(measureMode&&measureEvent)previewMeasure(measureTarget(measureEvent.x,measureEvent.y,measureEvent.type),measureEvent.x,measureEvent.y)});
},true);
renderer.domElement.addEventListener('pointerleave',hideMeasureHover);
function confirmedDesktopSnap(e,snap=displayedSnap){
 if(!snap||Math.hypot(e.clientX-snap.x,e.clientY-snap.y)>4)return null;
 const fresh=measureTarget(e.clientX,e.clientY,e.pointerType);
 if(!fresh?.p||fresh.p.distanceTo(snap.target.p)>0.00005)return null;
 return snap.target;
}
function selectMeasurePoint(target){
 if(!target?.p||target.projected||!['Vértice','Punto medio','Arista','Intersección de eje'].includes(target.kind))return;
 if(measurePoints.length!==1)clearMeasures();else if(target.p.distanceToSquared(measurePoints[0])<1e-12)return;
 clearProvisional();
 const p=target.p.clone();
 if(!measureMarks){measureMarks=new THREE.Group();scene.add(measureMarks)}
 const marker=new THREE.Points(new THREE.BufferGeometry().setFromPoints([p]),new THREE.PointsMaterial({color:0xd71920,size:5,sizeAttenuation:false,depthTest:false,depthWrite:false}));marker.renderOrder=1000;measureMarks.add(marker);
 measurePoints.push(p);
 if(measurePoints.length===1){measureLabel.textContent='Primer punto seleccionado. Puedes girar y acercarte para buscar el segundo.';return}
 const [a,b]=measurePoints,delta=b.clone().sub(a);
 const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]),new THREE.LineBasicMaterial({color:0x0078b8,depthTest:false,depthWrite:false}));line.renderOrder=999;measureMarks.add(line);
 const fmt=x=>Math.round(Math.abs(x)*1000).toLocaleString('es-ES');
 addDimension(a,b,fmt(delta.length()));
 measureLabel.textContent='Distancia: '+fmt(delta.length())+' mm'+(target.alignment?' · '+target.alignment:'')+' · Selecciona otro punto para empezar de nuevo.';
 measurePoints=[];
}
renderer.domElement.addEventListener('pointerup',e=>{
 if(e.pointerType==='touch'&&touchNavigation.has(e.pointerId)){touchMeasureUp(e);return;}
 if(desktopOrbit?.id===e.pointerId){e.preventDefault();e.stopImmediatePropagation();const d=desktopOrbit;desktopOrbit=null;if(renderer.domElement.hasPointerCapture(e.pointerId))renderer.domElement.releasePointerCapture(e.pointerId);if(measureMode&&!d.drag&&Math.hypot(e.clientX-d.startX,e.clientY-d.startY)<=4){const t=confirmedDesktopSnap(e,d.snap);if(t)selectMeasurePoint(t);else if(measureLabel)measureLabel.textContent='Sin enganche confirmado · Acerca el cursor hasta ver el punto rojo.';hideMeasureHover();if(measurePoints.length===1)previewMeasure(null,e.clientX,e.clientY)}else if(measureMode&&measurePoints.length===1)previewMeasure(null,e.clientX,e.clientY);return;}
 if(e.pointerType==='touch')measureTouches.delete(e.pointerId);
 const press=measurePress;
 if(!press||press.id!==e.pointerId)return;
 measurePress=null;
 if(!measureMode||press.drag||Math.hypot(e.clientX-press.x,e.clientY-press.y)>5)return;
 const target=e.pointerType==='touch'?measureTarget(e.clientX,e.clientY,e.pointerType):confirmedDesktopSnap(e,press.snap);
 if(target)selectMeasurePoint(target);else if(measureLabel)measureLabel.textContent='Sin enganche confirmado · Busca el punto rojo.';hideMeasureHover();
},true);
for(const event of ['pointercancel','lostpointercapture'])renderer.domElement.addEventListener(event,e=>{if(touchNavigation.has(e.pointerId)){touchMeasureUp(e,true);return}measureTouches.delete(e.pointerId);if(desktopOrbit?.id===e.pointerId)desktopOrbit=null;if(measurePress?.id===e.pointerId)measurePress=null},true);
addEventListener('blur',()=>{desktopOrbit=null;measurePress=null;measureTouches.clear();touchNavigation.clear();cancelTouchMeasure();hideMeasureHover()});
addEventListener('keydown',e=>{if(measureMode&&e.key==='Escape'){clearMeasures();hideMeasureHover()}});

return {get active(){return measureMode},get technical(){return technicalMode},setMeasureMode,toggleMeasure,clearMeasures,hideMeasureHover,setTechnicalMode,frame(){updateDimensions();updateElastic();if(mobileActive()||mobilePanel||touchLoupe)mobileUpdate();}};
}
