import {createWorld,snapshot,makeProposal,resolveConflicts,verify,commit,stateHash} from '../../src/twa-core.js';

const $=id=>document.getElementById(id);
const canvas=$('battle'),ctx=canvas.getContext('2d');
const TICK_HZ=10,TICK_MS=1000/TICK_HZ,SEED=4242;
const SQUAD_SIZE=10,COMPANY_SIZE=100,BATTALION_SIZE=300,SPATIAL_CELL=.06;
const ROLE={RIFLE:0,LEADER:1,MG:2,MEDIC:3,MARKSMAN:4,SCOUT:5,GRENADIER:6,ENGINEER:7};
const WEAPON={
  [ROLE.RIFLE]:{range:.145,optimal:.105,damage:8.0,accuracy:.70,cadence:3,supp:6,ammo:90},
  [ROLE.LEADER]:{range:.145,optimal:.105,damage:7.0,accuracy:.72,cadence:3,supp:6,ammo:90},
  [ROLE.MG]:{range:.180,optimal:.135,damage:5.0,accuracy:.62,cadence:2,supp:15,ammo:180},
  [ROLE.MEDIC]:{range:.110,optimal:.075,damage:4.0,accuracy:.58,cadence:5,supp:3,ammo:45},
  [ROLE.MARKSMAN]:{range:.225,optimal:.175,damage:18.0,accuracy:.84,cadence:6,supp:5,ammo:50},
  [ROLE.SCOUT]:{range:.175,optimal:.130,damage:6.0,accuracy:.76,cadence:4,supp:4,ammo:70},
  [ROLE.GRENADIER]:{range:.150,optimal:.105,damage:7.0,accuracy:.67,cadence:4,supp:7,ammo:70},
  [ROLE.ENGINEER]:{range:.135,optimal:.095,damage:7.5,accuracy:.66,cadence:3,supp:6,ammo:80},
};

let world,count=1200,running=true,speed=1,last=performance.now(),acc=0,benchRunning=false,doctrine='BALANCED';
let morale,suppression,cohesion,role,squadId,companyId,battalionId,cooldown,ammo,targetId;
let hierarchy={battalions:[],companies:[],squads:[]};
const log=[];
let hillHoldBlue=0,hillHoldRed=0,battlePhase='DEPLOY';
let activity={shots:0,hits:0,misses:0,heals:0,grenades:0,mgBursts:0,engaged:0,kills:0,damage:0};
let profiler={snap:0,spatial:0,move:0,combat:0,commit:0,writes:0,conflicts:0,last:0,cells:0,maxCell:0,queries:0,candidates:0};
let combatFx=[],deathFx=[];

function roleForSlot(slot){if(slot===0)return ROLE.LEADER;if(slot===1)return ROLE.MEDIC;if(slot===2)return ROLE.MG;if(slot===3)return ROLE.GRENADIER;if(slot===4)return ROLE.SCOUT;if(slot===5)return ROLE.MARKSMAN;if(slot===6)return ROLE.ENGINEER;return ROLE.RIFLE;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function hash01(a,b,c,d=0){let x=(SEED^(a*374761393)^(b*668265263)^(c*2246822519)^(d*3266489917))>>>0;x^=x>>>13;x=Math.imul(x,1274126177)>>>0;x^=x>>>16;return x/4294967296;}
function alive(i){return i>=0&&i<count&&world.active[i]&&world.hp[i]>0;}

function init(n=count){
  count=n;world=createWorld({seed:SEED,count,density:.15,speed:0});
  morale=new Float32Array(count);suppression=new Float32Array(count);cohesion=new Float32Array(count);role=new Uint8Array(count);
  squadId=new Uint32Array(count);companyId=new Uint32Array(count);battalionId=new Uint32Array(count);cooldown=new Uint8Array(count);ammo=new Uint16Array(count);targetId=new Int32Array(count);targetId.fill(-1);
  hierarchy={battalions:[],companies:[],squads:[]};hillHoldBlue=0;hillHoldRed=0;battlePhase='DEPLOY';
  activity={shots:0,hits:0,misses:0,heals:0,grenades:0,mgBursts:0,engaged:0,kills:0,damage:0};combatFx=[];deathFx=[];
  const half=count>>1;buildHierarchy(0,0,half);buildHierarchy(1,half,count);
  for(let i=0;i<count;i++){
    const team=i<half?0:1,sq=hierarchy.squads[squadId[i]],slot=i-sq.start,row=Math.floor(slot/5),col=slot%5,side=team===0?-1:1;
    role[i]=roleForSlot(slot%SQUAD_SIZE);world.team[i]=team;world.active[i]=1;world.hp[i]=100;world.radius[i]=.0042;world.mass[i]=1;world.type[i]=role[i]+1;
    morale[i]=100;suppression[i]=0;cohesion[i]=100;ammo[i]=WEAPON[role[i]].ammo;cooldown[i]=0;
    world.x[i]=sq.anchorX+side*col*.008;world.y[i]=sq.anchorY+(row-.5)*.014+(((i*97)%101)/101-.5)*.002;
  }
  world.tick=0;world.worldVersion=0;world.deltaLog.length=0;world.eventLog.length=0;log.length=0;
  profiler={snap:0,spatial:0,move:0,combat:0,commit:0,writes:0,conflicts:0,last:0,cells:0,maxCell:0,queries:0,candidates:0};
  pushLog('SYSTEM',`เริ่มระบบต่อสู้พื้นฐาน ${count.toLocaleString()} entities • BLUE บุก / RED รับ`);
  pushLog('COMBAT','Target → ระยะยิง → Cooldown/Ammo → Hit/Miss → Damage/Suppression → Casualty → Morale');
  draw();updateHUD();
}

function buildHierarchy(team,start,end){
  const side=team===0?-1:1,total=end-start,bnCount=Math.max(1,Math.ceil(total/BATTALION_SIZE));
  for(let b=0;b<bnCount;b++){
    const id=hierarchy.battalions.length,bs=start+b*BATTALION_SIZE,be=Math.min(end,bs+BATTALION_SIZE),lane=bnCount===1?0:-.68+b*(1.36/(bnCount-1));
    hierarchy.battalions.push({id,team,start:bs,end:be,homeX:side*.72,homeY:lane,targetX:team===0?-.52:.16,targetY:lane,order:team===0?'ASSEMBLE':'DEFEND',state:'READY'});
    const coCount=Math.ceil((be-bs)/COMPANY_SIZE);
    for(let c=0;c<coCount;c++){
      const coId=hierarchy.companies.length,cs=bs+c*COMPANY_SIZE,ce=Math.min(be,cs+COMPANY_SIZE),coY=(c-(coCount-1)/2)*.075;
      hierarchy.companies.push({id:coId,team,battalionId:id,start:cs,end:ce,offsetY:coY});
      const sqCount=Math.ceil((ce-cs)/SQUAD_SIZE);
      for(let q=0;q<sqCount;q++){
        const sqId=hierarchy.squads.length,qs=cs+q*SQUAD_SIZE,qe=Math.min(ce,qs+SQUAD_SIZE),qr=Math.floor(q/5),qc=q%5;
        hierarchy.squads.push({id:sqId,team,battalionId:id,companyId:coId,start:qs,end:qe,anchorX:side*.72+side*(c*.032+qc*.013),anchorY:lane+coY+(qr-.5)*.025,targetX:side*.58,targetY:lane});
        for(let i=qs;i<qe;i++){squadId[i]=sqId;companyId[i]=coId;battalionId[i]=id;}
      }
    }
  }
}

function pushLog(type,text){log.push({tick:world?.tick??0,type,text});if(log.length>90)log.shift();$('log').innerHTML=log.slice(-16).reverse().map(x=>`<div class="entry"><b>${x.type==='CONTACT'?'⚔️ ':''}${x.type}</b> • ${x.text}<div class="muted">tick ${x.tick}</div></div>`).join('');}
function buildSpatial(){const t0=performance.now(),g=new Map();let maxCell=0;for(let i=0;i<count;i++)if(alive(i)){const cx=Math.floor(world.x[i]/SPATIAL_CELL),cy=Math.floor(world.y[i]/SPATIAL_CELL),k=cx+','+cy;let b=g.get(k);if(!b){b=[];g.set(k,b)}b.push(i);maxCell=Math.max(maxCell,b.length)}profiler.spatial=performance.now()-t0;profiler.cells=g.size;profiler.maxCell=maxCell;profiler.queries=0;profiler.candidates=0;return{g,cell:SPATIAL_CELL};}
function neighbors(i,sp,rings=1){const x=world.x[i],y=world.y[i],cx=Math.floor(x/sp.cell),cy=Math.floor(y/sp.cell),out=[];profiler.queries++;for(let ox=-rings;ox<=rings;ox++)for(let oy=-rings;oy<=rings;oy++){const b=sp.g.get((cx+ox)+','+(cy+oy));if(b){profiler.candidates+=b.length;for(const j of b)out.push(j)}}return out;}
function nearestEnemy(i,sp,maxRange){const rings=Math.max(1,Math.ceil(maxRange/sp.cell)),r2=maxRange*maxRange;let best=-1,bestD=r2;for(const j of neighbors(i,sp,rings)){if(j===i||!alive(j)||world.team[j]===world.team[i])continue;const dx=world.x[j]-world.x[i],dy=world.y[j]-world.y[i],d2=dx*dx+dy*dy;if(d2<bestD||(d2===bestD&&j<best)){bestD=d2;best=j}}return{entity:best,d2:bestD};}

function battalionStats(bn){let n=0,m=0,s=0,c=0,x=0,y=0;for(let i=bn.start;i<bn.end;i++)if(alive(i)){n++;m+=morale[i];s+=suppression[i];c+=cohesion[i];x+=world.x[i];y+=world.y[i]}return{alive:n,morale:n?m/n:0,supp:n?s/n:0,cohesion:n?c/n:0,x:n?x/n:bn.homeX,y:n?y/n:bn.homeY,strength:n/Math.max(1,bn.end-bn.start)};}
function modeOf(a){const m=new Map();for(const x of a)m.set(x,(m.get(x)||0)+1);return[...m].sort((a,b)=>b[1]-a[1])[0]?.[0]||'-';}
function teamNearHill(team){let n=0;for(let i=0;i<count;i++)if(alive(i)&&world.team[i]===team&&world.x[i]*world.x[i]+world.y[i]*world.y[i]<.18*.18)n++;return n;}

function autonomousCommand(){
  const tick=world.tick;if(tick<18)battlePhase='DEPLOY';else if(tick<55)battlePhase='ADVANCE';else battlePhase='ENGAGEMENT';
  const blueCount=hierarchy.battalions.filter(b=>b.team===0).length;
  for(const bn of hierarchy.battalions){const st=battalionStats(bn),local=bn.team===0?bn.id:bn.id-blueCount,laneBias=((local%3)-1)*.10;
    if(bn.team===0){
      if(st.strength<.30||st.morale<20){bn.order='RETREAT';bn.targetX=-.72;bn.targetY=bn.homeY;bn.state='BROKEN';continue;}
      if(tick<18){bn.order='ASSEMBLE';bn.targetX=-.50;bn.targetY=bn.homeY;}
      else{bn.order=doctrine==='AGGRESSIVE'?'ASSAULT':doctrine==='CAUTIOUS'?'BOUND_ADVANCE':'ATTACK';bn.targetX=doctrine==='CAUTIOUS'?-.05:.04;bn.targetY=clamp(bn.homeY*.32+laneBias,-.66,.66);bn.state='ADVANCING';}
    }else{
      const pressure=teamNearHill(0)>12;
      if(st.strength<.27||st.morale<17){bn.order='FALLBACK';bn.targetX=.62;bn.targetY=bn.homeY;bn.state='ROUTING';}
      else if(pressure&&st.morale>50&&local%3===0){bn.order='COUNTER';bn.targetX=.00;bn.targetY=bn.homeY*.22;bn.state='COUNTERATTACK';}
      else{bn.order='DEFEND';bn.targetX=.10+(local%2)*.035;bn.targetY=clamp(bn.homeY*.48,-.62,.62);bn.state='HOLDING';}
    }
  }
  if(tick%50===0)pushLog('AI PLAN',`BLUE ${modeOf(hierarchy.battalions.filter(b=>b.team===0).map(b=>b.order))} • RED ${modeOf(hierarchy.battalions.filter(b=>b.team===1).map(b=>b.order))} • ${battlePhase}`);
}

function updateSquadTargets(){for(const sq of hierarchy.squads){const bn=hierarchy.battalions[sq.battalionId],co=hierarchy.companies[sq.companyId],side=sq.team===0?-1:1,local=Math.floor((sq.start-co.start)/SQUAD_SIZE),row=Math.floor(local/5),col=local%5;sq.targetX=bn.targetX+side*col*.010;sq.targetY=bn.targetY+(row-.5)*.030+co.offsetY*.46;}}
function computeSquadCenters(){const sx=new Float64Array(hierarchy.squads.length),sy=new Float64Array(hierarchy.squads.length),sc=new Uint16Array(hierarchy.squads.length);for(let i=0;i<count;i++)if(alive(i)){const q=squadId[i];sx[q]+=world.x[i];sy[q]+=world.y[i];sc[q]++}for(let q=0;q<sc.length;q++)if(sc[q]){sx[q]/=sc[q];sy[q]/=sc[q]}return{sx,sy,sc};}

function movementProposal(s,sp){
  const t0=performance.now();if(world.tick%5===0)autonomousCommand();updateSquadTargets();const centers=computeSquadCenters(),writes=[],step=.0095;let inContact=0;
  for(let i=0;i<count;i++)if(alive(i)){
    const sq=hierarchy.squads[squadId[i]],bn=hierarchy.battalions[battalionId[i]],slot=i-sq.start,row=Math.floor(slot/5),col=slot%5,side=world.team[i]===0?-1:1,r=role[i],wp=WEAPON[r];
    let ahead=0,rear=0;if(r===ROLE.SCOUT)ahead=.024;if(r===ROLE.MG||r===ROLE.MEDIC||r===ROLE.MARKSMAN)rear=.016;
    const tx=sq.targetX+side*col*.007-side*ahead+side*rear,ty=sq.targetY+(row-.5)*.012;
    const slotErr=Math.hypot(world.x[i]-tx,world.y[i]-ty),centerErr=Math.hypot(world.x[i]-centers.sx[sq.id],world.y[i]-centers.sy[sq.id]);cohesion[i]=clamp(100-(slotErr*400+centerErr*150),0,100);
    let contact=-1,contactDist=999;if(targetId[i]>=0&&alive(targetId[i])&&world.team[targetId[i]]!==world.team[i]){const dx=world.x[targetId[i]]-world.x[i],dy=world.y[targetId[i]]-world.y[i],d=Math.hypot(dx,dy);if(d<=wp.range*1.15){contact=targetId[i];contactDist=d;}}
    if(contact<0){const q=nearestEnemy(i,sp,wp.range*1.12);contact=q.entity;contactDist=contact>=0?Math.sqrt(q.d2):999;if(contact>=0)targetId[i]=contact;}
    const retreating=bn.order==='RETREAT'||bn.order==='FALLBACK';
    let contactMul=1;if(contact>=0&&!retreating){inContact++;if(contactDist<=wp.optimal)contactMul=.04;else if(contactDist<=wp.range)contactMul=.22;}
    if(suppression[i]>70&&!retreating)contactMul*=.2;if(morale[i]<25&&!retreating)contactMul*=.45;
    const dx=tx-world.x[i],dy=ty-world.y[i],d=Math.hypot(dx,dy);if(d<.0025)continue;
    const orderMul=retreating?1.2:bn.order==='ASSAULT'?1.10:1,roleMul=r===ROLE.SCOUT?1.05:r===ROLE.MG?.88:1,m=Math.min(step*contactMul*orderMul*roleMul*(.40+.60*morale[i]/100)*(1-Math.min(.80,suppression[i]/130))*(.70+.30*cohesion[i]/100),d)/d;
    if(m<=0)continue;
    writes.push({entity:i,field:'x',value:clamp(world.x[i]+dx*m,-.98,.98),expectedVersion:s.version[i],expectedGeneration:s.generation[i]},{entity:i,field:'y',value:clamp(world.y[i]+dy*m,-.98,.98),expectedVersion:s.version[i],expectedGeneration:s.generation[i]});
  }
  activity.engaged=inContact;profiler.move=performance.now()-t0;return makeProposal({snapshot:s,systemId:'totalfront.autonomous-movement',source:'hierarchical-ai',priority:120,writes,events:[],meta:{authority:true,inContact}});
}

function applySquadCasualtyMorale(deaths){for(const d of deaths){const sq=hierarchy.squads[squadId[d]];if(!sq)continue;for(let j=sq.start;j<sq.end;j++)if(alive(j)){morale[j]=Math.max(0,morale[j]-2.0);cohesion[j]=Math.max(0,cohesion[j]-1.5);}}}

function roleSystemsProposal(s,sp){
  const t0=performance.now(),writes=[],events=[];activity={shots:0,hits:0,misses:0,heals:0,grenades:0,mgBursts:0,engaged:activity.engaged||0,kills:0,damage:0};combatFx=[];
  const addHP=(target,value,source,type)=>{writes.push({entity:target,field:'hp',op:'add',value,expectedVersion:s.version[target],expectedGeneration:s.generation[target]});events.push({type,source,target,value});};
  for(let i=0;i<count;i++)if(alive(i)){
    const r=role[i],wp=WEAPON[r],bn=hierarchy.battalions[battalionId[i]];
    if(cooldown[i]>0)cooldown[i]--;
    if(r===ROLE.LEADER&&world.tick%5===0){const sq=hierarchy.squads[squadId[i]];for(let j=sq.start;j<sq.end;j++)if(alive(j)){morale[j]=Math.min(100,morale[j]+.10);cohesion[j]=Math.min(100,cohesion[j]+.15);}}
    if(r===ROLE.MEDIC&&world.tick%4===0){let best=-1,bhp=101;for(const j of neighbors(i,sp,2)){if(j!==i&&alive(j)&&world.team[j]===world.team[i]&&world.hp[j]<bhp&&world.hp[j]<72){best=j;bhp=world.hp[j];}}if(best>=0){addHP(best,Math.min(3.0,100-world.hp[best]),i,'medic');morale[best]=Math.min(100,morale[best]+.2);activity.heals++;continue;}}
    if(bn.order==='RETREAT'||bn.order==='FALLBACK'||cooldown[i]>0||ammo[i]===0)continue;
    let target=targetId[i];if(target<0||!alive(target)||world.team[target]===world.team[i]){const q=nearestEnemy(i,sp,wp.range);target=q.entity;targetId[i]=target;}
    if(target<0)continue;
    const dx=world.x[target]-world.x[i],dy=world.y[target]-world.y[i],distance=Math.hypot(dx,dy);if(distance>wp.range){targetId[i]=-1;continue;}
    cooldown[i]=wp.cadence;ammo[i]--;activity.shots++;if(r===ROLE.MG)activity.mgBursts++;
    const rangeFactor=clamp(1-distance/wp.range*.55,.45,1),moraleFactor=.55+.45*morale[i]/100,suppFactor=1-Math.min(.72,suppression[i]/140),cohesionFactor=.65+.35*cohesion[i]/100,targetSuppBonus=1+Math.min(.12,suppression[target]/500);
    const hitChance=clamp(wp.accuracy*rangeFactor*moraleFactor*suppFactor*cohesionFactor*targetSuppBonus,.08,.92),roll=hash01(world.tick,i,target,ammo[i]);
    const fx={x1:world.x[i],y1:world.y[i],x2:world.x[target],y2:world.y[target],kind:r===ROLE.MG?'mg':r===ROLE.MARKSMAN?'marksman':'fire',hit:roll<hitChance};if(combatFx.length<160)combatFx.push(fx);
    suppression[target]=Math.min(100,suppression[target]+wp.supp*(roll<hitChance?1:.55));
    if(roll>=hitChance){activity.misses++;morale[target]=Math.max(0,morale[target]-.08);continue;}
    activity.hits++;let damage=wp.damage*(.85+.30*hash01(i,target,world.tick,1));
    if(r===ROLE.GRENADIER&&distance<=.125&&world.tick%8===0&&ammo[i]>0){let hit=0;for(const j of neighbors(target,sp,1)){if(hit>=5)break;if(alive(j)&&world.team[j]!==world.team[i]){const ex=world.x[j]-world.x[target],ey=world.y[j]-world.y[target];if(ex*ex+ey*ey<.026*.026){const splash=damage*.62;addHP(j,-splash,i,'grenade');suppression[j]=Math.min(100,suppression[j]+11);morale[j]=Math.max(0,morale[j]-1.0);activity.damage+=splash;hit++;}}}if(hit){activity.grenades++;if(combatFx.length<160)combatFx.push({...fx,kind:'grenade',hit:true});continue;}}
    if(role[target]===ROLE.ENGINEER&&world.team[target]===1)damage*=.88;
    addHP(target,-damage,i,'fire');activity.damage+=damage;morale[target]=Math.max(0,morale[target]-(damage*.10+suppression[target]*.002));
  }
  for(let i=0;i<count;i++)if(alive(i)){suppression[i]=Math.max(0,suppression[i]-.55);if(suppression[i]<15)morale[i]=Math.min(100,morale[i]+.018);}
  profiler.combat=performance.now()-t0;return makeProposal({snapshot:s,systemId:'totalfront.basic-combat-v1',source:'soldier-weapons',priority:220,writes,events,meta:{authority:true,...activity}});
}

function oneTick(){
  const t0=performance.now(),s0=performance.now(),s=snapshot(world);profiler.snap=performance.now()-s0;const sp=buildSpatial(),move=movementProposal(s,sp),combat=roleSystemsProposal(s,sp);
  const k0=performance.now(),resolved=resolveConflicts([move,combat]),v=verify(world,resolved,{critical:false});if(!v.ok){pushLog('ERROR',v.errors.slice(0,2).join(', '));running=false;return;}
  commit(world,resolved,{verifierResult:v});profiler.commit=performance.now()-k0;profiler.writes=resolved.writes.length;profiler.conflicts=resolved.conflicts.length;profiler.last=performance.now()-t0;
  const deaths=[];for(let i=0;i<count;i++)if(world.hp[i]<=0&&world.active[i]){deathFx.push({x:world.x[i],y:world.y[i],ttl:16});world.hp[i]=0;world.active[i]=0;morale[i]=0;suppression[i]=0;cohesion[i]=0;targetId[i]=-1;deaths.push(i);}
  activity.kills=deaths.length;if(deaths.length)applySquadCasualtyMorale(deaths);
  if(deaths.length>0)pushLog('CONTACT',`${deaths.length} นายถูกกำจัด • ยิง ${activity.shots} • โดน ${activity.hits} • พลาด ${activity.misses}`);
  updateHill();if(world.tick%20===0){const b=teamStats(0),r=teamStats(1);pushLog('SITREP',`BLUE ${b.alive} • RED ${r.alive} • ยิง ${activity.shots} • Hit ${(activity.shots?activity.hits/activity.shots*100:0).toFixed(0)}% • Hill ${hillState()}`);}updateHUD();
}

function updateHill(){const b=teamNearHill(0),r=teamNearHill(1);if(b>r*1.2&&b>8){hillHoldBlue++;hillHoldRed=Math.max(0,hillHoldRed-1);}else if(r>b*1.2&&r>8){hillHoldRed++;hillHoldBlue=Math.max(0,hillHoldBlue-1);}else{hillHoldBlue=Math.max(0,hillHoldBlue-1);hillHoldRed=Math.max(0,hillHoldRed-1);}if(hillHoldBlue===60)pushLog('OBJECTIVE','BLUE ยึด Hill 42 ต่อเนื่อง 6 วินาที');if(hillHoldRed===60)pushLog('OBJECTIVE','RED รักษา Hill 42 ต่อเนื่อง 6 วินาที');}
function hillState(){const b=teamNearHill(0),r=teamNearHill(1);if(b>r*1.35&&b>6)return'BLUE CONTROL';if(r>b*1.35&&r>6)return'RED CONTROL';return'CONTESTED';}
function teamStats(team){let a=0,m=0,s=0,c=0,aSum=0;for(let i=0;i<count;i++)if(world.team[i]===team&&alive(i)){a++;m+=morale[i];s+=suppression[i];c+=cohesion[i];aSum+=ammo[i];}return{alive:a,morale:a?m/a:0,supp:a?s/a:0,cohesion:a?c/a:0,ammo:a?aSum/a:0};}
function roleCounts(){const out=new Array(8).fill(0);for(let i=0;i<count;i++)if(alive(i))out[role[i]]++;return out;}

function updateHUD(){if(!world)return;const b=teamStats(0),r=teamStats(1),half=count/2,rc=roleCounts();$('tick').textContent=world.tick.toLocaleString();$('entities').textContent=count.toLocaleString();$('alive').textContent=`${b.alive} / ${r.alive}`;$('tickMs').textContent=profiler.last.toFixed(2)+' ms';$('battlePhase').textContent=battlePhase;$('hash').textContent=String(stateHash(world)).slice(0,10);$('blueStrength').textContent=b.alive.toLocaleString();$('redStrength').textContent=r.alive.toLocaleString();$('blueBar').style.width=Math.max(0,b.alive/half*100)+'%';$('redBar').style.width=Math.max(0,r.alive/half*100)+'%';$('morale').textContent=`${b.morale.toFixed(1)} / ${r.morale.toFixed(1)}`;$('suppression').textContent=`${b.supp.toFixed(1)} / ${r.supp.toFixed(1)}`;$('cohesion').textContent=`${b.cohesion.toFixed(1)} / ${r.cohesion.toFixed(1)}`;$('hierarchy').textContent=`${hierarchy.battalions.length} BN • ${hierarchy.companies.length} CO • ${hierarchy.squads.length} SQ`;$('hillControl').textContent=hillState();$('rRifle').textContent=rc[0];$('rLeader').textContent=rc[1];$('rMG').textContent=rc[2];$('rMedic').textContent=rc[3];$('rMarksman').textContent=rc[4];$('rScout').textContent=rc[5];$('rGrenadier').textContent=rc[6];$('rEngineer').textContent=rc[7];$('roleActivity').textContent=`ยิง ${activity.shots} • Hit ${activity.hits} • Miss ${activity.misses} • Damage ${activity.damage.toFixed(0)} • MG ${activity.mgBursts} • Grenade ${activity.grenades} • Heal ${activity.heals} • Engaged ${activity.engaged}`;$('pSnap').textContent=profiler.snap.toFixed(2);$('pSpatial').textContent=profiler.spatial.toFixed(2);$('pMove').textContent=profiler.move.toFixed(2);$('pCombat').textContent=profiler.combat.toFixed(2);$('pCommit').textContent=profiler.commit.toFixed(2);$('cells').textContent=profiler.cells;$('maxCell').textContent=profiler.maxCell;$('queries').textContent=profiler.queries.toLocaleString();$('candidates').textContent=profiler.candidates.toLocaleString();$('writes').textContent=profiler.writes.toLocaleString();$('conflicts').textContent=profiler.conflicts.toLocaleString();}

function draw(){if(!world)return;const w=canvas.width,h=canvas.height,sx=x=>(x+1)*.5*w,sy=y=>(y+1)*.5*h;ctx.clearRect(0,0,w,h);ctx.fillStyle='#0b1925';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#1e3447';ctx.lineWidth=1;for(let x=0;x<=10;x++){ctx.beginPath();ctx.moveTo(x*w/10,0);ctx.lineTo(x*w/10,h);ctx.stroke();}for(let y=0;y<=8;y++){ctx.beginPath();ctx.moveTo(0,y*h/8);ctx.lineTo(w,y*h/8);ctx.stroke();}ctx.fillStyle='#6c5934';ctx.beginPath();ctx.arc(sx(0),sy(0),56,0,Math.PI*2);ctx.fill();ctx.fillStyle='#e4c677';ctx.font='bold 18px system-ui';ctx.textAlign='center';ctx.fillText('▲ HILL 42',sx(0),sy(0)+6);
  for(const bn of hierarchy.battalions){const st=battalionStats(bn);if(!st.alive)continue;ctx.strokeStyle=bn.team===0?'#52bfff88':'#ff6b6b88';ctx.lineWidth=2;ctx.beginPath();ctx.arc(sx(st.x),sy(st.y),Math.max(27,Math.sqrt(st.alive)*2),0,Math.PI*2);ctx.stroke();ctx.setLineDash([6,5]);ctx.beginPath();ctx.moveTo(sx(st.x),sy(st.y));ctx.lineTo(sx(bn.targetX),sy(bn.targetY));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=bn.team===0?'#52bfff':'#ff6b6b';ctx.font='bold 11px system-ui';ctx.fillText(`${bn.team===0?'ATK':'DEF'} BN${bn.id} ${bn.order}`,sx(st.x),sy(st.y)-31);}
  const stride=count>=10000?14:count>=5000?8:count>=2400?5:2;for(let i=0;i<count;i+=stride)if(alive(i)){ctx.fillStyle=world.team[i]===0?'#52bfff':'#ff6b6b';ctx.globalAlpha=.35+.65*Math.max(.2,world.hp[i]/100);const sz=role[i]===ROLE.LEADER||role[i]===ROLE.MG?5:4;ctx.fillRect(sx(world.x[i])-sz/2,sy(world.y[i])-sz/2,sz,sz);}ctx.globalAlpha=1;
  ctx.lineWidth=1.4;for(const f of combatFx){ctx.strokeStyle=f.kind==='grenade'?'#ffd166':f.hit?(f.kind==='mg'?'#ffb347':'#ffffffcc'):'#7f8c8d66';ctx.beginPath();ctx.moveTo(sx(f.x1),sy(f.y1));ctx.lineTo(sx(f.x2),sy(f.y2));ctx.stroke();if(f.kind==='grenade'){ctx.fillStyle='#ff9f4388';ctx.beginPath();ctx.arc(sx(f.x2),sy(f.y2),8,0,Math.PI*2);ctx.fill();}}
  deathFx=deathFx.filter(d=>--d.ttl>0);for(const d of deathFx){ctx.strokeStyle='#ffdd88aa';ctx.lineWidth=2;const x=sx(d.x),y=sy(d.y);ctx.beginPath();ctx.moveTo(x-4,y-4);ctx.lineTo(x+4,y+4);ctx.moveTo(x+4,y-4);ctx.lineTo(x-4,y+4);ctx.stroke();}
}

function loop(now){const dt=now-last;last=now;if(running&&!benchRunning){acc+=dt*speed;let guard=0;while(acc>=TICK_MS&&guard<8){oneTick();acc-=TICK_MS;guard++;}}draw();requestAnimationFrame(loop);}
$('pause').onclick=()=>{running=!running;$('pause').textContent=running?'⏸ PAUSE':'▶ RESUME';};
$('speed').onclick=()=>{speed=speed===1?2:speed===2?4:speed===4?8:1;$('speed').textContent=`▶ ${speed}×`;};
$('reset').onclick=()=>init(count);
$('scale').onclick=()=>{const sizes=[1200,2400,5000,10000],idx=sizes.indexOf(count),next=sizes[(idx+1)%sizes.length];init(next);const after=sizes[(sizes.indexOf(next)+1)%sizes.length];$('scale').textContent=after===1200?'↩ 1,200 ENTITIES':`📈 ${after.toLocaleString()} ENTITIES`;};
$('doctrine').onclick=()=>{doctrine=doctrine==='BALANCED'?'AGGRESSIVE':doctrine==='AGGRESSIVE'?'CAUTIOUS':'BALANCED';$('doctrine').textContent=`🧠 Doctrine: ${doctrine}`;pushLog('SCENARIO',`เปลี่ยน BLUE doctrine เป็น ${doctrine}`);};
$('bench').onclick=async()=>{if(benchRunning)return;benchRunning=true;const was=running;running=false,start=performance.now(),startTick=world.tick;for(let i=0;i<300;i++){oneTick();if(i%20===0)await new Promise(r=>setTimeout(r,0));}const ticks=world.tick-startTick,ms=performance.now()-start,avg=ms/Math.max(1,ticks);pushLog('BENCH',`${ticks} ticks • ${count.toLocaleString()} entities • avg ${avg.toFixed(2)} ms/tick • ${(1000/avg).toFixed(1)} ticks/s`);running=was;benchRunning=false;updateHUD();};

init();requestAnimationFrame(loop);
