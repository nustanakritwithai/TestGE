import {createWorld,allEntities,stateHash,executeTick,snapshot,makeDamageProposal,resolveConflicts,verify,commit,computeExact} from './twa-core.js';
import {createCheckpoint,restoreCheckpoint,rollback,replayRecord,auditEntity,verifyReplayRoundTrip} from './twa-history.js';
import {researchArchive} from './skills.js';

const $=id=>document.getElementById(id);
let world=createWorld(),timer=null,lastMode='exact',checkpoint=null,redoStack=[];

function draw(){
  const c=$('view'),g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);g.fillStyle='#07111f';g.fillRect(0,0,c.width,c.height);
  g.strokeStyle='#16324a';for(let x=0;x<c.width;x+=40){g.beginPath();g.moveTo(x,0);g.lineTo(x,c.height);g.stroke()}for(let y=0;y<c.height;y+=40){g.beginPath();g.moveTo(0,y);g.lineTo(c.width,y);g.stroke()}
  for(const e of allEntities(world)){const x=(e.x+1)*.5*c.width,y=(e.y+1)*.5*c.height;g.beginPath();g.arc(x,y,Math.max(3,e.r*260),0,Math.PI*2);g.fillStyle=e.type==='player'?'#48c9ff':'#ff6b6b';g.fill()}
  $('tick').textContent=world.tick;$('version').textContent=world.worldVersion;$('hash').textContent=stateHash(world);$('events').textContent=world.events.length;
  const lc=world.lastCommit;$('proposals').textContent=lc?.proposalCount??0;$('writes').textContent=lc?.writes??0;$('conflicts').textContent=lc?.conflicts??0;
  if($('historyDepth'))$('historyDepth').textContent=world.deltaLog.length;if($('redoDepth'))$('redoDepth').textContent=redoStack.length;if($('checkpointTick'))$('checkpointTick').textContent=checkpoint?checkpoint.tick:'—';
  renderDelta();renderAudit();
}
function reset(){stop();world=createWorld({seed:+$('seed').value,count:+$('count').value,density:+$('density').value,speed:+$('speed').value});checkpoint=null;redoStack=[];draw();$('log').textContent='สร้าง Canonical World + Snapshot baseline แล้ว';}
function step(mode){lastMode=mode;const t0=performance.now();const result=executeTick(world,{mode,critical:+$('critical').value>=3});const ms=performance.now()-t0;if(!result.ok){$('log').textContent=`BLOCKED: ${result.verification.errors.join(', ')}`;return;}redoStack=[];const fb=result.fallback?' • fallback Exact':'';$('log').textContent=`${mode.toUpperCase()} → Proposal → Resolve → Verify → Commit • ${ms.toFixed(3)} ms${fb}`;draw();}
function injectDamage(){const s=snapshot(world),a=makeDamageProposal(s,{target:1,amount:17,source:0,cause:'TWA demo'}),b=makeDamageProposal(s,{target:1,amount:9,source:2,cause:'simultaneous hit'}),physics=computeExact(s),resolved=resolveConflicts([physics,a,b]),check=verify(world,resolved,{critical:true});if(!check.ok){$('log').textContent='Damage transaction blocked: '+check.errors.join(', ');return;}const rec=commit(world,resolved,{verifierResult:check});redoStack=[];$('log').textContent=`Transaction demo: 2 damage proposals combine แบบ deterministic • conflicts=${rec.conflicts}`;draw();}
function play(){if(timer)return;const hz=+$('hz').value;timer=setInterval(()=>step(lastMode),1000/hz);$('runState').textContent=`RUN ${hz} Hz`;}
function stop(){if(timer){clearInterval(timer);timer=null}$('runState').textContent='STOP';}
function saveCheckpoint(){checkpoint=createCheckpoint(world,`tick-${world.tick}`);$('log').textContent=`Checkpoint บันทึกที่ Tick ${checkpoint.tick} • ${checkpoint.hash}`;draw();}
function loadCheckpoint(){stop();if(!checkpoint){$('log').textContent='ยังไม่มี Checkpoint';return;}restoreCheckpoint(world,checkpoint);redoStack=[];$('log').textContent=`Restore Checkpoint → Tick ${world.tick} • hash ${stateHash(world)}`;draw();}
function rollbackOne(){stop();const undone=rollback(world,1);if(!undone.length){$('log').textContent='ไม่มี Commit ให้ Rollback';return;}redoStack.push(undone[0]);$('log').textContent=`Rollback → Tick ${world.tick} • เก็บ 1 commit ไว้สำหรับ Replay`;draw();}
function replayOne(){stop();const rec=redoStack.pop();if(!rec){$('log').textContent='ไม่มี Commit ที่ Rollback ไว้ให้ Replay';return;}replayRecord(world,rec);$('log').textContent=`Replay Commit Tick ${rec.tick} → Tick ${world.tick}`;draw();}
function roundTrip(){stop();const r=verifyReplayRoundTrip(world);$('replayTest').textContent=r.ok?`PASS ${r.after||r.hash}`:`FAIL ${r.before} / ${r.after}`;$('replayTest').className=r.ok?'ok':'bad';$('log').textContent=r.ok?'Rollback + Replay ให้ State Hash เดิม':'Replay round-trip ไม่ตรง';draw();}
function benchmark(){const reps=+$('reps').value,seeds=+$('seeds').value,rows=[];for(const count of [128,512,1024])for(const mode of ['exact','approx']){const times=[];for(let s=0;s<seeds;s++)for(let r=0;r<reps;r++){const w=createWorld({seed:9000+s,count,density:.45,speed:1}),t0=performance.now();executeTick(w,{mode,critical:false});times.push(performance.now()-t0);}times.sort((a,b)=>a-b);const p=x=>times[Math.floor((times.length-1)*x)];rows.push({count,mode,p50:p(.5),p95:p(.95),p99:p(.99)});} $('benchRows').innerHTML=rows.map(r=>`<tr><td>${r.count.toLocaleString()}</td><td>${r.mode}</td><td>${r.p50.toFixed(3)}</td><td>${r.p95.toFixed(3)}</td><td>${r.p99.toFixed(3)}</td></tr>`).join('');}
function determinism(){const cfg={seed:+$('seed').value,count:+$('count').value,density:+$('density').value,speed:+$('speed').value};const run=()=>{const w=createWorld(cfg);for(let i=0;i<120;i++)executeTick(w,{mode:'exact',critical:true});return stateHash(w)};const a=run(),b=run(),ok=a===b;$('determinism').textContent=ok?`PASS ${a}`:`FAIL ${a} / ${b}`;$('determinism').className=ok?'ok':'bad';}
function renderDelta(){const host=$('deltaLog');if(!host)return;const recs=world.deltaLog.slice(-6).reverse();host.innerHTML=recs.length?recs.map(r=>`<div class="card"><b>Tick ${r.tick} → World v${r.worldVersion}</b><div class="muted">proposals ${r.proposalCount} • writes ${r.writes} • conflicts ${r.conflicts} • events ${r.events.length}</div>${r.delta.slice(0,5).map(d=>`<div class="mono">E${d.entity}.${d.field}: ${fmt(d.before)} → ${fmt(d.after)} | ${d.systemId}</div>`).join('')}</div>`).join(''):'<div class="muted">ยังไม่มี Commit Delta</div>'}
function renderAudit(){const host=$('auditLog');if(!host)return;const e=Math.max(0,Math.min(world.count-1,+($('auditEntity')?.value||0))),rows=auditEntity(world,e,20);host.innerHTML=rows.length?rows.map(d=>`<div class="mono">T${d.tick} • E${d.entity}.${d.field}: ${fmt(d.before)} → ${fmt(d.after)} • ${d.systemId}</div>`).join(''):'<div class="muted">ยังไม่มีประวัติของ Entity นี้</div>'}
function fmt(v){return typeof v==='number'?Number(v).toFixed(3):String(v)}
function renderArchive(){$('archive').innerHTML=researchArchive.map(x=>`<div class="card"><b>${x.id}</b> — <span class="bad">${x.status}</span><div class="muted">${x.reason}</div></div>`).join('');}

$('reset').onclick=reset;$('stepExact').onclick=()=>step('exact');$('stepApprox').onclick=()=>step('approx');$('injectDamage').onclick=injectDamage;$('play').onclick=play;$('stop').onclick=stop;$('runBench').onclick=benchmark;$('runDet').onclick=determinism;
$('saveCheckpoint').onclick=saveCheckpoint;$('loadCheckpoint').onclick=loadCheckpoint;$('rollbackOne').onclick=rollbackOne;$('replayOne').onclick=replayOne;$('roundTrip').onclick=roundTrip;$('auditEntity').oninput=renderAudit;
renderArchive();reset();
