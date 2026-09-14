import {createEngine} from './twa-engine.js';

function result(name,ok,detail=''){return {name,ok,detail}}

export async function runRegressionSuite({parallel=true}={}){
  const rows=[];

  // 1) deterministic sync runs
  const runHash=async()=>{const e=createEngine({seed:1337,count:64});e.submit('damage',{target:1,amount:12});e.submit('spawn',{x:.2,y:-.1});for(let i=0;i<120;i++)await e.step({parallel:false,critical:true});const h=e.hash;e.destroy();return h};
  const h1=await runHash(),h2=await runHash();
  rows.push(result('Determinism 120 ticks',h1===h2,`${h1} / ${h2}`));

  // 2) rollback/replay round-trip
  const e2=createEngine({seed:7,count:48});
  for(let i=0;i<40;i++)await e2.step({parallel:false});
  const before=e2.hash,undone=e2.rollback(20);e2.replay(20);const after=e2.hash;
  rows.push(result('Rollback → Replay hash',before===after,`${undone.length} commits • ${before} / ${after}`));
  e2.destroy();

  // 3) lifecycle + generation
  const e3=createEngine({seed:9,count:16});
  const live0=e3.liveEntities;e3.submit('spawn',{x:.1,y:.1});await e3.step({parallel:false});const live1=e3.liveEntities;e3.submit('despawn',{entity:1});await e3.step({parallel:false});const live2=e3.liveEntities;
  rows.push(result('Transactional lifecycle',live1===live0+1&&live2===live0,`${live0} → ${live1} → ${live2}`));
  e3.destroy();

  // 4) delta replication
  const e4=createEngine({seed:11,count:40});e4.createClient('r1',{mode:'all'});const boot=e4.bootstrapClient('r1');await e4.step({parallel:false});const rep=e4.replicateLatest('r1');
  rows.push(result('Delta replication authority match',boot.verify.ok&&rep.applied.ok&&rep.verify.ok,rep.verify.ok?`v${e4.version} • ${rep.stats.bytes} bytes`:(rep.verify.errors||[]).join(',')));
  e4.destroy();

  // 5) sync vs parallel equivalence (where Worker is available)
  if(parallel && typeof Worker!=='undefined'){
    const a=createEngine({seed:21,count:48}),b=createEngine({seed:21,count:48});
    a.submit('damage',{target:1,amount:5});b.submit('damage',{target:1,amount:5});
    let ok=true,detail='';
    try{for(let i=0;i<30;i++){await a.step({parallel:false,critical:true});await b.step({parallel:true,critical:true});}ok=a.hash===b.hash;detail=`${a.hash} / ${b.hash}`;}catch(err){ok=false;detail=String(err?.message||err)}
    rows.push(result('Sync = Parallel state hash',ok,detail));a.destroy();b.destroy();
  }else rows.push(result('Sync = Parallel state hash',true,'SKIP: Worker unavailable'));

  // 6) public API smoke
  const e5=createEngine({seed:3,count:8});const cp=e5.checkpoint('start');e5.submit('impulse',{entity:0,dvx:.1,dvy:0});const s=await e5.step({parallel:false});e5.restore(cp);
  rows.push(result('Public Engine API smoke',s.ok&&e5.tick===0&&e5.version===0,`step=${s.ok} restoreTick=${e5.tick}`));e5.destroy();

  return {ok:rows.every(r=>r.ok),passed:rows.filter(r=>r.ok).length,total:rows.length,rows};
}
