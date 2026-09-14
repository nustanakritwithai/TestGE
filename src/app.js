import {createWorld,allEntities,stateHash,executeTick,snapshot,makeDamageProposal,resolveConflicts,verify,commit,computeExact,submitCommand,liveCount} from './twa-core.js';
import {createCheckpoint,restoreCheckpoint,rollback,replayStack,auditEntity,auditInputs,auditEvents,verifyReplayRoundTrip,rollbackToTick,historyStats} from './twa-history.js';
import {TWATaskGraph,executeParallelTick} from './twa-parallel.js';
import {researchArchive} from './skills.js';

const $=id=>document.getElementById(id);
let world=createWorld(),timer=null,lastMode='exact',checkpoint=null,redoStack=[],inFlight=false;
const taskGraph=new TWATaskGraph({workers:2});

function draw(){
  const c=$('view'),g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);g.fillStyle='#07111f';g.fillRect(0,0,c.width,c.height);
  g.strokeStyle='#16324a';for(let x=0;x<c.width;x+=40){g.beginPath();g.moveTo(x,0);g.lineTo(x,c.height);g.stroke()}for(let y=0;y<c.height;y+=40){g.beginPath();g.moveTo(0,y);g.lineTo(c.width,g.canvas.height);g.stroke()}
  for(const e of allEntities(world)){const x=(e.x+1)*.5*c.width,y=(e.y+1)*.5*c.height;g.beginPath();g.arc(x,y,Math.max(3,e.r*260),0,Math.PI*2);g.fillStyle=e.type==='player'?'#48c9ff':'#ff6b6b';g.fill()}
  $('tick').textContent=world.tick;$('version').textContent=world.worldVersion;$('hash').textContent=stateHash(world);$('events').textContent=world.events.length;$('liveEntities').textContent=liveCount(world);
  const lc=world.lastCommit;$('proposals').textContent=lc?.proposalCount??0;$('writes').textContent=lc?.writes??0;$('conflicts').textContent=lc?.conflicts??0;
  const hs=historyStats(world,redoStack);$('historyDepth').textContent=hs.commits;$('redoDepth').textContent=hs.redo;$('checkpointTick').textContent=checkpoint?checkpoint.tick:'—';$('historyWrites').textContent=hs.writes.toLocaleString();$('historyConflicts').textContent=hs.conflicts.toLocaleString();$('inputCount').textContent=hs.inputs;$('eventCount').textContent=hs.eventLog;
  if($('workerStatus'))$('workerStatus').textContent=taskGraph.supported?`${taskGraph.workerCount} Workers`:'Inline Fallback';
  renderDelta();renderAudit();renderTimeline();renderIO();
}
function reset(){stop();world=createWorld({seed:+$('seed').value,count:+$('count').value,density:+$('density').value,speed:+$('speed').value});checkpoint=null;redoStack=[];draw();$('log').textContent='สร้าง Canonical World + Input/Event streams ใหม่แล้ว';}
async function step(mode,forceParallel=null){
  if(inFlight)return;inFlight=true;lastMode=mode;
  try{
    const parallel=forceParallel??($('executionMode')?.value==='parallel');
    const t0=performance.now();
    const result=parallel?await executeParallelTick(world,{mode,critical:+$('critical').value>=3,taskGraph}):executeTick(world,{mode,critical:+$('critical').value>=3});
    const ms=performance.now()-t0;
    if(!result.ok){$('log').textContent=`BLOCKED: ${result.verification.errors.join(', ')}`;return;}
    redoStack=[];const fb=result.fallback?' • fallback Exact':'';
    const detail=parallel?` • workers ${result.workerCount} • compute ${result.computeMs.toFixed(3)} ms • commit ${result.commitMs.toFixed(3)} ms`:'';
    $('log').textContent=`${parallel?'PARALLEL':'SYNC'} ${mode.toUpperCase()} → ${result.commands.length} input → Proposal → Verify → Commit • ${ms.toFixed(3)} ms${detail}${fb}`;draw();
  }finally{inFlight=false;}
}
function injectDamage(){const s=snapshot(world),a=makeDamageProposal(s,{target:1,amount:17,source:0,cause:'TWA demo'}),b=makeDamageProposal(s,{target:1,amount:9,source:2,cause:'simultaneous hit'}),physics=computeExact(s),resolved=resolveConflicts([physics,a,b]),check=verify(world,resolved,{critical:true});if(!check.ok){$('log').textContent='Damage transaction blocked: '+check.errors.join(', ');return;}const rec=commit(world,resolved,{verifierResult:check});redoStack=[];$('log').textContent=`2 damage proposals รวมแบบ deterministic • conflicts=${rec.conflicts}`;draw();}
function queue(type,payload){const c=submitCommand(world,{type,payload,source:'ui'});$('log').textContent=`Input #${c.sequence} ${type} ถูกเข้าคิวสำหรับ Tick ${c.targetTick}`;draw();}
function queueSpawn(){queue('spawn',{x:(Math.random()-.5)*.6,y:(Math.random()-.5)*.6,vx:0.15,vy:-0.1,team:1,type:2,hp:100});}
function queueDespawn(){queue('despawn',{entity:+$('lifeEntity').value});}
function queueDamage(){queue('damage',{target:+$('lifeEntity').value,amount:+$('damageAmount').value,source:0,cause:'command-log'});}
function queueImpulse(){queue('impulse',{entity:+$('lifeEntity').value,dvx:.35,dvy:-.2});}
function play(){if(timer)return;const hz=+$('hz').value,delay=1000/hz;const loop=async()=>{if(!timer)return;await step(lastMode);if(timer)timer=setTimeout(loop,delay)};timer=setTimeout(loop,0);$('runState').textContent=`RUN ${hz} Hz`;}
function stop(){if(timer){clearTimeout(timer);timer=null}$('runState').textContent='STOP';}
function saveCheckpoint(){checkpoint=createCheckpoint(world,`tick-${world.tick}`);$('log').textContent=`Checkpoint Tick ${checkpoint.tick} • ${checkpoint.hash}`;draw();}
function loadCheckpoint(){stop();if(!checkpoint){$('log').textContent='ยังไม่มี Checkpoint';return;}restoreCheckpoint(world,checkpoint);redoStack=[];$('log').textContent=`Restore → Tick ${world.tick} • ${stateHash(world)}`;draw();}
function rollbackSteps(){stop();const undone=rollback(world,+$('rollbackSteps').value);if(!undone.length){$('log').textContent='ไม่มี Commit ให้ Rollback';return;}redoStack.push(...undone);$('log').textContent=`Rollback ${undone.length} commit → Tick ${world.tick}`;draw();}
function replaySteps(){stop();const applied=replayStack(world,redoStack,+$('rollbackSteps').value);$('log').textContent=applied.length?`Replay ${applied.length} commit → Tick ${world.tick}`:'Replay Queue ว่าง';draw();}
function replayAll(){stop();const applied=replayStack(world,redoStack,Infinity);$('log').textContent=applied.length?`Replay ทั้งหมด ${applied.length} commit`:'Replay Queue ว่าง';draw();}
function jumpToTick(){stop();const target=+$('targetTick').value;if(target>world.tick){$('log').textContent='Target Tick ต้องไม่เกิน Tick ปัจจุบัน';return;}const r=rollbackToTick(world,target);redoStack.push(...r.undone);$('log').textContent=`Time Travel → Tick ${r.reachedTick}`;draw();}
function roundTrip(){stop();const r=verifyReplayRoundTrip(world,+$('roundTripSteps').value);$('replayTest').textContent=r.ok?`PASS ${r.steps} steps • ${r.after||r.hash}`:`FAIL ${r.before} / ${r.after}`;$('replayTest').className=r.ok?'ok':'bad';draw();}
function benchmark(){const reps=+$('reps').value,seeds=+$('seeds').value,rows=[];for(const count of [128,512,1024])for(const mode of ['exact','approx']){const times=[];for(let s=0;s<seeds;s++)for(let r=0;r<reps;r++){const w=createWorld({seed:9000+s,count,density:.45,speed:1}),t0=performance.now();executeTick(w,{mode});times.push(performance.now()-t0);}times.sort((a,b)=>a-b);const p=x=>times[Math.floor((times.length-1)*x)];rows.push({count,mode,p50:p(.5),p95:p(.95),p99:p(.99)});}$('benchRows').innerHTML=rows.map(r=>`<tr><td>${r.count.toLocaleString()}</td><td>${r.mode}</td><td>${r.p50.toFixed(3)}</td><td>${r.p95.toFixed(3)}</td><td>${r.p99.toFixed(3)}</td></tr>`).join('');}
function determinism(){const cfg={seed:+$('seed').value,count:+$('count').value,density:+$('density').value,speed:+$('speed').value};const run=()=>{const w=createWorld(cfg);submitCommand(w,{type:'damage',payload:{target:1,amount:10}});submitCommand(w,{type:'spawn',payload:{x:.2,y:.2}});for(let i=0;i<120;i++)executeTick(w,{mode:'exact',critical:true});return stateHash(w)};const a=run(),b=run(),ok=a===b;$('determinism').textContent=ok?`PASS ${a}`:`FAIL ${a} / ${b}`;$('determinism').className=ok?'ok':'bad';}
async function parallelDeterminism(){stop();const cfg={seed:+$('seed').value,count:+$('count').value,density:+$('density').value,speed:+$('speed').value},a=createWorld(cfg),b=createWorld(cfg);submitCommand(a,{type:'damage',payload:{target:1,amount:10}});submitCommand(b,{type:'damage',payload:{target:1,amount:10}});submitCommand(a,{type:'spawn',payload:{x:.2,y:.2}});submitCommand(b,{type:'spawn',payload:{x:.2,y:.2}});for(let i=0;i<60;i++){const s=executeTick(a,{mode:'exact',critical:true}),p=await executeParallelTick(b,{mode:'exact',critical:true,taskGraph});if(!s.ok||!p.ok){$('parallelDet').textContent=`FAIL at ${i}`;$('parallelDet').className='bad';return;}}const ha=stateHash(a),hb=stateHash(b),ok=ha===hb;$('parallelDet').textContent=ok?`PASS ${ha}`:`FAIL ${ha} / ${hb}`;$('parallelDet').className=ok?'ok':'bad';$('log').textContent=ok?'Sync และ Parallel 60 ticks ให้ State Hash เดียวกัน':'Parallel determinism mismatch';}
function renderDelta(){const host=$('deltaLog'),recs=world.deltaLog.slice(-6).reverse();host.innerHTML=recs.length?recs.map(r=>`<div class="card"><b>Tick ${r.tick} → World v${r.worldVersion}</b><div class="muted">inputs ${(r.commands||[]).length} • proposals ${r.proposalCount} • deltas ${r.writes} • conflicts ${r.conflicts}</div>${r.delta.slice(0,6).map(d=>d.kind==='lifecycle'?`<div class="mono">E${d.entity} ${d.op.toUpperCase()} • ${d.systemId}</div>`:`<div class="mono">E${d.entity}.${d.field}: ${fmt(d.before)} → ${fmt(d.after)} • ${d.systemId}</div>`).join('')}</div>`).join(''):'<div class="muted">ยังไม่มี Commit Delta</div>';}
function renderAudit(){const e=Math.max(0,Math.min(world.count-1,+$('auditEntity').value)),rows=auditEntity(world,e,20);$('auditLog').innerHTML=rows.length?rows.map(d=>`<div class="mono">T${d.tick} • E${d.entity}.${d.field} • ${d.kind==='lifecycle'?'lifecycle':`${fmt(d.before)} → ${fmt(d.after)}`} • ${d.systemId}</div>`).join(''):'<div class="muted">ยังไม่มีประวัติ Entity นี้</div>';}
function renderIO(){const ins=auditInputs(world,12),evs=auditEvents(world,16);$('inputLog').innerHTML=ins.length?ins.map(x=>`<div class="mono">#${x.sequence} T${x.targetTick} ${x.type} ${JSON.stringify(x.payload)}</div>`).join(''):'<div class="muted">ยังไม่มี Input</div>';$('eventLog').innerHTML=evs.length?evs.map(x=>`<div class="mono">T${x.tick} ${x.type} ${x.entity!==undefined?'E'+x.entity:''}</div>`).join(''):'<div class="muted">ยังไม่มี Event</div>';}
function renderTimeline(){const host=$('timeline'),items=world.deltaLog.slice(-20);host.innerHTML=items.length?items.map(r=>`<button class="tickBtn" data-tick="${r.tick}">T${r.tick}</button>`).join(''):'<span class="muted">ยังไม่มี Timeline</span>';host.querySelectorAll('.tickBtn').forEach(b=>b.onclick=()=>{$('targetTick').value=b.dataset.tick;jumpToTick();});}
function fmt(v){return typeof v==='number'?Number(v).toFixed(3):String(v)}
function renderArchive(){$('archive').innerHTML=researchArchive.map(x=>`<div class="card"><b>${x.id}</b> — <span class="bad">${x.status}</span><div class="muted">${x.reason}</div></div>`).join('');}

$('reset').onclick=reset;$('stepExact').onclick=()=>step('exact');$('stepApprox').onclick=()=>step('approx');$('injectDamage').onclick=injectDamage;$('play').onclick=play;$('stop').onclick=stop;$('runBench').onclick=benchmark;$('runDet').onclick=determinism;$('saveCheckpoint').onclick=saveCheckpoint;$('loadCheckpoint').onclick=loadCheckpoint;$('rollbackStepsBtn').onclick=rollbackSteps;$('replayStepsBtn').onclick=replaySteps;$('replayAll').onclick=replayAll;$('jumpToTick').onclick=jumpToTick;$('roundTrip').onclick=roundTrip;$('auditEntity').oninput=renderAudit;$('queueSpawn').onclick=queueSpawn;$('queueDespawn').onclick=queueDespawn;$('queueDamage').onclick=queueDamage;$('queueImpulse').onclick=queueImpulse;$('parallelDetBtn').onclick=parallelDeterminism;
renderArchive();reset();
