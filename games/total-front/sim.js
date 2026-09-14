import {createWorld,snapshot,makeProposal,resolveConflicts,verify,commit,stateHash} from '../../src/twa-core.js';

const $=id=>document.getElementById(id);
const canvas=$('battle'),ctx=canvas.getContext('2d');
let world,count=1200,running=true,speed=1,last=performance.now(),acc=0,benchRunning=false;
let morale,suppression,cohesion,squadId,companyId,battalionId;
let hierarchy={battalions:[],companies:[],squads:[]};
let selectedBn=null,pendingMapOrder=null;
const TICK_HZ=10,TICK_MS=1000/TICK_HZ,seed=4242;
const SQUAD_SIZE=10,COMPANY_SIZE=100,BATTALION_SIZE=300,SPATIAL_CELL=.055;
const log=[];
let profiler={snap:0,spatial:0,move:0,combat:0,commit:0,writes:0,conflicts:0,proposals:0,last:0,cells:0,maxCell:0,queries:0,candidates:0};

function init(n=count){
  count=n;world=createWorld({seed,count,density:.15,speed:0});
  morale=new Float32Array(count);suppression=new Float32Array(count);cohesion=new Float32Array(count);
  squadId=new Uint32Array(count);companyId=new Uint32Array(count);battalionId=new Uint32Array(count);
  hierarchy={battalions:[],companies:[],squads:[]};selectedBn=null;pendingMapOrder=null;
  const half=count>>1;
  buildHierarchy(0,0,half);buildHierarchy(1,half,count);
  for(let i=0;i<count;i++){
    const team=i<half?0:1,local=team===0?i:i-half,sq=hierarchy.squads[squadId[i]],slot=local%SQUAD_SIZE,row=Math.floor(slot/5),col=slot%5,side=team===0?-1:1;
    world.team[i]=team;world.active[i]=1;world.hp[i]=100;world.radius[i]=.0042;world.mass[i]=1;world.type[i]=1;
    morale[i]=100;suppression[i]=0;cohesion[i]=100;
    world.x[i]=sq.anchorX+side*col*.008;world.y[i]=sq.anchorY+(row-.5)*.014+(((i*97)%101)/101-.5)*.002;
  }
  world.tick=0;world.worldVersion=0;world.deltaLog.length=0;world.eventLog.length=0;
  log.length=0;profiler={snap:0,spatial:0,move:0,combat:0,commit:0,writes:0,conflicts:0,proposals:0,last:0,cells:0,maxCell:0,queries:0,candidates:0};
  pushLog('SYSTEM',`P2 เริ่ม ${count.toLocaleString()} entities • เลือก Battalion ฝ่าย BLUE แล้วออกคำสั่งได้`);
  draw();updateHUD();renderSelected();
}

function buildHierarchy(team,start,end){
  const side=team===0?-1:1,total=end-start,teamBnCount=Math.max(1,Math.ceil(total/BATTALION_SIZE));
  for(let b=0;b<teamBnCount;b++){
    const bnId=hierarchy.battalions.length,bStart=start+b*BATTALION_SIZE,bEnd=Math.min(end,bStart+BATTALION_SIZE);
    const lane=teamBnCount===1?0:-.72+b*(1.44/(teamBnCount-1));
    const bn={id:bnId,team,start:bStart,end:bEnd,homeX:side*.72,homeY:lane,targetX:side*.58,targetY:lane,order:'HOLD',cohesion:100};
    hierarchy.battalions.push(bn);
    const companyCount=Math.ceil((bEnd-bStart)/COMPANY_SIZE);
    for(let c=0;c<companyCount;c++){
      const coId=hierarchy.companies.length,cStart=bStart+c*COMPANY_SIZE,cEnd=Math.min(bEnd,cStart+COMPANY_SIZE),coYOffset=(c-(companyCount-1)/2)*.08;
      hierarchy.companies.push({id:coId,team,battalionId:bnId,start:cStart,end:cEnd,offsetY:coYOffset});
      const squadCount=Math.ceil((cEnd-cStart)/SQUAD_SIZE);
      for(let q=0;q<squadCount;q++){
        const sqId=hierarchy.squads.length,qStart=cStart+q*SQUAD_SIZE,qEnd=Math.min(cEnd,qStart+SQUAD_SIZE),qRow=Math.floor(q/5),qCol=q%5;
        const sq={id:sqId,team,battalionId:bnId,companyId:coId,start:qStart,end:qEnd,localRow:qRow,localCol:qCol,anchorX:bn.homeX+side*(c*.035+qCol*.014),anchorY:bn.homeY+coYOffset+(qRow-.5)*.026};
        hierarchy.squads.push(sq);
        for(let i=qStart;i<qEnd;i++){squadId[i]=sqId;companyId[i]=coId;battalionId[i]=bnId;}
      }
    }
  }
}

function pushLog(type,text){log.push({tick:world?.tick??0,type,text});if(log.length>70)log.shift();$('log').innerHTML=log.slice(-16).reverse().map(x=>`<div class="entry"><b>${x.type}</b> • ${x.text}<div class="muted">tick ${x.tick}</div></div>`).join('')}
const alive=i=>world.active[i]&&world.hp[i]>0;

function setOrder(bn,type,x=null,y=null){
  if(!bn)return;
  bn.order=type;
  if(type==='ATTACK'){bn.targetX=bn.team===0?-.04:.04;bn.targetY=0;}
  else if(type==='HOLD'){const c=battalionCenter(bn);bn.targetX=c.x;bn.targetY=c.y;}
  else if(type==='RETREAT'){bn.targetX=bn.homeX;bn.targetY=bn.homeY;}
  else if(type==='MOVE'&&x!=null&&y!=null){bn.targetX=Math.max(-.9,Math.min(.9,x));bn.targetY=Math.max(-.9,Math.min(.9,y));}
  pushLog('ORDER',`BN ${bn.id} ${type}${type==='MOVE'?` → (${bn.targetX.toFixed(2)}, ${bn.targetY.toFixed(2)})`:''}`);
  renderSelected();
}

function allAttack(){for(const bn of hierarchy.battalions)setOrder(bn,'ATTACK');}

function buildSpatial(){
  const t0=performance.now(),g=new Map();let maxCell=0;
  for(let i=0;i<count;i++)if(alive(i)){const cx=Math.floor(world.x[i]/SPATIAL_CELL),cy=Math.floor(world.y[i]/SPATIAL_CELL),k=cx+','+cy;let b=g.get(k);if(!b){b=[];g.set(k,b)}b.push(i);if(b.length>maxCell)maxCell=b.length;}
  profiler.spatial=performance.now()-t0;profiler.cells=g.size;profiler.maxCell=maxCell;profiler.queries=0;profiler.candidates=0;return {g,cell:SPATIAL_CELL};
}
function neighbors(index,sp){const x=world.x[index],y=world.y[index],cx=Math.floor(x/sp.cell),cy=Math.floor(y/sp.cell),out=[];profiler.queries++;for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){const b=sp.g.get((cx+ox)+','+(cy+oy));if(b){profiler.candidates+=b.length;for(const j of b)out.push(j)}}return out}

function battalionCenter(bn){let x=0,y=0,n=0;for(let i=bn.start;i<bn.end;i++)if(alive(i)){x+=world.x[i];y+=world.y[i];n++;}return n?{x:x/n,y:y/n,n}:{x:bn.targetX,y:bn.targetY,n:0};}
function battalionStats(bn){let n=0,m=0,s=0,c=0,h=0;for(let i=bn.start;i<bn.end;i++)if(alive(i)){n++;m+=morale[i];s+=suppression[i];c+=cohesion[i];h+=world.hp[i];}return {alive:n,morale:n?m/n:0,supp:n?s/n:0,cohesion:n?c/n:0,hp:n?h/n:0};}

function movementProposal(s){
  const t0=performance.now(),writes=[],step=.0115;
  for(let i=0;i<count;i++)if(alive(i)){
    const sq=hierarchy.squads[squadId[i]],bn=hierarchy.battalions[battalionId[i]],co=hierarchy.companies[companyId[i]],slot=i-sq.start,row=Math.floor(slot/5),col=slot%5,side=world.team[i]===0?-1:1;
    const spread=bn.order==='HOLD'?.95:bn.order==='RETREAT'?.85:1;
    const tx=bn.targetX+side*(co.id%3)*.018+side*sq.localCol*.012*spread+side*col*.0075;
    const ty=bn.targetY+(sq.localRow-.5)*.032+(co.id%3-1)*.065+(row-.5)*.013;
    const slotError=Math.hypot(world.x[i]-tx,world.y[i]-ty);cohesion[i]=Math.max(0,100-Math.min(100,slotError*470));
    const dx=tx-world.x[i],dy=ty-world.y[i],d=Math.hypot(dx,dy);if(d<.0025)continue;
    let orderMul=1;if(bn.order==='HOLD')orderMul=.35;else if(bn.order==='RETREAT')orderMul=1.15;
    const moraleMul=.35+.65*(morale[i]/100),supMul=1-Math.min(.75,suppression[i]/135),cohMul=.65+.35*(cohesion[i]/100),m=Math.min(step*orderMul*moraleMul*supMul*cohMul,d)/d;
    writes.push({entity:i,field:'x',value:Math.max(-.98,Math.min(.98,world.x[i]+dx*m)),expectedVersion:s.version[i],expectedGeneration:s.generation[i]},{entity:i,field:'y',value:Math.max(-.98,Math.min(.98,world.y[i]+dy*m)),expectedVersion:s.version[i],expectedGeneration:s.generation[i]});
  }
  profiler.move=performance.now()-t0;
  return makeProposal({snapshot:s,systemId:'totalfront.command-movement',source:'battalion-orders',priority:120,writes,events:[],meta:{authority:true}});
}

function combatProposal(s,sp){
  const t0=performance.now(),writes=[],events=[];let shots=0;const range=.072;
  for(let i=0;i<count;i++)if(alive(i)){
    const bn=hierarchy.battalions[battalionId[i]];if(bn.order==='RETREAT')continue;
    if(((world.tick+i*7)%3)!==0)continue;let best=-1,bestD=1e9;
    for(const j of neighbors(i,sp)){if(j===i||!alive(j)||world.team[j]===world.team[i])continue;const dx=world.x[j]-world.x[i],dy=world.y[j]-world.y[i],d2=dx*dx+dy*dy;if(d2<range*range&&d2<bestD){bestD=d2;best=j}}
    if(best<0)continue;shots++;const distance=Math.sqrt(bestD),base=2+(1-distance/range)*2.4,coh=.55+.45*cohesion[i]/100,orderBonus=bn.order==='ATTACK'?1.08:1;
    const dmg=Math.max(.45,base*(.55+.45*morale[i]/100)*(1-Math.min(.65,suppression[i]/150))*coh*orderBonus);
    writes.push({entity:best,field:'hp',op:'add',value:-dmg,expectedVersion:s.version[best],expectedGeneration:s.generation[best]});suppression[best]=Math.min(100,suppression[best]+5.2);morale[best]=Math.max(0,morale[best]-(dmg*.17+suppression[best]*.0025));events.push({type:'fire',source:i,target:best,damage:dmg});
  }
  for(let i=0;i<count;i++)if(alive(i)){suppression[i]=Math.max(0,suppression[i]-.75);if(suppression[i]<20)morale[i]=Math.min(100,morale[i]+.025)}
  profiler.combat=performance.now()-t0;
  return makeProposal({snapshot:s,systemId:'totalfront.combat',source:'small-arms',priority:220,writes,events,meta:{authority:true,shots}});
}

function enemyAutoOrders(){if(world.tick%20!==0)return;for(const bn of hierarchy.battalions)if(bn.team===1){const st=battalionStats(bn);if(st.alive===0)continue;if(st.morale<25||st.alive<(bn.end-bn.start)*.35){if(bn.order!=='RETREAT')setOrder(bn,'RETREAT');}else if(bn.order==='HOLD'&&world.tick>30)setOrder(bn,'ATTACK');}}

function oneTick(){
  const t0=performance.now(),s0=performance.now(),s=snapshot(world);profiler.snap=performance.now()-s0;enemyAutoOrders();const sp=buildSpatial(),move=movementProposal(s),combat=combatProposal(s,sp);
  const k0=performance.now(),resolved=resolveConflicts([move,combat]),v=verify(world,resolved,{critical:false});if(!v.ok){pushLog('ERROR',v.errors.slice(0,2).join(', '));running=false;return}
  commit(world,resolved,{verifierResult:v});profiler.commit=performance.now()-k0;profiler.writes=resolved.writes.length;profiler.conflicts=resolved.conflicts.length;profiler.proposals=resolved.proposalCount;profiler.last=performance.now()-t0;
  for(let i=0;i<count;i++)if(world.hp[i]<=0&&world.active[i]){world.hp[i]=0;world.active[i]=0;morale[i]=0;suppression[i]=0;cohesion[i]=0}
  if(world.tick%25===0){const b=teamStats(0),r=teamStats(1);pushLog('SITREP',`BLUE ${b.alive} • RED ${r.alive} • Cohesion ${b.cohesion.toFixed(0)}/${r.cohesion.toFixed(0)}`)}updateHUD();renderSelected();
}

function teamStats(team){let a=0,m=0,s=0,c=0;for(let i=0;i<count;i++)if(world.team[i]===team&&alive(i)){a++;m+=morale[i];s+=suppression[i];c+=cohesion[i]}return {alive:a,morale:a?m/a:0,supp:a?s/a:0,cohesion:a?c/a:0}}

function updateHUD(){if(!world)return;const b=teamStats(0),r=teamStats(1),half=count/2;$('tick').textContent=world.tick.toLocaleString();$('entities').textContent=count.toLocaleString();$('alive').textContent=`${b.alive} / ${r.alive}`;$('tickMs').textContent=profiler.last.toFixed(2)+' ms';$('proposals').textContent=profiler.proposals;$('hash').textContent=String(stateHash(world)).slice(0,10);$('blueStrength').textContent=b.alive.toLocaleString();$('redStrength').textContent=r.alive.toLocaleString();$('blueBar').style.width=Math.max(0,b.alive/half*100)+'%';$('redBar').style.width=Math.max(0,r.alive/half*100)+'%';$('morale').textContent=`${b.morale.toFixed(1)} / ${r.morale.toFixed(1)}`;$('suppression').textContent=`${b.supp.toFixed(1)} / ${r.supp.toFixed(1)}`;$('cohesion').textContent=`${b.cohesion.toFixed(1)} / ${r.cohesion.toFixed(1)}`;$('hierarchy').textContent=`${hierarchy.battalions.length} BN • ${hierarchy.companies.length} CO • ${hierarchy.squads.length} SQ`;$('pSnap').textContent=profiler.snap.toFixed(2);$('pSpatial').textContent=profiler.spatial.toFixed(2);$('pMove').textContent=profiler.move.toFixed(2);$('pCombat').textContent=profiler.combat.toFixed(2);$('pCommit').textContent=profiler.commit.toFixed(2);$('cells').textContent=profiler.cells;$('maxCell').textContent=profiler.maxCell;$('queries').textContent=profiler.queries.toLocaleString();$('candidates').textContent=profiler.candidates.toLocaleString();$('writes').textContent=profiler.writes.toLocaleString();$('conflicts').textContent=profiler.conflicts.toLocaleString()}

function renderSelected(){if(selectedBn==null){$('selectedBn').innerHTML='ยังไม่ได้เลือก';return}const bn=hierarchy.battalions[selectedBn];if(!bn){selectedBn=null;$('selectedBn').innerHTML='ยังไม่ได้เลือก';return}const st=battalionStats(bn),c=battalionCenter(bn);$('selectedBn').innerHTML=`<b class="${bn.team===0?'blue':'red'}">BN ${bn.id}</b> • ${st.alive}/${bn.end-bn.start} นาย<br>Morale ${st.morale.toFixed(1)} • Suppression ${st.supp.toFixed(1)} • Cohesion ${st.cohesion.toFixed(1)}<br>ตำแหน่ง (${c.x.toFixed(2)}, ${c.y.toFixed(2)})<br><span class="orderbadge">${bn.order}</span>`;}

function draw(){if(!world)return;const w=canvas.width,h=canvas.height,sx=x=>(x+1)*.5*w,sy=y=>(y+1)*.5*h;ctx.clearRect(0,0,w,h);ctx.fillStyle='#0b1925';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#1e3447';ctx.lineWidth=1;for(let x=0;x<=10;x++){ctx.beginPath();ctx.moveTo(x*w/10,0);ctx.lineTo(x*w/10,h);ctx.stroke()}for(let y=0;y<=8;y++){ctx.beginPath();ctx.moveTo(0,y*h/8);ctx.lineTo(w,y*h/8);ctx.stroke()}ctx.fillStyle='#6c5934';ctx.beginPath();ctx.arc(sx(0),sy(0),55,0,Math.PI*2);ctx.fill();ctx.fillStyle='#e4c677';ctx.font='bold 18px system-ui';ctx.textAlign='center';ctx.fillText('▲ HILL 42',sx(0),sy(0)+6);
  for(const bn of hierarchy.battalions){const c=battalionCenter(bn);ctx.strokeStyle=bn.team===0?'#52bfff88':'#ff6b6b88';ctx.lineWidth=selectedBn===bn.id?5:2;ctx.beginPath();ctx.arc(sx(c.x),sy(c.y),selectedBn===bn.id?30:24,0,Math.PI*2);ctx.stroke();ctx.setLineDash([6,5]);ctx.beginPath();ctx.moveTo(sx(c.x),sy(c.y));ctx.lineTo(sx(bn.targetX),sy(bn.targetY));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=bn.team===0?'#52bfff':'#ff6b6b';ctx.font='bold 12px system-ui';ctx.fillText(`BN${bn.id}`,sx(c.x),sy(c.y)-30)}
  const stride=count>5000?10:count>2400?6:count>1400?4:2;for(let i=0;i<count;i+=stride)if(alive(i)){ctx.fillStyle=world.team[i]===0?'#52bfff':'#ff6b6b';ctx.globalAlpha=.35+.65*Math.max(.2,world.hp[i]/100);ctx.fillRect(sx(world.x[i])-2,sy(world.y[i])-2,4,4)}ctx.globalAlpha=1;
}

function canvasWorld(ev){const r=canvas.getBoundingClientRect(),px=(ev.clientX-r.left)*canvas.width/r.width,py=(ev.clientY-r.top)*canvas.height/r.height;return {x:px/canvas.width*2-1,y:py/canvas.height*2-1};}
function handleCanvas(ev){const p=canvasWorld(ev);if(pendingMapOrder==='MOVE'&&selectedBn!=null){setOrder(hierarchy.battalions[selectedBn],'MOVE',p.x,p.y);pendingMapOrder=null;$('mapHint').textContent='MOVE ถูกส่งแล้ว • แตะ Battalion อื่นเพื่อเลือก';draw();return}let best=null,bestD=1e9;for(const bn of hierarchy.battalions)if(bn.team===0){const c=battalionCenter(bn),dx=p.x-c.x,dy=p.y-c.y,d=dx*dx+dy*dy;if(d<bestD){bestD=d;best=bn}}if(best&&bestD<.035){selectedBn=best.id;pendingMapOrder=null;$('mapHint').textContent=`เลือก BN ${best.id} แล้ว`;renderSelected();draw();}}

function loop(now){const dt=now-last;last=now;if(running&&!benchRunning){acc+=dt*speed;let guard=0;while(acc>=TICK_MS&&guard<8){oneTick();acc-=TICK_MS;guard++}}draw();requestAnimationFrame(loop)}

canvas.addEventListener('pointerdown',handleCanvas,{passive:true});
$('pause').onclick=()=>{running=!running;$('pause').textContent=running?'⏸ PAUSE':'▶ RESUME'};
$('speed').onclick=()=>{speed=speed===1?2:speed===2?4:1;$('speed').textContent=`▶ ${speed}×`};
$('cmdMove').onclick=()=>{if(selectedBn==null)return;pendingMapOrder='MOVE';$('mapHint').textContent='แตะตำแหน่งบนแผนที่เพื่อส่ง MOVE'};
$('cmdAttack').onclick=()=>selectedBn!=null&&setOrder(hierarchy.battalions[selectedBn],'ATTACK');
$('cmdHold').onclick=()=>selectedBn!=null&&setOrder(hierarchy.battalions[selectedBn],'HOLD');
$('cmdRetreat').onclick=()=>selectedBn!=null&&setOrder(hierarchy.battalions[selectedBn],'RETREAT');
$('allAttack').onclick=allAttack;
$('reset').onclick=()=>init(count);
$('scale').onclick=()=>{const next=count===1200?2400:count===2400?5000:count===5000?10000:1200;init(next);$('scale').textContent=next===1200?'📈 2,400 ENTITIES':next===2400?'📈 5,000 ENTITIES':next===5000?'📈 10,000 ENTITIES':'↩ 1,200 ENTITIES'};
$('bench').onclick=async()=>{if(benchRunning)return;benchRunning=true;const was=running;running=false,start=performance.now(),startTick=world.tick;for(let i=0;i<300;i++){oneTick();if(i%25===0)await new Promise(r=>setTimeout(r,0))}const ms=performance.now()-start,done=world.tick-startTick,avg=done?ms/done:0;pushLog('BENCH',`${done} ticks • avg ${avg.toFixed(2)} ms/tick • ${(avg?1000/avg:0).toFixed(1)} ticks/s`);running=was;benchRunning=false;updateHUD()};

init();requestAnimationFrame(loop);