import {createWorld,snapshot,makeProposal,resolveConflicts,verify,commit,stateHash} from '../../src/twa-core.js';
import {rollback} from '../../src/twa-history.js';

const $=id=>document.getElementById(id), SIZE=10, cell=()=>board.width/SIZE;
const board=$('board'),ctx=board.getContext('2d');
const staticUnits=[
  {id:0,name:'Vanguard',cls:'Vanguard',team:0,gx:1,gy:7,hp:130,atk:34,def:22,mov:4,range:1},
  {id:1,name:'Assault',cls:'Assault',team:0,gx:2,gy:8,hp:100,atk:42,def:14,mov:5,range:1},
  {id:2,name:'Ranger',cls:'Ranger',team:0,gx:0,gy:8,hp:82,atk:38,def:10,mov:4,range:4},
  {id:3,name:'Support',cls:'Support',team:0,gx:1,gy:9,hp:92,atk:24,def:14,mov:4,range:2},
  {id:4,name:'Raider A',cls:'Enemy',team:1,gx:7,gy:1,hp:90,atk:31,def:12,mov:4,range:1},
  {id:5,name:'Raider B',cls:'Enemy',team:1,gx:8,gy:2,hp:90,atk:31,def:12,mov:4,range:1},
  {id:6,name:'Raider C',cls:'Enemy',team:1,gx:6,gy:2,hp:90,atk:31,def:12,mov:4,range:1},
  {id:7,name:'Sniper A',cls:'Enemy Ranger',team:1,gx:8,gy:0,hp:72,atk:34,def:9,mov:3,range:4},
  {id:8,name:'Sniper B',cls:'Enemy Ranger',team:1,gx:9,gy:1,hp:72,atk:34,def:9,mov:3,range:4},
  {id:9,name:'Heavy',cls:'Enemy Heavy',team:1,gx:7,gy:0,hp:125,atk:44,def:20,mov:2,range:3}
];
const terrain=new Map(['4,4','4,5','5,4'].map(k=>[k,'wall']));
let world,units,turn,phase,selected,mode,acted,chrono,timeline;

function gxToX(g){return -0.9+g*0.2} function gyToY(g){return -0.9+g*0.2}
function xToG(x){return Math.round((x+0.9)/0.2)} function yToG(y){return Math.round((y+0.9)/0.2)}
function alive(u){return world.active[u.id]&&world.hp[u.id]>0}
function unitAt(gx,gy){return units.find(u=>alive(u)&&xToG(world.x[u.id])===gx&&yToG(world.y[u.id])===gy)}
function dist(a,b){return Math.abs(xToG(world.x[a.id])-xToG(world.x[b.id]))+Math.abs(yToG(world.y[a.id])-yToG(world.y[b.id]))}
function canStand(gx,gy){return gx>=0&&gy>=0&&gx<SIZE&&gy<SIZE&&!terrain.has(`${gx},${gy}`)&&!unitAt(gx,gy)}
function reset(){
  world=createWorld({seed:42,count:staticUnits.length,density:0,speed:0});
  units=staticUnits.map(u=>({...u}));
  for(const u of units){world.team[u.id]=u.team;world.x[u.id]=gxToX(u.gx);world.y[u.id]=gyToY(u.gy);world.vx[u.id]=0;world.vy[u.id]=0;world.hp[u.id]=u.hp;world.radius[u.id]=.03;world.mass[u.id]=1;world.type[u.id]=u.team===0?1:2;}
  turn=1;phase='PLAYER';selected=null;mode='move';acted=new Set();chrono=3;timeline=[];log('Mission เริ่ม: กำจัดศัตรูทั้งหมด','ok');draw();
}
function transaction(proposal,label,meta={}){
  const resolved=resolveConflicts([proposal]),check=verify(world,resolved,{critical:true});
  if(!check.ok){log(`BLOCKED: ${check.errors.join(', ')}`,'enemy');return false;}
  const rec=commit(world,resolved,{verifierResult:check});
  timeline.push({turn,phase,label,hash:stateHash(world),worldVersion:rec.worldVersion,...meta});
  log(label,phase==='PLAYER'?'player':'enemy');return true;
}
function moveUnit(u,gx,gy){
  if(!alive(u)||acted.has(u.id))return false;
  const d=Math.abs(xToG(world.x[u.id])-gx)+Math.abs(yToG(world.y[u.id])-gy);if(d<1||d>u.mov||!canStand(gx,gy))return false;
  const s=snapshot(world),p=makeProposal({snapshot:s,systemId:'ironfront.move',source:`unit:${u.id}`,priority:240,writes:[
    {entity:u.id,field:'x',value:gxToX(gx),expectedVersion:s.version[u.id],expectedGeneration:s.generation[u.id]},
    {entity:u.id,field:'y',value:gyToY(gy),expectedVersion:s.version[u.id],expectedGeneration:s.generation[u.id]}
  ],events:[{type:'move',entity:u.id,gx,gy}],meta:{authority:true,game:'iron-front'}});
  const ok=transaction(p,`${u.name} เดินไป (${gx},${gy})`);if(ok){acted.add(u.id);selected=null;}return ok;
}
function attackUnit(a,b){
  if(!alive(a)||!alive(b)||a.team===b.team||acted.has(a.id)||dist(a,b)>a.range)return false;
  const dmg=Math.max(1,a.atk-b.def),s=snapshot(world),p=makeProposal({snapshot:s,systemId:'ironfront.attack',source:`unit:${a.id}`,priority:260,writes:[{entity:b.id,field:'hp',op:'add',value:-dmg,expectedVersion:s.version[b.id],expectedGeneration:s.generation[b.id]}],events:[{type:'attack',source:a.id,target:b.id,damage:dmg}],meta:{authority:true,game:'iron-front'}});
  const ok=transaction(p,`${a.name} โจมตี ${b.name} -${dmg} HP`,{attacker:a.id,target:b.id,damage:dmg});if(ok){acted.add(a.id);if(world.hp[b.id]<=0){world.hp[b.id]=0;world.active[b.id]=0;log(`${b.name} ถูกกำจัด`,'enemy');}selected=null;}return ok;
}
function nearestEnemy(u){return units.filter(x=>alive(x)&&x.team!==u.team).sort((a,b)=>dist(u,a)-dist(u,b)||a.id-b.id)[0]}
function enemyPhase(){phase='ENEMY';acted.clear();draw();setTimeout(()=>{for(const u of units.filter(x=>alive(x)&&x.team===1)){
  const t=nearestEnemy(u);if(!t)break;
  if(dist(u,t)<=u.range){attackUnit(u,t);continue;}
  const ux=xToG(world.x[u.id]),uy=yToG(world.y[u.id]),tx=xToG(world.x[t.id]),ty=yToG(world.y[t.id]);let best=null,bestD=Infinity;
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=ux+dx,ny=uy+dy;if(!canStand(nx,ny))continue;const nd=Math.abs(nx-tx)+Math.abs(ny-ty);if(nd<bestD){bestD=nd;best=[nx,ny]}}
  if(best)moveUnit(u,best[0],best[1]);
  if(alive(t)&&dist(u,t)<=u.range&&!acted.has(u.id))attackUnit(u,t);
 }
 if(checkEnd())return;phase='PLAYER';turn++;acted.clear();selected=null;mode='move';log(`Turn ${turn} — Player Phase`,'ok');draw();},180);
}
function checkEnd(){const p=units.some(u=>alive(u)&&u.team===0),e=units.some(u=>alive(u)&&u.team===1);if(!e){phase='VICTORY';log('MISSION COMPLETE — ชนะ!','ok');draw();return true}if(!p){phase='DEFEAT';log('MISSION FAILED — ทีมถูกกำจัด','enemy');draw();return true}return false}
function rewindOne(){if(chrono<=0||world.deltaLog.length===0)return;const r=rollback(world,1);if(!r.length)return;chrono--;selected=null;acted.clear();timeline.pop();log('⏪ Rewind 1 Action','ok');draw()}
function canvasPos(ev){const r=board.getBoundingClientRect(),x=(ev.clientX-r.left)*board.width/r.width,y=(ev.clientY-r.top)*board.height/r.height;return [Math.floor(x/cell()),Math.floor(y/cell())]}
function handleBoard(ev){if(phase!=='PLAYER')return;const [gx,gy]=canvasPos(ev),u=unitAt(gx,gy);
  if(selected){if(mode==='attack'&&u&&u.team===1){attackUnit(selected,u);checkEnd();draw();return}if(mode==='move'&&!u){moveUnit(selected,gx,gy);draw();return}}
  if(u&&u.team===0&&!acted.has(u.id)){selected=u;mode='move';draw();}
}
function log(text,cls=''){timeline.push({displayOnly:true,text,cls});renderTimeline()}
function renderTimeline(){const list=timeline.filter(x=>x.displayOnly).slice(-18).reverse();$('timeline').innerHTML=list.map(x=>`<div class="entry ${x.cls}">${x.text}</div>`).join('')}
function renderUnitCard(){if(!selected){$('unitCard').innerHTML='ยังไม่ได้เลือก';return}const hp=Math.max(0,world.hp[selected.id]),pct=Math.max(0,Math.min(100,hp/selected.hp*100));$('unitCard').innerHTML=`<b>${selected.name}</b><div class="muted">${selected.cls} • ATK ${selected.atk} • DEF ${selected.def} • MOV ${selected.mov} • RANGE ${selected.range}</div><div>HP ${Math.round(hp)} / ${selected.hp}</div><div class="bar"><div class="fill" style="width:${pct}%"></div></div><div class="muted" style="margin-top:6px">โหมด: ${mode.toUpperCase()}</div>`}
function draw(){
  const cs=cell();ctx.clearRect(0,0,board.width,board.height);ctx.fillStyle='#07131f';ctx.fillRect(0,0,board.width,board.height);
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){ctx.fillStyle=terrain.has(`${x},${y}`)?'#28394c':((x+y)%2?'#102338':'#0d1e31');ctx.fillRect(x*cs,y*cs,cs,cs);ctx.strokeStyle='#294863';ctx.strokeRect(x*cs,y*cs,cs,cs)}
  if(selected&&phase==='PLAYER'){
    const sx=xToG(world.x[selected.id]),sy=yToG(world.y[selected.id]);for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const d=Math.abs(x-sx)+Math.abs(y-sy);if(mode==='move'&&d>0&&d<=selected.mov&&canStand(x,y)){ctx.fillStyle='#2c9d6b55';ctx.fillRect(x*cs,y*cs,cs,cs)}if(mode==='attack'&&d>0&&d<=selected.range){ctx.fillStyle='#d34b4b55';ctx.fillRect(x*cs,y*cs,cs,cs)}}}
  for(const u of units){if(!alive(u))continue;const x=xToG(world.x[u.id]),y=yToG(world.y[u.id]),cx=x*cs+cs/2,cy=y*cs+cs/2;ctx.beginPath();ctx.arc(cx,cy,cs*.27,0,Math.PI*2);ctx.fillStyle=u.team===0?'#54c7ff':'#ff6b6b';ctx.fill();if(selected?.id===u.id){ctx.lineWidth=6;ctx.strokeStyle='#ffd166';ctx.stroke()}ctx.fillStyle='#fff';ctx.font=`bold ${Math.max(16,cs*.18)}px system-ui`;ctx.textAlign='center';ctx.fillText(u.id,cx,cy+6);const hp=Math.max(0,world.hp[u.id])/u.hp;ctx.fillStyle='#1a2e3f';ctx.fillRect(x*cs+cs*.12,y*cs+cs*.78,cs*.76,7);ctx.fillStyle=u.team===0?'#5ce2a2':'#ff9a76';ctx.fillRect(x*cs+cs*.12,y*cs+cs*.78,cs*.76*hp,7)}
  $('turn').textContent=turn;$('phase').textContent=phase;$('chrono').textContent=chrono;const pa=units.filter(u=>alive(u)&&u.team===0).length,ea=units.filter(u=>alive(u)&&u.team===1).length;$('alive').textContent=`${pa} / ${ea}`;$('hint').textContent=phase==='PLAYER'?(selected?`${selected.name}: ${mode==='move'?'แตะช่องสีเขียวเพื่อเดิน':'แตะศัตรูในพื้นที่สีแดงเพื่อโจมตี'}`:'แตะยูนิตสีน้ำเงินเพื่อเลือก'):`${phase} กำลังทำงาน`;renderUnitCard();renderTimeline();
}
board.addEventListener('pointerdown',handleBoard,{passive:true});
$('move').onclick=()=>{if(selected){mode='move';draw()}};$('attack').onclick=()=>{if(selected){mode='attack';draw()}};$('end').onclick=()=>{if(phase==='PLAYER')enemyPhase()};$('rewind').onclick=rewindOne;$('reset').onclick=reset;$('clear').onclick=()=>{selected=null;draw()};
reset();