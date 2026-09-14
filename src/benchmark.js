import {createWorld,cloneWorld} from './world.js';

function median(a){const b=[...a].sort((x,y)=>x-y);return b[Math.floor(b.length/2)]}
function percentile(a,p){const b=[...a].sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor((b.length-1)*p))]}
function stateError(ref,proposal){let e=0,n=0;for(let i=0;i<ref.stateDelta.length;i++){const a=ref.stateDelta[i],b=proposal.stateDelta[i];e+=(a.x-b.x)**2+(a.y-b.y)**2+(a.vx-b.vx)**2+(a.vy-b.vy)**2;n+=4}return Math.sqrt(e/Math.max(1,n))}

export function benchmarkSkill(skill, exactSkill, spec, {reps=40,seeds=5}={}){
  const times=[],errors=[],eventMismatch=[];
  for(let s=0;s<seeds;s++){
    const base=createWorld({...spec,seed:spec.seed+s});
    const ref=exactSkill.run({world:cloneWorld(base)});
    for(let i=0;i<reps;i++){
      const w=cloneWorld(base),t0=performance.now(),out=skill.run({world:w}),t1=performance.now();times.push(t1-t0);
      errors.push(stateError(ref,out));
      const a=ref.events.length,b=out.events.length;eventMismatch.push(Math.abs(a-b)/Math.max(1,a,b));
    }
  }
  return {skill:skill.id,label:skill.label,p50:median(times),p95:percentile(times,.95),p99:percentile(times,.99),error:errors.reduce((a,b)=>a+b,0)/errors.length,eventMismatch:eventMismatch.reduce((a,b)=>a+b,0)/eventMismatch.length};
}

export function runDecisiveBenchmark(registry,{reps=40,seeds=5}={}){
  const specs=[
    {id:'simple',label:'Simple',count:24,density:.18,speed:.55,seed:1001},
    {id:'dense',label:'Dense',count:96,density:.72,speed:1.05,seed:2001},
    {id:'extreme',label:'Extreme',count:192,density:.9,speed:2.2,seed:3001}
  ];
  const rows=[];
  for(const spec of specs){
    const r=[];for(const skill of [registry.exact,registry.approx])r.push(benchmarkSkill(skill,registry.exact,spec,{reps,seeds}));
    rows.push({spec,results:r});
  }
  return rows;
}

export function summarizeDecision(rows,{qualityError=.05,eventMismatch=.25,requiredGain=.20}={}){
  let learnedApproved=false;
  const decisions=rows.map(row=>{
    const feasible=row.results.filter(x=>x.error<=qualityError&&x.eventMismatch<=eventMismatch);
    const winner=[...feasible].sort((a,b)=>a.p95-b.p95)[0];
    const exact=row.results.find(x=>x.skill==='exact');
    const approx=row.results.find(x=>x.skill==='approx');
    const gain=exact&&winner?(exact.p95-winner.p95)/exact.p95:0;
    return {workload:row.spec.label,winner:winner?.label||'ไม่มี',gain,exact,approx};
  });
  return {decisions,learnedApproved,requiredGain};
}
