import {createWorld,cloneWorld,commitProposal,stateHash} from './world.js';
import {registry,verifyProposal} from './skills.js';
import {runDecisiveBenchmark} from './benchmark.js';

const $=id=>document.getElementById(id);
let world=createWorld();

function draw(){
  const c=$('view'),g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);g.fillStyle='#07111f';g.fillRect(0,0,c.width,c.height);
  g.strokeStyle='#16324a';for(let x=0;x<c.width;x+=40){g.beginPath();g.moveTo(x,0);g.lineTo(x,c.height);g.stroke()}for(let y=0;y<c.height;y+=40){g.beginPath();g.moveTo(0,y);g.lineTo(c.width,y);g.stroke()}
  for(const e of world.entities){const x=(e.x+1)*.5*c.width,y=(e.y+1)*.5*c.height;g.beginPath();g.arc(x,y,Math.max(3,e.r*260),0,Math.PI*2);g.fillStyle=e.type==='player'?'#48c9ff':'#ff6b6b';g.fill()}
  $('tick').textContent=world.tick;$('hash').textContent=stateHash(world);$('events').textContent=world.events.length;$('relations').textContent=world.relations.length;
}

function reset(){world=createWorld({seed:+$('seed').value,count:+$('count').value,density:+$('density').value,speed:+$('speed').value});draw();$('log').textContent='รีเซ็ตโลกแล้ว';}

function step(skillId){const skill=registry[skillId];const request={world:cloneWorld(world),actions:world.actions,relations:world.relations,parameters:world.parameters,budget:{},criticality:+$('critical').value};const t0=performance.now();let p=skill.run(request);const ms=performance.now()-t0;const check=verifyProposal(world,p,{critical:+$('critical').value>=3});if(!check.ok){p=registry.exact.run({world:cloneWorld(world)});$('log').textContent=`${skill.label} ไม่ผ่าน verifier (${check.reason}) → fallback Exact`;}else $('log').textContent=`${skill.label} ผ่าน verifier • ${ms.toFixed(3)} ms`;commitProposal(world,p);draw();}

function benchmark(){const rows=runDecisiveBenchmark(registry,{reps:+$('reps').value,seeds:+$('seeds').value});$('benchRows').innerHTML='';for(const row of rows){for(const r of row.results){const tr=document.createElement('tr');tr.innerHTML=`<td>${row.spec.label}</td><td>${r.label}</td><td>${r.error.toFixed(5)}</td><td>${(r.eventMismatch*100).toFixed(1)}%</td><td>${r.p50.toFixed(4)}</td><td>${r.p95.toFixed(4)}</td><td>${r.p99.toFixed(4)}</td>`;$('benchRows').appendChild(tr)}}
  $('decision').innerHTML='<b>สถานะปัจจุบัน:</b> Classical baseline ใช้งานจริงแล้ว • GNN/Residual ยังถูกล็อกเป็น Research Slot จนกว่าจะมี trained model ที่ชนะเกณฑ์ ≥20% ใน workload ใด workload หนึ่ง';
}

$('reset').onclick=reset;$('stepExact').onclick=()=>step('exact');$('stepApprox').onclick=()=>step('approx');$('runBench').onclick=benchmark;reset();
