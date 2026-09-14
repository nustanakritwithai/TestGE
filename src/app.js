import {createWorld,cloneWorld,commitProposal,stateHash} from './world.js';
import {registry,verifyProposal,installTrainedModels,setApproval} from './skills.js';
import {trainGraphModels} from './learned.js';
import {runDecisiveBenchmark,summarizeDecision} from './benchmark.js';

const $=id=>document.getElementById(id);
let world=createWorld(), trainedMeta=null;

function draw(){
  const c=$('view'),g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);g.fillStyle='#07111f';g.fillRect(0,0,c.width,c.height);
  g.strokeStyle='#16324a';for(let x=0;x<c.width;x+=40){g.beginPath();g.moveTo(x,0);g.lineTo(x,c.height);g.stroke()}for(let y=0;y<c.height;y+=40){g.beginPath();g.moveTo(0,y);g.lineTo(c.width,y);g.stroke()}
  for(const e of world.entities){const x=(e.x+1)*.5*c.width,y=(e.y+1)*.5*c.height;g.beginPath();g.arc(x,y,Math.max(3,e.r*260),0,Math.PI*2);g.fillStyle=e.type==='player'?'#48c9ff':'#ff6b6b';g.fill()}
  $('tick').textContent=world.tick;$('hash').textContent=stateHash(world);$('events').textContent=world.events.length;$('relations').textContent=world.relations.length;
}

function reset(){world=createWorld({seed:+$('seed').value,count:+$('count').value,density:+$('density').value,speed:+$('speed').value});draw();$('log').textContent='รีเซ็ตโลกแล้ว';}

function step(skillId){const skill=registry[skillId];try{const request={world:cloneWorld(world),actions:world.actions,relations:world.relations,parameters:world.parameters,budget:{},criticality:+$('critical').value};const t0=performance.now();let p=skill.run(request);const ms=performance.now()-t0;const check=verifyProposal(world,p,{critical:+$('critical').value>=3});if(!check.ok){p=registry.exact.run({world:cloneWorld(world)});$('log').textContent=`${skill.label} ไม่ผ่าน verifier (${check.reason}) → fallback Exact`;}else $('log').textContent=`${skill.label} ผ่าน verifier • ${ms.toFixed(3)} ms`;commitProposal(world,p);draw();}catch(e){$('log').textContent=e.message;}}

function train(){
  $('trainStatus').textContent='กำลังฝึก...';
  const t0=performance.now();
  const models=trainGraphModels(registry.exact,registry.approx,{episodes:+$('episodes').value,epochs:+$('epochs').value,lr:+$('lr').value,count:64,density:.55,speed:1.1,seed:7001});
  installTrainedModels(models);trainedMeta=models.meta;
  const ms=performance.now()-t0;
  $('trainStatus').textContent=`ฝึกแล้ว ${models.meta.samples.toLocaleString()} ตัวอย่าง • ${ms.toFixed(0)} ms`;
  $('gnnState').textContent='ฝึกแล้ว / รอพิสูจน์';$('resState').textContent='ฝึกแล้ว / รอพิสูจน์';
}

function benchmark(){
  const rows=runDecisiveBenchmark(registry,{reps:+$('reps').value,seeds:+$('seeds').value});$('benchRows').innerHTML='';
  for(const row of rows)for(const r of row.results){const tr=document.createElement('tr');tr.innerHTML=`<td>${row.spec.label}</td><td>${r.label}</td><td>${r.error.toFixed(5)}</td><td>${(r.eventMismatch*100).toFixed(1)}%</td><td>${r.p50.toFixed(4)}</td><td>${r.p95.toFixed(4)}</td><td>${r.p99.toFixed(4)}</td>`;$('benchRows').appendChild(tr)}
  const s=summarizeDecision(rows,{requiredGain:.20});
  setApproval('gnn',false);setApproval('residual',false);
  let html='<b>ผลชี้ขาด:</b><br>';
  for(const d of s.decisions){const gain=Number.isFinite(d.learnedGain)?(d.learnedGain*100).toFixed(1)+'%':'ไม่มี learned ที่ผ่านคุณภาพ';html+=`${d.workload}: Classical=${d.classical} • Learned=${d.learned} • Gain=${gain} • ${d.passLearned?'PASS':'FAIL'}<br>`;}
  if(s.learnedApproved){html+='<br><b class="ok">มีอย่างน้อย 1 competence region ที่ Learned ชนะ ≥20% → อนุญาตให้วิจัย Hybrid ต่อ</b>';for(const row of rows){for(const r of row.results){if((r.skill==='gnn'||r.skill==='residual')&&r.error<=.05&&r.eventMismatch<=.25){const classical=row.results.filter(x=>x.skill==='exact'||x.skill==='approx').filter(x=>x.error<=.05&&x.eventMismatch<=.25).sort((a,b)=>a.p95-b.p95)[0];if(classical&&(classical.p95-r.p95)/classical.p95>=.20)setApproval(r.skill,true);}}}}
  else html+='<br><b class="bad">ยังไม่มี Learned Skill ชนะ ≥20% → V1 คง Classical เท่านั้น</b>';
  $('decision').innerHTML=html;
  $('gnnState').textContent=registry.gnn.approved?'ผ่าน Gate':'ยังไม่ผ่าน Gate';$('resState').textContent=registry.residual.approved?'ผ่าน Gate':'ยังไม่ผ่าน Gate';
  localStorage.setItem('testge_learned_decision_v1',JSON.stringify({time:new Date().toISOString(),meta:trainedMeta,rows,summary:s}));
}

$('reset').onclick=reset;$('stepExact').onclick=()=>step('exact');$('stepApprox').onclick=()=>step('approx');$('stepGnn').onclick=()=>step('gnn');$('stepResidual').onclick=()=>step('residual');$('trainModels').onclick=train;$('runBench').onclick=benchmark;reset();
