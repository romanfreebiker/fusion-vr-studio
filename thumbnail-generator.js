import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import {GLTFLoader} from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/loaders/GLTFLoader.js';

// Portadas automáticas generadas en el ordenador, no en las Quest.
export async function createModelThumbnail(blob){
  const url=URL.createObjectURL(blob);
  let gltf,renderer;
  try{
    gltf=await new GLTFLoader().loadAsync(url);
    const root=gltf.scene;
    root.rotation.x=-Math.PI/2; // Fusion 360: Z siempre vertical.
    root.updateMatrixWorld(true);
    let bounds=new THREE.Box3().setFromObject(root);
    if(bounds.isEmpty())throw Error('Modelo sin geometría visible');
    const center=bounds.getCenter(new THREE.Vector3());
    const dimensions=bounds.getSize(new THREE.Vector3());
    root.position.sub(center);
    root.updateMatrixWorld(true);
    bounds=new THREE.Box3().setFromObject(root);
    const scene=new THREE.Scene();
    scene.background=new THREE.Color(0x23364f);
    scene.add(root);
    const hemi=new THREE.HemisphereLight(0xffffff,0x718399,2.0);
    scene.add(hemi);
    const sun=new THREE.DirectionalLight(0xfff5e8,2.5);
    sun.position.set(3,8,6);scene.add(sun);
    const maxDimension=Math.max(dimensions.x,dimensions.y,dimensions.z,.5);
    const camera=new THREE.PerspectiveCamera(40,480/300,.01,Math.max(100,maxDimension*12));
    const diagonal=new THREE.Vector3(1,.65,1.1).normalize();
    const distance=maxDimension*2.5;
    camera.position.copy(diagonal.multiplyScalar(distance));
    camera.lookAt(0,0,0);
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
    renderer.setSize(480,300,false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.15;
    root.traverse(object=>{
      if(!object.isMesh)return;
      for(const material of [object.material].flat())if(material){
        material.side=THREE.DoubleSide;
        material.needsUpdate=true;
      }
    });
    renderer.render(scene,camera);
    const dataURL=renderer.domElement.toDataURL('image/jpeg',.8);
    const base64=dataURL.split(',')[1];
    if(!base64||base64.length<100)throw Error('No se pudo crear imagen');
    return base64;
  }finally{
    renderer?.dispose();
    renderer?.forceContextLoss();
    URL.revokeObjectURL(url);
  }
}
