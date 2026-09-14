import {createWorld,snapshot,makeProposal,resolveConflicts,verify,commit,stateHash} from '../../src/twa-core.js';

const $=id=>document.getElementById(id), canvas=$('battle'), ctx=canvas.getContext('2d');
const TICK_MS=100, SEED=4242, SQUAD_SIZE=10, COMPANY_SIZE=100, BATTALION_SIZE=300, SPATIAL_CELL=.06;
const HILL={x:.58,y:0,r:.18};
const ROLE={RIFLE:0,LEADER:1,MG:2,MEDIC:3,MARKSMAN:4,SCOUT:5,GRENADIER:6,ENGINEER:7};
const STATE={ADVANCE:0,SEEK_COVER:1,AIM:2,FIRE:3,SUPPRESS:4,RELOAD:5,TREAT:6,FALL_BACK:7,PINNED:8,ROUT:9};
const SQ={ADVANCE:0,ENGAGE:1,SUPPRESS:2,FLANK:3,DEFEND:4,FALLBACK:5,RESERVE:6};
const CO={ADVANCE:0,FIREBASE:1,MANEUVER:2,RESERVE:3,DEFEND:4,REINFORCE:5,FALLBACK:6};
const WEAPON={
 0:{range:.15,optimal:.105,damage:8,accuracy:.72,cadence:3,supp:6,ammo:90},
 1:{range:.15,optimal:.105,damage:7,accuracy:.74,cadence:3,supp:6,ammo:90},
 2:{range:.19,optimal:.14,damage:5,accuracy:.64,cadence:2,supp:17,ammo:180},
 3:{range:.12,optimal:.08,damage:4,accuracy:.60,cadence:5,supp:3,ammo:45},
 4:{range:.23,optimal:.18,damage:18,accuracy:.86,cadence:6,supp:5,ammo:50},
 5:{range:.18,optimal:.13,damage:6,accuracy:.78,cadence:4,supp:4,ammo:70},
 6:{range:.16,optimal:.11,damage:7,accuracy:.70,cadence:4,supp:8,ammo:70},
 7:{range:.14,optimal:.10,damage:7.5,accuracy:.68,cadence:3,supp:6,ammo:80}
};
const TERRAIN=[
 {x:-.18,y:-.42,r:.16,cover:.18,name:'FOREST'},
 {x:-.10,y:.40,r:.17,cover:.20,name:'FOREST'},
 {x:.34,y:-.28,r:.13,cover:.22,name:'FORWARD TRENCH'},
 {x:.36,y:.28,r:.13,cover:.22,name:'FORWARD TRENCH'},
 {x:.55,y:-.14,r:.14,cover:.34,name:'HILL TRENCH'},
 {x:.57,y:.16,r:.14,cover:.34,name:'HILL TRENCH'},
 {x:.72,y:0,r:.12,cover:.27,name:'RESERVE'},
 {x:.68,y:-.36,r:.13,cover:.20,name:'WOOD'},
 {x:.69,y:.37,r:.13,cover:.20,name:'WOOD'}
];

let world,count=1200,running=true,speed=1,last=performance.now(),acc=0,benchRunning=false,doctrine='BALANCED',battleOver=false,winner='';
let morale,suppression,cohesion,role,squadId,companyId,battalionId,cooldown,ammo,targetId,healCooldown,combatState,aimTicks;
let hierarchy={battalions:[],companies:[],squads:[]},log=[],combatFx=[],deathFx=[];
let battlePhase='DEPLOY',hillHoldBlue=0,hillHoldRed=0;
let activity={shots:0,hits:0,misses:0,heals:0,grenades:0,engaged:0,kills:0,damage:0};
let profiler={snap:0,spatial:0,move:0,combat:0,commit:0,writes:0,conflicts:0,last:0,cells:0,maxCell:0,queries:0,candidates:0};

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function hash01(a,b,c,d=0){let x=(SEED^(a*374761393)^(b*668265263)^(c*2246822519)^(d*3266489917))>>>0;x^=x>>>13;x=Math.imul(x,1274126177)>>>0;x^=x>>>16;return x/4294967296}
function alive(i){return i>=0&&i<count&&world.active[i]&&world.hp[i]>0}
function roleForSlot(s){return s===0?ROLE.LEADER:s===1?ROLE.MEDIC:s===2?ROLE.MG:s===3?ROLE.GRENADIER:s===4?ROLE.SCOUT:s===5?ROLE.MARKSMAN:s===6?ROLE.ENGINEER:ROLE.RIFLE}
function pushLog(type,text){log.push({tick:world?.tick||0,type,text});if(log.length>100)log.shift();$('log').innerHTML=log.slice(-16).reverse().map(x=>`<div class="entry"><b>${x.type==='CONTACT'?'⚔️ ':''}${x.type}</b> • ${x.text}<div class="muted">tick ${x.tick}</div></div>`).join('')}
function coverAt(x,y,team){let c=0;for(const t of TERRAIN)if(Math.hypot(x-t.x,y-t.y)<t.r)c=Math.max(c,t.cover);if(team===1&&x>.30&&x<.76&&Math.abs(y)<.50)c=Math.max(c,.08);return c}

function init(n=count){
 count=n;world=createWorld({seed:SEED,count,density:.15,speed:0});
 morale=new Float32Array(count);suppression=new Float32Array(count);cohesion=new Float32Array(count);role=new Uint8Array(count);combatState=new Uint8Array(count);aimTicks=new Uint8Array(count);
 squadId=new Uint32Array(count);companyId=new Uint32Array(count);battalionId=new Uint32Array(count);cooldown=new Uint8Array(count);ammo=new Uint16Array(count);targetId=new Int32Array(count);targetId.fill(-1);healCooldown=new Uint8Array(count);
 hierarchy={battalions:[],companies:[],squads:[]};log=[];combatFx=[];deathFx=[];hillHoldBlue=hillHoldRed=0;battlePhase='DEPLOY';battleOver=false;winner='';
 const half=count>>1;buildHierarchy(0,0,half);buildHierarchy(1,half,count);
 for(let i=0;i<count;i++){
  const team=i<half?0:1,sq=hierarchy.squads[squadId[i]],slot=i-sq.start,row=Math.floor(slot/5),col=slot%5,side=team===0?-1:1;
  role[i]=roleForSlot(slot%10);world.team[i]=team;world.active[i]=1;world.hp[i]=100;world.radius[i]=.0042;world.mass[i]=1;world.type[i]=role[i]+1;
  morale[i]=100;cohesion[i]=100;ammo[i]=WEAPON[role[i]].ammo;world.x[i]=sq.anchorX+side*col*.008;world.y[i]=sq.anchorY+(row-.5)*.014+(((i*97)%101)/101-.5)*.002;
 }
 world.tick=0;world.worldVersion=0;world.deltaLog.length=0;world.eventLog.length=0;
 profiler={snap:0,spatial:0,move:0,combat:0,commit:0,writes:0,conflicts:0,last:0,cells:0,maxCell:0,queries:0,candidates:0};
 pushLog('SYSTEM',`Total Front P4.2 • Defender Objective Zone • ${count.toLocaleString()} entities`);
 pushLog('MISSION','Hill 42 อยู่ในแนวตั้งรับ RED ที่ x=+0.58 • ฝ่ายรับเข้าประจำพื้นที่ก่อนฝ่ายบุก');draw();updateHUD();
}

function buildHierarchy(team,start,end){
 const side=team===0?-1:1,total=end-start,bnCount=Math.max(1,Math.ceil(total/BATTALION_SIZE));
 for(let b=0;b<bnCount;b++){
  const id=hierarchy.battalions.length,bs=start+b*BATTALION_SIZE,be=Math.min(end,bs+BATTALION_SIZE),lane=bnCount===1?0:-.68+b*(1.36/(bnCount-1));
  hierarchy.battalions.push({id,team,start:bs,end:be,homeX:side*.72,homeY:lane,targetX:team===0?-.5:HILL.x+.03,targetY:lane,order:team===0?'ASSEMBLE':'DEFEND',damageDone:0,losses:0});
  const coCount=Math.ceil((be-bs)/COMPANY_SIZE);
  for(let c=0;c<coCount;c++){
   const coId=hierarchy.companies.length,cs=bs+c*COMPANY_SIZE,ce=Math.min(be,cs+COMPANY_SIZE),coY=(c-(coCount-1)/2)*.075;
   hierarchy.companies.push({id:coId,team,battalionId:id,start:cs,end:ce,offsetY:coY,state:team===0?CO.ADVANCE:CO.DEFEND,targetX:side*.58,targetY:lane+coY,threat:0});
   const sqCount=Math.ceil((ce-cs)/SQUAD_SIZE);
   for(let q=0;q<sqCount;q++){
    const sqId=hierarchy.squads.length,qs=cs+q*SQUAD_SIZE,qe=Math.min(ce,qs+SQUAD_SIZE),qr=Math.floor(q/5),qc=q%5;
    hierarchy.squads.push({id:sqId,team,battalionId:id,companyId:coId,start:qs,end:qe,anchorX:side*.72+side*(c*.032+qc*.013),anchorY:lane+coY+(qr-.5)*.025,targetX:side*.58,targetY:lane,state:SQ.ADVANCE,contact:-1});
    for(let i=qs;i<qe;i++){squadId[i]=sqId;companyId[i]=coId;battalionId[i]=id}
   }
  }
 }
}

function buildSpatial(){const t0=performance.now(),g=new Map();let maxCell=0;for(let i=0;i<count;i++)if(alive(i)){const cx=Math.floor(world.x[i]/SPATIAL_CELL),cy=Math.floor(world.y[i]/SPATIAL_CELL),k=cx+','+cy;let b=g.get(k);if(!b){b=[];g.set(k,b)}b.push(i);maxCell=Math.max(maxCell,b.length)}profiler.spatial=performance.now()-t0;profiler.cells=g.size;profiler.maxCell=maxCell;profiler.queries=0;profiler.candidates=0;return{g,cell:SPATIAL_CELL}}
function neighbors(i,sp,rings=1){const cx=Math.floor(world.x[i]/sp.cell),cy=Math.floor(world.y[i]/sp.cell),out=[];profiler.queries++;for(let ox=-rings;ox<=rings;ox++)for(let oy=-rings;oy<=rings;oy++){const b=sp.g.get((cx+ox)+','+(cy+oy));if(b){profiler.candidates+=b.length;out.push(...b)}}return out}
function battalionStats(bn){let n=0,m=0,s=0,c=0,x=0,y=0;for(let i=bn.start;i<bn.end;i++)if(alive(i)){n++;m+=morale[i];s+=suppression[i];c+=cohesion[i];x+=world.x[i];y+=world.y[i]}return{alive:n,morale:n?m/n:0,supp:n?s/n:0,cohesion:n?c/n:0,x:n?x/n:bn.homeX,y:n?y/n:bn.homeY,strength:n/Math.max(1,bn.end-bn.start)}}
function companyStats(co){let n=0,m=0,s=0,x=0,y=0;for(let i=co.start;i<co.end;i++)if(alive(i)){n++;m+=morale[i];s+=suppression[i];x+=world.x[i];y+=world.y[i]}return{alive:n,morale:n?m/n:0,supp:n?s/n:0,x:n?x/n:co.targetX,y:n?y/n:co.targetY,strength:n/Math.max(1,co.end-co.start)}}
function teamNearHill(team){let n=0;for(let i=0;i<count;i++)if(alive(i)&&world.team[i]===team&&Math.hypot(world.x[i]-HILL.x,world.y[i]-HILL.y)<HILL.r)n++;return n}
function modeOf(a){const m=new Map();for(const x of a)m.set(x,(m.get(x)||0)+1);return[...m].sort((a,b)=>b[1]-a[1])[0]?.[0]||'-'}

function autonomousCommand(){
 const tick=world.tick;if(tick<18)battlePhase='DEPLOY';else if(tick<55)battlePhase='ADVANCE';else battlePhase='ENGAGEMENT';
 const blueCount=hierarchy.battalions.filter(b=>b.team===0).length;
 for(const bn of hierarchy.battalions){
  const st=battalionStats(bn),local=bn.team===0?bn.id:bn.id-blueCount,laneBias=((local%3)-1)*.08;
  if(bn.team===0){
   if(st.strength<.30||st.morale<20){bn.order='RETREAT';bn.targetX=-.72;bn.targetY=bn.homeY}
   else if(tick<18){bn.order='ASSEMBLE';bn.targetX=-.48;bn.targetY=bn.homeY}
   else{bn.order=doctrine==='AGGRESSIVE'?'ASSAULT':doctrine==='CAUTIOUS'?'BOUND_ADVANCE':'ATTACK';bn.targetX=HILL.x-.02;bn.targetY=clamp(HILL.y+bn.homeY*.24+laneBias,-.54,.54)}
  }else{
   const pressure=teamNearHill(0)>12;
   if(st.strength<.27||st.morale<17){bn.order='FALLBACK';bn.targetX=.78;bn.targetY=bn.homeY}
   else if(pressure&&st.morale>50&&local%3===0){bn.order='COUNTER';bn.targetX=HILL.x-.10;bn.targetY=bn.homeY*.16}
   else{bn.order='DEFEND';bn.targetX=HILL.x+.01+(local%2)*.02;bn.targetY=clamp(bn.homeY*.36,-.52,.52)}
  }
 }
 if(tick%50===0)pushLog('AI PLAN',`BLUE ${modeOf(hierarchy.battalions.filter(b=>b.team===0).map(b=>b.order))} • RED ${modeOf(hierarchy.battalions.filter(b=>b.team===1).map(b=>b.order))}`)
}

function updateCompanyAI(){
 for(const bn of hierarchy.battalions){
  const companies=hierarchy.companies.filter(c=>c.battalionId===bn.id),stats=companies.map(companyStats);if(!companies.length)continue;
  if(bn.order==='RETREAT'||bn.order==='FALLBACK'){companies.forEach(c=>{c.state=CO.FALLBACK;c.targetX=bn.homeX;c.targetY=bn.homeY+c.offsetY});continue}
  if(bn.team===0){
   const reserve=companies.length-1;let pressured=0,max=-1;stats.forEach((s,i)=>{if(s.supp>max){max=s.supp;pressured=i}});
   companies.forEach((c,i)=>{if(i===reserve&&stats[i].strength>.55){c.state=CO.RESERVE;c.targetX=bn.targetX-.12;c.targetY=bn.targetY+c.offsetY*.7}else if(i===0){c.state=CO.FIREBASE;c.targetX=bn.targetX-.05;c.targetY=bn.targetY+c.offsetY*.45}else{c.state=CO.MANEUVER;const flank=((bn.id+i)%2?1:-1);c.targetX=bn.targetX;c.targetY=clamp(bn.targetY+flank*.12+c.offsetY*.25,-.60,.60)}});
   if(max>55&&reserve!==pressured){companies[reserve].state=CO.REINFORCE;companies[reserve].targetX=stats[pressured].x-.03;companies[reserve].targetY=stats[pressured].y}
  }else{
   let weak=0,min=2;stats.forEach((s,i)=>{if(s.strength<min){min=s.strength;weak=i}});
   companies.forEach((c,i)=>{c.state=CO.DEFEND;if(i===companies.length-1){c.targetX=HILL.x+.12;c.targetY=clamp(bn.targetY+c.offsetY*.35,-.48,.48)}else if(i===0){c.targetX=HILL.x-.12;c.targetY=clamp(bn.targetY+c.offsetY*.45,-.52,.52)}else{c.targetX=HILL.x;c.targetY=clamp(bn.targetY+c.offsetY*.45,-.52,.52)}});
   const reserve=companies.length-1;if(min<.62&&reserve!==weak){companies[reserve].state=CO.REINFORCE;companies[reserve].targetX=stats[weak].x+.035;companies[reserve].targetY=stats[weak].y}
  }
 }
}

function updateSquadTargets(){
 for(const sq of hierarchy.squads){
  const co=hierarchy.companies[sq.companyId],local=Math.floor((sq.start-co.start)/SQUAD_SIZE),row=Math.floor(local/5),col=local%5,side=sq.team===0?-1:1;
  sq.targetX=co.targetX+side*col*.009;sq.targetY=co.targetY+(row-.5)*.028;
  if(co.state===CO.FIREBASE)sq.state=(local%3===0)?SQ.SUPPRESS:SQ.ENGAGE;
  else if(co.state===CO.MANEUVER)sq.state=(local%3===0)?SQ.SUPPRESS:SQ.FLANK;
  else if(co.state===CO.RESERVE)sq.state=SQ.RESERVE;
  else if(co.state===CO.REINFORCE)sq.state=SQ.ADVANCE;
  else if(co.state===CO.DEFEND)sq.state=SQ.DEFEND;
  else if(co.state===CO.FALLBACK)sq.state=SQ.FALLBACK;
 }
}

function targetScore(i,j,d){const r=role[i],jr=role[j],wp=WEAPON[r];let s=(1-d/wp.range)*45+(100-world.hp[j])*.08+suppression[j]*.03+(targetId[i]===j?18:0);if(r===ROLE.MARKSMAN&&(jr===ROLE.LEADER||jr===ROLE.MG||jr===ROLE.GRENADIER))s+=28;if(r===ROLE.GRENADIER)s+=12;return s}
function acquireTarget(i,sp,range){let best=-1,bestScore=-1e9,bestD=999,current=targetId[i];if(current>=0&&alive(current)&&world.team[current]!==world.team[i]){const d=Math.hypot(world.x[current]-world.x[i],world.y[current]-world.y[i]);if(d<=range*1.08){best=current;bestD=d;bestScore=targetScore(i,current,d)+20}}for(const j of neighbors(i,sp,Math.max(1,Math.ceil(range/sp.cell)))){if(j===i||!alive(j)||world.team[j]===world.team[i])continue;const d=Math.hypot(world.x[j]-world.x[i],world.y[j]-world.y[i]);if(d>range)continue;const s=targetScore(i,j,d);if(s>bestScore){best=j;bestD=d;bestScore=s}}targetId[i]=best;return{entity:best,distance:bestD}}
function chooseState(i,hasTarget,dist){const sq=hierarchy.squads[squadId[i]],bn=hierarchy.battalions[battalionId[i]],wp=WEAPON[role[i]];if(bn.order==='RETREAT'||bn.order==='FALLBACK'||sq.state===SQ.FALLBACK||morale[i]<12)return STATE.ROUT;if(morale[i]<25)return STATE.FALL_BACK;if(suppression[i]>=80)return STATE.PINNED;if(suppression[i]>=52)return STATE.SEEK_COVER;if(ammo[i]===0)return STATE.RELOAD;if(sq.state===SQ.RESERVE&&!hasTarget)return STATE.ADVANCE;if(!hasTarget)return STATE.ADVANCE;if(role[i]===ROLE.MG&&(sq.state===SQ.SUPPRESS||sq.state===SQ.DEFEND))return STATE.SUPPRESS;if(dist>wp.optimal*1.08)return STATE.ADVANCE;if(aimTicks[i]<1)return STATE.AIM;return STATE.FIRE}

function movementProposal(s,sp){
 const t0=performance.now();if(world.tick%5===0){autonomousCommand();updateCompanyAI()}updateSquadTargets();const writes=[],step=.0095;let inContact=0;
 for(let i=0;i<count;i++)if(alive(i)){
  const sq=hierarchy.squads[squadId[i]],co=hierarchy.companies[companyId[i]],bn=hierarchy.battalions[battalionId[i]],slot=i-sq.start,row=Math.floor(slot/5),col=slot%5,side=world.team[i]===0?-1:1,r=role[i],wp=WEAPON[r];
  const ac=acquireTarget(i,sp,wp.range*1.08),hasTarget=ac.entity>=0,dist=ac.distance;if(hasTarget)inContact++;combatState[i]=chooseState(i,hasTarget,dist);
  let tx=sq.targetX+side*col*.007,ty=sq.targetY+(row-.5)*.012;
  if(r===ROLE.SCOUT)tx-=side*.025;if(r===ROLE.MG||r===ROLE.MEDIC||r===ROLE.MARKSMAN)tx+=side*.018;
  if(combatState[i]===STATE.SEEK_COVER){let best={x:tx,y:ty,score:-999};for(let k=0;k<8;k++){const a=k*Math.PI/4,cx=world.x[i]+Math.cos(a)*.035,cy=world.y[i]+Math.sin(a)*.035,score=coverAt(cx,cy,world.team[i])*100-Math.hypot(cx-sq.targetX,cy-sq.targetY)*30;if(score>best.score)best={x:cx,y:cy,score}}tx=best.x;ty=best.y}
  if(combatState[i]===STATE.FALL_BACK||combatState[i]===STATE.ROUT){tx=bn.homeX;ty=bn.homeY+(i%7-3)*.01}
  let moveMul=1;if(combatState[i]===STATE.FIRE||combatState[i]===STATE.AIM||combatState[i]===STATE.SUPPRESS)moveMul=.04;else if(combatState[i]===STATE.PINNED)moveMul=.01;else if(combatState[i]===STATE.SEEK_COVER)moveMul=.70;else if(combatState[i]===STATE.FALL_BACK)moveMul=1.15;else if(combatState[i]===STATE.ROUT)moveMul=1.35;
  if(co.state===CO.FIREBASE)moveMul*=.60;if(co.state===CO.RESERVE)moveMul*=.55;if(sq.state===SQ.DEFEND)moveMul*=.50;
  const dx=tx-world.x[i],dy=ty-world.y[i],d=Math.hypot(dx,dy);if(d<.0025)continue;const m=Math.min(step*moveMul*(.4+.6*morale[i]/100)*(1-Math.min(.82,suppression[i]/130)),d)/d;
  if(m>0)writes.push({entity:i,field:'x',value:clamp(world.x[i]+dx*m,-.98,.98),expectedVersion:s.version[i],expectedGeneration:s.generation[i]},{entity:i,field:'y',value:clamp(world.y[i]+dy*m,-.98,.98),expectedVersion:s.version[i],expectedGeneration:s.generation[i]});
 }
 activity.engaged=inContact;profiler.move=performance.now()-t0;return makeProposal({snapshot:s,systemId:'totalfront.p4-movement',source:'company-ai',priority:120,writes,events:[],meta:{authority:true,inContact}})
}

function combatProposal(s,sp){
 const t0=performance.now(),writes=[],events=[];activity={shots:0,hits:0,misses:0,heals:0,grenades:0,engaged:activity.engaged||0,kills:0,damage:0};combatFx=[];
 const addHP=(target,value,source,type)=>{writes.push({entity:target,field:'hp',op:'add',value,expectedVersion:s.version[target],expectedGeneration:s.generation[target]});events.push({type,source,target,value})};
 for(let i=0;i<count;i++)if(alive(i)){
  const r=role[i],wp=WEAPON[r],st=combatState[i];if(cooldown[i]>0)cooldown[i]--;if(healCooldown[i]>0)healCooldown[i]--;
  if(st===STATE.RELOAD&&ammo[i]===0){ammo[i]=Math.max(12,Math.floor(wp.ammo*.35));cooldown[i]=8;continue}
  if(r===ROLE.LEADER&&world.tick%5===0){const sq=hierarchy.squads[squadId[i]];for(let j=sq.start;j<sq.end;j++)if(alive(j)){morale[j]=Math.min(100,morale[j]+.10);cohesion[j]=Math.min(100,cohesion[j]+.12)}}
  if(r===ROLE.MEDIC&&healCooldown[i]===0&&world.tick%5===0){let best=-1,bhp=101;for(const j of neighbors(i,sp,1))if(j!==i&&alive(j)&&world.team[j]===world.team[i]&&world.hp[j]<bhp&&world.hp[j]<60){best=j;bhp=world.hp[j]}if(best>=0){addHP(best,1.5,i,'medic');healCooldown[i]=15;activity.heals++;continue}}
  if(st===STATE.PINNED||st===STATE.ROUT||st===STATE.FALL_BACK||st===STATE.SEEK_COVER||cooldown[i]>0||ammo[i]===0)continue;
  if(st===STATE.AIM){aimTicks[i]=Math.min(3,aimTicks[i]+1);continue}if(st!==STATE.FIRE&&st!==STATE.SUPPRESS)continue;
  const ac=acquireTarget(i,sp,wp.range);if(ac.entity<0||ac.distance>wp.range){aimTicks[i]=0;continue}const target=ac.entity,distance=ac.distance;cooldown[i]=wp.cadence;ammo[i]--;activity.shots++;
  const cover=coverAt(world.x[target],world.y[target],world.team[target]),rangeFactor=clamp(1-distance/wp.range*.50,.50,1),hitChance=clamp(wp.accuracy*rangeFactor*(.6+.4*morale[i]/100)*(1-Math.min(.72,suppression[i]/145))*(1-cover),.08,.94),roll=hash01(world.tick,i,target,ammo[i]),hit=roll<hitChance;aimTicks[i]=0;
  if(combatFx.length<180)combatFx.push({x1:world.x[i],y1:world.y[i],x2:world.x[target],y2:world.y[target],kind:r===ROLE.MG?'mg':'fire',hit});suppression[target]=Math.min(100,suppression[target]+wp.supp*(st===STATE.SUPPRESS?1.45:1)*(hit?1:.5));
  if(!hit){activity.misses++;continue}activity.hits++;let damage=wp.damage*(.9+.2*hash01(i,target,world.tick,1))*(1-cover*.65);if(st===STATE.SUPPRESS)damage*=.78;if(r===ROLE.ENGINEER&&world.team[target]===1)damage*=.9;
  if(r===ROLE.GRENADIER&&distance<=.13&&world.tick%8===0){let n=0;for(const j of neighbors(target,sp,1)){if(n>=5)break;if(alive(j)&&world.team[j]!==world.team[i]&&Math.hypot(world.x[j]-world.x[target],world.y[j]-world.y[target])<.024){const splash=damage*.58;addHP(j,-splash,i,'grenade');suppression[j]=Math.min(100,suppression[j]+10);activity.damage+=splash;n++}}if(n){activity.grenades++;continue}}
  addHP(target,-damage,i,'fire');activity.damage+=damage;hierarchy.battalions[battalionId[i]].damageDone+=damage;morale[target]=Math.max(0,morale[target]-(damage*.08+suppression[target]*.002));
 }
 for(let i=0;i<count;i++)if(alive(i)){suppression[i]=Math.max(0,suppression[i]-.50);if(suppression[i]<18)morale[i]=Math.min(100,morale[i]+.018)}
 profiler.combat=performance.now()-t0;return makeProposal({snapshot:s,systemId:'totalfront.p4-combat',source:'role-ai',priority:220,writes,events,meta:{authority:true,...activity}})
}

function updateHill(){const b=teamNearHill(0),r=teamNearHill(1);if(b>r*1.2&&b>8){hillHoldBlue++;hillHoldRed=Math.max(0,hillHoldRed-1)}else if(r>b*1.2&&r>8){hillHoldRed++;hillHoldBlue=Math.max(0,hillHoldBlue-1)}else{hillHoldBlue=Math.max(0,hillHoldBlue-1);hillHoldRed=Math.max(0,hillHoldRed-1)}}
function hillState(){const b=teamNearHill(0),r=teamNearHill(1);return b>r*1.35&&b>6?'BLUE CONTROL':r>b*1.35&&r>6?'RED CONTROL':'CONTESTED'}
function teamStats(team){let a=0,m=0,s=0,c=0;for(let i=0;i<count;i++)if(world.team[i]===team&&alive(i)){a++;m+=morale[i];s+=suppression[i];c+=cohesion[i]}return{alive:a,morale:a?m/a:0,supp:a?s/a:0,cohesion:a?c/a:0}}
function roleCounts(){const out=new Array(8).fill(0);for(let i=0;i<count;i++)if(alive(i))out[role[i]]++;return out}
function companyStateSummary(){const n=new Array(7).fill(0);for(const c of hierarchy.companies)n[c.state]++;return n}
function checkVictory(){if(battleOver)return;const b=teamStats(0),r=teamStats(1),half=count/2;if(hillHoldBlue>=100){winner='BLUE';battleOver=true}else if(b.alive<half*.12){winner='RED';battleOver=true}else if(r.alive<half*.12){winner='BLUE';battleOver=true}if(battleOver){battlePhase='COMPLETE';running=false;pushLog('VICTORY',`${winner} ชนะยุทธการ Hill 42 ที่ tick ${world.tick}`)}}

function oneTick(){if(battleOver)return;const t0=performance.now(),s0=performance.now(),s=snapshot(world);profiler.snap=performance.now()-s0;const sp=buildSpatial(),move=movementProposal(s,sp),combat=combatProposal(s,sp);const k0=performance.now(),resolved=resolveConflicts([move,combat]),v=verify(world,resolved,{critical:false});if(!v.ok){pushLog('ERROR',v.errors.slice(0,2).join(', '));running=false;return}commit(world,resolved,{verifierResult:v});profiler.commit=performance.now()-k0;profiler.writes=resolved.writes.length;profiler.conflicts=resolved.conflicts.length;profiler.last=performance.now()-t0;const deaths=[];for(let i=0;i<count;i++)if(world.hp[i]<=0&&world.active[i]){deathFx.push({x:world.x[i],y:world.y[i],ttl:16});world.hp[i]=0;world.active[i]=0;targetId[i]=-1;hierarchy.battalions[battalionId[i]].losses++;deaths.push(i)}for(const d of deaths){const sq=hierarchy.squads[squadId[d]];for(let j=sq.start;j<sq.end;j++)if(alive(j)){morale[j]=Math.max(0,morale[j]-2);cohesion[j]=Math.max(0,cohesion[j]-1.5)}}activity.kills=deaths.length;if(deaths.length)pushLog('CONTACT',`${deaths.length} casualties • shots ${activity.shots} • hits ${activity.hits}`);updateHill();checkVictory();if(world.tick%25===0){const cs=companyStateSummary();pushLog('P4 AI',`FIREBASE ${cs[CO.FIREBASE]} • MANEUVER ${cs[CO.MANEUVER]} • RESERVE ${cs[CO.RESERVE]} • REINFORCE ${cs[CO.REINFORCE]}`)}updateHUD()}

function updateHUD(){if(!world)return;const b=teamStats(0),r=teamStats(1),half=count/2,rc=roleCounts(),cs=companyStateSummary();$('tick').textContent=world.tick.toLocaleString();$('entities').textContent=count.toLocaleString();$('alive').textContent=`${b.alive} / ${r.alive}`;$('tickMs').textContent=profiler.last.toFixed(2)+' ms';$('battlePhase').textContent=battlePhase;$('hash').textContent=String(stateHash(world)).slice(0,10);$('blueStrength').textContent=b.alive.toLocaleString();$('redStrength').textContent=r.alive.toLocaleString();$('blueBar').style.width=Math.max(0,b.alive/half*100)+'%';$('redBar').style.width=Math.max(0,r.alive/half*100)+'%';$('morale').textContent=`${b.morale.toFixed(1)} / ${r.morale.toFixed(1)}`;$('suppression').textContent=`${b.supp.toFixed(1)} / ${r.supp.toFixed(1)}`;$('cohesion').textContent=`${b.cohesion.toFixed(1)} / ${r.cohesion.toFixed(1)}`;$('hierarchy').textContent=`${hierarchy.battalions.length} BN • ${hierarchy.companies.length} CO • ${hierarchy.squads.length} SQ`;$('hillControl').textContent=battleOver?`${winner} VICTORY`:hillState();$('rRifle').textContent=rc[0];$('rLeader').textContent=rc[1];$('rMG').textContent=rc[2];$('rMedic').textContent=rc[3];$('rMarksman').textContent=rc[4];$('rScout').textContent=rc[5];$('rGrenadier').textContent=rc[6];$('rEngineer').textContent=rc[7];$('roleActivity').textContent=`Shots ${activity.shots} • Hit ${activity.hits} • Dmg ${activity.damage.toFixed(0)} • Company FB ${cs[CO.FIREBASE]} / MAN ${cs[CO.MANEUVER]} / RSV ${cs[CO.RESERVE]} / REINF ${cs[CO.REINFORCE]}`;$('pSnap').textContent=profiler.snap.toFixed(2);$('pSpatial').textContent=profiler.spatial.toFixed(2);$('pMove').textContent=profiler.move.toFixed(2);$('pCombat').textContent=profiler.combat.toFixed(2);$('pCommit').textContent=profiler.commit.toFixed(2);$('cells').textContent=profiler.cells;$('maxCell').textContent=profiler.maxCell;$('queries').textContent=profiler.queries.toLocaleString();$('candidates').textContent=profiler.candidates.toLocaleString();$('writes').textContent=profiler.writes.toLocaleString();$('conflicts').textContent=profiler.conflicts.toLocaleString()}

function draw(){if(!world)return;const w=canvas.width,h=canvas.height,sx=x=>(x+1)*.5*w,sy=y=>(y+1)*.5*h;ctx.clearRect(0,0,w,h);ctx.fillStyle='#0b1925';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#1e3447';for(let x=0;x<=10;x++){ctx.beginPath();ctx.moveTo(x*w/10,0);ctx.lineTo(x*w/10,h);ctx.stroke()}for(let y=0;y<=8;y++){ctx.beginPath();ctx.moveTo(0,y*h/8);ctx.lineTo(w,y*h/8);ctx.stroke()}
 for(const t of TERRAIN){ctx.fillStyle=t.name.includes('FOREST')||t.name==='WOOD'?'#294b36':'#5b4932';ctx.globalAlpha=.65;ctx.beginPath();ctx.arc(sx(t.x),sy(t.y),t.r*.5*w,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.fillStyle='#c9d8c5';ctx.font='11px system-ui';ctx.fillText(t.name,sx(t.x),sy(t.y))}
 ctx.fillStyle='#6c5934';ctx.beginPath();ctx.arc(sx(HILL.x),sy(HILL.y),HILL.r*.5*w,0,Math.PI*2);ctx.fill();ctx.fillStyle='#e4c677';ctx.font='bold 18px system-ui';ctx.textAlign='center';ctx.fillText('▲ HILL 42',sx(HILL.x),sy(HILL.y)+6);
 for(const co of hierarchy.companies){const st=companyStats(co);if(!st.alive)continue;ctx.strokeStyle=co.team===0?'#52bfff55':'#ff6b6b55';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(sx(st.x),sy(st.y));ctx.lineTo(sx(co.targetX),sy(co.targetY));ctx.stroke();ctx.setLineDash([])}
 for(const bn of hierarchy.battalions){const st=battalionStats(bn);if(!st.alive)continue;ctx.strokeStyle=bn.team===0?'#52bfff88':'#ff6b6b88';ctx.lineWidth=2;ctx.beginPath();ctx.arc(sx(st.x),sy(st.y),Math.max(27,Math.sqrt(st.alive)*2),0,Math.PI*2);ctx.stroke();ctx.fillStyle=bn.team===0?'#52bfff':'#ff6b6b';ctx.font='bold 11px system-ui';ctx.fillText(`${bn.team===0?'ATK':'DEF'} BN${bn.id} ${bn.order}`,sx(st.x),sy(st.y)-31)}
 const stride=count>=10000?14:count>=5000?8:count>=2400?5:2;for(let i=0;i<count;i+=stride)if(alive(i)){ctx.fillStyle=combatState[i]===STATE.PINNED?'#ffd166':world.team[i]===0?'#52bfff':'#ff6b6b';ctx.globalAlpha=.4+.6*Math.max(.2,world.hp[i]/100);ctx.fillRect(sx(world.x[i])-2,sy(world.y[i])-2,4,4)}ctx.globalAlpha=1;
 for(const f of combatFx){ctx.strokeStyle=f.hit?(f.kind==='mg'?'#ffb347':'#ffffffdd'):'#64727f55';ctx.beginPath();ctx.moveTo(sx(f.x1),sy(f.y1));ctx.lineTo(sx(f.x2)+(f.hit?0:5),sy(f.y2)+(f.hit?0:-5));ctx.stroke()}
 deathFx=deathFx.filter(d=>--d.ttl>0);for(const d of deathFx){ctx.strokeStyle='#ffdd88aa';const x=sx(d.x),y=sy(d.y);ctx.beginPath();ctx.moveTo(x-4,y-4);ctx.lineTo(x+4,y+4);ctx.moveTo(x+4,y-4);ctx.lineTo(x-4,y+4);ctx.stroke()}
 if(battleOver){ctx.fillStyle='#02060bcc';ctx.fillRect(0,0,w,h);ctx.fillStyle=winner==='BLUE'?'#52bfff':'#ff6b6b';ctx.font='bold 42px system-ui';ctx.fillText(`${winner} VICTORY`,w/2,h/2)}
}

function loop(now){const dt=now-last;last=now;if(running&&!benchRunning){acc+=dt*speed;let guard=0;while(acc>=TICK_MS&&guard<8){oneTick();acc-=TICK_MS;guard++}}draw();requestAnimationFrame(loop)}
$('pause').onclick=()=>{running=!running&&!battleOver;$('pause').textContent=running?'⏸ PAUSE':'▶ RESUME'};
$('speed').onclick=()=>{speed=speed===1?2:speed===2?4:speed===4?8:1;$('speed').textContent=`▶ ${speed}×`};
$('reset').onclick=()=>{running=true;init(count)};
$('scale').onclick=()=>{const sizes=[1200,2400,5000,10000],next=sizes[(sizes.indexOf(count)+1)%sizes.length];running=true;init(next);const after=sizes[(sizes.indexOf(next)+1)%sizes.length];$('scale').textContent=after===1200?'↩ 1,200 ENTITIES':`📈 ${after.toLocaleString()} ENTITIES`};
$('doctrine').onclick=()=>{doctrine=doctrine==='BALANCED'?'AGGRESSIVE':doctrine==='AGGRESSIVE'?'CAUTIOUS':'BALANCED';$('doctrine').textContent=`🧠 Doctrine: ${doctrine}`;pushLog('SCENARIO',`BLUE doctrine ${doctrine}`)};
$('bench').onclick=async()=>{if(benchRunning)return;benchRunning=true;const was=running;running=false,start=performance.now(),startTick=world.tick;for(let i=0;i<300&&!battleOver;i++){oneTick();if(i%20===0)await new Promise(r=>setTimeout(r,0))}const ticks=world.tick-startTick,ms=performance.now()-start,avg=ms/Math.max(1,ticks);pushLog('BENCH',`${ticks} ticks • avg ${avg.toFixed(2)} ms/tick`);running=was&&!battleOver;benchRunning=false;updateHUD()};

init();requestAnimationFrame(loop);
