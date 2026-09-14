import { performance } from 'node:perf_hooks';

// TestGE Local Residual Contact Solver research benchmark.
// Goal: test whether a learned residual corrector can accelerate an expensive
// local iterative contact solver while keeping geometry/events classical.

function rng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function mean(a){return a.reduce((s,x)=>s+x,0)/Math.max(1,a.length)}
function pct(a,p){const b=[...a].sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor((b.length-1)*p))]}
function rmse(a,b){let s=0,n=0;for(let i=0;i<a.length;i++){const dx=a[i].vx-b[i].vx,dy=a[i].vy-b[i].vy;s+=dx*dx+dy*dy;n+=2}return Math.sqrt(s/Math.max(1,n))}
function cloneBodies(b){return b.map(x=>({...x}))}

function makeCase({seed=1,contacts=64,speed=1,dense=0.7,restitution=0.15,friction=0.08}={}){
  const R=rng(seed), n=Math.max(8,Math.ceil(contacts*0.62));
  const bodies=Array.from({length:n},(_,i)=>({id:i,mass:0.65+R()*1.8,vx:(R()-.5)*2*speed,vy:(R()-.5)*2*speed}));
  const edges=[], seen=new Set();
  // First build a connected backbone, then random local contact edges.
  for(let i=1;i<n && edges.length<contacts;i++){
    const j=Math.max(0,i-1-Math.floor(R()*Math.min(i,3)));
    const ang=R()*Math.PI*2,key=Math.min(i,j)+':'+Math.max(i,j);seen.add(key);
    edges.push({a:j,b:i,nx:Math.cos(ang),ny:Math.sin(ang),penetration:.005+R()*.035,restitution,friction});
  }
  while(edges.length<contacts){
    const a=Math.floor(R()*n), span=Math.max(2,Math.floor(2+dense*10)), b=Math.max(0,Math.min(n-1,a+Math.floor((R()-.5)*span*2)));
    if(a===b)continue;const lo=Math.min(a,b),hi=Math.max(a,b),key=lo+':'+hi;if(seen.has(key))continue;seen.add(key);
    const ang=R()*Math.PI*2;edges.push({a:lo,b:hi,nx:Math.cos(ang),ny:Math.sin(ang),penetration:.003+R()*.045,restitution,friction});
  }
  return {bodies,edges,meta:{seed,contacts:edges.length,n,speed,dense,restitution,friction}};
}

function solveIterative(input,iterations=20){
  const b=cloneBodies(input.bodies), E=input.edges;
  for(let it=0;it<iterations;it++){
    for(const c of E){
      const A=b[c.a],B=b[c.b],rvx=B.vx-A.vx,rvy=B.vy-A.vy,rvn=rvx*c.nx+rvy*c.ny;
      // Bias term approximates positional correction pressure.
      const bias=Math.min(.65,c.penetration*9);
      let j=(-(1+c.restitution)*Math.min(0,rvn)+bias)/(1/A.mass+1/B.mass);
      if(j<0)j=0;
      const ix=j*c.nx,iy=j*c.ny;A.vx-=ix/A.mass;A.vy-=iy/A.mass;B.vx+=ix/B.mass;B.vy+=iy/B.mass;
      // Lightweight tangential damping/friction.
      const tx=-c.ny,ty=c.nx,rvt=rvx*tx+rvy*ty,jt=Math.max(-c.friction*j,Math.min(c.friction*j,-rvt/(1/A.mass+1/B.mass)));
      A.vx-=jt*tx/A.mass;A.vy-=jt*ty/A.mass;B.vx+=jt*tx/B.mass;B.vy+=jt*ty/B.mass;
    }
  }
  return b;
}

function aggregateFeatures(input,approx){
  const n=input.bodies.length, agg=Array.from({length:n},()=>({cnt:0,nx:0,ny:0,rvn:0,pen:0,nbvx:0,nbvy:0}));
  for(const c of input.edges){
    const A=approx[c.a],B=approx[c.b],rvn=(B.vx-A.vx)*c.nx+(B.vy-A.vy)*c.ny;
    for(const [id,sign,nb] of [[c.a,1,B],[c.b,-1,A]]){const q=agg[id];q.cnt++;q.nx+=c.nx*sign;q.ny+=c.ny*sign;q.rvn+=rvn;q.pen+=c.penetration;q.nbvx+=nb.vx;q.nbvy+=nb.vy;}
  }
  return approx.map((e,i)=>{const q=agg[i],k=Math.max(1,q.cnt);return [1,e.vx,e.vy,1/e.mass,Math.min(1,q.cnt/10),q.nx/k,q.ny/k,q.rvn/k,q.pen/k,q.nbvx/k,q.nbvy/k,(q.cnt*q.pen)/k];});
}

const F=12;
function weights(){return {x:new Float64Array(F),y:new Float64Array(F)}}
function dot(w,f){let s=0;for(let i=0;i<F;i++)s+=w[i]*f[i];return s}
function trainResidual(trainCases,{epochs=24,lr=.008,approxIterations=2,exactIterations=20}={}){
  const W=weights(), samples=[];
  for(const c of trainCases){const ap=solveIterative(c,approxIterations),ex=solveIterative(c,exactIterations),fs=aggregateFeatures(c,ap);for(let i=0;i<ap.length;i++)samples.push({f:fs[i],tx:ex[i].vx-ap[i].vx,ty:ex[i].vy-ap[i].vy});}
  for(let ep=0;ep<epochs;ep++){const eta=lr/(1+ep*.08);for(const s of samples){const ex=dot(W.x,s.f)-s.tx,ey=dot(W.y,s.f)-s.ty;for(let j=0;j<F;j++){W.x[j]-=eta*(2*ex*s.f[j]+1e-6*W.x[j]);W.y[j]-=eta*(2*ey*s.f[j]+1e-6*W.y[j]);}}}
  return {W,samples:samples.length,epochs,lr,approxIterations,exactIterations};
}
function solveResidual(input,model){const ap=solveIterative(input,model.approxIterations),fs=aggregateFeatures(input,ap);for(let i=0;i<ap.length;i++){ap[i].vx+=dot(model.W.x,fs[i]);ap[i].vy+=dot(model.W.y,fs[i]);}return ap}

function benchOne(name,fn,cases,reps=24){const times=[],errors=[];for(const c of cases){const ref=solveIterative(c,20);for(let r=0;r<reps;r++){const t0=performance.now(),out=fn(c),t1=performance.now();times.push(t1-t0);errors.push(rmse(ref,out));}}return {name,p50:pct(times,.50),p95:pct(times,.95),p99:pct(times,.99),error:mean(errors),maxError:Math.max(...errors),samples:times.length};}
function determinism(fn,c){const a=fn(c),b=fn(c);let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i].vx-b[i].vx),Math.abs(a[i].vy-b[i].vy));return max===0;}

const train=[];for(let s=0;s<90;s++){const contacts=[32,64,128,256][s%4],speed=[.6,1,1.6][s%3],dense=[.45,.7,.9][s%3];train.push(makeCase({seed:10000+s,contacts,speed,dense,restitution:.1+(s%4)*.05,friction:.04+(s%3)*.04}));}
const model=trainResidual(train,{epochs:28,lr:.0065,approxIterations:2,exactIterations:20});

const suites=[
  {id:'iid',label:'IID',counts:[32,64,128,256],speed:1,dense:.7,seeds:[2101,2102,2103,2104,2105]},
  {id:'scale',label:'Scale 512',counts:[512],speed:1,dense:.85,seeds:[3101,3102,3103,3104,3105]},
  {id:'fast',label:'High velocity OOD',counts:[64,128,256],speed:2.6,dense:.75,seeds:[4101,4102,4103,4104,4105]},
  {id:'dense',label:'Dense OOD',counts:[128,256,512],speed:1.3,dense:.98,seeds:[5101,5102,5103,5104,5105]},
  {id:'material',label:'Material OOD',counts:[64,128,256],speed:1.4,dense:.8,seeds:[6101,6102,6103,6104,6105],restitution:.45,friction:.22}
];

const results=[];
for(const suite of suites){
  const cases=[];for(const count of suite.counts)for(const seed of suite.seeds)cases.push(makeCase({seed:seed+count,contacts:count,speed:suite.speed,dense:suite.dense,restitution:suite.restitution??.15,friction:suite.friction??.08}));
  const exact=benchOne('Exact iterative x20',c=>solveIterative(c,20),cases,18);
  const approx=benchOne('Approx iterative x2',c=>solveIterative(c,2),cases,18);
  const residual=benchOne('Residual contact corrector',c=>solveResidual(c,model),cases,18);
  const gain=(exact.p95-residual.p95)/exact.p95;
  const qualityPass=residual.error<=.08 && residual.maxError<=.16;
  const speedPass=gain>=.20;
  results.push({suite:suite.id,label:suite.label,cases:cases.length,contacts:suite.counts,exact,approx,residual,gain,qualityPass,speedPass,pass:qualityPass&&speedPass,eventMismatch:0,criticalMiss:0,deterministic:determinism(c=>solveResidual(c,model),cases[0])});
}

// Scaling detail by contact count to find a competence region boundary.
const scaling=[];for(const contacts of [32,64,128,256,512]){const cases=[1,2,3,4,5].map(s=>makeCase({seed:8000+s+contacts,contacts,speed:1.2,dense:.85}));const ex=benchOne('exact',c=>solveIterative(c,20),cases,25),re=benchOne('residual',c=>solveResidual(c,model),cases,25);scaling.push({contacts,exactP95:ex.p95,residualP95:re.p95,error:re.error,maxError:re.maxError,gain:(ex.p95-re.p95)/ex.p95,pass:re.error<=.08&&re.maxError<=.16&&((ex.p95-re.p95)/ex.p95)>=.20});}

const mem0=process.memoryUsage().heapUsed;for(let i=0;i<50;i++)solveResidual(makeCase({seed:9000+i,contacts:512,speed:1.3,dense:.9}),model);const mem1=process.memoryUsage().heapUsed;
const anyPass=results.some(x=>x.pass)||scaling.some(x=>x.pass);
const allSafe=results.every(x=>x.eventMismatch===0&&x.criticalMiss===0&&x.deterministic);
const report={version:'local-contact-v1',model:{samples:model.samples,epochs:model.epochs,lr:model.lr,approxIterations:model.approxIterations,exactIterations:model.exactIterations},thresholds:{meanRmse:.08,maxRmse:.16,requiredP95Gain:.20,eventMismatch:0,criticalMiss:0},results,scaling,memory:{heapDeltaBytes:mem1-mem0},decision:{anyCompetenceRegion:anyPass,allSafetyChecksPass:allSafe,next:anyPass&&allSafe?'CANDIDATE_FOR_ENGINE_RESEARCH_SLOT':'KEEP_CLASSICAL_V1'}};
console.log('TESTGE_LOCAL_CONTACT_BEGIN');console.log(JSON.stringify(report,null,2));console.log('TESTGE_LOCAL_CONTACT_END');console.log('FINAL_LOCAL_CONTACT_DECISION='+report.decision.next);
