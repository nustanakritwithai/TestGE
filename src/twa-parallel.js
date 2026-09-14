import {snapshot,drainCommands,resolveConflicts,verify,commit,computeExact,computeApprox,proposalsFromCommands} from './twa-core.js';

class WorkerSlot{
  constructor(url){
    this.worker=new Worker(url,{type:'module'});
    this.seq=1;this.pending=new Map();
    this.worker.onmessage=(ev)=>{const m=ev.data||{},p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);m.ok?p.resolve(m.result):p.reject(new Error(m.error||'Worker task failed'));};
    this.worker.onerror=(e)=>{for(const p of this.pending.values())p.reject(e.error||new Error(e.message));this.pending.clear();};
  }
  run(task,snapshotView,commands=[]){
    const id=this.seq++;
    return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.worker.postMessage({id,task,snapshot:snapshotView,commands});});
  }
  terminate(){this.worker.terminate();this.pending.clear();}
}

export class TWATaskGraph{
  constructor({workers=2}={}){
    this.supported=typeof Worker!=='undefined';
    this.workerCount=Math.max(1,Math.floor(workers));
    this.slots=[];this.next=0;
    if(this.supported){const url=new URL('./twa-worker.js',import.meta.url);for(let i=0;i<this.workerCount;i++)this.slots.push(new WorkerSlot(url));}
  }
  run(task,s,commands=[]){
    if(!this.supported){
      if(task==='physics-exact')return Promise.resolve(computeExact(s));
      if(task==='physics-approx')return Promise.resolve(computeApprox(s));
      if(task==='commands')return Promise.resolve(proposalsFromCommands(s,commands));
      return Promise.reject(new Error(`Unknown task ${task}`));
    }
    const slot=this.slots[this.next++%this.slots.length];return slot.run(task,s,commands);
  }
  close(){for(const s of this.slots)s.terminate();this.slots=[];}
}

export async function executeParallelTick(world,{mode='exact',critical=false,taskGraph,extraProposals=[]}={}){
  const graph=taskGraph||new TWATaskGraph({workers:2});
  const s=snapshot(world),commands=drainCommands(world,s.tick),physicsTask=mode==='approx'?'physics-approx':'physics-exact';
  const t0=performance.now();
  const [physics,commandProposals]=await Promise.all([
    graph.run(physicsTask,s),
    graph.run('commands',s,commands)
  ]);
  const computeMs=performance.now()-t0;
  let resolved=resolveConflicts([physics,...commandProposals,...extraProposals]);
  let check=verify(world,resolved,{critical});
  let fallback=false;
  if(!check.ok&&mode!=='exact'){
    fallback=true;
    const exact=await graph.run('physics-exact',snapshot(world));
    resolved=resolveConflicts([exact,...commandProposals,...extraProposals]);
    check=verify(world,resolved,{critical:true});
  }
  if(!check.ok)return {ok:false,fallback,verification:check,resolved,commands,computeMs,workerCount:graph.workerCount};
  const t1=performance.now();
  const record=commit(world,resolved,{verifierResult:check,commands});
  const commitMs=performance.now()-t1;
  return {ok:true,fallback,verification:check,resolved,record,commands,computeMs,commitMs,workerCount:graph.workerCount};
}

export async function compareParallelDeterminism(createWorldFn,executeSync,{config={},ticks=60,mode='exact',workers=2}={}){
  const a=createWorldFn(config),b=createWorldFn(config),graph=new TWATaskGraph({workers});
  try{
    for(let i=0;i<ticks;i++){
      const sa=executeSync(a,{mode,critical:true});if(!sa.ok)return {ok:false,reason:'sync failed',tick:i};
      const pb=await executeParallelTick(b,{mode,critical:true,taskGraph:graph});if(!pb.ok)return {ok:false,reason:'parallel failed',tick:i};
    }
    return {ok:true,a,b};
  }finally{graph.close();}
}
