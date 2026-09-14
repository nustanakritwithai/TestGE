import {stateHash} from './twa-core.js';

const ARRAY_FIELDS=['id','generation','version','type','active','team','x','y','vx','vy','radius','mass','hp'];

export function createCheckpoint(world,label='manual'){
  const arrays={};
  for(const f of ARRAY_FIELDS) arrays[f]=world[f].slice();
  return {
    label,
    tick:world.tick,
    worldVersion:world.worldVersion,
    count:world.count,
    capacity:world.capacity,
    seed:world.seed,
    dt:world.dt,
    parameters:{...world.parameters},
    arrays,
    hash:stateHash(world),
    createdAt:new Date().toISOString()
  };
}

export function restoreCheckpoint(world,cp){
  if(!cp||!cp.arrays) throw new Error('Invalid checkpoint');
  if(world.capacity!==cp.capacity||world.count!==cp.count) throw new Error('Checkpoint shape mismatch');
  for(const f of ARRAY_FIELDS) world[f].set(cp.arrays[f]);
  world.tick=cp.tick;
  world.worldVersion=cp.worldVersion;
  world.events=[];
  world.lastCommit=null;
  world.deltaLog=[];
  return {tick:world.tick,worldVersion:world.worldVersion,hash:stateHash(world)};
}

function applyDelta(world,direction,record){
  const list=direction==='forward'?record.delta:[...record.delta].reverse();
  for(const d of list){
    const value=direction==='forward'?d.after:d.before;
    world[d.field][d.entity]=value;
    if(direction==='forward') world.version[d.entity]++;
    else if(world.version[d.entity]>0) world.version[d.entity]--;
  }
}

export function rollbackOne(world){
  const record=world.deltaLog.pop();
  if(!record) return null;
  applyDelta(world,'backward',record);
  world.tick=Math.max(0,world.tick-1);
  world.worldVersion=Math.max(0,world.worldVersion-1);
  world.events=world.deltaLog.length?world.deltaLog[world.deltaLog.length-1].events||[]:[];
  world.lastCommit=world.deltaLog.length?world.deltaLog[world.deltaLog.length-1]:null;
  return record;
}

export function rollback(world,steps=1){
  const undone=[];
  for(let i=0;i<steps;i++){
    const r=rollbackOne(world);
    if(!r) break;
    undone.push(r);
  }
  return undone;
}

export function replayRecord(world,record){
  if(!record) return null;
  applyDelta(world,'forward',record);
  world.tick++;
  world.worldVersion++;
  world.events=record.events||[];
  world.lastCommit=record;
  world.deltaLog.push(record);
  if(world.deltaLog.length>256) world.deltaLog.shift();
  return record;
}

export function replayMany(world,records=[]){
  const applied=[];
  for(const r of records){replayRecord(world,r);applied.push(r)}
  return applied;
}

export function auditEntity(world,entity,limit=30){
  const rows=[];
  for(let i=world.deltaLog.length-1;i>=0&&rows.length<limit;i--){
    const rec=world.deltaLog[i];
    for(const d of rec.delta){
      if(d.entity!==entity) continue;
      rows.push({tick:rec.tick,worldVersion:rec.worldVersion,entity,field:d.field,before:d.before,after:d.after,systemId:d.systemId,proposalId:d.proposalId});
      if(rows.length>=limit) break;
    }
  }
  return rows;
}

export function verifyReplayRoundTrip(world){
  if(!world.deltaLog.length) return {ok:true,reason:'no history',hash:stateHash(world)};
  const before=stateHash(world);
  const rec=rollbackOne(world);
  if(!rec) return {ok:false,reason:'rollback failed'};
  replayRecord(world,rec);
  const after=stateHash(world);
  return {ok:before===after,before,after,recordTick:rec.tick};
}
