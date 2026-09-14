import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const $=id=>document.getElementById(id), clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let rngState=424242>>>0;
function rand(){rngState=(rngState+0x6D2B79F5)>>>0;let t=rngState;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;}

const ARENA_R=9.0, MOVE_BUDGET=3.2, STEP=.45, DUEL_MIN=1.15;
const SKILLS={
 quick:{label:'ฟันเร็ว',kind:'physical',power:62,accuracy:.95,mp:0,st:10,posture:8,range:1.75,anim:'slash'},
 heavy:{label:'ฟันหนัก',kind:'physical',power:112,accuracy:.82,mp:0,st:22,posture:18,range:2.05,anim:'heavy'},
 break:{label:'ทำลายการ์ด',kind:'physical',power:42,accuracy:.90,mp:0,st:18,posture:30,range:1.65,anim:'heavy'},
 flame:{label:'คมดาบเพลิง',kind:'magic',power:94,accuracy:.90,mp:14,st:5,posture:6,range:3.4,anim:'magic'},
 focus:{label:'ตั้งสมาธิ',kind:'buff',power:0,accuracy:1,mp:8,st:0,posture:0,range:99,anim:'buff'}
};

function actor(name,side,cfg){const start=side==='p'?-5.3:5.3;return{name,side,maxHP:cfg.hp,hp:cfg.hp,maxMP:cfg.mp,mp:cfg.mp,stamina:100,posture:100,atk:cfg.atk,def:cfg.def,mag:cfg.mag,mdef:cfg.mdef,spd:cfg.spd,accuracy:cfg.accuracy,evasion:cfg.evasion,crit:.12,critDmg:1.55,guarding:false,focusBuff:0,status:'READY',x:start,z:0,homeX:start,homeZ:0,moveLeft:MOVE_BUDGET,model:null};}
let P=actor('อัศวินแห่งรุ่งอรุณ','p',{hp:980,mp:60,atk:108,def:104,mag:72,mdef:86,spd:92,accuracy:.92,evasion:.08});
let E=actor('ซามูไรเงา','e',{hp:900,mp:50,atk:112,def:92,mag:68,mdef:82,spd:104,accuracy:.9,evasion:.12});
let phase='PLAYER_COMMAND',busy=false,turn=1,moveMode=false,queue=[];

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x8da3a0);
scene.fog=new THREE.FogExp2(0x879994,.0105);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.08;
$('viewport').appendChild(renderer.domElement);

const camera=new THREE.OrthographicCamera(-14,14,9,-9,.1,120);
camera.position.set(17,19,17);camera.lookAt(0,0,0);scene.add(camera);
scene.add(new THREE.HemisphereLight(0xddeecb,0x334232,2.25));
const sun=new THREE.DirectionalLight(0xffe6bc,3.7);sun.position.set(-10,18,11);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-16;sun.shadow.camera.right=16;sun.shadow.camera.top=16;sun.shadow.camera.bottom=-16;scene.add(sun);
const fill=new THREE.DirectionalLight(0x9cbfff,.65);fill.position.set(10,8,-10);scene.add(fill);

const MAT={
 grass:new THREE.MeshStandardMaterial({color:0x526c45,roughness:1}),
 grass2:new THREE.MeshStandardMaterial({color:0x3f5738,roughness:1}),
 earth:new THREE.MeshStandardMaterial({color:0x6e5b43,roughness:1}),
 stone:new THREE.MeshStandardMaterial({color:0x73766c,roughness:.94}),
 stone2:new THREE.MeshStandardMaterial({color:0x50554f,roughness:.96}),
 moss:new THREE.MeshStandardMaterial({color:0x536844,roughness:1}),
 rune:new THREE.MeshBasicMaterial({color:0x68d7d0,transparent:true,opacity:.64,side:THREE.DoubleSide}),
 crystal:new THREE.MeshStandardMaterial({color:0x72d7d2,emissive:0x246b68,emissiveIntensity:1.8,roughness:.25,metalness:.08}),
 trunk:new THREE.MeshStandardMaterial({color:0x4b3527,roughness:1}),
 leaves:new THREE.MeshStandardMaterial({color:0x31543b,roughness:1}),
 dark:new THREE.MeshStandardMaterial({color:0x1e1916,roughness:.9}),
 blue:new THREE.MeshStandardMaterial({color:0x285c91}),
 red:new THREE.MeshStandardMaterial({color:0x8a2b20}),
 steel:new THREE.MeshStandardMaterial({color:0xa4a8ad,metalness:.72,roughness:.35}),
 skin:new THREE.MeshStandardMaterial({color:0xc08b65})
};
function addMesh(g,m,x=0,y=0,z=0){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;scene.add(o);return o;}

function buildArena(){
 addMesh(new THREE.CylinderGeometry(10.6,10.6,.55,72),MAT.stone2,0,-.42,0);
 addMesh(new THREE.CylinderGeometry(9.65,9.65,.28,72),MAT.grass2,0,-.10,0);
 addMesh(new THREE.CylinderGeometry(8.95,8.95,.16,72),MAT.grass,0,.02,0);

 // worn stone paths crossing the arena, kept flush so they do not block movement
 for(let i=-6;i<=6;i++){
  const s=addMesh(new THREE.BoxGeometry(1.05,.035,.72),i%2?MAT.stone:MAT.stone2,i*1.12,.13,0);
  s.rotation.y=(i%3-1)*.035;
 }
 for(let i=-5;i<=5;i++){
  const s=addMesh(new THREE.BoxGeometry(.72,.035,1.02),i%2?MAT.stone2:MAT.stone,0,.132,i*1.15);
  s.rotation.y=(i%3-1)*.04;
 }

 // ancient magic circle at center
 for(const r of [1.15,1.9,2.45]){const ring=addMesh(new THREE.TorusGeometry(r,.035,8,96),MAT.rune,0,.17,0);ring.rotation.x=Math.PI/2;}
 for(let i=0;i<8;i++){const a=i/8*Math.PI*2;const rune=addMesh(new THREE.BoxGeometry(.12,.025,.72),MAT.rune,Math.cos(a)*2.18,.175,Math.sin(a)*2.18);rune.rotation.y=-a;}

 // ruined pillars stay near the outer rim so the playable center remains open
 const ruins=[[-7.7,-4.2,2.6],[-7.2,4.8,1.7],[7.5,-4.7,2.1],[7.8,4.0,2.8],[-3.0,-8.0,1.4],[3.5,8.0,1.8]];
 for(const [x,z,h] of ruins){
  addMesh(new THREE.CylinderGeometry(.48,.62,.28,10),MAT.stone2,x,.14,z);
  const col=addMesh(new THREE.CylinderGeometry(.30,.38,h,10),MAT.stone,x,h/2+.25,z);col.rotation.z=(rand()-.5)*.09;
  addMesh(new THREE.CylinderGeometry(.52,.36,.22,10),MAT.moss,x,h+.32,z);
 }
 // fallen stones / broken arch silhouettes outside the main fight lane
 const fallen=[[-8.3,1.5,.6],[8.1,1.2,-.45],[-5.8,7.1,.3],[5.9,-7.2,-.4]];
 for(const [x,z,rot] of fallen){const b=addMesh(new THREE.BoxGeometry(2.0,.42,.62),MAT.stone2,x,.24,z);b.rotation.y=rot;b.rotation.z=.08;}

 // crystals: visual landmarks at the rim
 for(const [x,z] of [[-8.0,-1.7],[8.1,-1.8],[-1.5,8.2],[1.8,-8.25]]){
  const c=addMesh(new THREE.ConeGeometry(.34,1.25,6),MAT.crystal,x,.68,z);c.rotation.y=rand()*Math.PI;
  const light=new THREE.PointLight(0x70d8d2,2.2,4.2);light.position.set(x,1.2,z);scene.add(light);
 }

 // stylized trees beyond the playable boundary
 for(let i=0;i<18;i++){
  const a=i/18*Math.PI*2+.12*Math.sin(i*2.1),r=10.25+(.35*(i%3));
  const x=Math.cos(a)*r,z=Math.sin(a)*r,h=1.7+(i%4)*.22;
  addMesh(new THREE.CylinderGeometry(.16,.23,h,7),MAT.trunk,x,h/2-.05,z);
  addMesh(new THREE.ConeGeometry(.78,1.55,8),MAT.leaves,x,h+.55,z);
  addMesh(new THREE.ConeGeometry(.58,1.25,8),MAT.leaves,x,h+1.18,z);
 }
}
buildArena();

const ground=new THREE.Mesh(new THREE.CircleGeometry(ARENA_R,72),new THREE.MeshBasicMaterial({transparent:true,opacity:0,side:THREE.DoubleSide}));
ground.rotation.x=-Math.PI/2;ground.position.y=.20;scene.add(ground);
const edgeGuide=addMesh(new THREE.RingGeometry(ARENA_R-.07,ARENA_R,.01?96:96),new THREE.MeshBasicMaterial({color:0xd9efb4,transparent:true,opacity:.18,side:THREE.DoubleSide}),0,.19,0);edgeGuide.rotation.x=-Math.PI/2;
const moveRing=addMesh(new THREE.RingGeometry(MOVE_BUDGET-.04,MOVE_BUDGET,64),new THREE.MeshBasicMaterial({color:0x6fd9ff,transparent:true,opacity:.32,side:THREE.DoubleSide}),0,.22,0);moveRing.rotation.x=-Math.PI/2;moveRing.visible=false;

function fighterModel(a){
 const g=new THREE.Group(),body=a.side==='p'?MAT.blue:MAT.red;
 const torso=new THREE.Mesh(new THREE.CylinderGeometry(.28,.36,.82,8),body);torso.position.y=1;g.add(torso);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.2,12,10),MAT.skin);head.position.y=1.58;g.add(head);
 const helmet=new THREE.Mesh(new THREE.ConeGeometry(.24,.28,8),MAT.steel);helmet.position.y=1.8;g.add(helmet);
 for(const x of [-.14,.14]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.09,.1,.62,7),MAT.dark);leg.position.set(x,.34,0);g.add(leg);}
 const swordArm=new THREE.Group();const arm=new THREE.Mesh(new THREE.CylinderGeometry(.075,.09,.6,7),MAT.steel);arm.position.y=-.27;swordArm.add(arm);
 const sword=new THREE.Mesh(new THREE.BoxGeometry(.055,.86,.035),MAT.steel);sword.position.set(0,-.78,0);swordArm.add(sword);swordArm.position.set(a.side==='p'?.34:-.34,1.3,0);swordArm.rotation.z=a.side==='p'?-1:1;g.add(swordArm);
 const ring=new THREE.Mesh(new THREE.RingGeometry(.43,.48,32),new THREE.MeshBasicMaterial({color:a.side==='p'?0x49bfff:0xff5a50,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.025;g.add(ring);
 g.userData={swordArm,base:swordArm.rotation.z};g.traverse(c=>{if(c.isMesh)c.castShadow=c.receiveShadow=true});scene.add(g);return g;
}
P.model=fighterModel(P);E.model=fighterModel(E);
function syncActor(a){a.model.position.set(a.x,.20,a.z);const other=a===P?E:P;a.model.rotation.y=Math.atan2(other.x-a.x,other.z-a.z);}
syncActor(P);syncActor(E);

function dist(a,b){return Math.hypot(a.x-b.x,a.z-b.z)}
function arenaClamp(x,z){const d=Math.hypot(x,z);if(d<=ARENA_R)return{x,z};const s=ARENA_R/d;return{x:x*s,z:z*s};}
function canOccupy(x,z,other){return Math.hypot(x-other.x,z-other.z)>=DUEL_MIN;}
function moveActor(a,x,z,costLimit=a.moveLeft){let p=arenaClamp(x,z),d=Math.hypot(p.x-a.x,p.z-a.z);if(d>.001&&d>costLimit){const s=costLimit/d;p={x:a.x+(p.x-a.x)*s,z:a.z+(p.z-a.z)*s};d=costLimit;}const other=a===P?E:P;if(!canOccupy(p.x,p.z,other)){const dx=p.x-other.x,dz=p.z-other.z,len=Math.hypot(dx,dz)||1;p={x:other.x+dx/len*DUEL_MIN,z:other.z+dz/len*DUEL_MIN};d=Math.hypot(p.x-a.x,p.z-a.z);}a.x=p.x;a.z=p.z;a.moveLeft=clamp(a.moveLeft-d,0,MOVE_BUDGET);syncActor(a);return d;}
function stepPlayer(dx,dz){if(!moveMode||busy||phase!=='PLAYER_COMMAND')return;const len=Math.hypot(dx,dz)||1,step=Math.min(STEP,P.moveLeft);if(step<=0)return;moveActor(P,P.x+dx/len*step,P.z+dz/len*step);updateMoveUI();renderHUD();}

function log(t){const d=document.createElement('div');d.className='entry';d.textContent=t;$('log').prepend(d)}
function pct(v,max){return `${clamp(v/max*100,0,100)}%`}
function renderHUD(){for(const[a,p]of[[P,'p'],[E,'e']]){$(p+'HP').textContent=`${Math.round(a.hp)}/${a.maxHP}`;$(p+'MP').textContent=`${Math.round(a.mp)}/${a.maxMP}`;$(p+'ST').textContent=`${Math.round(a.stamina)}/100`;$(p+'PO').textContent=`${Math.round(a.posture)}/100`;$(p+'HPBar').style.width=pct(a.hp,a.maxHP);$(p+'MPBar').style.width=pct(a.mp,a.maxMP);$(p+'STBar').style.width=pct(a.stamina,100);$(p+'POBar').style.width=pct(a.posture,100)}$('playerState').textContent=`${P.guarding?'กำลังป้องกัน':P.status} · Move ${P.moveLeft.toFixed(1)}m`;$('enemyState').textContent=E.guarding?'กำลังป้องกัน':E.status;$('turnBadge').textContent=phase==='PLAYER_COMMAND'?`เทิร์น ${turn} · ${moveMode?'เลือกตำแหน่ง':'เลือกคำสั่ง'}`:`เทิร์น ${turn} · กำลังดำเนินการ`;document.querySelectorAll('.commands button').forEach(b=>b.disabled=busy||phase!=='PLAYER_COMMAND');}

function injectMovementUI(){const commands=document.querySelector('.commands');const b=document.createElement('button');b.dataset.cmd='move';b.textContent='เคลื่อนที่';commands.prepend(b);b.onclick=()=>showSub('move');const panel=document.createElement('div');panel.id='movePanel';panel.className='panel';panel.style.marginTop='8px';panel.innerHTML='<b>ควบคุมการเคลื่อนที่</b><div class="muted" id="moveInfo" style="margin:4px 0 8px">แตะพื้นสนามหรือใช้ปุ่มทิศทาง</div><div style="display:grid;grid-template-columns:repeat(3,52px);gap:6px;justify-content:center"><span></span><button type="button" data-dir="0,-1">▲</button><span></span><button type="button" data-dir="-1,0">◀</button><button type="button" id="moveDone">✓</button><button type="button" data-dir="1,0">▶</button><span></span><button type="button" data-dir="0,1">▼</button><span></span></div>';document.querySelector('.commandWrap').after(panel);panel.querySelectorAll('button').forEach(x=>{x.style.minHeight='46px';x.style.borderRadius='10px';x.style.border='1px solid #806344';x.style.background='#332216';x.style.color='#fff';x.style.fontWeight='900'});panel.querySelectorAll('[data-dir]').forEach(x=>x.onclick=()=>{const [dx,dz]=x.dataset.dir.split(',').map(Number);stepPlayer(dx,dz)});$('moveDone').onclick=()=>setMoveMode(false);panel.style.display='none';}
function updateMoveUI(){const p=$('movePanel');if(!p)return;p.style.display=moveMode?'block':'none';$('moveInfo').textContent=`เหลือระยะเคลื่อนที่ ${P.moveLeft.toFixed(1)} m · ระยะศัตรู ${dist(P,E).toFixed(1)} m`;moveRing.visible=moveMode;moveRing.position.set(P.x,.22,P.z);moveRing.scale.setScalar(Math.max(.05,P.moveLeft/MOVE_BUDGET));}
function setMoveMode(v){moveMode=v&&!busy&&phase==='PLAYER_COMMAND'&&P.moveLeft>.01;updateMoveUI();renderHUD();}

function optionsFor(cmd){if(cmd==='move')return[{label:'เข้าสู่โหมดเคลื่อนที่',desc:'แตะพื้นหรือใช้ปุ่มทิศทาง · ใช้ได้ก่อนออก Action',action:{type:'move'}}];if(cmd==='attack')return[{label:'ฟันเร็ว',desc:'ระยะ 1.75m',action:{type:'skill',skill:'quick'}},{label:'ฟันหนัก',desc:'ระยะ 2.05m',action:{type:'skill',skill:'heavy'}},{label:'ทำลายการ์ด',desc:'ระยะ 1.65m',action:{type:'skill',skill:'break'}}];if(cmd==='skill')return[{label:'คมดาบเพลิง',desc:'MP14 · ระยะ 3.4m',action:{type:'skill',skill:'flame'}},{label:'ตั้งสมาธิ',desc:'เพิ่มความแม่น',action:{type:'skill',skill:'focus'}}];if(cmd==='guard')return[{label:'Guard',desc:'ลดดาเมจ + ฟื้น Posture',action:{type:'guard'}}];if(cmd==='item')return[{label:'Potion',desc:'ฟื้น HP 180',action:{type:'item'}}];if(cmd==='tactic')return[{label:'ตั้งรับ',desc:'Guard + ฟื้น Stamina',action:{type:'tactic',mode:'defensive'}}];return[{label:'รอจังหวะ',desc:'ฟื้นทรัพยากร',action:{type:'wait'}}];}
function showSub(cmd){document.querySelectorAll('.commands button').forEach(b=>b.classList.toggle('active',b.dataset.cmd===cmd));$('subCommands').innerHTML='';for(const o of optionsFor(cmd)){const b=document.createElement('button');b.innerHTML=`${o.label}<small>${o.desc}</small>`;b.onclick=()=>o.action.type==='move'?setMoveMode(true):commitPlayer(o.action);$('subCommands').appendChild(b)}}
document.querySelectorAll('.commands button').forEach(b=>b.onclick=()=>showSub(b.dataset.cmd));

const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();renderer.domElement.addEventListener('pointerdown',ev=>{if(!moveMode||busy)return;const r=renderer.domElement.getBoundingClientRect();pointer.x=(ev.clientX-r.left)/r.width*2-1;pointer.y=-((ev.clientY-r.top)/r.height)*2+1;raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObject(ground,false)[0];if(hit){moveActor(P,hit.point.x,hit.point.z);updateMoveUI();renderHUD();}});

function enemyChoice(){if(E.hp/E.maxHP<.28&&rand()<.35)return{type:'guard'};const d=dist(E,P);if(d>2.0)return{type:'skill',skill:'quick'};const r=rand();return r<.3?{type:'skill',skill:'break'}:r<.65?{type:'skill',skill:'quick'}:{type:'skill',skill:'heavy'};}
function actionSpeed(a,act){let s=a.spd;if(act.type==='guard')s+=25;if(act.type==='skill'&&act.skill==='quick')s+=15;if(act.type==='skill'&&act.skill==='heavy')s-=12;return s;}
function enemyRepositionFor(act){if(act.type!=='skill')return;const sk=SKILLS[act.skill],d=dist(E,P);if(d<=sk.range)return;const dx=P.x-E.x,dz=P.z-E.z,len=d||1,target=Math.max(DUEL_MIN,sk.range*.84);const need=Math.max(0,d-target);moveActor(E,E.x+dx/len*Math.min(2.6,need),E.z+dz/len*Math.min(2.6,need),2.6);}
function commitPlayer(action){if(busy||phase!=='PLAYER_COMMAND')return;setMoveMode(false);if(action.type==='skill'){const s=SKILLS[action.skill];if(s.kind!=='buff'&&dist(P,E)>s.range){log(`อยู่นอกระยะ ${s.label} (${dist(P,E).toFixed(1)}m > ${s.range}m)`);showSub(action.skill==='flame'?'skill':'attack');return;}}busy=true;phase='RESOLVE';const enemy=enemyChoice();enemyRepositionFor(enemy);queue=[{actor:P,target:E,action,initiative:actionSpeed(P,action)+rand()*8},{actor:E,target:P,action:enemy,initiative:actionSpeed(E,enemy)+rand()*8}].sort((a,b)=>b.initiative-a.initiative);renderHUD();$('subCommands').innerHTML='';resolveQueue();}

function resolveSkill(attacker,defender,key){const s=SKILLS[key];if(s.kind!=='buff'&&dist(attacker,defender)>s.range)return{hit:false,outOfRange:true};if(attacker.mp<s.mp||attacker.stamina<s.st)return{hit:false,noResource:true};attacker.mp-=s.mp;attacker.stamina-=s.st;if(s.kind==='buff'){attacker.focusBuff=2;return{hit:true,buff:true};}const hitChance=clamp(s.accuracy+attacker.accuracy-.9-defender.evasion+(attacker.focusBuff>0?.08:0),.15,.99);if(rand()>hitChance)return{hit:false};const atk=s.kind==='magic'?attacker.mag:attacker.atk,def=s.kind==='magic'?defender.mdef:defender.def;let damage=s.power*(atk/(atk+def*.75));const flank=positionBonus(attacker,defender);damage*=flank.mult;let crit=false;if(rand()<attacker.crit){damage*=attacker.critDmg;crit=true}if(defender.guarding)damage*=.42;defender.hp=clamp(defender.hp-damage,0,defender.maxHP);defender.posture=clamp(defender.posture-s.posture*(defender.guarding?1.45:1),0,100);return{hit:true,damage,crit,flank:flank.label,anim:s.anim};}
function positionBonus(a,d){const facing=new THREE.Vector2(a.x-d.x,a.z-d.z).normalize(),home=new THREE.Vector2(d.side==='p'?-1:1,0);const dot=facing.dot(home);if(dot<-.45)return{mult:1.22,label:'BACK'};if(Math.abs(dot)<.35)return{mult:1.1,label:'SIDE'};return{mult:1,label:'FRONT'};}
function applyAction(a,d,act){a.guarding=false;if(act.type==='guard'){a.guarding=true;a.posture=clamp(a.posture+16,0,100);return{type:'guard'}}if(act.type==='wait'){a.stamina=clamp(a.stamina+24,0,100);a.mp=clamp(a.mp+5,0,a.maxMP);return{type:'wait'}}if(act.type==='item'){a.hp=clamp(a.hp+180,0,a.maxHP);return{type:'item'}}if(act.type==='tactic'){a.guarding=true;a.stamina=clamp(a.stamina+12,0,100);return{type:'tactic'}}return{type:'skill',skill:act.skill,...resolveSkill(a,d,act.skill)}}
function tween(ms,fn){return new Promise(res=>{const st=performance.now();function f(t){const p=clamp((t-st)/ms,0,1);fn(p);p<1?requestAnimationFrame(f):res()}requestAnimationFrame(f)})}
async function present(a,d,act,r){if(act.type!=='skill'||SKILLS[act.skill].kind==='buff'){await tween(220,p=>a.model.scale.setScalar(1+Math.sin(p*Math.PI)*.06));a.model.scale.setScalar(1);return}const sk=SKILLS[act.skill],m=a.model,home=new THREE.Vector3(a.x,.20,a.z),target=new THREE.Vector3(d.x,.20,d.z),dir=target.clone().sub(home).setY(0).normalize(),attackPos=target.clone().addScaledVector(dir,-Math.min(sk.range*.72,1.25));await tween(220,p=>m.position.lerpVectors(home,attackPos,p));const arm=m.userData.swordArm,base=m.userData.base;await tween(sk.anim==='heavy'?320:210,p=>arm.rotation.z=base+(a.side==='p'?1:-1)*Math.sin(p*Math.PI)*1.8);if(r.hit&&!r.buff){d.model.scale.setScalar(.9);setTimeout(()=>d.model.scale.setScalar(1),110)}await tween(240,p=>m.position.lerpVectors(attackPos,home,p));arm.rotation.z=base;syncActor(a)}
async function resolveQueue(){for(const q of queue){if(q.actor.hp<=0||q.target.hp<=0)continue;const r=applyAction(q.actor,q.target,q.action);if(r.outOfRange)log(`${q.actor.name} โจมตีไม่ถึง`);else if(r.noResource)log(`${q.actor.name} ทรัพยากรไม่พอ`);else if(r.type==='skill'){const s=SKILLS[q.action.skill];log(`${q.actor.name} ใช้ ${s.label}${r.hit?` → ${Math.round(r.damage||0)}${r.flank&&r.flank!=='FRONT'?` · ${r.flank}`:''}${r.crit?' CRIT':''}`:' → MISS'}`)}else log(`${q.actor.name} ใช้ ${r.type}`);await present(q.actor,q.target,q.action,r);renderHUD();if(P.hp<=0||E.hp<=0)break;}if(P.hp<=0||E.hp<=0){busy=true;phase='END';$('result').textContent=`ผู้ชนะ: ${P.hp>E.hp?P.name:E.name}`;renderHUD();return}turn++;P.moveLeft=MOVE_BUDGET;E.moveLeft=MOVE_BUDGET;P.stamina=clamp(P.stamina+7,0,100);E.stamina=clamp(E.stamina+7,0,100);busy=false;phase='PLAYER_COMMAND';renderHUD();updateMoveUI();}

injectMovementUI();renderHUD();updateMoveUI();log('เริ่มการต่อสู้ — Fantasy Ruined Sanctuary · สนามขนาดใหญ่');
function resize(){const el=$('viewport'),w=el.clientWidth,h=Math.max(380,Math.min(700,w*.64));renderer.setSize(w,h,false);const aspect=w/h,f=16.5;camera.left=-f*aspect/2;camera.right=f*aspect/2;camera.top=f/2;camera.bottom=-f/2;camera.updateProjectionMatrix()}new ResizeObserver(resize).observe($('viewport'));resize();
function frame(){syncActor(P);syncActor(E);renderer.render(scene,camera);requestAnimationFrame(frame)}requestAnimationFrame(frame);
