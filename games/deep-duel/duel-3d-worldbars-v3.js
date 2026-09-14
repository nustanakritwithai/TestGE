import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const viewport=document.getElementById('viewport');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function sideOf(group){
  const ring=group?.userData?.ring;
  if(!ring?.material?.color)return null;
  const hex=ring.material.color.getHex();
  const r=(hex>>16)&255,b=hex&255;
  return b>r?'a':'b';
}

function makeBar(color,y){
  const root=new THREE.Group();
  root.position.set(0,y,0);
  const bg=new THREE.Mesh(
    new THREE.PlaneGeometry(1.15,.11),
    new THREE.MeshBasicMaterial({color:0x110d09,transparent:true,opacity:.88,depthTest:false,depthWrite:false,side:THREE.DoubleSide})
  );
  bg.renderOrder=50;
  root.add(bg);
  const fill=new THREE.Mesh(
    new THREE.PlaneGeometry(1.08,.065),
    new THREE.MeshBasicMaterial({color,depthTest:false,depthWrite:false,side:THREE.DoubleSide})
  );
  fill.position.z=.006;
  fill.renderOrder=51;
  root.add(fill);
  root.userData.fill=fill;
  root.userData.baseWidth=1.08;
  return root;
}

function addWorldBars(group,side){
  if(group.userData.worldBars)return group.userData.worldBars;
  const holder=new THREE.Group();
  holder.position.set(0,.11,0);
  const hp=makeBar(0xd45d53,0);
  const st=makeBar(0x57a9d8,-.15);
  const po=makeBar(0xd9aa56,-.30);
  holder.add(hp,st,po);
  holder.userData={hp,st,po,side};
  holder.traverse(o=>{if(o.isMesh)o.frustumCulled=false});
  group.add(holder);
  group.userData.worldBars=holder;
  return holder;
}

function value(side,key){
  const el=document.getElementById(side+key);
  return Number(el?.textContent)||0;
}

function setFill(bar,pct){
  pct=clamp(pct,0,1);
  const f=bar.userData.fill;
  f.scale.x=Math.max(.001,pct);
  f.position.x=-(bar.userData.baseWidth*(1-pct))/2;
}

function updateBars(group,camera,side){
  const bars=addWorldBars(group,side);
  setFill(bars.userData.hp,value(side,'HP')/(side==='a'?1000:900));
  setFill(bars.userData.st,value(side,'ST')/100);
  setFill(bars.userData.po,value(side,'PO')/100);
  // billboard: keep the bars facing the camera while remaining attached under fighter
  const worldQ=new THREE.Quaternion();
  group.getWorldQuaternion(worldQ);
  bars.quaternion.copy(camera.quaternion).premultiply(worldQ.invert());
  bars.scale.setScalar(.92);
}

const originalRender=THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render=function(scene,camera){
  try{
    if(this.domElement&&viewport?.contains(this.domElement)){
      scene.traverse(o=>{
        if(o?.isGroup&&o.userData?.swordArm&&o.userData?.ring){
          const side=sideOf(o);
          if(side)updateBars(o,camera,side);
        }
      });
    }
  }catch(e){console.warn('3D fighter bars:',e)}
  return originalRender.call(this,scene,camera);
};

// Hide the failed DOM overlay variant entirely; the visible bars are now world-space 3D meshes.
for(const id of ['aUnitHud','bUnitHud']){
  const el=document.getElementById(id); if(el)el.style.display='none';
}

await import('./duel-3d-isometric-v1.js');
