import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const fighters=[];
const originalAdd=THREE.Object3D.prototype.add;

function makeArc(inner,outer,color,pct=1){
  const theta=Math.max(0.001,Math.PI*2*Math.max(0,Math.min(1,pct)));
  const mesh=new THREE.Mesh(
    new THREE.RingGeometry(inner,outer,96,1,-Math.PI/2,theta),
    new THREE.MeshBasicMaterial({color,transparent:true,opacity:1,side:THREE.DoubleSide,depthTest:false,depthWrite:false})
  );
  mesh.rotation.x=-Math.PI/2;
  mesh.position.y=.05;
  mesh.renderOrder=120;
  mesh.frustumCulled=false;
  return mesh;
}
function makeBg(inner,outer){
  const mesh=new THREE.Mesh(
    new THREE.RingGeometry(inner,outer,96),
    new THREE.MeshBasicMaterial({color:0x1b120d,transparent:true,opacity:.76,side:THREE.DoubleSide,depthTest:false,depthWrite:false})
  );
  mesh.rotation.x=-Math.PI/2;
  mesh.position.y=.045;
  mesh.renderOrder=119;
  mesh.frustumCulled=false;
  return mesh;
}
function install(group,oldRing){
  if(group.userData.__ringHudV6)return;
  group.userData.__ringHudV6=true;
  oldRing.visible=false;
  oldRing.material.opacity=0;

  const holder=new THREE.Group();
  holder.name='TWA_RING_HUD_V6';
  const specs={
    HP:{inner:.67,outer:.735,color:0xff3f36,max:null},
    ST:{inner:.555,outer:.61,color:0x36baff,max:100},
    PO:{inner:.455,outer:.50,color:0xffc13b,max:100}
  };
  const arcs={};
  for(const [key,s] of Object.entries(specs)){
    holder.add(makeBg(s.inner,s.outer));
    const mesh=makeArc(s.inner,s.outer,s.color,1);
    holder.add(mesh);
    arcs[key]={...s,mesh,last:-1};
  }
  originalAdd.call(group,holder);
  group.userData.__ringHudV6Data={holder,arcs};
  fighters.push(group);
}

THREE.Object3D.prototype.add=function(...objects){
  const result=originalAdd.apply(this,objects);
  for(const o of objects){
    if(this?.isGroup && o?.isMesh && o.geometry?.type==='RingGeometry'){
      const p=o.geometry.parameters;
      if(p && p.innerRadius>=.40 && p.outerRadius<=.52 && !this.userData.__ringHudV6){
        queueMicrotask(()=>install(this,o));
      }
    }
  }
  return result;
};

function sideOf(group){
  const old=group.children.find(o=>o?.isMesh&&o.geometry?.type==='RingGeometry'&&o.visible===false);
  if(!old?.material?.color)return null;
  const c=old.material.color.getHex(),r=(c>>16)&255,b=c&255;
  return b>r?'a':'b';
}
function read(side,key){return Number(document.getElementById(side+key)?.textContent)||0}
function rebuild(group,key,pct){
  const data=group.userData.__ringHudV6Data?.arcs?.[key];
  if(!data)return;
  pct=Math.max(0,Math.min(1,pct));
  const q=Math.round(pct*500)/500;
  if(q===data.last)return;
  data.last=q;
  const fresh=makeArc(data.inner,data.outer,data.color,q);
  const holder=group.userData.__ringHudV6Data.holder;
  holder.remove(data.mesh);
  data.mesh.geometry.dispose();
  data.mesh.material.dispose();
  holder.add(fresh);
  data.mesh=fresh;
}
function update(){
  for(const g of fighters){
    const side=sideOf(g); if(!side)continue;
    rebuild(g,'HP',read(side,'HP')/(side==='a'?1000:900));
    rebuild(g,'ST',read(side,'ST')/100);
    rebuild(g,'PO',read(side,'PO')/100);
  }
  requestAnimationFrame(update);
}

await import('./duel-3d-isometric-v1.js');
requestAnimationFrame(update);
