import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const fighters=[];
const originalAdd=THREE.Object3D.prototype.add;

function makeArc(inner,outer,color,pct=1){
  const theta=Math.max(0.01,Math.PI*2*Math.max(0,Math.min(1,pct)));
  const g=new THREE.RingGeometry(inner,outer,72,1,-Math.PI/2,theta);
  const m=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.98,side:THREE.DoubleSide,depthTest:false,depthWrite:false});
  const mesh=new THREE.Mesh(g,m);
  mesh.rotation.x=-Math.PI/2;
  mesh.position.y=.035;
  mesh.renderOrder=95;
  mesh.frustumCulled=false;
  return mesh;
}

function makeBg(inner,outer){
  const g=new THREE.RingGeometry(inner,outer,72);
  const m=new THREE.MeshBasicMaterial({color:0x130d09,transparent:true,opacity:.62,side:THREE.DoubleSide,depthTest:false,depthWrite:false});
  const mesh=new THREE.Mesh(g,m);
  mesh.rotation.x=-Math.PI/2;
  mesh.position.y=.03;
  mesh.renderOrder=94;
  mesh.frustumCulled=false;
  return mesh;
}

function installStatusRings(group,oldRing){
  if(group.userData.__statusRingInstalled)return;
  group.userData.__statusRingInstalled=true;
  oldRing.visible=false;

  const holder=new THREE.Group();
  holder.name='TWA_STATUS_RINGS';
  const specs=[
    {key:'HP',max:null,inner:.64,outer:.70,color:0xff443d},
    {key:'ST',max:100,inner:.53,outer:.575,color:0x43baff},
    {key:'PO',max:100,inner:.43,outer:.47,color:0xf2ba3f}
  ];
  const arcs={};
  for(const s of specs){
    holder.add(makeBg(s.inner,s.outer));
    const arc=makeArc(s.inner,s.outer,s.color,1);
    holder.add(arc);
    arcs[s.key]={mesh:arc,...s,last:-1};
  }
  originalAdd.call(group,holder);
  group.userData.__statusRings={holder,arcs};
  fighters.push(group);
}

THREE.Object3D.prototype.add=function(...objects){
  const result=originalAdd.apply(this,objects);
  for(const o of objects){
    if(this?.isGroup&&o?.isMesh&&o.geometry?.type==='RingGeometry'&&!this.userData.__statusRingInstalled){
      const p=o.geometry?.parameters;
      if(p&&p.innerRadius>=.35&&p.outerRadius<=.6){
        queueMicrotask(()=>installStatusRings(this,o));
      }
    }
  }
  return result;
};

function read(side,key){return Number(document.getElementById(side+key)?.textContent)||0}
function sideFromGroup(g){
  const ring=g.children.find(o=>o?.isMesh&&o.geometry?.type==='RingGeometry'&&o.visible===false);
  if(!ring?.material?.color)return null;
  const c=ring.material.color.getHex(),r=(c>>16)&255,b=c&255;
  return b>r?'a':'b';
}
function replaceArc(group,key,pct){
  const data=group.userData.__statusRings?.arcs?.[key]; if(!data)return;
  pct=Math.max(0,Math.min(1,pct));
  const q=Math.round(pct*1000)/1000; if(q===data.last)return; data.last=q;
  const old=data.mesh;
  const fresh=makeArc(data.inner,data.outer,data.color,pct);
  const holder=group.userData.__statusRings.holder;
  holder.remove(old); old.geometry.dispose(); old.material.dispose(); holder.add(fresh); data.mesh=fresh;
}
function update(){
  for(const g of fighters){
    const side=sideFromGroup(g); if(!side)continue;
    replaceArc(g,'HP',read(side,'HP')/(side==='a'?1000:900));
    replaceArc(g,'ST',read(side,'ST')/100);
    replaceArc(g,'PO',read(side,'PO')/100);
  }
  requestAnimationFrame(update);
}

await import('./duel-3d-isometric-v1.js');
requestAnimationFrame(update);
