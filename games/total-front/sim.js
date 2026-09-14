import {createWorld,snapshot,makeProposal,resolveConflicts,verify,commit,stateHash} from '../../src/twa-core.js';

const $=id=>document.getElementById(id);
const canvas=$('battle'),ctx=canvas.getContext('2d');
let world,count=1200,running=true,speed=1,last=performance.now(),acc=0,attackOrder=false,benchRunning=false;
let morale,suppression,cohesion,squadId,companyId,battalionId,slotX,slotY;
let hierarchy={battalions:[],companies:[],squads:[]};
const TICK_HZ=10,TICK_MS=1000/TICK_HZ,seed=4242;
const SQUAD_SIZE=10,COMPANY_SIZE=100,BATTALION_SIZE=300,SPATIAL_CELL=.055;
const log=[];
let profiler={snap:0,spatial:0,move:0,combat:0,commit:0,writes:0,conflicts:0,proposals:0,last:0,cells:0,maxCell:0,queries:0,candidates:0};

function init(n=count){
  count=n;world=createWorld({seed,count,density:.15,speed:0});
  morale=new Float32Array(count);suppression=new Float32Array(count);cohesion=new Float32Array(count);
  squadId=new Uint32Array(count);companyId=new Uint32Array(count);battalionId=new Uint32Array(count);slotX=new Float64Array(count);slotY=new Float64Array(count);
  hierarchy={battalions:[],companies:[],squads:[]};
  const half=count>>1;
  for(let team=0;team<2;team++)buildHierarchy(team,team===0?0:half,team===0?half:count);
  for(let i=0;i<count;i++){
    const team=i<half?0:1,local=team===0?i:i-half;
    world.team[i]=team;world.active[i]=1;world.hp[i]=100;world.radius[i]=.0042;world.mass[i]=1;world.type[i]=1;
    morale[i]=100;suppression[i]=0;cohesion[i]=100;
    const sq=hierarchy.squads[squadId[i]],slot=local%SQUAD_SIZE,row=Math.floor(slot/5),col=slot%5;
    const side=team===0?-1:1;
    world.x[i]=sq.anchorX+side*col*.008;
    world.y[i]=sq.anchorY+(row-0.5)*.014+(((i*97)%101)/101-.5)*.002;
    slotX[i]=world.x[i];slotY[i]=world.y[i];
  }
  world.tick=0;world.worldVersion=0;world.deltaLog.length=0;world.eventLog.length=0;
  attackOrder=false;log.length=0;profiler={snap:0,spatial:0,move:0,combat:0,commit:0,writes:0,conflicts:0,proposals:0,last:0,cells:0,maxCell:0,queries:0,candidates:0};
  pushLog('SYSTEM',`P1 เริ่ม ${count.toLocaleString()} entities • ${hierarchy.battalions.length} BN • ${hierarchy.companies.length} CO • ${hierarchy.squads.length} SQ`);
  draw();updateHUD();
}

function buildHierarchy(team,start,end){
  const side=team===0?-1:1,total=end-start;
  const teamBnCount=Math.max(1,Math.ceil(total/BATTALION_SIZE));
  for(let b=0;b<teamBnCount;b++){
    const bnId=hierarchy.battalions.length,bStart=start+b*BATTALION_SIZE,bEnd=Math.min(end,bStart+BATTALION_SIZE);
    const lane=(b-(teamBnCount-1)/2)*.42;
    const bn={id:bnId,team,start:bStart,end:bEnd,anchorX:side*.72,anchorY:lane,targetX:side*.58,targetY:lane,cohesion:100};hierarchy.battalions.push(bn);
    const companyCount=Math.ceil((bEnd-bStart)/COMPANY_SIZE);
    for(let c=0;c<companyCount;c++){
      const coId=hierarchy.companies.length,cStart=bStart+c*COMPANY_SIZE,cEnd=Math.min(bEnd,cStart+COMPANY_SIZE);
      const coYOffset=(c-(companyCount-1)/2)*.12;
      hierarchy.companies.push({id:coId,team,battalionId:bnId,start:cStart,end:cEnd,anchorX:bn.anchorX,anchorY:bn.anchorY+coYOffset});
      const squadCount=Math.ceil((cEnd-cStart)/SQUAD_SIZE);
      for(let q=0;q<squadCount;q++){
        const sqId=hierarchy.squads.length,qStart=cStart+q*SQUAD_SIZE,qEnd=Math.min(cEnd,qStart+SQUAD_SIZE);
        const qRow=Math.floor(q/5),qCol=q%5;
        const sq={id:sqId,team,battalionId:bnId,companyId:coId,start:qStart,end:qEnd,anchorX:bn.anchorX+side*(c*.045+qCol*.017),anchorY:bn.anchorY+coYOffset+(qRow-.5)*.035,targetX:bn.targetX,targetY:bn.targetY};hierarchy.squads.push(sq);
        for(let i=qStart;i<qEnd;i++){squadId[i]=sqId;companyId[i]=coId;battalionId[i]=bnId;}
      }
    }
  }
}

function pushLog(type,text){log.push({tick:world?.tick??0,type,text});if(log.length>60)log.shift();$('log').innerHTML=log.slice(-14).reverse().map(x=>`<div class="entry"><b>${x.type}</b> • ${x.text}<div class="muted">tick ${x.tick}</div></div>`).join('')}
const alive=i=>world.active[i]&&world.hp[i]>0;

function updateFormationTargets(){
  for(const bn of hierarchy.battalions){
    const side=bn.team===0?-1:1;
    bn.targetX=attackOrder?side*.10:side*.58;
    bn.targetY=bn.anchorY*.55;
  }
  for(const sq of hierarchy.squads){const bn=hierarchy.battalions[sq.battalionId],co=hierarchy.companies[sq.companyId],side=sq.team===0?-1:1;const localSq=sq.id-hierarchy.squads.findIndex(s=>s.companyId===sq.companyId);const row=Math.floor(localSq/5),col=localSq%5;sq.targetX=bn.targetX+side*(co.id%3)*.022+side*col*.014;sq.targetY=bn.targetY+(row-.5)*.04+(co.id%3-1)*.09;}
}

function buildSpatial(){
  const t0=performance.now(),g=new Map();let maxCell=0;
  for(let i=0;i<count;i++)if(alive(i)){const cx=Math.floor(world.x[i]/SPATIAL_CELL),cy=Math.floor(world.y[i]/SPATIAL_CELL),k=cx+','+cy;let b=g.get(k);if(!b){b=[];g.set(k,b)}b.push(i);if(b.length>maxCell)maxCell=b.length;}
  profiler.spatial=performance.now()-t0;profiler.cells=g.size;profiler.maxCell=maxCell;profiler.queries=0;profiler.candidates=0;
  return {g,cell:SPATIAL_CELL};
}
function neighbors(index,sp){const x=world.x[index],y=world.y[index],cx=Math.floor(x/sp.cell),cy=Math.floor(y/sp.cell),out=[];profiler.queries++;for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){const b=sp.g.get((cx+ox)+','+(cy+oy));if(b){profiler.candidates+=b.length;for(const j of b)out.push(j)}}return out}

function computeSquadCenters(){
  const sx=new Float64Array(hierarchy.squads.length),sy=new Float64Array(hierarchy.squads.length),sc=new Uint16Array(hierarchy.squads.length);
  for(let i=0;i<count;i++)if(alive(i)){const q=squadId[i];sx[q]+=world.x[i];sy[q]+=world.y[i];sc[q]++;}
  for(let q=0;q<hierarchy.squads.length;q++)if(sc[q]){sx[q]/=sc[q];sy[q]/=sc[q];}
  return {sx,sy,sc};
}

function movementProposal(s){
  const t0=performance.now();updateFormationTargets();const centers=computeSquadCenters();const writes=[],step=.0115;
  for(let i=0;i<count;i++)if(alive(i)){
    const sq=hierarchy.squads[squadId[i]],bn=hierarchy.battalions[battalionId[i]],slot=i-sq.start,row=Math.floor(slot/5),col=slot%5,side=world.team[i]===0?-1:1;
    const tx=sq.targetX+side*col*.0075,ty=sq.targetY+(row-.5)*.013;
    slotX[i]=tx;slotY[i]=ty;
    const centerError=Math.hypot(world.x[i]-centers.sx[sq.id],world.y[i]-centers.sy[sq.id]);
    const slotError=Math.hypot(world.x[i]-tx,world.y[i]-ty);
    cohesion[i]=Math.max(0,100-Math.min(100,(slotError*420+centerError*180)));
    const dx=tx-world.x[i],dy=ty-world.y[i],d=Math.hypot(dx,dy);if(d<.0025)continue;
    const moraleMul=.35+.65*(morale[i]/100),supMul=1-Math.min(.75,suppression[i]/135),cohMul=.65+.35*(cohesion[i]/100),m=Math.min(step*moraleMul*supMul*cohMul,d)/d;
    const nx=Math.max(-.98,Math.min(.98,world.x[i]+dx*m)),ny=Math.max(-.98,Math.min(.98,world.y[i]+dy*m));
    writes.push({entity:i,field:'x',value:nx,expectedVersion:s.version[i],expectedGeneration:s.generation[i]},{entity:i,field:'y',value:ny,expectedVersion:s.version[i],expectedGeneration:s.generation[i]});
    bn.cohesion=(bn.cohesion*.995)+(cohesion[i]*.005);
  }
  profiler.move=performance.now()-t0;
  return makeProposal({snapshot:s,systemId:'totalfront.formation-movement',source:'formation-hierarchy',priority:120,writes,events:[],meta:{authority:true,battalions:hierarchy.battalions.length,squads:hierarchy.squads.length}})
}

function combatProposal(s,sp){
  const t0=performance.now(),writes=[],events=[];let shots=0;const range=.072;
  for(let i=0;i<count;i++)if(alive(i)){
    if(((world.tick+i*7)%3)!==0)continue;
    let best=-1,bestD=1e9;
    for(const j of neighbors(i,sp)){if(j===i||!alive(j)||world.team[j]===world.team[i])continue;const dx=world.x[j]-world.x[i],dy=world.y[j]-world.y[i],d2=dx*dx+dy*dy;if(d2<range*range&&d2<bestD){bestD=d2;best=j}}
    if(best<0)continue;shots++;
    const distance=Math.sqrt(bestD),base=2.0+(1-distance/range)*2.4,coh=.55+.45*cohesion[i]/100;
    const dmg=Math.max(.45,base*(.55+.45*morale[i]/100)*(1-Math.min(.65,suppression[i]/150))*coh);
    writes.push({entity:best,field:'hp',op:'add',value:-dmg,expectedVersion:s.version[best],expectedGeneration:s.generation[best]});
    suppression[best]=Math.min(100,suppression[best]+5.2);morale[best]=Math.max(0,morale[best]-(dmg*.17+suppression[best]*.0025));events.push({type:'fire',source:i,target:best,damage:dmg});
  }
  for(let i=0;i<count;i++)if(alive(i)){suppression[i]=Math.max(0,suppression[i]-.75);if(suppression[i]<20)morale[i]=Math.min(100,morale[i]+.025)}
  profiler.combat=performance.now()-t0;
  return makeProposal({snapshot:s,systemId:'totalfront.combat',source:'small-arms',priority:220,writes,events,meta:{authority:true,shots,queries:profiler.queries,candidates:profiler.candidates}})
}

function oneTick(){
  const t0=performance.now(),s0=performance.now(),s=snapshot(world);profiler.snap=performance.now()-s0;
  const sp=buildSpatial(),move=movementProposal(s),combat=combatProposal(s,sp);
  const k0=performance.now(),resolved=resolveConflicts([move,combat]),v=verify(world,resolved,{critical:false});if(!v.ok){pushLog('ERROR',v.errors.slice(0,2).join(', '));running=false;return}
  commit(world,resolved,{verifierResult:v});profiler.commit=performance.now()-k0;
  profiler.writes=resolved.writes.length;profiler.conflicts=resolved.conflicts.length;profiler.proposals=resolved.proposalCount;profiler.last=performance.now()-t0;
  for(let i=0;i<count;i++)if(world.hp[i]<=0&&world.active[i]){world.hp[i]=0;world.active[i]=0;morale[i]=0;suppression[i]=0;cohesion[i]=0}
  if(world.tick%25===0){const b=teamStats(0),r=teamStats(1);pushLog('SITREP',`BLUE ${b.alive} • RED ${r.alive} • cohesion ${b.cohesion.toFixed(0)}/${r.cohesion.toFixed(0)} • ${profiler.cells} cells`)}
  updateHUD();
}

function teamStats(team){let a=0,m=0,s=0,c=0;for(let i=0;i<count;i++)if(world.team[i]===team&&alive(i)){a++;m+=morale[i];s+=suppression[i];c+=cohesion[i]}return {alive:a,morale:a?m/a:0,supp:a?s/a:0,cohesion:a?c/a:0}}
function updateHUD(){if(!world)return;const b=teamStats(0),r=teamStats(1),half=count/2;$('tick').textContent=world.tick.toLocaleString();$('entities').textContent=count.toLocaleString();$('alive').textContent=`${b.alive} / ${r.alive}`;$('tickMs').textContent=profiler.last.toFixed(2)+' ms';$('proposals').textContent=profiler.proposals;$('hash').textContent=String(stateHash(world)).slice(0,10);$('blueStrength').textContent=b.alive.toLocaleString();$('redStrength').textContent=r.alive.toLocaleString();$('blueBar').style.width=Math.max(0,b.alive/half*100)+'%';$('redBar').style.width=Math.max(0,r.alive/half*100)+'%';$('morale').textContent=`${b.morale.toFixed(1)} / ${r.morale.toFixed(1)}`;$('suppression').textContent=`${b.supp.toFixed(1)} / ${r.supp.toFixed(1)}`;$('cohesion').textContent=`${b.cohesion.toFixed(1)} / ${r.cohesion.toFixed(1)}`;$('hierarchy').textContent=`${hierarchy.battalions.length} BN • ${hierarchy.companies.length} CO • ${hierarchy.squads.length} SQ`;$('pSnap').textContent=profiler.snap.toFixed(2);$('pSpatial').textContent=profiler.spatial.toFixed(2);$('pMove').textContent=profiler.move.toFixed(2);$('pCombat').textContent=profiler.combat.toFixed(2);$('pCommit').textContent=profiler.commit.toFixed(2);$('cells').textContent=profiler.cells;$('maxCell').textContent=profiler.maxCell;$('queries').textContent=profiler.queries.toLocaleString();$('candidates').textContent=profiler.candidates.toLocaleString();$('writes').textContent=profiler.writes.toLocaleString();$('conflicts').textContent=profiler.conflicts.toLocaleString()}

function draw(){if(!world)return;const w=canvas.width,h=canvas.height,sx=x=>(x+1)*.5*w,sy=y=>(y+1)*.5*h;ctx.clearRect(0,0,w,h);ctx.fillStyle='#0b1925';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#1e3447';ctx.lineWidth=1;for(let x=0;x<=10;x++){ctx.beginPath();ctx.moveTo(x*w/10,0);ctx.lineTo(x*w/10,h);ctx.stroke()}for(let y=0;y<=8;y++){ctx.beginPath();ctx.moveTo(0,y*h/8);ctx.lineTo(w,y*h/8);ctx.stroke()}
  ctx.fillStyle='#6c5934';ctx.beginPath();ctx.arc(sx(0),sy(0),55,0,Math.PI*2);ctx.fill();ctx.fillStyle='#e4c677';ctx.font='bold 18px system-ui';ctx.textAlign='center';ctx.fillText('▲ HILL 42',sx(0),sy(0)+6);
  for(const bn of hierarchy.battalions){let cx=0,cy=0,n=0;for(let i=bn.start;i<bn.end;i++)if(alive(i)){cx+=world.x[i];cy+=world.y[i];n++}if(!n)continue;cx/=n;cy/=n;ctx.strokeStyle=bn.team===0?'#52bfff88':'#ff6b6b88';ctx.lineWidth=2;ctx.beginPath();ctx.arc(sx(cx),sy(cy),Math.max(28,Math.sqrt(n)*2.1),0,Math.PI*2);ctx.stroke();ctx.fillStyle=bn.team===0?'#52bfff':'#ff6b6b';ctx.font='bold 12px system-ui';ctx.fillText(`BN ${bn.id} • ${n}`,sx(cx),sy(cy)-34)}
  const stride=count>=10000?14:count>=5000?8:count>=2400?5:2;for(let i=0;i<count;i+=stride)if(alive(i)){ctx.fillStyle=world.team[i]===0?'#52bfff':'#ff6b6b';ctx.globalAlpha=.35+.65*Math.max(.2,world.hp[i]/100);ctx.fillRect(sx(world.x[i])-2,sy(world.y[i])-2,4,4)}ctx.globalAlpha=1;
}
function loop(now){const dt=now-last;last=now;if(running&&!benchRunning){acc+=dt*speed;let guard=0;while(acc>=TICK_MS&&guard<8){oneTick();acc-=TICK_MS;guard++}}draw();requestAnimationFrame(loop)}

$('pause').onclick=()=>{running=!running;$('pause').textContent=running?'⏸ PAUSE':'▶ RESUME'};
$('speed').onclick=()=>{speed=speed===1?2:speed===2?4:1;$('speed').textContent=`▶ ${speed}×`};
$('order').onclick=()=>{attackOrder=!attackOrder;$('order').textContent=attackOrder?'🛡 HOLD LINE':'⚔️ ATTACK HILL';pushLog('ORDER',attackOrder?'Battalion ทั้งสองฝ่ายรุกเข้าสู่ Hill 42':'หยุดการรุกและกลับ formation line')};
$('reset').onclick=()=>init(count);
$('scale').onclick=()=>{const sizes=[1200,2400,5000,10000],idx=sizes.indexOf(count),next=sizes[(idx+1)%sizes.length];init(next);const after=sizes[(sizes.indexOf(next)+1)%sizes.length];$('scale').textContent=after===1200?'↩ 1,200 ENTITIES':`📈 ${after.toLocaleString()} ENTITIES`};
$('bench').onclick=async()=>{if(benchRunning)return;benchRunning=true;const was=running;running=false;const start=performance.now(),startTick=world.tick;for(let i=0;i<300;i++){oneTick();if(i%20===0)await new Promise(r=>setTimeout(r,0))}const ticks=world.tick-startTick,ms=performance.now()-start,avg=ms/Math.max(1,ticks);pushLog('BENCH',`${ticks} ticks • ${count.toLocaleString()} entities • avg ${avg.toFixed(2)} ms/tick • ${(1000/avg).toFixed(1)} ticks/s`);running=was;benchRunning=false;updateHUD()};

init();requestAnimationFrame(loop);
