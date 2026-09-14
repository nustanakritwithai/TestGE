// TestGE TWA P15 — Client Prediction / Reconciliation
// Client prediction never owns authority. It predicts from local inputs, then
// rebases on authoritative replication and replays any unacknowledged inputs.

export function createPredictionClient({clientId='client-1',controlledEntity=0,dt=1/60}={}){
  return {
    clientId,controlledEntity,dt,
    state:null,
    pendingInputs:[],
    nextLocalSequence:1,
    lastAckSequence:0,
    reconciliations:0,
    corrections:0,
    replayedInputs:0,
    maxPositionError:0,
    lastPositionError:0
  };
}

export function seedPredictionFromReplica(prediction,replica){
  const s=replica.entities.get(prediction.controlledEntity);
  prediction.state=s?{...s}:null;
  prediction.pendingInputs=[];
  prediction.lastAckSequence=0;
  prediction.lastPositionError=0;
  return prediction.state;
}

function applyLocalCommandToState(state,command){
  if(!state)return;
  const p=command.payload||{};
  if(command.type==='impulse'){
    state.vx=Number(state.vx||0)+Number(p.dvx||0);
    state.vy=Number(state.vy||0)+Number(p.dvy||0);
  }
}

export function predictStep(prediction){
  const s=prediction.state;if(!s||!s.active)return s;
  s.x=Number(s.x||0)+Number(s.vx||0)*prediction.dt;
  s.y=Number(s.y||0)+Number(s.vy||0)*prediction.dt;
  if(s.x<-1){s.x=-1;s.vx=Math.abs(s.vx)}else if(s.x>1){s.x=1;s.vx=-Math.abs(s.vx)}
  if(s.y<-1){s.y=-1;s.vy=Math.abs(s.vy)}else if(s.y>1){s.y=1;s.vy=-Math.abs(s.vy)}
  return s;
}

export function queuePredictedInput(prediction,{type='impulse',payload={}}={}){
  const cmd={localSequence:prediction.nextLocalSequence++,type,payload:{...payload}};
  prediction.pendingInputs.push(cmd);
  applyLocalCommandToState(prediction.state,cmd);
  return cmd;
}

export function tagServerSequence(prediction,localSequence,serverSequence){
  const cmd=prediction.pendingInputs.find(x=>x.localSequence===localSequence);
  if(cmd)cmd.serverSequence=serverSequence;
  return cmd||null;
}

export function reconcilePrediction(prediction,replica,{ackSequence=0}={}){
  const auth=replica.entities.get(prediction.controlledEntity);
  if(!auth){prediction.state=null;return {ok:false,reason:'controlled entity outside replica'};}
  const before=prediction.state?{...prediction.state}:null;
  const dx=before?Number(before.x||0)-Number(auth.x||0):0;
  const dy=before?Number(before.y||0)-Number(auth.y||0):0;
  const error=Math.hypot(dx,dy);
  prediction.lastPositionError=error;
  prediction.maxPositionError=Math.max(prediction.maxPositionError,error);
  if(error>1e-9)prediction.corrections++;
  prediction.reconciliations++;
  prediction.lastAckSequence=Math.max(prediction.lastAckSequence,Number(ackSequence||0));
  prediction.pendingInputs=prediction.pendingInputs.filter(cmd=>!cmd.serverSequence||cmd.serverSequence>prediction.lastAckSequence);

  // Rebase on authoritative state, then replay local inputs that the server has not acknowledged.
  prediction.state={...auth};
  for(const cmd of prediction.pendingInputs){
    applyLocalCommandToState(prediction.state,cmd);
    predictStep(prediction);
    prediction.replayedInputs++;
  }
  return {ok:true,error,pending:prediction.pendingInputs.length,replayed:prediction.pendingInputs.length,before,after:{...prediction.state},authority:{...auth}};
}

export function predictionStats(prediction){
  return {
    pending:prediction.pendingInputs.length,
    reconciliations:prediction.reconciliations,
    corrections:prediction.corrections,
    replayedInputs:prediction.replayedInputs,
    lastError:prediction.lastPositionError,
    maxError:prediction.maxPositionError,
    lastAckSequence:prediction.lastAckSequence
  };
}
