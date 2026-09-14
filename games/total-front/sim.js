import {createWorld,snapshot,makeProposal,resolveConflicts,verify,commit,stateHash} from '../../src/twa-core.js';

const $=id=>document.getElementById(id);
const canvas=$('battle'),ctx=canvas.getContext('2d');
let world,count=1200,running=true,speed=1,last=performance.now(),acc=0,attackOrder=false,benchRunning=false;
let morale,suppression,formation,targetX,targetY;
const TICK_HZ=10,TICK_MS=1000/TICK_HZ;
const seed=4242;
const log=[];
let profiler={snap:0,move:0,combat:0,commit:0,writes:0,conflicts:0,proposals:0,last:0};

function init(n=count){
  count=n;world=createWorld({seed,count,density:.15,speed:0});
  morale=new Float32Array(count);suppression=new Float32Array(count);formation=new Uint16Array(count);targetX=new Float64Array(count);targetY=new Float64Array(count);
  const half=count>>1,cols=Math.max(12,Math.floor(Math.sqrt(half)*1.35));
  for(let i=0;i<count;i++){
    const team=i<half?0:1,local=team===0?i:i-half,row=Math.floor(local/cols),col=local%cols;
    world.team[i]=team;world.active[i]=1;world.hp[i]=100;world.radius[i]=.0045;world.mass[i]=1;world.type[i]=1;
    const jitter=((i*1103515245+12345)>>>8)%1000/1000-.5;
    world.x[i]=(team===0?-0.78:0.78)+(team===0?1:-1)*(col/cols)*.18+jitter*.01;
    world.y[i]=-0.66+(row/Math.max(1,Math.ceil(half/cols)-1))*1.32+(((i*97)%101)/101-.5)*.008;
    morale[i]=100;suppression[i]=0;formation[i]=team===0?1:2;
    targetX[i]=team===0?-.12:.12;targetY[i]=world.y[i]*.42;
  }
  world.tick=0;world.worldVersion=0;world.deltaLog.length=0;world.eventLog.length=0;
  attackOrder=false;log.length=0;pushLog('SYSTEM',`เริ่มสนามทดสอบ ${count.toLocaleString()} entities`);
  draw();updateHUD();
}

function pushLog(type,text){log.push({tick:world?.tick??0,type,text});if(log.length>50)log.shift();$('log').innerHTML=log.slice(-14).reverse().map(x=>`<div class="entry"><b>${x.type}</b> • ${x.text}<div class="muted">tick ${x.tick}</div></div>`).join('')}

function alive(i){return world.active[i]&&world.hp[i]>0}
function buildSpatial(cell=.055){const g=new Map();for(let i=0;i<count;i++)if(alive(i)){const cx=Math.floor(world.x[i]/cell),cy=Math.floor(world.y[i]/cell),k=cx+','+cy;if(!g.has(k))g.set(k,[]);g.get(k).push(i)}return {g,cell}}
function neighbors(index,sp){const x=world.x[index],y=world.y[index],cx=Math.floor(x/sp.cell),cy=Math.floor(y/sp.cell),out=[];for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){const b=sp.g.get((cx+ox)+','+(cy+oy));if(b)out.push(...b)}return out}

function movementProposal(s){
  const writes=[];const step=.012;
  for(let i=0;i<count;i++)if(alive(i)){
    const team=world.team[i];let tx=targetX[i],ty=targetY[i];
    if(!attackOrder){tx=team===0?-.58:.58;ty=world.y[i]}
    const dx=tx-world.x[i],dy=ty-world.y[i],d=Math.hypot(dx,dy);if(d<.004)continue;
    const moraleMul=.35+.65*(morale[i]/100),supMul=1-Math.min(.75,suppression[i]/135),m=Math.min(step*moraleMul*supMul,d)/d;
    const nx=Math.max(-.98,Math.min(.98,world.x[i]+dx*m)),ny=Math.max(-.98,Math.min(.98,world.y[i]+dy*m));
    writes.push({entity:i,field:'x',value:nx,expectedVersion:s.version[i],expectedGeneration:s.generation[i]});
    writes.push({entity:i,field:'y',value:ny,expectedVersion:s.version[i],expectedGeneration:s.generation[i]});
  }
  return makeProposal({snapshot:s,systemId:'totalfront.movement',source:'formations',priority:120,writes,events:[],meta:{authority:true}})
}

function combatProposal(s,sp){
  const writes=[],events=[];let shots=0;
  const range=.072;
  for(let i=0;i<count;i++)if(alive(i)){
    if(((world.tick+i*7)%3)!==0)continue;
    let best=-1,bestD=1e9;
    for(const j of neighbors(i,sp)){if(j===i||!alive(j)||world.team[j]===world.team[i])continue;const dx=world.x[j]-world.x[i],dy=world.y[j]-world.y[i],d2=dx*dx+dy*dy;if(d2<range*range&&d2<bestD){bestD=d2;best=j}}
    if(best<0)continue;shots++;
    const distance=Math.sqrt(bestD),base=2.2+(1-distance/range)*2.4;
    const dmg=Math.max(.5,base*(.55+.45*morale[i]/100)*(1-Math.min(.65,suppression[i]/150)));
    writes.push({entity:best,field:'hp',op:'add',value:-dmg,expectedVersion:s.version[best],expectedGeneration:s.generation[best]});
    suppression[best]=Math.min(100,suppression[best]+5.5);
    morale[best]=Math.max(0,morale[best]-(dmg*.18+suppression[best]*.002));
    events.push({type:'fire',source:i,target:best,damage:dmg});
  }
  for(let i=0;i<count;i++)if(alive(i)){suppression[i]=Math.max(0,suppression[i]-.8);if(suppression[i]<20)morale[i]=Math.min(100,morale[i]+.03)}
  return makeProposal({snapshot:s,systemId:'totalfront.combat',source:'small-arms',priority:220,writes,events,meta:{authority:true,shots}})
}

function oneTick(){
  const t0=performance.now();const s0=performance.now();const s=snapshot(world);profiler.snap=performance.now()-s0;
  const m0=performance.now();const move=movementProposal(s);profiler.move=performance.now()-m0;
  const c0=performance.now();const sp=buildSpatial();const combat=combatProposal(s,sp);profiler.combat=performance.now()-c0;
  const k0=performance.now();const resolved=resolveConflicts([move,combat]),v=verify(world,resolved,{critical:false});if(!v.ok){pushLog('ERROR',v.errors.slice(0,2).join(', '));running=false;return}
  commit(world,resolved,{verifierResult:v});profiler.commit=performance.now()-k0;
  profiler.writes=resolved.writes.length;profiler.conflicts=resolved.conflicts.length;profiler.proposals=resolved.proposalCount;profiler.last=performance.now()-t0;
  for(let i=0;i<count;i++)if(world.hp[i]<=0&&world.active[i]){world.hp[i]=0;world.active[i]=0;morale[i]=0;suppression[i]=0}
  if(world.tick%25===0){const b=teamStats(0),r=teamStats(1);pushLog('SITREP',`BLUE ${b.alive} • RED ${r.alive} • tick ${world.tick}`)}
  updateHUD();
}

function teamStats(team){let a=0,hp=0,m=0,s=0;for(let i=0;i<count;i++)if(world.team[i]===team&&alive(i)){a++;hp+=world.hp[i];m+=morale[i];s+=suppression[i]}return {alive:a,hp,morale:a?m/a:0,supp:a?s/a:0}}

function updateHUD(){if(!world)return;const b=teamStats(0),r=teamStats(1),half=count/2;$('tick').textContent=world.tick.toLocaleString();$('entities').textContent=count.toLocaleString();$('alive').textContent=`${b.alive} / ${r.alive}`;$('tickMs').textContent=profiler.last.toFixed(2)+' ms';$('proposals').textContent=profiler.proposals;$('hash').textContent=String(stateHash(world)).slice(0,10);$('blueStrength').textContent=b.alive.toLocaleString();$('redStrength').textContent=r.alive.toLocaleString();$('blueBar').style.width=Math.max(0,b.alive/half*100)+'%';$('redBar').style.width=Math.max(0,r.alive/half*100)+'%';$('morale').textContent=`${b.morale.toFixed(1)} / ${r.morale.toFixed(1)}`;$('suppression').textContent=`${b.supp.toFixed(1)} / ${r.supp.toFixed(1)}`;$('pSnap').textContent=profiler.snap.toFixed(2);$('pMove').textContent=profiler.move.toFixed(2);$('pCombat').textContent=profiler.combat.toFixed(2);$('pCommit').textContent=profiler.commit.toFixed(2);$('writes').textContent=profiler.writes.toLocaleString();$('conflicts').textContent=profiler.conflicts.toLocaleString()}

function draw(){if(!world)return;const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='#0b1925';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#1e3447';ctx.lineWidth=1;for(let x=0;x<=10;x++){ctx.beginPath();ctx.moveTo(x*w/10,0);ctx.lineTo(x*w/10,h);ctx.stroke()}for(let y=0;y<=8;y++){ctx.beginPath();ctx.moveTo(0,y*h/8);ctx.lineTo(w,y*h/8);ctx.stroke()}
  const sx=x=>(x+1)*.5*w,sy=y=>(y+1)*.5*h;
  ctx.fillStyle='#6c5934';ctx.beginPath();ctx.arc(sx(0),sy(0),55,0,Math.PI*2);ctx.fill();ctx.fillStyle='#e4c677';ctx.font='bold 18px system-ui';ctx.textAlign='center';ctx.fillText('▲ HILL 42',sx(0),sy(0)+6);
  const stride=count>2400?6:count>1400?4:2;
  for(let i=0;i<count;i+=stride)if(alive(i)){const team=world.team[i];ctx.fillStyle=team===0?'#52bfff':'#ff6b6b';ctx.globalAlpha=.35+.65*Math.max(.2,world.hp[i]/100);ctx.fillRect(sx(world.x[i])-2,sy(world.y[i])-2,4,4)}ctx.globalAlpha=1;
}

function loop(now){const dt=now-last;last=now;if(running&&!benchRunning){acc+=dt*speed;let guard=0;while(acc>=TICK_MS&&guard<8){oneTick();acc-=TICK_MS;guard++}}draw();requestAnimationFrame(loop)}

$('pause').onclick=()=>{running=!running;$('pause').textContent=running?'⏸ PAUSE':'▶ RESUME'};
$('speed').onclick=()=>{speed=speed===1?2:speed===2?4:1;$('speed').textContent=`▶ ${speed}×`};
$('order').onclick=()=>{attackOrder=!attackOrder;$('order').textContent=attackOrder?'🛡 HOLD LINE':'⚔️ ATTACK HILL';pushLog('ORDER',attackOrder?'ทั้งสองฝ่ายเริ่มรุกเข้าสู่ Hill 42':'หยุดการรุกและรักษาแนว')};
$('reset').onclick=()=>init(count);
$('scale').onclick=()=>{const next=count===1200?2400:count===2400?5000:1200;init(next);$('scale').textContent=next===1200?'📈 2,400 ENTITIES':next===2400?'📈 5,000 ENTITIES':'↩ 1,200 ENTITIES'};
$('bench').onclick=async()=>{if(benchRunning)return;benchRunning=true;const was=running;running=false;const start=performance.now(),startTick=world.tick;for(let i=0;i<300;i++){oneTick();if(i%25===0)await new Promise(r=>setTimeout(r,0))}const ms=performance.now()-start,avg=ms/(world.tick-startTick);pushLog('BENCH',`${world.tick-startTick} ticks • avg ${avg.toFixed(2)} ms/tick • ${(1000/avg).toFixed(1)} ticks/s`);running=was;benchRunning=false;updateHUD()};

init();requestAnimationFrame(loop);
