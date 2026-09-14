const REPL_FIELDS=['id','generation','type','active','team','x','y','vx','vy','radius','mass','hp','version'];

function inInterestXY(x,y,interest){
  if(!interest||interest.mode==='all')return true;
  const cx=Number(interest.x||0),cy=Number(interest.y||0),r=Math.max(0,Number(interest.radius??1));
  const dx=Number(x)-cx,dy=Number(y)-cy;return dx*dx+dy*dy<=r*r;
}

export function entitySnapshot(world,e){
  const out={};for(const f of REPL_FIELDS)out[f]=Number(world[f][e]);return out;
}

export function entityRelevant(world,e,interest){
  return e>=0&&e<world.count&&!!world.active[e]&&inInterestXY(world.x[e],world.y[e],interest);
}

export function createReplicationSession({clientId='client-1',interest={mode:'radius',x:0,y:0,radius:.75}}={}){
  return {clientId,interest:{...interest},known:new Set(),lastWorldVersion:0,packets:0,bytes:0,deltas:0,fullStates:0,leaves:0};
}

export function setInterest(session,interest){session.interest={...interest};return session;}

export function createBootstrapPacket(world,session){
  const entities=[];session.known.clear();
  for(let e=0;e<world.count;e++)if(entityRelevant(world,e,session.interest)){entities.push(entitySnapshot(world,e));session.known.add(e);}
  const packet={protocol:'twa-delta-v1',kind:'bootstrap',clientId:session.clientId,tick:world.tick,worldVersion:world.worldVersion,interest:{...session.interest},entities};
  const encoded=JSON.stringify(packet);packet.bytes=new TextEncoder().encode(encoded).byteLength;session.lastWorldVersion=world.worldVersion;session.packets++;session.bytes+=packet.bytes;session.fullStates+=entities.length;return packet;
}

function currentRelevantSet(world,interest){const s=new Set();for(let e=0;e<world.count;e++)if(entityRelevant(world,e,interest))s.add(e);return s;}

export function createDeltaPacket(world,record,session){
  if(!record)return null;
  const relevant=currentRelevantSet(world,session.interest),ops=[],knownBefore=new Set(session.known);
  for(const e of knownBefore)if(!relevant.has(e))ops.push({op:'leave',entity:e});
  for(const e of relevant)if(!knownBefore.has(e))ops.push({op:'upsert',entity:e,state:entitySnapshot(world,e)});
  const fresh=new Set(ops.filter(x=>x.op==='upsert').map(x=>x.entity));
  for(const d of record.delta||[]){
    const e=d.entity;if(!relevant.has(e)||fresh.has(e))continue;
    if(d.kind==='lifecycle'){
      if(d.op==='despawn')ops.push({op:'leave',entity:e});
      else if(d.op==='spawn')ops.push({op:'upsert',entity:e,state:entitySnapshot(world,e)});
    }else ops.push({op:'set',entity:e,field:d.field,value:d.after,generation:Number(world.generation[e]),version:Number(world.version[e])});
  }
  session.known=relevant;
  const eventEntity=e=>Number.isInteger(e?.entity)?e.entity:(Number.isInteger(e?.target)?e.target:null);
  const events=(record.events||[]).filter(ev=>{const e=eventEntity(ev);return e===null||relevant.has(e)});
  const packet={protocol:'twa-delta-v1',kind:'delta',clientId:session.clientId,baseWorldVersion:session.lastWorldVersion,tick:record.tick,worldVersion:record.worldVersion,ops,events};
  const encoded=JSON.stringify(packet);packet.bytes=new TextEncoder().encode(encoded).byteLength;
  session.lastWorldVersion=record.worldVersion;session.packets++;session.bytes+=packet.bytes;session.deltas+=ops.filter(x=>x.op==='set').length;session.fullStates+=ops.filter(x=>x.op==='upsert').length;session.leaves+=ops.filter(x=>x.op==='leave').length;
  return packet;
}

export function createClientReplica(clientId='client-1'){
  return {clientId,worldVersion:0,tick:0,entities:new Map(),packets:0,bytes:0,lastPacket:null};
}

export function applyReplicationPacket(replica,packet){
  if(!packet)return {ok:false,reason:'no packet'};
  if(packet.clientId!==replica.clientId)return {ok:false,reason:'client mismatch'};
  if(packet.kind==='bootstrap'){
    replica.entities.clear();for(const s of packet.entities||[])replica.entities.set(s.id,{...s});
  }else if(packet.kind==='delta'){
    if(packet.baseWorldVersion!==replica.worldVersion)return {ok:false,reason:`version gap ${replica.worldVersion} -> ${packet.baseWorldVersion}`};
    for(const op of packet.ops||[]){
      if(op.op==='leave')replica.entities.delete(op.entity);
      else if(op.op==='upsert')replica.entities.set(op.entity,{...op.state});
      else if(op.op==='set'){
        const cur=replica.entities.get(op.entity);if(!cur)return {ok:false,reason:`missing entity ${op.entity}`};cur[op.field]=op.value;cur.generation=op.generation;cur.version=op.version;
      }
    }
  }
  replica.worldVersion=packet.worldVersion;replica.tick=packet.kind==='bootstrap'?packet.tick:packet.tick+1;replica.packets++;replica.bytes+=packet.bytes||0;replica.lastPacket=packet;return {ok:true};
}

export function verifyReplica(world,replica,session){
  const expected=currentRelevantSet(world,session.interest),errors=[];
  for(const e of expected){const r=replica.entities.get(e);if(!r){errors.push(`missing ${e}`);continue;}for(const f of REPL_FIELDS){const a=Number(world[f][e]),b=Number(r[f]);if(Number.isFinite(a)&&Math.abs(a-b)>1e-9){errors.push(`E${e}.${f}`);break;}}}
  for(const e of replica.entities.keys())if(!expected.has(e))errors.push(`stale ${e}`);
  return {ok:errors.length===0,errors,expected:expected.size,actual:replica.entities.size};
}

export function replicationStats(session,replica){return {packets:session.packets,bytes:session.bytes,deltas:session.deltas,fullStates:session.fullStates,leaves:session.leaves,clientEntities:replica.entities.size,lastWorldVersion:replica.worldVersion};}
