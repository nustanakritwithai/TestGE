import {createWorld,executeTick,submitCommand,stateHash,entityView} from './twa-core.js';
import {createReplicationSession,createClientReplica,createBootstrapPacket,createDeltaPacket,applyReplicationPacket,verifyReplica} from './twa-replication.js';
import {createPredictionClient,seedPredictionFromReplica,queuePredictedInput,tagServerSequence,predictStep,reconcilePrediction,predictionStats} from './twa-prediction.js';

const $=id=>document.getElementById(id);
let server,session,replica,prediction,networkQueue=[],running=false,timer=null,lastRecon=null,totalPackets=0,totalBytes=0;

function reset(){
  stop();
  server=createWorld({seed:42,count:24,density:.35,speed:.45});
  session=createReplicationSession({clientId:'client-1',interest:{mode:'all'}});
  replica=createClientReplica('client-1');
  const boot=createBootstrapPacket(server,session);applyReplicationPacket(replica,boot);
  prediction=createPredictionClient({clientId:'client-1',controlledEntity:0,dt:server.dt});
  seedPredictionFromReplica(prediction,replica);
  networkQueue=[];lastRecon=null;totalPackets=1;totalBytes=boot.bytes||0;
  render();log(`Bootstrap v${server.worldVersion} • ${boot.entities.length} entities • ${boot.bytes} bytes`);
}

function latencyTicks(){return Math.max(0,+$('latency').value||0)}
function log(s){$('log').textContent=s}

function localImpulse(dx,dy){
  const local=queuePredictedInput(prediction,{type:'impulse',payload:{entity:0,dvx:dx,dvy:dy}});
  const serverCmd=submitCommand(server,{type:'impulse',payload:{entity:0,dvx:dx,dvy:dy},source:'prediction-client'});
  tagServerSequence(prediction,local.localSequence,serverCmd.sequence);
  render();log(`Local prediction input #${local.localSequence} → server input #${serverCmd.sequence} • client ตอบสนองทันที`);
}

function enqueuePacket(packet,ackSequence){
  networkQueue.push({packet,ackSequence,deliverAt:server.tick+latencyTicks()});
  totalPackets++;totalBytes+=packet.bytes||0;
}

function deliverPackets(){
  const due=[],future=[];
  for(const q of networkQueue)(q.deliverAt<=server.tick?due:future).push(q);
  networkQueue=future;
  for(const q of due){
    const applied=applyReplicationPacket(replica,q.packet);
    if(!applied.ok){
      log(`Replication error: ${applied.reason}`);
      const boot=createBootstrapPacket(server,session);applyReplicationPacket(replica,boot);totalPackets++;totalBytes+=boot.bytes||0;
      seedPredictionFromReplica(prediction,replica);continue;
    }
    lastRecon=reconcilePrediction(prediction,replica,{ackSequence:q.ackSequence});
  }
}

function step(){
  // client renders/predicts before authoritative result arrives
  predictStep(prediction);
  const result=executeTick(server,{mode:'exact',critical:true});
  if(!result.ok){log(`Server BLOCKED: ${result.verification.errors.join(', ')}`);return;}
  const rec=result.record;
  const ack=Math.max(0,...(rec.commands||[]).map(c=>Number(c.sequence)||0));
  const packet=createDeltaPacket(server,rec,session);
  enqueuePacket(packet,ack);
  deliverPackets();
  render();
}

function run(){if(running)return;running=true;$('runState').textContent='RUN';const loop=()=>{if(!running)return;step();timer=setTimeout(loop,1000/30)};loop()}
function stop(){running=false;if(timer){clearTimeout(timer);timer=null}if($('runState'))$('runState').textContent='STOP'}

function verify(){
  const v=verifyReplica(server,replica,session);
  $('verify').textContent=v.ok?'Replica PASS':`Replica DELAYED/MISMATCH (${v.errors.slice(0,2).join(', ')})`;
  $('verify').className=v.ok?'ok':'warn';
}

function render(){
  const auth=entityView(server,0),pred=prediction.state||auth,s=predictionStats(prediction);
  $('tick').textContent=server.tick;$('serverHash').textContent=stateHash(server);$('serverX').textContent=auth.x.toFixed(4);$('clientX').textContent=Number(pred.x||0).toFixed(4);
  $('pending').textContent=s.pending;$('reconciliations').textContent=s.reconciliations;$('corrections').textContent=s.corrections;$('lastError').textContent=s.lastError.toFixed(5);$('maxError').textContent=s.maxError.toFixed(5);
  $('queue').textContent=networkQueue.length;$('packets').textContent=totalPackets;$('bytes').textContent=totalBytes.toLocaleString();$('ack').textContent=s.lastAckSequence;
  const c=$('view'),g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);g.fillStyle='#07111f';g.fillRect(0,0,c.width,c.height);
  g.strokeStyle='#24445f';for(let x=0;x<c.width;x+=50){g.beginPath();g.moveTo(x,0);g.lineTo(x,c.height);g.stroke()}for(let y=0;y<c.height;y+=50){g.beginPath();g.moveTo(0,y);g.lineTo(c.width,y);g.stroke()}
  const px=x=>(x+1)*.5*c.width,py=y=>(y+1)*.5*c.height;
  g.beginPath();g.arc(px(auth.x),py(auth.y),11,0,Math.PI*2);g.fillStyle='#5ce2a2';g.fill();
  g.beginPath();g.arc(px(pred.x),py(pred.y),7,0,Math.PI*2);g.fillStyle='#ffd166';g.fill();
  g.strokeStyle='#ff6b6b';g.beginPath();g.moveTo(px(auth.x),py(auth.y));g.lineTo(px(pred.x),py(pred.y));g.stroke();
  g.fillStyle='#edf6ff';g.font='13px system-ui';g.fillText('เขียว = Authority Server',12,20);g.fillText('เหลือง = Client Prediction',12,40);
  verify();
  $('recon').textContent=lastRecon?.ok?`Reconcile error ${lastRecon.error.toFixed(5)} • replay ${lastRecon.replayed} input`:'ยังไม่มี authoritative correction';
}

$('reset').onclick=reset;$('step').onclick=step;$('run').onclick=run;$('stop').onclick=stop;
$('left').onclick=()=>localImpulse(-.22,0);$('right').onclick=()=>localImpulse(.22,0);$('up').onclick=()=>localImpulse(0,-.22);$('down').onclick=()=>localImpulse(0,.22);
$('latency').onchange=()=>log(`จำลอง network latency ${latencyTicks()} ticks`);
window.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')localImpulse(-.22,0);else if(e.key==='ArrowRight')localImpulse(.22,0);else if(e.key==='ArrowUp')localImpulse(0,-.22);else if(e.key==='ArrowDown')localImpulse(0,.22)});
reset();
