import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import {terrainHeight,zoneAt,clampArena,blocked,tacticalScore,chooseTacticalPoint} from './colosseum-map-v1.js';

const $=id=>document.getElementById(id), clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), fmt=n=>Math.round(n);
const DUEL_MIN_DISTANCE=1.22;
const DUEL_IDEAL_DISTANCE=1.55;
const ACTIONS={
 QUICK_ATTACK:{label:'โจมตีเร็ว',kind:'attack',startup:150,active:110,recovery:220,range:1.8,cost:10,power:48,posture:7},
 HEAVY_ATTACK:{label:'โจมตีหนัก',kind:'attack',startup:430,active:150,recovery:520,range:2.1,cost:22,power:105,posture:18},
 GUARD_BREAK:{label:'ทำลายการ์ด',kind:'attack',startup:300,active:120,recovery:360,range:1.7,cost:17,power:28,posture:30},
 FEINT:{label:'หลอกโจมตี',kind:'setup',startup:170,active:80,recovery:120,range:2.0,cost:7,power:0,posture:0},
 BLOCK:{label:'ป้องกัน',kind:'defense',startup:70,active:500,recovery:120,range:99,cost:4,power:0,posture:0},
 DODGE:{label:'หลบ',kind:'defense',startup:90,active:220,recovery:210,range:99,cost:11,power:0,posture:0},
 PARRY:{label:'ปัดป้อง',kind:'defense',startup:80,active:180,recovery:300,range:2.0,cost:12,power:0,posture:0},
 RECOVER:{label:'ฟื้นกำลัง',kind:'recover',startup:260,active:420,recovery:180,range:99,cost:0,power:0,posture:0}
};
let seedBase=Number(new URLSearchParams(location.search).get('seed'))||424242,rngState=seedBase>>>0;
function rand(){rngState=(rngState+0x6D2B79F5)>>>0;let t=rngState;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}

const scene=new THREE.Scene(); scene.background=new THREE.Color(0x2b1c12); scene.fog=new THREE.FogExp2(0x6f4c2e,.018);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false}); renderer.setPixelRatio(Math.min(devicePixelRatio,1.75)); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.1;
$('viewport').appendChild(renderer.domElement);
const camera=new THREE.OrthographicCamera(-10,10,7,-7,.1,100); camera.position.set(12,13,12); camera.lookAt(0,0,0); scene.add(camera);

const hemi=new THREE.HemisphereLight(0xffe2b5,0x372419,2.2);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffdfaa,4.0);sun.position.set(-8,16,10);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-14;sun.shadow.camera.right=14;sun.shadow.camera.top=14;sun.shadow.camera.bottom=-14;scene.add(sun);
const fill=new THREE.DirectionalLight(0xb7c6ff,.8);fill.position.set(8,8,-8);scene.add(fill);

const MAT={
 sand:new THREE.MeshStandardMaterial({color:0x8f7049,roughness:.93,metalness:.02}),
 sand2:new THREE.MeshStandardMaterial({color:0x6e5237,roughness:.98}),
 stone:new THREE.MeshStandardMaterial({color:0x75624d,roughness:.9}),
 stone2:new THREE.MeshStandardMaterial({color:0x4f4134,roughness:.94}),
 dark:new THREE.MeshStandardMaterial({color:0x251b14,roughness:1}),
 bronze:new THREE.MeshStandardMaterial({color:0x6e4a28,roughness:.55,metalness:.45}),
 red:new THREE.MeshStandardMaterial({color:0x7d1f18,roughness:.72}),
 blue:new THREE.MeshStandardMaterial({color:0x244f7b,roughness:.65}),
 black:new THREE.MeshStandardMaterial({color:0x191919,roughness:.75}),
 steel:new THREE.MeshStandardMaterial({color:0x9da4aa,roughness:.38,metalness:.75}),
 skin:new THREE.MeshStandardMaterial({color:0xbd8a63,roughness:.8})
};
function shadow(o){o.traverse?.(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true}});return o}
function mesh(g,m,x=0,y=0,z=0){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;scene.add(o);return o}

function buildArena(){
 mesh(new THREE.CylinderGeometry(7.1,7.1,.45,64),MAT.stone2,0,-.28,0);
 mesh(new THREE.CylinderGeometry(6.35,6.35,.24,64),MAT.sand,0,0,0);
 for(let r=1.2;r<6;r+=1.15){const ring=mesh(new THREE.TorusGeometry(r,.035,8,96),MAT.stone);ring.rotation.x=Math.PI/2;ring.position.y=.14}
 const center=mesh(new THREE.CylinderGeometry(1.4,1.4,.06,48),MAT.sand2,0,.16,0);center.material=MAT.sand2;
 for(let i=0;i<16;i++){const a=i/16*Math.PI*2;const r=1.05;const bar=mesh(new THREE.BoxGeometry(.08,.035,1.0),MAT.stone,Math.cos(a)*r,.205,Math.sin(a)*r);bar.rotation.y=-a;}
 for(let i=0;i<40;i++){const a=i/40*Math.PI*2;const r=7.1;const h=1.8+((i%5===0)?.25:0);const b=mesh(new THREE.BoxGeometry(.95,h,.72),i%2?MAT.stone:MAT.stone2,Math.cos(a)*r,h/2-.1,Math.sin(a)*r);b.rotation.y=-a+Math.PI/2}
 for(let tier=0;tier<3;tier++){for(let i=0;i<48;i++){const a=i/48*Math.PI*2;const r=7.75+tier*.72;const b=mesh(new THREE.BoxGeometry(.92,.45,.82),tier===2?MAT.stone2:MAT.stone,Math.cos(a)*r,.35+tier*.5,Math.sin(a)*r);b.rotation.y=-a+Math.PI/2}}
 for(const z of [-7.0,7.0]){mesh(new THREE.BoxGeometry(3.1,2.8,.55),MAT.dark,0,1.25,z);const arch=mesh(new THREE.TorusGeometry(1.5,.32,10,28,Math.PI),MAT.stone,0,2.55,z+(z>0?-.32:.32));arch.rotation.x=Math.PI/2;arch.rotation.z=Math.PI;}
 [[-2.7,.2],[2.7,-.2],[-4.5,3.2],[4.5,-3.2]].forEach(([x,z],idx)=>{
  mesh(new THREE.CylinderGeometry(.42,.55,.28,12),MAT.stone,x,.15,z);mesh(new THREE.CylinderGeometry(.27,.34,2.15,12),MAT.stone,x,1.28,z);mesh(new THREE.CylinderGeometry(.48,.34,.24,12),MAT.stone,x,2.45,z);
  if(idx>1){mesh(new THREE.CylinderGeometry(.42,.25,.18,16),MAT.bronze,x,2.67,z);mesh(new THREE.SphereGeometry(.18,10,8),new THREE.MeshStandardMaterial({color:0xff8a22,emissive:0xff4a00,emissiveIntensity:4}),x,2.92,z);const pl=new THREE.PointLight(0xff6a22,7,6);pl.position.set(x,3,z);scene.add(pl)}
 });
 for(const z of [-3.35,3.25]){mesh(new THREE.CylinderGeometry(1.15,1.35,.5,24),MAT.stone,0,.35,z);for(let s=0;s<4;s++)mesh(new THREE.BoxGeometry(1.35,.12,.34),MAT.stone,0,.12+s*.11,z+(z<0?1.15+s*.28:-1.15-s*.28));}
 for(let i=0;i<8;i++){const a=i/8*Math.PI*2;const r=6.55;const banner=mesh(new THREE.PlaneGeometry(.8,1.6),MAT.red,Math.cos(a)*r,1.5,Math.sin(a)*r);banner.rotation.y=-a+Math.PI/2;}
 const crowdMat=new THREE.MeshStandardMaterial({color:0x5a3427,roughness:1});
 for(let i=0;i<90;i++){const a=rand()*Math.PI*2,r=8.0+rand()*1.3,h=.25+rand()*.25;const c=mesh(new THREE.CapsuleGeometry(.09,h,2,5),crowdMat,Math.cos(a)*r,1.5+rand()*1.1,Math.sin(a)*r);c.rotation.y=rand()*Math.PI;}
}
buildArena();

function makeStatusArc(inner,outer,color,pct=1){
 const theta=Math.max(.001,Math.PI*2*clamp(pct,0,1));
 const m=new THREE.Mesh(new THREE.RingGeometry(inner,outer,72,1,-Math.PI/2,theta),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.96,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));
 m.rotation.x=-Math.PI/2;m.renderOrder=80;m.frustumCulled=false;return m;
}
function makeStatusRings(){
 const root=new THREE.Group();root.position.y=.045;
 const specs={HP:{inner:.66,outer:.715,color:0xff453d},ST:{inner:.55,outer:.595,color:0x42baff},PO:{inner:.455,outer:.49,color:0xffc13d}};
 const arcs={};
 for(const [key,s] of Object.entries(specs)){
  const bg=new THREE.Mesh(new THREE.RingGeometry(s.inner,s.outer,72),new THREE.MeshBasicMaterial({color:0x17100c,transparent:true,opacity:.72,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));bg.rotation.x=-Math.PI/2;bg.renderOrder=79;root.add(bg);
  const arc=makeStatusArc(s.inner,s.outer,s.color,1);root.add(arc);arcs[key]={...s,mesh:arc,last:-1};
 }
 root.userData.arcs=arcs;return root;
}
function setStatusArc(root,key,pct){
 const d=root?.userData?.arcs?.[key];if(!d)return;pct=clamp(pct,0,1);const q=Math.round(pct*100)/100;if(q===d.last)return;d.last=q;
 const fresh=makeStatusArc(d.inner,d.outer,d.color,q);root.remove(d.mesh);d.mesh.geometry.dispose();d.mesh.material.dispose();root.add(fresh);d.mesh=fresh;
}
function updateStatusRings(f){const r=f.model.userData.statusRings;setStatusArc(r,'HP',f.hp/f.maxHP);setStatusArc(r,'ST',f.stamina/100);setStatusArc(r,'PO',f.posture/100)}

function fighterModel(side){
 const g=new THREE.Group();
 const bodyMat=side==='a'?MAT.blue:MAT.red, capeMat=side==='a'?MAT.red:MAT.black;
 const torso=new THREE.Mesh(new THREE.CylinderGeometry(.28,.36,.8,8),bodyMat);torso.position.y=1.05;g.add(torso);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.2,12,10),MAT.skin);head.position.y=1.62;g.add(head);
 const helmet=new THREE.Mesh(new THREE.ConeGeometry(.24,.28,8),MAT.steel);helmet.position.y=1.82;g.add(helmet);
 const cape=new THREE.Mesh(new THREE.PlaneGeometry(.62,1.0),capeMat);cape.position.set(0,.95,.24);cape.rotation.x=.18;g.add(cape);
 const legGeo=new THREE.CylinderGeometry(.09,.11,.65,7);for(const x of [-.14,.14]){const l=new THREE.Mesh(legGeo,MAT.dark);l.position.set(x,.38,0);g.add(l)}
 const armGeo=new THREE.CylinderGeometry(.075,.09,.62,7);const swordArm=new THREE.Group();const arm=new THREE.Mesh(armGeo,MAT.steel);arm.position.y=-.28;swordArm.add(arm);const sword=new THREE.Mesh(new THREE.BoxGeometry(.055,.8,.035),MAT.steel);sword.position.set(0,-.78,0);swordArm.add(sword);swordArm.position.set(side==='a'?.34:-.34,1.32,0);swordArm.rotation.z=side==='a'?-1.0:1.0;g.add(swordArm);
 const off=new THREE.Mesh(armGeo,MAT.steel);off.position.set(side==='a'?-.34:.34,1.1,0);off.rotation.z=side==='a'?.55:-.55;g.add(off);
 const statusRings=makeStatusRings();g.add(statusRings);
 g.userData={swordArm,baseSwordRot:swordArm.rotation.z,statusRings};shadow(g);scene.add(g);return g;
}

function fighter(name,side,x,z,cfg){return{name,side,x,z,y:terrainHeight(x,z),vx:0,vz:0,hp:cfg.hp,maxHP:cfg.hp,stamina:100,posture:100,atk:cfg.atk,def:cfg.def,spd:cfg.spd,mobility:cfg.mobility,focus:72,tempo:0,intent:'TEST',current:null,phase:'IDLE',phaseTime:0,targetPoint:null,zone:zoneAt(x,z),memory:{counts:Object.fromEntries(Object.keys(ACTIONS).map(k=>[k,1])),total:0},lastAction:null,reason:'',candidates:[],model:fighterModel(side),hitFlash:0}}
let A,B,running=true,lastT=performance.now(),aiClock=0,finished=false,metrics={nodes:0,interrupts:0,reactions:0},fx=[];

function reset(){
 rngState=seedBase>>>0;if(A?.model)scene.remove(A.model);if(B?.model)scene.remove(B.model);fx.forEach(o=>scene.remove(o.mesh));fx=[];
 A=fighter('อัศวิน','a',-4.7,0,{hp:1000,atk:108,def:112,spd:92,mobility:4.1});B=fighter('ซามูไร','b',4.7,0,{hp:900,atk:116,def:96,spd:108,mobility:4.6});
 running=true;finished=false;aiClock=0;metrics={nodes:0,interrupts:0,reactions:0};$('log').innerHTML='';$('result').textContent='';log(`Seed ${seedBase} — 3D Isometric Colosseum เริ่มการต่อสู้`);renderHUD();
}
function observe(self,enemy){const u=Math.max(.08,.6-self.focus*.006);return{x:enemy.x+(rand()*2-1)*u,z:enemy.z+(rand()*2-1)*u,y:enemy.y+(rand()*2-1)*u*.22,stamina:clamp(enemy.stamina+(rand()*2-1)*10,0,100),posture:clamp(enemy.posture+(rand()*2-1)*9,0,100)}}
function prediction(self,enemy){const obs=observe(self,enemy),total=Object.values(self.memory.counts).reduce((s,v)=>s+v,0),p={};for(const k of Object.keys(self.memory.counts))p[k]=self.memory.counts[k]/total;return{obs,p,top:Object.entries(p).sort((a,b)=>b[1]-a[1])[0],predictedX:obs.x+enemy.vx*.45,predictedZ:obs.z+enemy.vz*.45}}
function derive(self,enemy,pred){const d=Math.hypot(self.x-pred.obs.x,self.z-pred.obs.z),t=tacticalScore({x:self.x,y:self.z,z:self.y,stamina:self.stamina,hp:self.hp,maxHP:self.maxHP},{x:enemy.x,y:enemy.z,z:enemy.y}),death=clamp((1-self.hp/self.maxHP)*.72+pred.p.HEAVY_ATTACK*.25,0,1),breakRisk=clamp((1-self.posture/100)*.65+pred.p.GUARD_BREAK*.35,0,1);return{distance:d,terrain:t,heightAdv:self.y-enemy.y,deathRisk:death,breakRisk,interruptOpp:clamp(pred.p.HEAVY_ATTACK*.6*(self.spd/enemy.spd),0,1),positionValue:clamp(.46+t.score/45-(d>3?.12:0),0,1)}}
function chooseIntent(self,d){if(d.deathRisk>.7)return'SURVIVE';if(self.stamina<28)return'RECOVER';if(d.interruptOpp>.48)return'INTERRUPT';if(d.positionValue<.48)return'CONTROL';if(d.distance>2.1)return'CLOSE_DISTANCE';return'DAMAGE'}
function utility(id,a,self,enemy,pred,d){metrics.nodes++;let u=0;const inRange=d.distance<=a.range,expected=a.power*(self.atk/(self.atk+enemy.def*.72));if(a.kind==='attack')u+=expected*.55+(100-pred.obs.posture)*(id==='GUARD_BREAK'?.3:.08)+d.heightAdv*14+d.terrain.score*.25;if(!inRange&&a.kind==='attack')u-=78;if(id==='QUICK_ATTACK')u+=d.interruptOpp*28;if(id==='HEAVY_ATTACK')u+=(1-enemy.hp/enemy.maxHP)*35-pred.p.PARRY*25;if(id==='FEINT')u+=(pred.p.PARRY+pred.p.BLOCK)*42+12;if(a.kind==='defense')u+=d.deathRisk*38+d.breakRisk*20;if(id==='RECOVER')u+=(100-self.stamina)*.8-(d.distance<1.7?28:0)+(d.terrain.zone.type==='RECOVERY'?28:0);u+=d.positionValue*12-a.cost*.7;if(self.lastAction===id)u-=13;return u}
function chooseAction(self,enemy){const pred=prediction(self,enemy),d=derive(self,enemy,pred);self.intent=chooseIntent(self,d);const p=chooseTacticalPoint({x:self.x,y:self.z,z:self.y,stamina:self.stamina,hp:self.hp,maxHP:self.maxHP},{x:enemy.x,y:enemy.z,z:enemy.y},self.intent);self.targetPoint={...p,x:p.x,z:p.y};const cs=Object.entries(ACTIONS).map(([id,a])=>({id,...a,score:utility(id,a,self,enemy,pred,d)})).sort((a,b)=>b.score-a.score);self.candidates=cs;self.reason=`${d.terrain.zone.label} → ${p.label} | ระยะ ${d.distance.toFixed(1)}m | ระยะดวล ${DUEL_IDEAL_DISTANCE.toFixed(2)}m | ${cs[0].label}`;return{id:cs[0].id,...cs[0]}}
function startAction(f,a){f.current=a;f.phase='STARTUP';f.phaseTime=0;f.stamina=clamp(f.stamina-a.cost,0,100);f.lastAction=a.id}
function spawnFx(attacker,kind){const color=attacker.side==='a'?0x63c9ff:0xff6a55;let m;if(kind==='HEAVY_ATTACK'){m=new THREE.Mesh(new THREE.TorusGeometry(.85,.07,8,24,Math.PI*1.2),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.95}));m.rotation.x=Math.PI/2;m.rotation.z=-.7}else{m=new THREE.Mesh(new THREE.BoxGeometry(1.25,.06,.08),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.95}));m.rotation.y=-Math.atan2(attacker.vz||0.1,attacker.vx||1)}m.position.set(attacker.x,.85+attacker.y,attacker.z);scene.add(m);fx.push({mesh:m,t:0,life:260});}
function updateAction(f,e,dt){if(!f.current)return;f.phaseTime+=dt;const a=f.current;const arm=f.model.userData.swordArm;if(f.phase==='STARTUP'){const p=clamp(f.phaseTime/a.startup,0,1);arm.rotation.z=f.model.userData.baseSwordRot+(f.side==='a'?1:-1)*p*.9;if(f.phaseTime>=a.startup){f.phase='ACTIVE';f.phaseTime=0;resolveActive(f,e,a)}}else if(f.phase==='ACTIVE'){arm.rotation.z=f.model.userData.baseSwordRot+(f.side==='a'?-1:1)*.8;if(f.phaseTime>=a.active){f.phase='RECOVERY';f.phaseTime=0}}else if(f.phase==='RECOVERY'){arm.rotation.z=THREE.MathUtils.lerp(arm.rotation.z,f.model.userData.baseSwordRot,.18);if(f.phaseTime>=a.recovery){f.phase='IDLE';f.phaseTime=0;f.current=null;arm.rotation.z=f.model.userData.baseSwordRot}}}
function resolveActive(attacker,defender,a){if(a.kind==='recover'){attacker.stamina=clamp(attacker.stamina+30,0,100);attacker.posture=clamp(attacker.posture+10,0,100);log(`${attacker.name} ฟื้นกำลัง`);return}if(a.kind==='setup'){attacker.tempo+=8;spawnFx(attacker,'FEINT');log(`${attacker.name} ใช้หลอกโจมตี`);return}if(a.kind==='defense')return;const d=Math.hypot(attacker.x-defender.x,attacker.z-defender.z);spawnFx(attacker,a.id);if(d>a.range){log(`${attacker.name} ${a.label} พลาด ระยะ ${d.toFixed(1)}m`);return}const react=defender.current?.kind==='defense'?defender.current:null;if(defender.phase==='STARTUP'&&defender.current?.kind==='attack'&&a.startup+40<defender.current.startup){defender.current=null;defender.phase='RECOVERY';defender.phaseTime=0;defender.posture=clamp(defender.posture-10,0,100);metrics.interrupts++;log(`${attacker.name} Interrupt ${defender.name}`)}if(react?.id==='PARRY'&&rand()<.55){attacker.posture=clamp(attacker.posture-18,0,100);metrics.reactions++;log(`${defender.name} ปัดป้อง ${a.label}`);return}if(react?.id==='DODGE'&&rand()<.62){metrics.reactions++;log(`${defender.name} หลบ ${a.label}`);return}let dmg=a.power*(attacker.atk/(attacker.atk+defender.def*.72))*(1+clamp(attacker.y-defender.y,-1.2,1.2)*.11),po=a.posture;if(react?.id==='BLOCK'){dmg*=.35;po*=1.5;metrics.reactions++}defender.hp=clamp(defender.hp-dmg,0,defender.maxHP);defender.posture=clamp(defender.posture-po,0,100);defender.hitFlash=180;log(`${attacker.name} ${a.label} → ${fmt(dmg)} ดาเมจ`)}
function move(f,enemy,dt){
 if(f.current&&f.phase!=='IDLE'&&f.current.kind==='attack')return;
 const t=f.targetPoint||{x:enemy.x,z:enemy.z},dx=t.x-f.x,dz=t.z-f.z,len=Math.hypot(dx,dz)||1,edx=enemy.x-f.x,edz=enemy.z-f.z,ed=Math.hypot(edx,edz)||1;
 let vx=dx/len,vz=dz/len;
 if(ed<DUEL_MIN_DISTANCE){vx=-edx/ed;vz=-edz/ed}
 else if(f.intent==='CLOSE_DISTANCE'){if(ed>DUEL_IDEAL_DISTANCE+.08){vx=edx/ed;vz=edz/ed}else{vx=0;vz=0}}
 if(f.intent==='SURVIVE'&&ed<2.5){vx=-edx/ed;vz=-edz/ed}
 const speed=f.mobility*(f.stamina<20?.55:1),nx=f.x+vx*speed*dt/1000,nz=f.z+vz*speed*dt/1000;let p=clampArena(nx,nz);
 const nd=Math.hypot(p.x-enemy.x,p.y-enemy.z);if(nd<DUEL_MIN_DISTANCE){const ux=(f.x-enemy.x)/(ed||1),uz=(f.z-enemy.z)/(ed||1);p=clampArena(enemy.x+ux*DUEL_MIN_DISTANCE,enemy.z+uz*DUEL_MIN_DISTANCE)}
 if(blocked(p.x,p.y)){const s=f.side==='a'?1:-1;p=clampArena(f.x-vz*s*speed*dt/1000,f.z+vx*s*speed*dt/1000)}
 f.vx=vx*speed;f.vz=vz*speed;f.x=p.x;f.z=p.y;f.y=terrainHeight(f.x,f.z);f.zone=zoneAt(f.x,f.z)
}
function enforceDuelSpacing(){
 const dx=B.x-A.x,dz=B.z-A.z;let d=Math.hypot(dx,dz);if(d>=DUEL_MIN_DISTANCE)return;
 let ux,uz;if(d<.001){ux=1;uz=0;d=.001}else{ux=dx/d;uz=dz/d}
 const push=(DUEL_MIN_DISTANCE-d)/2+.002;let pa=clampArena(A.x-ux*push,A.z-uz*push),pb=clampArena(B.x+ux*push,B.z+uz*push);
 if(!blocked(pa.x,pa.y)){A.x=pa.x;A.z=pa.y}if(!blocked(pb.x,pb.y)){B.x=pb.x;B.z=pb.y}
 A.y=terrainHeight(A.x,A.z);B.y=terrainHeight(B.x,B.z);
}
function think(f,e){if(f.current)return;startAction(f,chooseAction(f,e))}
function aiTick(){think(A,B);think(B,A);for(const[o,e]of[[A,B],[B,A]])if(e.lastAction){o.memory.counts[e.lastAction]=(o.memory.counts[e.lastAction]||0)+1;o.memory.total++}}
function syncModel(f,e,dt){const m=f.model;m.position.set(f.x,f.y,f.z);m.rotation.y=Math.atan2(e.x-f.x,e.z-f.z);const bob=Math.sin(performance.now()*.008+(f.side==='a'?0:1))*0.025;m.position.y+=bob;if(f.hitFlash>0){f.hitFlash-=dt;m.scale.setScalar(1+.06*Math.sin(f.hitFlash*.08))}else m.scale.setScalar(1);updateStatusRings(f)}
function updateFx(dt){for(let i=fx.length-1;i>=0;i--){const o=fx[i];o.t+=dt;o.mesh.material.opacity=1-o.t/o.life;o.mesh.scale.multiplyScalar(1.02);if(o.t>=o.life){scene.remove(o.mesh);fx.splice(i,1)}}}
function renderHUD(){for(const f of [A,B]){const s=f.side;$(s+'HP').textContent=fmt(f.hp);$(s+'ST').textContent=fmt(f.stamina);$(s+'PO').textContent=fmt(f.posture);$(s+'HPBar').style.width=`${clamp(f.hp/f.maxHP*100,0,100)}%`;$(s+'STBar').style.width=`${clamp(f.stamina,0,100)}%`;$(s+'POBar').style.width=`${clamp(f.posture,0,100)}%`;$(s+'State').textContent=`${f.phase}${f.current?' · '+f.current.label:''} · ${f.intent}`;$(s+'Why').textContent=f.reason;$(s+'Candidates').innerHTML=f.candidates.slice(0,4).map((c,i)=>`<div class="candidate ${i===0?'chosen':''}"><span>${i===0?'▶ ':''}${c.label}</span><b>${fmt(c.score)}</b></div>`).join('')}$('distance').textContent=`${Math.hypot(A.x-B.x,A.z-B.z).toFixed(2)} m`;$('metricNodes').textContent=metrics.nodes;$('metricInterrupt').textContent=metrics.interrupts;$('metricReaction').textContent=metrics.reactions;if((A.hp<=0||B.hp<=0)&&!finished){finished=true;running=false;$('result').textContent=`ผู้ชนะ: ${A.hp>B.hp?A.name:B.name}`}}
function log(t){const d=document.createElement('div');d.className='entry';d.textContent=t;$('log').prepend(d)}
function resize(){const el=$('viewport'),w=el.clientWidth,h=Math.max(360,Math.min(680,w*.62));renderer.setSize(w,h,false);const aspect=w/h,frustum=11;camera.left=-frustum*aspect/2;camera.right=frustum*aspect/2;camera.top=frustum/2;camera.bottom=-frustum/2;camera.updateProjectionMatrix()}
new ResizeObserver(resize).observe($('viewport'));resize();
$('pause').addEventListener('click',()=>{running=!running;$('pause').textContent=running?'⏸ หยุด':'▶ เล่นต่อ'});$('reset').addEventListener('click',reset);
function frame(t){const dt=Math.min(34,t-lastT||16);lastT=t;if(running&&!finished){aiClock+=dt;if(aiClock>=250){aiClock=0;aiTick()}move(A,B,dt);move(B,A,dt);enforceDuelSpacing();updateAction(A,B,dt);updateAction(B,A,dt);A.stamina=clamp(A.stamina+dt*.004,0,100);B.stamina=clamp(B.stamina+dt*.004,0,100)}if(A&&B){syncModel(A,B,dt);syncModel(B,A,dt);updateFx(dt);renderHUD()}renderer.render(scene,camera);requestAnimationFrame(frame)}
reset();requestAnimationFrame(frame);
