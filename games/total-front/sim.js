import {createWorld,snapshot,makeProposal,resolveConflicts,verify,commit,stateHash} from '../../src/twa-core.js';

const $=id=>document.getElementById(id);
const canvas=$('battle'),ctx=canvas.getContext('2d');
const TICK_HZ=10,TICK_MS=1000/TICK_HZ,SEED=4242;
const SQUAD_SIZE=10,COMPANY_SIZE=100,BATTALION_SIZE=300,SPATIAL_CELL=.055;
const ROLE={RIFLE:0,LEADER:1,MG:2,MEDIC:3,MARKSMAN:4,SCOUT:5,GRENADIER:6,ENGINEER:7};
let world,count=1200,running=true,speed=1,last=performance.now(),acc=0,benchRunning=false,doctrine='BALANCED';
let morale,suppression,cohesion,role,squadId,companyId,battalionId;
let hierarchy={battalions:[],companies:[],squads:[]};
const log=[];
let hillHoldBlue=0,hillHoldRed=0,battlePhase='DEPLOY';
let activity={shots:0,heals:0,grenades:0,scoutShots:0,mgBursts:0};
let profiler={snap:0,spatial:0,move:0,combat:0,commit:0,writes:0,conflicts:0,last:0,cells:0,maxCell:0,queries:0,candidates:0};

function roleForSlot(slot){if(slot===0)return ROLE.LEADER;if(slot===1)return ROLE.MEDIC;if(slot===2)return ROLE.MG;if(slot===3)return ROLE.GRENADIER;if(slot===4)return ROLE.SCOUT;if(slot===5)return ROLE.MARKSMAN;if(slot===6)return ROLE.ENGINEER;return ROLE.RIFLE;}
function roleRange(r){return r===ROLE.SCOUT?.11:r===ROLE.MARKSMAN?.105:r===ROLE.MG?.082:r===ROLE.GRENADIER?.075:.07}
function roleDamage(r){return r===ROLE.MARKSMAN?5.3:r===ROLE.MG?2.2:r===ROLE.GRENADIER?2.6:r===ROLE.SCOUT?1.7:r===ROLE.LEADER?2.8:2.7}
function roleSuppression(r){return r===ROLE.MG?11:r===ROLE.GRENADIER?8:r===ROLE.MARKSMAN?3.5:4.8}
function fireCadence(r){return r===ROLE.MG?2:r===ROLE.MARKSMAN?6:r===ROLE.SCOUT?5:r===ROLE.GRENADIER?7:3}

function init(n=count){
  count=n;world=createWorld({seed:SEED,count,density:.15,speed:0});
  morale=new Float32Array(count);suppression=new Float32Array(count);cohesion=new Float32Array(count);role=new Uint8Array(count);
  squadId=new Uint32Array(count);companyId=new Uint32Array(count);battalionId=new Uint32Array(count);
  hierarchy={battalions:[],companies:[],squads:[]};hillHoldBlue=0;hillHoldRed=0;battlePhase='DEPLOY';activity={shots:0,heals:0,grenades:0,scoutShots:0,mgBursts:0};
  const half=count>>1;buildHierarchy(0,0,half);buildHierarchy(1,half,count);
  for(let i=0;i<count;i++){
    const team=i<half?0:1,sq=hierarchy.squads[squadId[i]],slot=i-sq.start,row=Math.floor(slot/5),col=slot%5,side=team===0?-1:1;
    role[i]=roleForSlot(slot%SQUAD_SIZE);world.team[i]=team;world.active[i]=1;world.hp[i]=100;world.radius[i]=.0042;world.mass[i]=1;world.type[i]=role[i]+1;
    morale[i]=100;suppression[i]=0;cohesion[i]=100;
    world.x[i]=sq.anchorX+side*col*.008;world.y[i]=sq.anchorY+(row-.5)*.014+(((i*97)%101)/101-.5)*.002;
  }
  world.tick=0;world.worldVersion=0;world.deltaLog.length=0;world.eventLog.length=0;log.length=0;
  profiler={snap:0,spatial:0,move:0,combat:0,commit:0,writes:0,conflicts:0,last:0,cells:0,maxCell:0,queries:0,candidates:0};
  pushLog('SYSTEM',`เริ่ม AI vs AI ${count.toLocaleString()} entities • BLUE บุก / RED รับ`);pushLog('ROLES','ทุก Squad มี Leader, Medic, MG, Grenadier, Scout, Marksman, Engineer และ Riflemen');draw();updateHUD();
}

function buildHierarchy(team,start,end){
  const side=team===0?-1:1,total=end-start,bnCount=Math.max(1,Math.ceil(total/BATTALION_SIZE));
  for(let b=0;b<bnCount;b++){
    const id=hierarchy.battalions.length,bs=start+b*BATTALION_SIZE,be=Math.min(end,bs+BATTALION_SIZE),lane=bnCount===1?0:-.72+b*(1.44/(bnCount-1));
    const bn={id,team,start:bs,end:be,homeX:side*.72,homeY:lane,targetX:team===0?-.56:.24,targetY:lane,order:team===0?'ASSEMBLE':'DEFEND',state:'READY'};hierarchy.battalions.push(bn);
    const coCount=Math.ceil((be-bs)/COMPANY_SIZE);
    for(let c=0;c<coCount;c++){
      const coId=hierarchy.companies.length,cs=bs+c*COMPANY_SIZE,ce=Math.min(be,cs+COMPANY_SIZE),coY=(c-(coCount-1)/2)*.08;
      hierarchy.companies.push({id:coId,team,battalionId:id,start:cs,end:ce,offsetY:coY});
      const sqCount=Math.ceil((ce-cs)/SQUAD_SIZE);
      for(let q=0;q<sqCount;q++){
        const sqId=hierarchy.squads.length,qs=cs+q*SQUAD_SIZE,qe=Math.min(ce,qs+SQUAD_SIZE),qr=Math.floor(q/5),qc=q%5;
        const sq={id:sqId,team,battalionId:id,companyId:coId,start:qs,end:qe,anchorX:side*.72+side*(c*.035+qc*.014),anchorY:lane+coY+(qr-.5)*.026,targetX:side*.58,targetY:lane};hierarchy.squads.push(sq);
        for(let i=qs;i<qe;i++){squadId[i]=sqId;companyId[i]=coId;battalionId[i]=id;}
      }
    }
  }
}

function pushLog(type,text){log.push({tick:world?.tick??0,type,text});if(log.length>80)log.shift();$('log').innerHTML=log.slice(-16).reverse().map(x=>`<div class="entry"><b>${x.type}</b> • ${x.text}<div class="muted">tick ${x.tick}</div></div>`).join('')}
const alive=i=>world.active[i]&&world.hp[i]>0;

function buildSpatial(){const t0=performance.now(),g=new Map();let maxCell=0;for(let i=0;i<count;i++)if(alive(i)){const cx=Math.floor(world.x[i]/SPATIAL_CELL),cy=Math.floor(world.y[i]/SPATIAL_CELL),k=cx+','+cy;let b=g.get(k);if(!b){b=[];g.set(k,b)}b.push(i);maxCell=Math.max(maxCell,b.length)}profiler.spatial=performance.now()-t0;profiler.cells=g.size;profiler.maxCell=maxCell;profiler.queries=0;profiler.candidates=0;return{g,cell:SPATIAL_CELL}}
function neighbors(i,sp,rings=1){const x=world.x[i],y=world.y[i],cx=Math.floor(x/sp.cell),cy=Math.floor(y/sp.cell),out=[];profiler.queries++;for(let ox=-rings;ox<=rings;ox++)for(let oy=-rings;oy<=rings;oy++){const b=sp.g.get((cx+ox)+','+(cy+oy));if(b){profiler.candidates+=b.length;out.push(...b)}}return out}

function battalionStats(bn){let n=0,m=0,s=0,c=0,x=0,y=0;for(let i=bn.start;i<bn.end;i++)if(alive(i)){n++;m+=morale[i];s+=suppression[i];c+=cohesion[i];x+=world.x[i];y+=world.y[i]}return{alive:n,morale:n?m/n:0,supp:n?s/n:0,cohesion:n?c/n:0,x:n?x/n:bn.homeX,y:n?y/n:bn.homeY,strength:n/Math.max(1,bn.end-bn.start)}}
function modeOf(a){const m=new Map();for(const x of a)m.set(x,(m.get(x)||0)+1);return[...m].sort((a,b)=>b[1]-a[1])[0]?.[0]||'-'}
function teamNearHill(team){let n=0;for(let i=0;i<count;i++)if(alive(i)&&world.team[i]===team&&world.x[i]*world.x[i]+world.y[i]*world.y[i]<.18*.18)n++;return n}

function autonomousCommand(){
  const tick=world.tick;if(tick<25)battlePhase='DEPLOY';else if(tick<80)battlePhase='ADVANCE';else battlePhase='ENGAGEMENT';
  for(const bn of hierarchy.battalions){const st=battalionStats(bn),laneBias=((bn.id%3)-1)*.13;
    if(bn.team===0){
      if(st.strength<.32||st.morale<22){bn.order='RETREAT';bn.targetX=-.72;bn.targetY=bn.homeY;bn.state='BROKEN';continue}
      if(tick<25){bn.order='ASSEMBLE';bn.targetX=-.57;bn.targetY=bn.homeY;}
      else{const flank=bn.id%3===1?0:laneBias;bn.order=doctrine==='AGGRESSIVE'?'ASSAULT':doctrine==='CAUTIOUS'?'BOUND_ADVANCE':'ATTACK';bn.targetX=doctrine==='CAUTIOUS'?-.06:.03;bn.targetY=Math.max(-.72,Math.min(.72,bn.homeY*.35+flank));}
    }else{
      const pressure=teamNearHill(0)>25;
      if(st.strength<.28||st.morale<18){bn.order='FALLBACK';bn.targetX=.62;bn.targetY=bn.homeY;bn.state='ROUTING';}
      else if(pressure&&st.morale>45&&bn.id%3===0){bn.order='COUNTER';bn.targetX=-.03;bn.targetY=bn.homeY*.25;bn.state='COUNTERATTACK';}
      else{bn.order='DEFEND';bn.targetX=.10+(bn.id%2)*.055;bn.targetY=Math.max(-.68,Math.min(.68,bn.homeY*.72));bn.state='HOLDING';}
    }
  }
  if(tick%50===0){pushLog('AI PLAN',`BLUE ${modeOf(hierarchy.battalions.filter(b=>b.team===0).map(b=>b.order))} • RED ${modeOf(hierarchy.battalions.filter(b=>b.team===1).map(b=>b.order))} • ${battlePhase}`)}
}

function updateSquadTargets(){for(const sq of hierarchy.squads){const bn=hierarchy.battalions[sq.battalionId],co=hierarchy.companies[sq.companyId],side=sq.team===0?-1:1,local=Math.floor((sq.start-co.start)/SQUAD_SIZE),row=Math.floor(local/5),col=local%5;sq.targetX=bn.targetX+side*col*.012;sq.targetY=bn.targetY+(row-.5)*.032+co.offsetY*.55;}}
function computeSquadCenters(){const sx=new Float64Array(hierarchy.squads.length),sy=new Float64Array(hierarchy.squads.length),sc=new Uint16Array(hierarchy.squads.length);for(let i=0;i<count;i++)if(alive(i)){const q=squadId[i];sx[q]+=world.x[i];sy[q]+=world.y[i];sc[q]++}for(let q=0;q<sc.length;q++)if(sc[q]){sx[q]/=sc[q];sy[q]/=sc[q]}return{sx,sy,sc}}

function movementProposal(s){
  const t0=performance.now();if(world.tick%5===0)autonomousCommand();updateSquadTargets();const centers=computeSquadCenters(),writes=[],step=.0108;
  for(let i=0;i<count;i++)if(alive(i)){
    const sq=hierarchy.squads[squadId[i]],bn=hierarchy.battalions[battalionId[i]],slot=i-sq.start,row=Math.floor(slot/5),col=slot%5,side=world.team[i]===0?-1:1,r=role[i];
    let ahead=0,rear=0;if(r===ROLE.SCOUT)ahead=.025;if(r===ROLE.MG||r===ROLE.MEDIC||r===ROLE.MARKSMAN)rear=.018;
    const tx=sq.targetX+side*col*.0075-side*ahead+side*rear,ty=sq.targetY+(row-.5)*.013;
    const slotErr=Math.hypot(world.x[i]-tx,world.y[i]-ty),centerErr=Math.hypot(world.x[i]-centers.sx[sq.id],world.y[i]-centers.sy[sq.id]);cohesion[i]=Math.max(0,100-Math.min(100,slotErr*420+centerErr*170));
    const dx=tx-world.x[i],dy=ty-world.y[i],d=Math.hypot(dx,dy);if(d<.0025)continue;
    const orderMul=bn.order==='RETREAT'||bn.order==='FALLBACK'?1.15:bn.order==='ASSAULT'?1.12:1,roleMul=r===ROLE.SCOUT?1.08:r===ROLE.MG?.92:1,m=Math.min(step*orderMul*roleMul*(.35+.65*morale[i]/100)*(1-Math.min(.75,suppression[i]/135))*(.65+.35*cohesion[i]/100),d)/d;
    writes.push({entity:i,field:'x',value:Math.max(-.98,Math.min(.98,world.x[i]+dx*m)),expectedVersion:s.version[i],expectedGeneration:s.generation[i]},{entity:i,field:'y',value:Math.max(-.98,Math.min(.98,world.y[i]+dy*m)),expectedVersion:s.version[i],expectedGeneration:s.generation[i]});
  }
  profiler.move=performance.now()-t0;return makeProposal({snapshot:s,systemId:'totalfront.autonomous-movement',source:'hierarchical-ai',priority:120,writes,events:[],meta:{authority:true}})
}

function roleSystemsProposal(s,sp){
  const t0=performance.now(),writes=[],events=[];activity={shots:0,heals:0,grenades:0,scoutShots:0,mgBursts:0};
  const addHP=(target,value,source,type)=>{writes.push({entity:target,field:'hp',op:'add',value,expectedVersion:s.version[target],expectedGeneration:s.generation[target]});events.push({type,source,target,value})};
  for(let i=0;i<count;i++)if(alive(i)){
    const r=role[i],cad=fireCadence(r);
    if(r===ROLE.LEADER&&world.tick%5===0){const sq=hierarchy.squads[squadId[i]];for(let j=sq.start;j<sq.end;j++)if(alive(j)){morale[j]=Math.min(100,morale[j]+.18);cohesion[j]=Math.min(100,cohesion[j]+.25)}}
    if(r===ROLE.MEDIC&&world.tick%5===0){let best=-1,bhp=101;for(const j of neighbors(i,sp,1)){if(j!==i&&alive(j)&&world.team[j]===world.team[i]&&world.hp[j]<bhp&&world.hp[j]<92){best=j;bhp=world.hp[j]}}if(best>=0){addHP(best,2.4,i,'medic');morale[best]=Math.min(100,morale[best]+.2);activity.heals++}}
    if(((world.tick+i*7)%cad)!==0)continue;
    const range=roleRange(r),rings=range>.09?2:1;let best=-1,bestD=1e9;
    for(const j of neighbors(i,sp,rings)){if(j===i||!alive(j)||world.team[j]===world.team[i])continue;const dx=world.x[j]-world.x[i],dy=world.y[j]-world.y[i],d2=dx*dx+dy*dy;if(d2<range*range&&d2<bestD){best=j;bestD=d2}}
    if(best<0)continue;
    const distance=Math.sqrt(bestD),acc=Math.max(.35,1-distance/range),coh=.5+.5*cohesion[i]/100,base=roleDamage(r),dmg=Math.max(.35,base*(.55+.45*morale[i]/100)*(1-Math.min(.7,suppression[i]/145))*coh*(.65+.35*acc));
    if(r===ROLE.GRENADIER&&world.tick%14===0){let hit=0;for(const j of neighbors(best,sp,1)){if(hit>=5)break;if(alive(j)&&world.team[j]!==world.team[i]){const dx=world.x[j]-world.x[best],dy=world.y[j]-world.y[best];if(dx*dx+dy*dy<.032*.032){addHP(j,-dmg*.8,i,'grenade');suppression[j]=Math.min(100,suppression[j]+10);morale[j]=Math.max(0,morale[j]-1.1);hit++}}}if(hit){activity.grenades++;continue}}
    const defense=role[best]===ROLE.ENGINEER&&world.team[best]===1?.82:1;addHP(best,-dmg*defense,i,'fire');suppression[best]=Math.min(100,suppression[best]+roleSuppression(r));morale[best]=Math.max(0,morale[best]-(dmg*.16+suppression[best]*.0025));activity.shots++;if(r===ROLE.MG)activity.mgBursts++;if(r===ROLE.SCOUT)activity.scoutShots++;
  }
  for(let i=0;i<count;i++)if(alive(i)){suppression[i]=Math.max(0,suppression[i]-.72);if(suppression[i]<18)morale[i]=Math.min(100,morale[i]+.028)}
  profiler.combat=performance.now()-t0;return makeProposal({snapshot:s,systemId:'totalfront.roles-combat',source:'soldier-roles',priority:220,writes,events,meta:{authority:true,...activity}})
}

function oneTick(){
  const t0=performance.now(),s0=performance.now(),s=snapshot(world);profiler.snap=performance.now()-s0;const sp=buildSpatial(),move=movementProposal(s),combat=roleSystemsProposal(s,sp);
  const k0=performance.now(),resolved=resolveConflicts([move,combat]),v=verify(world,resolved,{critical:false});if(!v.ok){pushLog('ERROR',v.errors.slice(0,2).join(', '));running=false;return}commit(world,resolved,{verifierResult:v});profiler.commit=performance.now()-k0;profiler.writes=resolved.writes.length;profiler.conflicts=resolved.conflicts.length;profiler.last=performance.now()-t0;
  for(let i=0;i<count;i++)if(world.hp[i]<=0&&world.active[i]){world.hp[i]=0;world.active[i]=0;morale[i]=0;suppression[i]=0;cohesion[i]=0}
  updateHill();if(world.tick%25===0){const b=teamStats(0),r=teamStats(1);pushLog('SITREP',`BLUE ${b.alive} • RED ${r.alive} • Hill ${hillState()} • Fire ${activity.shots} • Heal ${activity.heals}`)}updateHUD();
}

function updateHill(){const b=teamNearHill(0),r=teamNearHill(1);if(b>r*1.2&&b>8){hillHoldBlue++;hillHoldRed=Math.max(0,hillHoldRed-1)}else if(r>b*1.2&&r>8){hillHoldRed++;hillHoldBlue=Math.max(0,hillHoldBlue-1)}else{hillHoldBlue=Math.max(0,hillHoldBlue-1);hillHoldRed=Math.max(0,hillHoldRed-1)}if(hillHoldBlue===60)pushLog('OBJECTIVE','BLUE ยึด Hill 42 ต่อเนื่อง 6 วินาที');if(hillHoldRed===60)pushLog('OBJECTIVE','RED รักษา Hill 42 ต่อเนื่อง 6 วินาที')}
function hillState(){const b=teamNearHill(0),r=teamNearHill(1);if(b>r*1.35&&b>6)return'BLUE CONTROL';if(r>b*1.35&&r>6)return'RED CONTROL';return'CONTESTED'}
function teamStats(team){let a=0,m=0,s=0,c=0;for(let i=0;i<count;i++)if(world.team[i]===team&&alive(i)){a++;m+=morale[i];s+=suppression[i];c+=cohesion[i]}return{alive:a,morale:a?m/a:0,supp:a?s/a:0,cohesion:a?c/a:0}}
function roleCounts(){const out=new Array(8).fill(0);for(let i=0;i<count;i++)if(alive(i))out[role[i]]++;return out}

function updateHUD(){if(!world)return;const b=teamStats(0),r=teamStats(1),half=count/2,rc=roleCounts();$('tick').textContent=world.tick.toLocaleString();$('entities').textContent=count.toLocaleString();$('alive').textContent=`${b.alive} / ${r.alive}`;$('tickMs').textContent=profiler.last.toFixed(2)+' ms';$('battlePhase').textContent=battlePhase;$('hash').textContent=String(stateHash(world)).slice(0,10);$('blueStrength').textContent=b.alive.toLocaleString();$('redStrength').textContent=r.alive.toLocaleString();$('blueBar').style.width=Math.max(0,b.alive/half*100)+'%';$('redBar').style.width=Math.max(0,r.alive/half*100)+'%';$('morale').textContent=`${b.morale.toFixed(1)} / ${r.morale.toFixed(1)}`;$('suppression').textContent=`${b.supp.toFixed(1)} / ${r.supp.toFixed(1)}`;$('cohesion').textContent=`${b.cohesion.toFixed(1)} / ${r.cohesion.toFixed(1)}`;$('hierarchy').textContent=`${hierarchy.battalions.length} BN • ${hierarchy.companies.length} CO • ${hierarchy.squads.length} SQ`;$('hillControl').textContent=hillState();$('rRifle').textContent=rc[0];$('rLeader').textContent=rc[1];$('rMG').textContent=rc[2];$('rMedic').textContent=rc[3];$('rMarksman').textContent=rc[4];$('rScout').textContent=rc[5];$('rGrenadier').textContent=rc[6];$('rEngineer').textContent=rc[7];$('roleActivity').textContent=`Fire ${activity.shots} • MG ${activity.mgBursts} • Scout ${activity.scoutShots} • Grenade ${activity.grenades} • Heal ${activity.heals}`;$('pSnap').textContent=profiler.snap.toFixed(2);$('pSpatial').textContent=profiler.spatial.toFixed(2);$('pMove').textContent=profiler.move.toFixed(2);$('pCombat').textContent=profiler.combat.toFixed(2);$('pCommit').textContent=profiler.commit.toFixed(2);$('cells').textContent=profiler.cells;$('maxCell').textContent=profiler.maxCell;$('queries').textContent=profiler.queries.toLocaleString();$('candidates').textContent=profiler.candidates.toLocaleString();$('writes').textContent=profiler.writes.toLocaleString();$('conflicts').textContent=profiler.conflicts.toLocaleString()}

function draw(){if(!world)return;const w=canvas.width,h=canvas.height,sx=x=>(x+1)*.5*w,sy=y=>(y+1)*.5*h;ctx.clearRect(0,0,w,h);ctx.fillStyle='#0b1925';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#1e3447';for(let x=0;x<=10;x++){ctx.beginPath();ctx.moveTo(x*w/10,0);ctx.lineTo(x*w/10,h);ctx.stroke()}for(let y=0;y<=8;y++){ctx.beginPath();ctx.moveTo(0,y*h/8);ctx.lineTo(w,y*h/8);ctx.stroke()}ctx.fillStyle='#6c5934';ctx.beginPath();ctx.arc(sx(0),sy(0),56,0,Math.PI*2);ctx.fill();ctx.fillStyle='#e4c677';ctx.font='bold 18px system-ui';ctx.textAlign='center';ctx.fillText('▲ HILL 42',sx(0),sy(0)+6);
  for(const bn of hierarchy.battalions){const st=battalionStats(bn);if(!st.alive)continue;ctx.strokeStyle=bn.team===0?'#52bfff88':'#ff6b6b88';ctx.lineWidth=2;ctx.beginPath();ctx.arc(sx(st.x),sy(st.y),Math.max(27,Math.sqrt(st.alive)*2),0,Math.PI*2);ctx.stroke();ctx.setLineDash([6,5]);ctx.beginPath();ctx.moveTo(sx(st.x),sy(st.y));ctx.lineTo(sx(bn.targetX),sy(bn.targetY));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=bn.team===0?'#52bfff':'#ff6b6b';ctx.font='bold 11px system-ui';ctx.fillText(`${bn.team===0?'ATK':'DEF'} BN${bn.id} ${bn.order}`,sx(st.x),sy(st.y)-31)}
  const stride=count>=10000?14:count>=5000?8:count>=2400?5:2;for(let i=0;i<count;i+=stride)if(alive(i)){ctx.fillStyle=world.team[i]===0?'#52bfff':'#ff6b6b';ctx.globalAlpha=.35+.65*Math.max(.2,world.hp[i]/100);const sz=role[i]===ROLE.LEADER||role[i]===ROLE.MG?5:4;ctx.fillRect(sx(world.x[i])-sz/2,sy(world.y[i])-sz/2,sz,sz)}ctx.globalAlpha=1}

function loop(now){const dt=now-last;last=now;if(running&&!benchRunning){acc+=dt*speed;let guard=0;while(acc>=TICK_MS&&guard<8){oneTick();acc-=TICK_MS;guard++}}draw();requestAnimationFrame(loop)}
$('pause').onclick=()=>{running=!running;$('pause').textContent=running?'⏸ PAUSE':'▶ RESUME'};$('speed').onclick=()=>{speed=speed===1?2:speed===2?4:speed===4?8:1;$('speed').textContent=`▶ ${speed}×`};$('reset').onclick=()=>init(count);
$('scale').onclick=()=>{const sizes=[1200,2400,5000,10000],idx=sizes.indexOf(count),next=sizes[(idx+1)%sizes.length];init(next);const after=sizes[(sizes.indexOf(next)+1)%sizes.length];$('scale').textContent=after===1200?'↩ 1,200 ENTITIES':`📈 ${after.toLocaleString()} ENTITIES`};
$('doctrine').onclick=()=>{doctrine=doctrine==='BALANCED'?'AGGRESSIVE':doctrine==='AGGRESSIVE'?'CAUTIOUS':'BALANCED';$('doctrine').textContent=`🧠 Doctrine: ${doctrine}`;pushLog('SCENARIO',`เปลี่ยน BLUE doctrine เป็น ${doctrine}`)};
$('bench').onclick=async()=>{if(benchRunning)return;benchRunning=true;const was=running;running=false,start=performance.now(),startTick=world.tick;for(let i=0;i<300;i++){oneTick();if(i%20===0)await new Promise(r=>setTimeout(r,0))}const ticks=world.tick-startTick,ms=performance.now()-start,avg=ms/Math.max(1,ticks);pushLog('BENCH',`${ticks} ticks • ${count.toLocaleString()} entities • avg ${avg.toFixed(2)} ms/tick • ${(1000/avg).toFixed(1)} ticks/s`);running=was;benchRunning=false;updateHUD()};

init();requestAnimationFrame(loop);
