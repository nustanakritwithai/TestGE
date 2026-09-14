import {stateHash,ARRAY_FIELDS,ensureCapacity} from './twa-core.js';

export function createCheckpoint(world,label='manual'){
  const arrays={};for(const f of ARRAY_FIELDS)arrays[f]=world[f].slice();
  return {label,tick:world.tick,worldVersion:world.worldVersion,count:world.count,capacity:world.capacity,seed:world.seed,dt:world.dt,parameters:{...world.parameters},arrays,hash:stateHash(world),inputLog:world.inputLog.map(x=>({...x,payload:{...x.payload}})),eventLog:world.eventLog.map(x=>({...x})),pendingInputs:world.pendingInputs.map(x=>({...x,payload:{...x.payload}})),nextInputSequence:world.nextInputSequence,createdAt:new Date().toISOString()};
}

export function restoreCheckpoint(world,cp,{clearHistory=true}={}){
  if(!cp||!cp.arrays)throw new Error('Invalid checkpoint');ensureCapacity(world,cp.capacity);world.count=cp.count;
  for(const f of ARRAY_FIELDS){world[f].fill(0);world[f].set(cp.arrays[f]);}
  world.tick=cp.tick;world.worldVersion=cp.worldVersion;world.seed=cp.seed;world.dt=cp.dt;world.parameters={...cp.parameters};world.events=[];world.lastCommit=null;
  world.inputLog=(cp.inputLog||[]).map(x=>({...x,payload:{...x.payload}}));world.eventLog=(cp.eventLog||[]).map(x=>({...x}));world.pendingInputs=(cp.pendingInputs||[]).map(x=>({...x,payload:{...x.payload}}));world.nextInputSequence=cp.nextInputSequence||1;if(clearHistory)world.deltaLog=[];
  return {tick:world.tick,worldVersion:world.worldVersion,hash:stateHash(world)};
}

function setEntityState(world,e,s){ensureCapacity(world,e+1);if(e>=world.count)world.count=e+1;for(const f of ARRAY_FIELDS)world[f][e]=s[f]??0}
function applyDelta(world,direction,record){
  const list=direction==='forward'?record.delta:[...record.delta].reverse();
  for(const d of list){
    if(d.kind==='lifecycle'){setEntityState(world,d.entity,direction==='forward'?d.after:d.before);continue;}
    const value=direction==='forward'?d.after:d.before;world[d.field][d.entity]=value;
    if(direction==='forward')world.version[d.entity]++;else if(world.version[d.entity]>0)world.version[d.entity]--;
  }
}

export function rollbackOne(world){
  const record=world.deltaLog.pop();if(!record)return null;applyDelta(world,'backward',record);world.tick=Math.max(0,world.tick-1);world.worldVersion=Math.max(0,world.worldVersion-1);
  if(record.events?.length)world.eventLog.splice(Math.max(0,world.eventLog.length-record.events.length),record.events.length);
  world.events=world.deltaLog.length?world.deltaLog[world.deltaLog.length-1].events||[]:[];world.lastCommit=world.deltaLog.length?world.deltaLog[world.deltaLog.length-1]:null;return record;
}
export function rollback(world,steps=1){const undone=[];for(let i=0;i<steps;i++){const r=rollbackOne(world);if(!r)break;undone.push(r);}return undone}
export function rollbackToTick(world,targetTick){const target=Math.max(0,Math.floor(targetTick)),undone=[];while(world.tick>target&&world.deltaLog.length){const r=rollbackOne(world);if(!r)break;undone.push(r);}return {targetTick:target,reachedTick:world.tick,undone}}

export function replayRecord(world,record){
  if(!record)return null;applyDelta(world,'forward',record);world.tick++;world.worldVersion++;world.events=(record.events||[]).map(x=>({...x}));world.eventLog.push(...world.events.map(x=>({...x})));world.lastCommit=record;world.deltaLog.push(record);if(world.deltaLog.length>4096)world.deltaLog.shift();return record;
}
export function replayMany(world,records=[]){const applied=[];for(const r of records){replayRecord(world,r);applied.push(r)}return applied}
export function replayStack(world,redoStack=[],steps=Infinity){const applied=[],n=Math.min(redoStack.length,Number.isFinite(steps)?Math.max(0,Math.floor(steps)):redoStack.length);for(let i=0;i<n;i++){const rec=redoStack.pop();if(!rec)break;replayRecord(world,rec);applied.push(rec);}return applied}

export function auditEntity(world,entity,limit=30){const rows=[];for(let i=world.deltaLog.length-1;i>=0&&rows.length<limit;i--){const rec=world.deltaLog[i];for(const d of rec.delta){if(d.entity!==entity)continue;rows.push({tick:rec.tick,worldVersion:rec.worldVersion,entity,field:d.kind==='lifecycle'?d.op:d.field,before:d.before,after:d.after,systemId:d.systemId,proposalId:d.proposalId,kind:d.kind||'write'});if(rows.length>=limit)break;}}return rows}
export function auditInputs(world,limit=30){return world.inputLog.slice(-limit).reverse()}
export function auditEvents(world,limit=50){return world.eventLog.slice(-limit).reverse()}

export function verifyReplayRoundTrip(world,steps=1){const n=Math.max(1,Math.floor(steps));if(!world.deltaLog.length)return {ok:true,reason:'no history',hash:stateHash(world),steps:0};const before=stateHash(world),beforeTick=world.tick,undone=rollback(world,n),replayOrder=[...undone].reverse();replayMany(world,replayOrder);const after=stateHash(world);return {ok:before===after,before,after,beforeTick,afterTick:world.tick,steps:undone.length}}
export function historyStats(world,redoStack=[]){const commits=world.deltaLog.length;let writes=0,events=0,conflicts=0,lifecycle=0;for(const r of world.deltaLog){writes+=r.writes||0;events+=(r.events||[]).length;conflicts+=r.conflicts||0;lifecycle+=(r.delta||[]).filter(x=>x.kind==='lifecycle').length;}return {commits,writes,events,conflicts,lifecycle,redo:redoStack.length,tick:world.tick,worldVersion:world.worldVersion,inputs:world.inputLog.length,eventLog:world.eventLog.length}}
