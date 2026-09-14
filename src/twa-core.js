export const DT = 1/60;

export function mulberry32(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

export function createWorld({seed=42,count=48,density=.45,speed=1}={}){
  const r=mulberry32(seed),cap=Math.max(8,count),spread=1-density*.55;
  const w={
    tick:0,worldVersion:0,dt:DT,seed,count,capacity:cap,parameters:{density,speed},
    id:new Uint32Array(cap),generation:new Uint32Array(cap),version:new Uint32Array(cap),
    type:new Uint8Array(cap),active:new Uint8Array(cap),team:new Uint8Array(cap),
    x:new Float64Array(cap),y:new Float64Array(cap),vx:new Float64Array(cap),vy:new Float64Array(cap),
    radius:new Float64Array(cap),mass:new Float64Array(cap),hp:new Float64Array(cap),
    events:[],deltaLog:[],lastCommit:null
  };
  for(let i=0;i<count;i++){
    w.id[i]=i;w.generation[i]=1;w.version[i]=0;w.type[i]=i===0?1:2;w.active[i]=1;w.team[i]=i===0?0:1;
    w.x[i]=(r()-.5)*spread;w.y[i]=(r()-.5)*spread;w.vx[i]=(r()-.5)*speed;w.vy[i]=(r()-.5)*speed;
    w.radius[i]=.012+r()*.008;w.mass[i]=1;w.hp[i]=100;
  }
  return w;
}

export function snapshot(world){
  // Logical immutable snapshot: compute receives only this read contract. Canonical arrays are mutated only in commit().
  return Object.freeze({
    tick:world.tick,worldVersion:world.worldVersion,dt:world.dt,count:world.count,
    parameters:world.parameters,id:world.id,generation:world.generation,version:world.version,
    type:world.type,active:world.active,team:world.team,x:world.x,y:world.y,vx:world.vx,vy:world.vy,
    radius:world.radius,mass:world.mass,hp:world.hp
  });
}

function bound1D(p,v){if(p<-1)return[-1,Math.abs(v)];if(p>1)return[1,-Math.abs(v)];return[p,v]}
function key(entity,field){return entity+':'+field}

export function makeProposal({snapshot,systemId='unknown',source='engine',priority=100,writes=[],events=[],meta={}}){
  return {proposalId:`${snapshot.tick}:${systemId}:${source}`,tick:snapshot.tick,worldVersion:snapshot.worldVersion,systemId,source,priority,writes,events,meta};
}

export function computeExact(snapshotView){
  const s=snapshotView,n=s.count,writes=[],events=[],nx=new Float64Array(n),ny=new Float64Array(n),nvx=new Float64Array(n),nvy=new Float64Array(n);
  for(let i=0;i<n;i++){
    let x=s.x[i]+s.vx[i]*s.dt,y=s.y[i]+s.vy[i]*s.dt,vx=s.vx[i],vy=s.vy[i];
    [x,vx]=bound1D(x,vx);[y,vy]=bound1D(y,vy);nx[i]=x;ny[i]=y;nvx[i]=vx;nvy[i]=vy;
  }
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
    const dx=nx[j]-nx[i],dy=ny[j]-ny[i],rr=s.radius[i]+s.radius[j];
    if(dx*dx+dy*dy<rr*rr){const avx=nvx[i],avy=nvy[i];nvx[i]=nvx[j];nvy[i]=nvy[j];nvx[j]=avx;nvy[j]=avy;events.push({type:'collision',a:i,b:j});}
  }
  for(let i=0;i<n;i++){
    writes.push({entity:i,field:'x',value:nx[i],expectedVersion:s.version[i]});
    writes.push({entity:i,field:'y',value:ny[i],expectedVersion:s.version[i]});
    writes.push({entity:i,field:'vx',value:nvx[i],expectedVersion:s.version[i]});
    writes.push({entity:i,field:'vy',value:nvy[i],expectedVersion:s.version[i]});
  }
  return makeProposal({snapshot:s,systemId:'physics.exact',source:'exact',priority:100,writes,events,meta:{authority:true,mode:'exact'}});
}

function gridPairs(s,px,py,cell=.12){
  const grid=new Map(),pairs=[],seen=new Set();
  for(let i=0;i<s.count;i++){const cx=Math.floor(px[i]/cell),cy=Math.floor(py[i]/cell),k=cx+','+cy;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i)}
  for(let i=0;i<s.count;i++){const cx=Math.floor(px[i]/cell),cy=Math.floor(py[i]/cell);for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){
    const bucket=grid.get((cx+ox)+','+(cy+oy));if(!bucket)continue;for(const j of bucket){if(i===j)continue;const a=Math.min(i,j),b=Math.max(i,j),k=a+':'+b;if(seen.has(k))continue;seen.add(k);pairs.push([a,b]);}
  }}return pairs;
}

export function computeApprox(snapshotView){
  const s=snapshotView,n=s.count,writes=[],events=[],nx=new Float64Array(n),ny=new Float64Array(n),nvx=new Float64Array(n),nvy=new Float64Array(n);
  for(let i=0;i<n;i++){let x=s.x[i]+s.vx[i]*s.dt,y=s.y[i]+s.vy[i]*s.dt,vx=s.vx[i],vy=s.vy[i];[x,vx]=bound1D(x,vx);[y,vy]=bound1D(y,vy);nx[i]=x;ny[i]=y;nvx[i]=vx;nvy[i]=vy;}
  const pairs=gridPairs(s,nx,ny,.12);
  for(const [i,j] of pairs){const dx=nx[j]-nx[i],dy=ny[j]-ny[i],rr=s.radius[i]+s.radius[j];if(dx*dx+dy*dy<rr*rr){const avx=nvx[i],avy=nvy[i];nvx[i]=nvx[j];nvy[i]=nvy[j];nvx[j]=avx;nvy[j]=avy;events.push({type:'collision',a:i,b:j});}}
  for(let i=0;i<n;i++)for(const [field,value] of [['x',nx[i]],['y',ny[i]],['vx',nvx[i]],['vy',nvy[i]]])writes.push({entity:i,field,value,expectedVersion:s.version[i]});
  return makeProposal({snapshot:s,systemId:'physics.approx',source:'approx',priority:90,writes,events,meta:{authority:false,mode:'spatial',broadphasePairs:pairs.length}});
}

export function makeDamageProposal(snapshotView,{target=1,amount=10,source=0,cause='test',priority=200}={}){
  const s=snapshotView;if(target<0||target>=s.count)return makeProposal({snapshot:s,systemId:'combat',source,priority,writes:[],events:[],meta:{invalidTarget:true}});
  return makeProposal({snapshot:s,systemId:'combat',source:String(source),priority,writes:[{entity:target,field:'hp',op:'add',value:-Math.abs(amount),expectedVersion:s.version[target],cause}],events:[{type:'damage',target,source,amount:Math.abs(amount),cause}],meta:{authority:true}});
}

export function resolveConflicts(proposals){
  const all=[...proposals].sort((a,b)=>b.priority-a.priority||String(a.systemId).localeCompare(String(b.systemId))||String(a.proposalId).localeCompare(String(b.proposalId)));
  const groups=new Map(),events=[];
  for(const p of all){for(const e of p.events||[])events.push({...e,proposalId:p.proposalId});for(const wr of p.writes||[]){const k=key(wr.entity,wr.field);if(!groups.has(k))groups.set(k,[]);groups.get(k).push({...wr,proposalId:p.proposalId,systemId:p.systemId,priority:p.priority});}}
  const writes=[],conflicts=[];
  for(const [k,list] of groups){
    const [entityStr,field]=k.split(':'),entity=+entityStr;
    if(list.length===1){writes.push(list[0]);continue;}
    conflicts.push({entity,field,count:list.length,proposalIds:list.map(x=>x.proposalId)});
    // Additive writes (damage/heal) combine deterministically; absolute writes use highest-priority stable winner.
    if(list.every(x=>x.op==='add')){
      const base=list[0];writes.push({...base,value:list.reduce((s,x)=>s+Number(x.value||0),0),combined:true});
    }else writes.push(list[0]);
  }
  writes.sort((a,b)=>a.entity-b.entity||a.field.localeCompare(b.field));
  return {writes,events,conflicts,proposalCount:all.length};
}

const mutableFields=new Set(['x','y','vx','vy','hp','active','team']);
export function verify(world,resolved,{critical=false}={}){
  const errors=[];
  for(const wr of resolved.writes){
    if(!Number.isInteger(wr.entity)||wr.entity<0||wr.entity>=world.count){errors.push('invalid entity');continue;}
    if(!mutableFields.has(wr.field)){errors.push(`invalid field ${wr.field}`);continue;}
    if(wr.expectedVersion!==undefined&&wr.expectedVersion!==world.version[wr.entity])errors.push(`stale version entity ${wr.entity}`);
    if(!Number.isFinite(Number(wr.value)))errors.push(`non-finite ${wr.field}`);
    if((wr.field==='x'||wr.field==='y')&&Math.abs(Number(wr.value))>1.05)errors.push(`out of bounds entity ${wr.entity}`);
  }
  if(critical){const hasAuthority=resolved.writes.every(wr=>{const p=String(wr.proposalId||'');return p.includes(':physics.exact:')||p.includes(':combat:');});if(!hasAuthority)errors.push('critical commit requires authority proposal');}
  return {ok:errors.length===0,errors};
}

function readField(world,e,f){return world[f][e]}
function writeField(world,e,f,v){world[f][e]=v}

export function commit(world,resolved,{verifierResult={ok:true,errors:[]}}={}){
  if(!verifierResult.ok)throw new Error('Commit blocked: '+verifierResult.errors.join(', '));
  const delta=[],t=world.tick;
  for(const wr of resolved.writes){
    const before=readField(world,wr.entity,wr.field);let after=wr.op==='add'?before+Number(wr.value):Number(wr.value);
    if(wr.field==='hp')after=Math.max(0,after);
    if(Object.is(before,after))continue;
    writeField(world,wr.entity,wr.field,after);world.version[wr.entity]++;
    delta.push({tick:t,sequence:delta.length,entity:wr.entity,field:wr.field,before,after,proposalId:wr.proposalId,systemId:wr.systemId,worldVersionBefore:world.worldVersion});
  }
  world.events=resolved.events;world.tick++;world.worldVersion++;
  const record={tick:t,worldVersion:world.worldVersion,proposalCount:resolved.proposalCount,conflicts:resolved.conflicts.length,writes:delta.length,delta,events:resolved.events,verification:'PASS'};
  world.lastCommit=record;world.deltaLog.push(record);if(world.deltaLog.length>256)world.deltaLog.shift();
  return record;
}

export function executeTick(world,{mode='exact',critical=false,extraProposals=[]}={}){
  const s=snapshot(world),physics=mode==='approx'?computeApprox(s):computeExact(s),resolved=resolveConflicts([physics,...extraProposals]);
  const check=verify(world,resolved,{critical});
  if(!check.ok&&mode!=='exact'){
    const exactResolved=resolveConflicts([computeExact(snapshot(world)),...extraProposals]);
    const exactCheck=verify(world,exactResolved,{critical:true});
    if(!exactCheck.ok)return {ok:false,fallback:true,verification:exactCheck,resolved:exactResolved};
    const record=commit(world,exactResolved,{verifierResult:exactCheck});return {ok:true,fallback:true,verification:exactCheck,resolved:exactResolved,record};
  }
  if(!check.ok)return {ok:false,fallback:false,verification:check,resolved};
  const record=commit(world,resolved,{verifierResult:check});return {ok:true,fallback:false,verification:check,resolved,record};
}

export function stateHash(world){let h=2166136261>>>0;const mix=s=>{for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}};mix(String(world.tick));mix(String(world.worldVersion));for(let i=0;i<world.count;i++)for(const v of [world.id[i],world.generation[i],world.version[i],world.x[i],world.y[i],world.vx[i],world.vy[i],world.hp[i],world.active[i],world.team[i]])mix(String(Math.round(Number(v)*1e6)));return(h>>>0).toString(16).padStart(8,'0')}

export function entityView(world,i){return {id:world.id[i],type:world.type[i]===1?'player':'enemy',x:world.x[i],y:world.y[i],vx:world.vx[i],vy:world.vy[i],r:world.radius[i],hp:world.hp[i],team:world.team[i],active:!!world.active[i],version:world.version[i]}}
export function allEntities(world){const out=[];for(let i=0;i<world.count;i++)out.push(entityView(world,i));return out}
