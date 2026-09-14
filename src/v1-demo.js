import {createEngine} from './twa-engine.js';

const $=id=>document.getElementById(id);
let engine=createEngine({seed:42,count:28,workers:2});
let running=true,parallel=true,last=0,acc=0;
engine.createClient('demo-client',{mode:'all'});engine.bootstrapClient('demo-client');

function draw(){
  const c=$('view'),g=c.getContext('2d'),ents=engine.entities;
  g.clearRect(0,0,c.width,c.height);g.fillStyle='#06101b';g.fillRect(0,0,c.width,c.height);
  g.strokeStyle='#16324a';for(let x=0;x<c.width;x+=50){g.beginPath();g.moveTo(x,0);g.lineTo(x,c.height);g.stroke()}for(let y=0;y<c.height;y+=50){g.beginPath();g.moveTo(0,y);g.lineTo(c.width,y);g.stroke()}
  for(const e of ents){const x=(e.x+1)*.5*c.width,y=(e.y+1)*.5*c.height;g.beginPath();g.arc(x,y,e.type==='player'?10:6,0,Math.PI*2);g.fillStyle=e.type==='player'?'#5ce2a2':'#ff6b6b';g.fill()}
  $('tick').textContent=engine.tick;$('version').textContent=engine.version;$('hash').textContent=engine.hash;$('live').textContent=engine.liveEntities;
  const st=engine.clientStats('demo-client');$('net').textContent=`${st.packets} pkt / ${st.bytes} B`;
  const h=engine.world.lastCommit;$('delta').textContent=h?`${h.writes} deltas / ${h.conflicts} conflicts`:'—';
}

async function tick(){
  const r=await engine.step({parallel,mode:'exact',critical:true});
  if(r.ok){const rep=engine.replicateLatest('demo-client');if(!rep.applied.ok){engine.createClient('demo-client',{mode:'all'});engine.bootstrapClient('demo-client')}}
  draw();
}

async function loop(ts){
  if(!last)last=ts;acc+=ts-last;last=ts;
  while(running&&acc>=1000/60){await tick();acc-=1000/60}
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function impulse(dx,dy){engine.submit('impulse',{entity:0,dvx:dx,dvy:dy},{source:'player'});$('status').textContent=`Input impulse ${dx}, ${dy} เข้าคิว`}
function damage(){engine.submit('damage',{target:1,amount:15,source:0,cause:'player-action'},{source:'player'});$('status').textContent='Input โจมตี Entity 1 เข้าคิว'}
function spawn(){engine.submit('spawn',{x:.35,y:.15,vx:-.08,vy:.05,team:1,type:2,hp:100},{source:'player'});$('status').textContent='Input Spawn เข้าคิว'}

$('up').onclick=()=>impulse(0,-.18);$('down').onclick=()=>impulse(0,.18);$('left').onclick=()=>impulse(-.18,0);$('right').onclick=()=>impulse(.18,0);$('attack').onclick=damage;$('spawn').onclick=spawn;
$('pause').onclick=()=>{running=!running;$('pause').textContent=running?'หยุด':'เล่นต่อ'};
$('parallel').onchange=e=>{parallel=e.target.checked};
$('checkpoint').onclick=()=>{engine.checkpoint('demo');$('status').textContent=`Checkpoint ที่ Tick ${engine.tick}`};
$('rollback').onclick=()=>{const u=engine.rollback(30);engine.createClient('demo-client',{mode:'all'});engine.bootstrapClient('demo-client');$('status').textContent=`Rollback ${u.length} commits`;draw()};
$('replay').onclick=()=>{const a=engine.replay(30);engine.createClient('demo-client',{mode:'all'});engine.bootstrapClient('demo-client');$('status').textContent=`Replay ${a.length} commits`;draw()};
$('reset').onclick=()=>{engine.destroy();engine=createEngine({seed:42,count:28,workers:2});engine.createClient('demo-client',{mode:'all'});engine.bootstrapClient('demo-client');$('status').textContent='สร้าง World ใหม่';draw()};

draw();
