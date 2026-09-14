export const DT = 1/60;
const ARRAY_FIELDS=['id','generation','version','type','active','team','x','y','vx','vy','radius','mass','hp'];

export function mulberry32(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function allocArrays(cap){return {
  id:new Uint32Array(cap),generation:new Uint32Array(cap),version:new Uint32Array(cap),
  type:new Uint8Array(cap),active:new Uint8Array(cap),team:new Uint8Array(cap),
  x:new Float64Array(cap),y:new Float64Array(cap),vx:new Float64Array(cap),vy:new Float64Array(cap),
  radius:new Float64Array(cap),mass:new Float64Array(cap),hp:new Float64Array(cap)
}}

export function ensureCapacity(world,minCapacity){
  if(minCapacity<=world.capacity)return false;
  let cap=world.capacity;while(cap<minCapacity)cap=Math.max(cap+1,cap*2);
  const next=allocArrays(cap);
  for(const f of ARRAY_FIELDS)next[f].set(world[f]);
  for(const f of ARRAY_FIELDS)world[f]=next[f];
  world.capacity=cap;return true;
}

export function createWorld({seed=42,count=48,density=.45,speed=1}={}){
  const r=mulberry32(seed),cap=Math.max(64,count*2),spread=1-density*.55,arrays=allocArrays(cap);
  const w={tick:0,worldVersion:0,dt:DT,seed,count,capacity:cap,parameters:{density,speed},...arrays,
    events:[],deltaLog:[],lastCommit:null,inputLog:[],eventLog:[],pendingInputs:[],nextInputSequence:1};
  for(let i=0;i<count;i++){
    w.id[i]=i;w.generation[i]=1;w.version[i]=0;w.type[i]=i===0?1:2;w.active[i]=1;w.team[i]=i===0?0:1;
    w.x[i]=(r()-.5)*spread;w.y[i]=(r()-.5)*spread;w.vx[i]=(r()-.5)*speed;w.vy[i]=(r()-.5)*speed;
    w.radius[i]=.012+r()*.008;w.mass[i]=1;w.hp[i]=100;
  }
  return w;
}

export function snapshot(world){return Object.freeze({
  tick:world.tick,worldVersion:world.worldVersion,dt:world.dt,count:world.count,capacity:world.capacity,
  parameters:world.parameters,id:world.id,generation:world.generation,version:world.version,type:world.type,
  active:world.active,team:world.team,x:world.x,y:world.y,vx:world.vx,vy:world.vy,radius:world.radius,mass:world.mass,hp:world.hp
})}

export function submitCommand(world,command={}){
  const rec={sequence:world.nextInputSequence++,submittedAtTick:world.tick,targetTick:command.targetTick??world.tick,type:command.type||'noop',payload:{...(command.payload||{})},source:command.source||'ui'};
  world.inputLog.push(rec);world.pendingInputs.push(rec);return rec;
}

export function drainCommands(world,tick=world.tick){
  const ready=[],future=[];
  for(const c of world.pendingInputs)(c.targetTick<=tick?ready:future).push(c);
  ready.sort((a,b)=>a.targetTick-b.targetTick||a.sequence-b.sequence);world.pendingInputs=future;return ready;
}

function bound1D(p,v){if(p<-1)return[-1,Math.abs(v)];if(p>1)return[1,-Math.abs(v)];return[p,v]}
function key(entity,field){return entity+':'+field}

export function makeProposal({snapshot,systemId='unknown',source='engine',priority=100,writes=[],lifecycle=[],events=[],meta={}}){
  return {proposalId:`${snapshot.tick}:${systemId}:${source}`,tick:snapshot.tick,worldVersion:snapshot.worldVersion,systemId,source,priority,writes,lifecycle,events,meta};
}

export function computeExact(s){
  const n=s.count,writes=[],events=[],nx=new Float64Array(n),ny=new Float64Array(n),nvx=new Float64Array(n),nvy=new Float64Array(n);
  for(let i=0;i<n;i++){
    if(!s.active[i])continue;
    let x=s.x[i]+s.vx[i]*s.dt,y=s.y[i]+s.vy[i]*s.dt,vx=s.vx[i],vy=s.vy[i];[x,vx]=bound1D(x,vx);[y,vy]=bound1D(y,vy);nx[i]=x;ny[i]=y;nvx[i]=vx;nvy[i]=vy;
  }
  for(let i=0;i<n;i++)if(s.active[i])for(let j=i+1;j<n;j++)if(s.active[j]){
    const dx=nx[j]-nx[i],dy=ny[j]-ny[i],rr=s.radius[i]+s.radius[j];
    if(dx*dx+dy*dy<rr*rr){const avx=nvx[i],avy=nvy[i];nvx[i]=nvx[j];nvy[i]=nvy[j];nvx[j]=avx;nvy[j]=avy;events.push({type:'collision',a:i,b:j});}
  }
  for(let i=0;i<n;i++)if(s.active[i])for(const [field,value] of [['x',nx[i]],['y',ny[i]],['vx',nvx[i]],['vy',nvy[i]]])writes.push({entity:i,field,value,expectedVersion:s.version[i]});
  return makeProposal({snapshot:s,systemId:'physics.exact',source:'exact',priority:100,writes,events,meta:{authority:true,mode:'exact'}})
}

function gridPairs(s,px,py,cell=.12){
  const grid=new Map(),pairs=[],seen=new Set();
  for(let i=0;i<s.count;i++)if(s.active[i]){const cx=Math.floor(px[i]/cell),cy=Math.floor(py[i]/cell),k=cx+','+cy;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i)}
  for(let i=0;i<s.count;i++)if(s.active[i]){const cx=Math.floor(px[i]/cell),cy=Math.floor(py[i]/cell);for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){
    const bucket=grid.get((cx+ox)+','+(cy+oy));if(!bucket)continue;for(const j of bucket){if(i===j)continue;const a=Math.min(i,j),b=Math.max(i,j),k=a+':'+b;if(seen.has(k))continue;seen.add(k);pairs.push([a,b]);}
  }}return pairs;
}

export function computeApprox(s){
  const n=s.count,writes=[],events=[],nx=new Float64Array(n),ny=new Float64Array(n),nvx=new Float64Array(n),nvy=new Float64Array(n);
  for(let i=0;i<n;i++)if(s.active[i]){let x=s.x[i]+s.vx[i]*s.dt,y=s.y[i]+s.vy[i]*s.dt,vx=s.vx[i],vy=s.vy[i];[x,vx]=bound1D(x,vx);[y,vy]=bound1D(y,vy);nx[i]=x;ny[i]=y;nvx[i]=vx;nvy[i]=vy;}
  const pairs=gridPairs(s,nx,ny,.12);
  for(const [i,j] of pairs){const dx=nx[j]-nx[i],dy=ny[j]-ny[i],rr=s.radius[i]+s.radius[j];if(dx*dx+dy*dy<rr*rr){const avx=nvx[i],avy=nvy[i];nvx[i]=nvx[j];nvy[i]=nvy[j];nvx[j]=avx;nvy[j]=avy;events.push({type:'collision',a:i,b:j});}}
  for(let i=0;i<n;i++)if(s.active[i])for(const [field,value] of [['x',nx[i]],['y',ny[i]],['vx',nvx[i]],['vy',nvy[i]]])writes.push({entity:i,field,value,expectedVersion:s.version[i]});
  return makeProposal({snapshot:s,systemId:'physics.approx',source:'approx',priority:90,writes,events,meta:{authority:false,mode:'spatial',broadphasePairs:pairs.length}})
}

export function makeDamageProposal(s,{target=1,amount=10,source=0,cause='test',priority=200}={}){
  if(target<0||target>=s.count||!s.active[target])return makeProposal({snapshot:s,systemId:'combat',source,priority,writes:[],events:[],meta:{invalidTarget:true}});
  return makeProposal({snapshot:s,systemId:'combat',source:String(source),priority,writes:[{entity:target,field:'hp',op:'add',value:-Math.abs(amount),expectedVersion:s.version[target],expectedGeneration:s.generation[target],cause}],events:[{type:'damage',target,source,amount:Math.abs(amount),cause}],meta:{authority:true}})
}

export function makeSpawnProposal(s,{x=0,y=0,vx=0,vy=0,team=1,type=2,hp=100,radius=.016,mass=1,source='lifecycle'}={}){
  return makeProposal({snapshot:s,systemId:'lifecycle.spawn',source,priority:300,lifecycle:[{op:'spawn',entity:null,data:{x,y,vx,vy,team,type,hp,radius,mass}}],events:[{type:'spawn-request',source}],meta:{authority:true}})
}
export function makeDespawnProposal(s,{entity,source='lifecycle'}={}){
  return makeProposal({snapshot:s,systemId:'lifecycle.despawn',source,priority:310,lifecycle:[{op:'despawn',entity,expectedVersion:s.version[entity],expectedGeneration:s.generation[entity]}],events:[{type:'despawn-request',entity,source}],meta:{authority:true}})
}

export function proposalsFromCommands(s,commands=[]){
  const out=[];
  for(const c of commands){const p=c.payload||{};
    if(c.type==='damage')out.push(makeDamageProposal(s,{target:p.target??1,amount:p.amount??10,source:p.source??0,cause:p.cause||'input'}));
    else if(c.type==='spawn')out.push(makeSpawnProposal(s,{...p,source:`input:${c.sequence}`}));
    else if(c.type==='despawn')out.push(makeDespawnProposal(s,{entity:p.entity??1,source:`input:${c.sequence}`}));
    else if(c.type==='impulse'&&Number.isInteger(p.entity)&&p.entity>=0&&p.entity<s.count&&s.active[p.entity])out.push(makeProposal({snapshot:s,systemId:'input.impulse',source:`input:${c.sequence}`,priority:220,writes:[{entity:p.entity,field:'vx',op:'add',value:Number(p.dvx||0),expectedVersion:s.version[p.entity],expectedGeneration:s.generation[p.entity]},{entity:p.entity,field:'vy',op:'add',value:Number(p.dvy||0),expectedVersion:s.version[p.entity],expectedGeneration:s.generation[p.entity]}],events:[{type:'impulse',entity:p.entity,dvx:Number(p.dvx||0),dvy:Number(p.dvy||0)}],meta:{authority:true}}));
  }return out;
}

export function resolveConflicts(proposals){
  const all=[...proposals].sort((a,b)=>b.priority-a.priority||String(a.systemId).localeCompare(String(b.systemId))||String(a.proposalId).localeCompare(String(b.proposalId)));
  const groups=new Map(),events=[],lifecycle=[];
  for(const p of all){for(const e of p.events||[])events.push({...e,proposalId:p.proposalId});for(const op of p.lifecycle||[])lifecycle.push({...op,proposalId:p.proposalId,systemId:p.systemId,priority:p.priority});for(const wr of p.writes||[]){const k=key(wr.entity,wr.field);if(!groups.has(k))groups.set(k,[]);groups.get(k).push({...wr,proposalId:p.proposalId,systemId:p.systemId,priority:p.priority});}}
  const writes=[],conflicts=[];
  for(const [k,list] of groups){const [entityStr,field]=k.split(':'),entity=+entityStr;if(list.length===1){writes.push(list[0]);continue;}conflicts.push({entity,field,count:list.length,proposalIds:list.map(x=>x.proposalId)});if(list.every(x=>x.op==='add')){const base=list[0];writes.push({...base,value:list.reduce((sum,x)=>sum+Number(x.value||0),0),combined:true});}else writes.push(list[0]);}
  writes.sort((a,b)=>a.entity-b.entity||a.field.localeCompare(b.field));lifecycle.sort((a,b)=>b.priority-a.priority||String(a.proposalId).localeCompare(String(b.proposalId)));
  return {writes,lifecycle,events,conflicts,proposalCount:all.length};
}

const mutableFields=new Set(['x','y','vx','vy','hp','active','team']);
export function verify(world,resolved,{critical=false}={}){
  const errors=[],despawning=new Set(resolved.lifecycle.filter(x=>x.op==='despawn').map(x=>x.entity));
  for(const op of resolved.lifecycle){
    if(op.op==='despawn'){
      if(!Number.isInteger(op.entity)||op.entity<0||op.entity>=world.count||!world.active[op.entity])errors.push('invalid despawn entity');
      else if(op.expectedGeneration!==undefined&&op.expectedGeneration!==world.generation[op.entity])errors.push(`stale generation entity ${op.entity}`);
    }else if(op.op!=='spawn')errors.push(`invalid lifecycle op ${op.op}`);
  }
  for(const wr of resolved.writes){
    if(!Number.isInteger(wr.entity)||wr.entity<0||wr.entity>=world.count){errors.push('invalid entity');continue;}
    if(!world.active[wr.entity]&&!despawning.has(wr.entity)){errors.push(`write inactive entity ${wr.entity}`);continue;}
    if(!mutableFields.has(wr.field)){errors.push(`invalid field ${wr.field}`);continue;}
    if(wr.expectedVersion!==undefined&&wr.expectedVersion!==world.version[wr.entity])errors.push(`stale version entity ${wr.entity}`);
    if(wr.expectedGeneration!==undefined&&wr.expectedGeneration!==world.generation[wr.entity])errors.push(`stale generation entity ${wr.entity}`);
    if(!Number.isFinite(Number(wr.value)))errors.push(`non-finite ${wr.field}`);
    if((wr.field==='x'||wr.field==='y')&&Math.abs(Number(wr.value))>1.05)errors.push(`out of bounds entity ${wr.entity}`);
  }
  if(critical){const ok=[...resolved.writes,...resolved.lifecycle].every(w=>String(w.proposalId||'').includes(':physics.exact:')||String(w.proposalId||'').includes(':combat:')||String(w.proposalId||'').includes(':lifecycle.')||String(w.proposalId||'').includes(':input.'));if(!ok)errors.push('critical commit requires authority proposal');}
  return {ok:errors.length===0,errors};
}

function readField(world,e,f){return world[f][e]}
function writeField(world,e,f,v){world[f][e]=v}
function entityState(world,e){const o={};for(const f of ARRAY_FIELDS)o[f]=Number(world[f][e]);return o}
function setEntityState(world,e,s){for(const f of ARRAY_FIELDS)world[f][e]=s[f]??0}
function findSpawnSlot(world){for(let i=0;i<world.count;i++)if(!world.active[i])return i;ensureCapacity(world,world.count+1);return world.count++}

export function commit(world,resolved,{verifierResult={ok:true,errors:[]},commands=[]}={}){
  if(!verifierResult.ok)throw new Error('Commit blocked: '+verifierResult.errors.join(', '));
  const delta=[],t=world.tick,lifecycleEvents=[];
  for(const op of resolved.lifecycle){
    if(op.op==='despawn'){
      const e=op.entity,before=entityState(world,e);world.active[e]=0;world.version[e]++;const after=entityState(world,e);
      delta.push({kind:'lifecycle',op:'despawn',tick:t,sequence:delta.length,entity:e,before,after,proposalId:op.proposalId,systemId:op.systemId});lifecycleEvents.push({type:'despawn',entity:e,generation:world.generation[e],proposalId:op.proposalId});
    }else if(op.op==='spawn'){
      const e=findSpawnSlot(world),before=entityState(world,e),d=op.data||{};world.id[e]=e;world.generation[e]=Math.max(1,world.generation[e]+1);world.version[e]=0;world.type[e]=d.type??2;world.active[e]=1;world.team[e]=d.team??1;world.x[e]=d.x??0;world.y[e]=d.y??0;world.vx[e]=d.vx??0;world.vy[e]=d.vy??0;world.radius[e]=d.radius??.016;world.mass[e]=d.mass??1;world.hp[e]=d.hp??100;const after=entityState(world,e);
      delta.push({kind:'lifecycle',op:'spawn',tick:t,sequence:delta.length,entity:e,before,after,proposalId:op.proposalId,systemId:op.systemId});lifecycleEvents.push({type:'spawn',entity:e,generation:world.generation[e],proposalId:op.proposalId});
    }
  }
  for(const wr of resolved.writes){if(!world.active[wr.entity])continue;const before=readField(world,wr.entity,wr.field);let after=wr.op==='add'?before+Number(wr.value):Number(wr.value);if(wr.field==='hp')after=Math.max(0,after);if(Object.is(before,after))continue;writeField(world,wr.entity,wr.field,after);world.version[wr.entity]++;delta.push({kind:'write',tick:t,sequence:delta.length,entity:wr.entity,field:wr.field,before,after,proposalId:wr.proposalId,systemId:wr.systemId,worldVersionBefore:world.worldVersion});}
  world.events=[...resolved.events,...lifecycleEvents];world.tick++;world.worldVersion++;
  const committedEvents=world.events.map((e,i)=>({...e,tick:t,worldVersion:world.worldVersion,eventSequence:i}));world.eventLog.push(...committedEvents);
  const record={tick:t,worldVersion:world.worldVersion,proposalCount:resolved.proposalCount,conflicts:resolved.conflicts.length,writes:delta.length,delta,events:committedEvents,commands:commands.map(c=>({...c})),verification:'PASS'};
  world.lastCommit=record;world.deltaLog.push(record);if(world.deltaLog.length>4096)world.deltaLog.shift();if(world.eventLog.length>16384)world.eventLog.splice(0,world.eventLog.length-16384);return record;
}

export function executeTick(world,{mode='exact',critical=false,extraProposals=[],commands=null}={}){
  const s=snapshot(world),consumed=commands??drainCommands(world,s.tick),inputProposals=proposalsFromCommands(s,consumed),physics=mode==='approx'?computeApprox(s):computeExact(s),resolved=resolveConflicts([physics,...inputProposals,...extraProposals]);
  const check=verify(world,resolved,{critical});
  if(!check.ok&&mode!=='exact'){
    const exactResolved=resolveConflicts([computeExact(snapshot(world)),...inputProposals,...extraProposals]),exactCheck=verify(world,exactResolved,{critical:true});
    if(!exactCheck.ok)return {ok:false,fallback:true,verification:exactCheck,resolved:exactResolved,commands:consumed};
    const record=commit(world,exactResolved,{verifierResult:exactCheck,commands:consumed});return {ok:true,fallback:true,verification:exactCheck,resolved:exactResolved,record,commands:consumed};
  }
  if(!check.ok)return {ok:false,fallback:false,verification:check,resolved,commands:consumed};
  const record=commit(world,resolved,{verifierResult:check,commands:consumed});return {ok:true,fallback:false,verification:check,resolved,record,commands:consumed};
}

export function stateHash(world){let h=2166136261>>>0;const mix=s=>{for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}};mix(String(world.tick));mix(String(world.worldVersion));for(let i=0;i<world.count;i++)for(const v of [world.id[i],world.generation[i],world.version[i],world.x[i],world.y[i],world.vx[i],world.vy[i],world.hp[i],world.active[i],world.team[i]])mix(String(Math.round(Number(v)*1e6)));return(h>>>0).toString(16).padStart(8,'0')}
export function entityView(world,i){return {id:world.id[i],generation:world.generation[i],type:world.type[i]===1?'player':'enemy',x:world.x[i],y:world.y[i],vx:world.vx[i],vy:world.vy[i],r:world.radius[i],hp:world.hp[i],team:world.team[i],active:!!world.active[i],version:world.version[i]}}
export function allEntities(world,{activeOnly=true}={}){const out=[];for(let i=0;i<world.count;i++)if(!activeOnly||world.active[i])out.push(entityView(world,i));return out}
export function liveCount(world){let n=0;for(let i=0;i<world.count;i++)n+=world.active[i]?1:0;return n}
export {ARRAY_FIELDS};