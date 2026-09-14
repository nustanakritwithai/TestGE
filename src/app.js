import {createWorld,cloneWorld,commitProposal,stateHash} from './world.js';
import {registry,verifyProposal,researchArchive} from './skills.js';

const $=id=>document.getElementById(id);
let world=createWorld(),timer=null,lastMode='exact';

function draw(){
  const c=$('view'),g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);g.fillStyle='#07111f';g.fillRect(0,0,c.width,c.height);
  g.strokeStyle='#16324a';for(let x=0;x<c.width;x+=40){g.beginPath();g.moveTo(x,0);g.lineTo(x,c.height);g.stroke()}for(let y=0;y<c.height;y+=40){g.beginPath();g.moveTo(0,y);g.lineTo(c.width,y);g.stroke()}
  for(const e of world.entities){const x=(e.x+1)*.5*c.width,y=(e.y+1)*.5*c.height;g.beginPath();g.arc(x,y,Math.max(3,e.r*260),0,Math.PI*2);g.fillStyle=e.type==='player'?'#48c9ff':'#ff6b6b';g.fill()}
  $('tick').textContent=world.tick;$('hash').textContent=stateHash(world);$('events').textContent=world.events.length;$('relations').textContent=world.relations.length;
}
function reset(){stop();world=createWorld({seed:+$('seed').value,count:+$('count').value,density:+$('density').value,speed:+$('speed').value});draw();$('log').textContent='รีเซ็ตโลกแล้ว';}
function step(skillId){lastMode=skillId;const skill=registry[skillId];const request={world:cloneWorld(world),actions:world.actions,relations:world.relations,parameters:world.parameters,budget:{},criticality:+$('critical').value};const t0=performance.now();let p=skill.run(request);const ms=performance.now()-t0;const check=verifyProposal(world,p,{critical:+$('critical').value>=3});if(!check.ok){p=registry.exact.run({world:cloneWorld(world)});$('log').textContent=`${skill.label} ไม่ผ่าน verifier (${check.reason}) → fallback Exact`;}else $('log').textContent=`${skill.label} • ${ms.toFixed(3)} ms • verifier PASS`;commitProposal(world,p);draw();}
function play(){if(timer)return;const hz=+$('hz').value;timer=setInterval(()=>step(lastMode),1000/hz);$('runState').textContent=`RUN ${hz} Hz`;}
function stop(){if(timer){clearInterval(timer);timer=null}$('runState').textContent='STOP';}
function benchmark(){const reps=+$('reps').value,seeds=+$('seeds').value;const rows=[];for(const count of [24,96,192])for(const skillId of ['exact','approx']){const times=[];let mismatches=0;for(let s=0;s<seeds;s++){const base=createWorld({seed:1000+s+count,count,density:count>100?.75:count>50?.45:.18,speed:1});const ref=registry.exact.run({world:cloneWorld(base)});for(let r=0;r<reps;r++){const w=cloneWorld(base),t0=performance.now(),out=registry[skillId].run({world:w}),t1=performance.now();times.push(t1-t0);if(skillId==='approx'&&JSON.stringify(out.events)!==JSON.stringify(ref.events))mismatches++;}}times.sort((a,b)=>a-b);const p=x=>times[Math.floor((times.length-1)*x)];rows.push({count,skillId,p50:p(.5),p95:p(.95),p99:p(.99),mismatch:mismatches/(reps*seeds)});} $('benchRows').innerHTML=rows.map(r=>`<tr><td>${r.count}</td><td>${registry[r.skillId].label}</td><td>${r.p50.toFixed(4)}</td><td>${r.p95.toFixed(4)}</td><td>${r.p99.toFixed(4)}</td><td>${(r.mismatch*100).toFixed(1)}%</td></tr>`).join('');
}
function determinism(){const seed=+$('seed').value,count=+$('count').value,density=+$('density').value,speed=+$('speed').value;const run=()=>{let w=createWorld({seed,count,density,speed});for(let i=0;i<120;i++)commitProposal(w,registry.exact.run({world:cloneWorld(w)}));return stateHash(w)};const a=run(),b=run(),ok=a===b;$('determinism').textContent=ok?`PASS ${a}`:`FAIL ${a} / ${b}`;$('determinism').className=ok?'ok':'bad';}
function renderArchive(){$('archive').innerHTML=researchArchive.map(x=>`<div class="card"><b>${x.id}</b> — <span class="bad">${x.status}</span><div class="muted">${x.reason}</div></div>`).join('');}

$('reset').onclick=reset;$('stepExact').onclick=()=>step('exact');$('stepApprox').onclick=()=>step('approx');$('play').onclick=play;$('stop').onclick=stop;$('runBench').onclick=benchmark;$('runDet').onclick=determinism;renderArchive();reset();
