import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const hudA=document.getElementById('aUnitHud');
const hudB=document.getElementById('bUnitHud');
const viewport=document.getElementById('viewport');
const v=new THREE.Vector3();

function sideOf(group){
  const ring=group?.userData?.ring;
  if(!ring?.material?.color)return null;
  const hex=ring.material.color.getHex();
  const r=(hex>>16)&255,b=hex&255;
  return b>r?'a':'b';
}

function syncValues(side,hud){
  if(!hud)return;
  const hp=document.getElementById(side+'HP')?.textContent||'0';
  const st=document.getElementById(side+'ST')?.textContent||'0';
  const po=document.getElementById(side+'PO')?.textContent||'0';
  const hpMax=side==='a'?1000:900;
  hud.querySelector('[data-hp-text]').textContent=hp;
  hud.querySelector('[data-st-text]').textContent=st;
  hud.querySelector('[data-po-text]').textContent=po;
  hud.querySelector('[data-hp]').style.width=`${Math.max(0,Math.min(100,(+hp||0)/hpMax*100))}%`;
  hud.querySelector('[data-st]').style.width=`${Math.max(0,Math.min(100,+st||0))}%`;
  hud.querySelector('[data-po]').style.width=`${Math.max(0,Math.min(100,+po||0))}%`;
  const state=document.getElementById(side+'State')?.textContent||'';
  hud.querySelector('[data-state]').textContent=state;
}

function place(group,camera,hud,side,canvas){
  group.getWorldPosition(v);
  v.y=Math.max(.05,v.y+.08);
  v.project(camera);
  const x=(v.x*.5+.5)*canvas.clientWidth;
  const y=(-v.y*.5+.5)*canvas.clientHeight+34;
  hud.style.left=`${x}px`;
  hud.style.top=`${y}px`;
  hud.style.display=(v.z<-1||v.z>1)?'none':'block';
  syncValues(side,hud);
}

const originalRender=THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render=function(scene,camera){
  try{
    const canvas=this.domElement;
    if(canvas&&viewport&&viewport.contains(canvas)){
      let a=null,b=null;
      scene.traverse(o=>{
        if(o?.isGroup&&o.userData?.swordArm&&o.userData?.ring){
          const s=sideOf(o); if(s==='a')a=o; else if(s==='b')b=o;
        }
      });
      if(a)place(a,camera,hudA,'a',canvas); else if(hudA)hudA.style.display='none';
      if(b)place(b,camera,hudB,'b',canvas); else if(hudB)hudB.style.display='none';
    }
  }catch(e){console.warn('fighter HUD overlay:',e)}
  return originalRender.call(this,scene,camera);
};

await import('./duel-3d-isometric-v1.js');
