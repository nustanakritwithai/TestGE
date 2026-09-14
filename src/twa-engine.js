import {createWorld,snapshot,submitCommand,executeTick,stateHash,allEntities,liveCount} from './twa-core.js';
import {createCheckpoint,restoreCheckpoint,rollback,replayStack,rollbackToTick,verifyReplayRoundTrip,historyStats} from './twa-history.js';
import {TWATaskGraph,executeParallelTick} from './twa-parallel.js';
import {createReplicationSession,createClientReplica,createBootstrapPacket,createDeltaPacket,applyReplicationPacket,verifyReplica,setInterest,replicationStats} from './twa-replication.js';

export class TestGEEngine{
  constructor(options={}){
    const {workers=2,...worldOptions}=options;
    this.world=createWorld(worldOptions);
    this.taskGraph=new TWATaskGraph({workers});
    this.redoStack=[];
    this.checkpoints=new Map();
    this.replication=new Map();
  }
  get tick(){return this.world.tick}
  get version(){return this.world.worldVersion}
  get hash(){return stateHash(this.world)}
  get entities(){return allEntities(this.world)}
  get liveEntities(){return liveCount(this.world)}
  snapshot(){return snapshot(this.world)}
  submit(type,payload={},options={}){return submitCommand(this.world,{type,payload,source:options.source||'api',targetTick:options.targetTick})}
  async step({mode='exact',critical=false,parallel=true}={}){
    const result=parallel
      ? await executeParallelTick(this.world,{mode,critical,taskGraph:this.taskGraph})
      : executeTick(this.world,{mode,critical});
    if(result.ok)this.redoStack.length=0;
    return {...result,tick:this.tick,version:this.version,hash:this.hash};
  }
  checkpoint(name=`tick-${this.tick}`){const cp=createCheckpoint(this.world,name);this.checkpoints.set(name,cp);return cp}
  restore(nameOrCheckpoint){const cp=typeof nameOrCheckpoint==='string'?this.checkpoints.get(nameOrCheckpoint):nameOrCheckpoint;if(!cp)throw new Error('Checkpoint not found');this.redoStack.length=0;return restoreCheckpoint(this.world,cp)}
  rollback(steps=1){const undone=rollback(this.world,steps);this.redoStack.push(...undone);return undone}
  rollbackTo(targetTick){const r=rollbackToTick(this.world,targetTick);this.redoStack.push(...r.undone);return r}
  replay(steps=Infinity){return replayStack(this.world,this.redoStack,steps)}
  verifyRoundTrip(steps=1){return verifyReplayRoundTrip(this.world,steps)}
  stats(){return {...historyStats(this.world,this.redoStack),hash:this.hash,liveEntities:this.liveEntities}}
  createClient(clientId='client-1',interest={mode:'radius',x:0,y:0,radius:.75}){
    const session=createReplicationSession({clientId,interest});
    const replica=createClientReplica(clientId);
    const ctx={session,replica,lastPacket:null};
    this.replication.set(clientId,ctx);
    return ctx;
  }
  setClientInterest(clientId,interest){const c=this.replication.get(clientId);if(!c)throw new Error('Client not found');setInterest(c.session,interest);return c}
  bootstrapClient(clientId){const c=this.replication.get(clientId);if(!c)throw new Error('Client not found');const packet=createBootstrapPacket(this.world,c.session);const applied=applyReplicationPacket(c.replica,packet);c.lastPacket=packet;return {packet,applied,verify:verifyReplica(this.world,c.replica,c.session)}}
  replicateLatest(clientId){const c=this.replication.get(clientId);if(!c)throw new Error('Client not found');const rec=this.world.lastCommit;if(!rec)return {packet:null,applied:{ok:false,reason:'no commit'}};const packet=createDeltaPacket(this.world,rec,c.session);const applied=applyReplicationPacket(c.replica,packet);c.lastPacket=packet;return {packet,applied,verify:applied.ok?verifyReplica(this.world,c.replica,c.session):{ok:false,errors:[applied.reason]},stats:replicationStats(c.session,c.replica)}}
  verifyClient(clientId){const c=this.replication.get(clientId);if(!c)throw new Error('Client not found');return verifyReplica(this.world,c.replica,c.session)}
  clientStats(clientId){const c=this.replication.get(clientId);if(!c)throw new Error('Client not found');return replicationStats(c.session,c.replica)}
  destroy(){this.taskGraph?.destroy?.();this.replication.clear();}
}

export function createEngine(options={}){return new TestGEEngine(options)}
