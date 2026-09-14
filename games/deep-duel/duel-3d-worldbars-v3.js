import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const viewport=document.getElementById('viewport');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const SEGMENTS=72;

function sideOf(group){
  const ring=group?.userData?.ring;
  if(!ring?.material?.color)return null;
  const hex=ring.material.color.getHex();
  const r=(hex>>16)&255,b=hex&255;
  return b>r?'a':'b';
}

function circleGeometry(radius){
  const pts=[];
  for(let i=0;i<=SEGMENTS;i++){
    const a=-Math.PI/2+(i/SEGMENTS)*Math.PI*2;
    pts.push(new THREE.Vector3(Math.cos(a)*radius,0,Math.sin(a)*radius));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function makeStatusRing(radius,color,y){
  const root=new THREE.Group();
  root.position.y=y;

  const bg=new THREE.Line(
    circleGeometry(radius),
    new THREE.LineBasicMaterial({color:0x160f0b,transparent:true,opacity:.72,depthTest:false,depthWrite:false})
  );
  bg.renderOrder=70;
  root.add(bg);

  const progress=new THREE.Line(
    circleGeometry(radius),
    new THREE.LineBasicMaterial({color,transparent:true,opacity:1,depthTest:false,depthWrite:false})
  );
  progress.renderOrder=71;
  progress.geometry.setDrawRange(0,SEGMENTS+1);
  root.add(progress);

  root.userData.progress=progress;
  root.traverse(o=>{if(o.isLine)o.frustumCulled=false});
  return root;
}

function addWorldRings(group,side){
  if(group.userData.statusRings)return group.userData.statusRings;

  // Three thin concentric lines around the fighter's feet.
  // Outer = HP, middle = Stamina, inner = Posture.
  const holder=new THREE.Group();
  holder.position.set(0,.035,0);
  const hp=makeStatusRing(.66,0xff5148,.000);
  const st=makeStatusRing(.54,0x4cbcff,.012);
  const po=makeStatusRing(.42,0xf4bd45,.024);
  holder.add(hp,st,po);
  holder.userData={hp,st,po,side};
  group.add(holder);
  group.userData.statusRings=holder;

  // Hide the old selection ring so the status rings are unambiguous.
  if(group.userData.ring)group.userData.ring.visible=false;
  return holder;
}

function value(side,key){
  const el=document.getElementById(side+key);
  return Number(el?.textContent)||0;
}

function setArc(ring,pct){
  pct=clamp(pct,0,1);
  const count=Math.max(1,Math.round(SEGMENTS*pct)+1);
  ring.userData.progress.geometry.setDrawRange(0,count);
}

function updateRings(group,side){
  const rings=addWorldRings(group,side);
  setArc(rings.userData.hp,value(side,'HP')/(side==='a'?1000:900));
  setArc(rings.userData.st,value(side,'ST')/100);
  setArc(rings.userData.po,value(side,'PO')/100);
}

const originalRender=THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render=function(scene,camera){
  try{
    if(this.domElement&&viewport?.contains(this.domElement)){
      scene.traverse(o=>{
        if(o?.isGroup&&o.userData?.swordArm&&o.userData?.ring){
          const side=sideOf(o);
          if(side)updateRings(o,side);
        }
      });
    }
  }catch(e){console.warn('3D fighter status rings:',e)}
  return originalRender.call(this,scene,camera);
};

for(const id of ['aUnitHud','bUnitHud']){
  const el=document.getElementById(id); if(el)el.style.display='none';
}

await import('./duel-3d-isometric-v1.js');
