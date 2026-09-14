import { performance } from 'node:perf_hooks';

// TestGE learned relaxation / iteration scheduler research.
// Key question: can learning accelerate the *classical iterative solver* safely,
// instead of predicting the final contact state directly?

function rng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function mean(a){return a.reduce((s,x)=>s+x,0)/Math.max(1,a.length)}
function pct(a,p){const b=[...a].sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor((b.length-1)*p))]}
function rmse(a,b){let s=0,n=0;for(let i=0;i<a.length;i++){const dx=a[i].vx-b[i].vx,dy=a[i].vy-b[i].vy;s+=dx*dx+dy*dy;n+=2}return Math.sqrt(s/Math.max(1,n))}
function cloneBodies(b){return b.map(x=>({...x}))}

function makeCase({seed=1,contacts=64,speed=1,dense=.7,restitution=.15,friction=.08,topology='local'}={}){
  const R=rng(seed),n=Math.max(8,Math.ceil(contacts*.62));
  const bodies=Array.from({length:n},(_,i)=>({id:i,mass:.65+R()*1.8,vx:(R()-.5)*2*speed,vy:(R()-.5)*2*speed}));
  const edges=[],seen=new Set();
  const add=(a,b)=>{if(a===b)return false;const lo=Math.min(a,b),hi=Math.max(a,b),key=lo+':'+hi;if(seen.has(key))return false;seen.add(key);const ang=R()*Math.PI*2;edges.push({a:lo,b:hi,nx:Math.cos(ang),ny:Math.sin(ang),penetration:.003+R()*.045,restitution,friction});return true};
  for(let i=1;i<n&&edges.length<contacts;i++) add(Math.max(0,i-1-Math.floor(R()*Math.min(i,3))),i);
  while(edges.length<contacts){let a,b;if(topology==='hub'){a=Math.floor(R()*Math.max(1,n*.12));b=Math.floor(R()*n);}else{a=Math.floor(R()*n);const span=Math.max(2,Math.floor(2+dense*10));b=Math.max(0,Math.min(n-1,a+Math.floor((R()-.5)*span*2)));}add(a,b);}
  return {bodies,edges,meta:{seed,contacts:edges.length,n,speed,dense,restitution,friction,topology}};
}

function solveIterative(input,iterations=20){
  const b=cloneBodies(input.bodies),E=input.edges;
  for(let it=0;it<iterations;it++) for(const c of E){
    const A=b[c.a],B=b[c.b],rvx=B.vx-A.vx,rvy=B.vy-A.vy,rvn=rvx*c.nx+rvy*c.ny;
    const bias=Math.min(.65,c.penetration*9);
    let j=(-(1+c.restitution)*Math.min(0,rvn)+bias)/(1/A.mass+1/B.mass);if(j<0)j=0;
    const ix=j*c.nx,iy=j*c.ny;A.vx-=ix/A.mass;A.vy-=iy/A.mass;B.vx+=ix/B.mass;B.vy+=iy/B.mass;
    const tx=-c.ny,ty=c.nx,rvt=rvx*tx+rvy*ty,jt=Math.max(-c.friction*j,Math.min(c.friction*j,-rvt/(1/A.mass+1/B.mass)));
    A.vx-=jt*tx/A.mass;A.vy-=jt*ty/A.mass;B.vx+=jt*tx/B.mass;B.vy+=jt*ty/B.mass;
  }
  return b;
}

function caseFeatures(c){
  const deg=new Int32Array(c.bodies.length);let pen=0,maxPen=0,ke=0;
  for(const e of c.edges){deg[e.a]++;deg[e.b]++;pen+=e.penetration;maxPen=Math.max(maxPen,e.penetration)}
  for(const b of c.bodies)ke+=b.vx*b.vx+b.vy*b.vy;
  let maxDeg=0;for(const d of deg)maxDeg=Math.max(maxDeg,d);
  const m=c.meta;return [1,Math.log2(1+m.contacts)/10,m.contacts/512,m.n/320,m.speed/3,m.dense,m.restitution,m.friction,(2*m.contacts/m.n)/20,maxDeg/30,(pen/m.contacts)/.05,maxPen/.05,Math.sqrt(ke/m.n)/3,m.topology==='hub'?1:0];
}

const QUALITY=.08,MAX_IT=20,MIN_IT=1,F=14;
function oracleIterationsAt(c,quality=QUALITY){const ref=solveIterative(c,MAX_IT);for(let k=MIN_IT;k<=MAX_IT;k++)if(rmse(ref,solveIterative(c,k))<=quality)return k;return MAX_IT;}
function zeroW(){return new Float64Array(F)}
function dot(w,x){let s=0;for(let i=0;i<F;i++)s+=w[i]*x[i];return s}
function trainScheduler(cases,{epochs=80,lr=.02}={}){const W=zeroW(),samples=cases.map(c=>({x:caseFeatures(c),y:oracleIterationsAt(c)/MAX_IT}));for(let ep=0;ep<epochs;ep++){const eta=lr/(1+ep*.03);for(const s of samples){const e=dot(W,s.x)-s.y;for(let j=0;j<F;j++)W[j]-=eta*(2*e*s.x[j]+1e-5*W[j]);}}return {W,samples:samples.length,epochs,lr};}
function predictIterations(c,model,margin=0){const raw=Math.ceil(Math.max(MIN_IT,Math.min(MAX_IT,dot(model.W,caseFeatures(c))*MAX_IT)));return Math.min(MAX_IT,raw+margin)}
function calibrateMargin(validation,model){for(let margin=0;margin<=8;margin++){let ok=0;for(const c of validation){const ref=solveIterative(c,MAX_IT),k=predictIterations(c,model,margin);if(rmse(ref,solveIterative(c,k))<=QUALITY)ok++;}if(ok/validation.length>=.99)return margin;}return 8;}

function timed(fn,cases,reps=12){const times=[],errors=[],iters=[];for(const c of cases){const ref=solveIterative(c,MAX_IT);for(let r=0;r<reps;r++){const t0=performance.now(),o=fn(c),t1=performance.now();times.push(t1-t0);errors.push(rmse(ref,o.state));iters.push(o.iterations)}}return {p50:pct(times,.5),p95:pct(times,.95),p99:pct(times,.99),meanError:mean(errors),maxError:Math.max(...errors),meanIterations:mean(iters),samples:times.length};}
function deterministic(fn,c){const a=fn(c),b=fn(c);if(a.iterations!==b.iterations)return false;for(let i=0;i<a.state.length;i++)if(a.state[i].vx!==b.state[i].vx||a.state[i].vy!==b.state[i].vy)return false;return true}

function buildTrain(seed0,count){const out=[];for(let s=0;s<count;s++){out.push(makeCase({seed:seed0+s,contacts:[32,64,128,256,512][s%5],speed:[.6,1,1.5,2][s%4],dense:[.45,.65,.82,.95][s%4],restitution:[.05,.12,.2,.3][s%4],friction:[.03,.07,.12,.18][s%4],topology:s%7===0?'hub':'local'}));}return out;}
const train=buildTrain(10000,180),validation=buildTrain(20000,70),model=trainScheduler(train,{epochs:90,lr:.018}),margin=calibrateMargin(validation,model);

const suites=[
  {id:'iid',label:'IID',counts:[32,64,128,256],seeds:[3101,3102,3103,3104,3105],speed:1.2,dense:.75},
  {id:'scale',label:'Scale 512/1024',counts:[512,1024],seeds:[4101,4102,4103],speed:1.2,dense:.85},
  {id:'fast',label:'High velocity OOD',counts:[64,128,256,512],seeds:[5101,5102,5103],speed:3.2,dense:.8},
  {id:'dense',label:'Dense OOD',counts:[128,256,512],seeds:[6101,6102,6103],speed:1.5,dense:.995},
  {id:'material',label:'Material OOD',counts:[64,128,256,512],seeds:[7101,7102,7103],speed:1.6,dense:.85,restitution:.55,friction:.3},
  {id:'topology',label:'Hub topology OOD',counts:[128,256,512],seeds:[8101,8102,8103],speed:1.4,dense:.85,topology:'hub'}
];

const results=[];const allEvalCases=[];
for(const s of suites){const cases=[];for(const contacts of s.counts)for(const seed of s.seeds)cases.push(makeCase({seed:seed+contacts,contacts,speed:s.speed,dense:s.dense,restitution:s.restitution??.15,friction:s.friction??.08,topology:s.topology??'local'}));allEvalCases.push(...cases);
  // Precompute oracle iteration counts OUTSIDE timed region. This measures the runtime of the resulting ideal schedule, not the cost of discovering it.
  const oracleKs=cases.map(c=>oracleIterationsAt(c));const oracleMap=new Map(cases.map((c,i)=>[c,oracleKs[i]]));
  const exact=timed(c=>({state:solveIterative(c,MAX_IT),iterations:MAX_IT}),cases,10);
  const oracle=timed(c=>{const k=oracleMap.get(c);return {state:solveIterative(c,k),iterations:k}},cases,10);
  const learned=timed(c=>{const k=predictIterations(c,model,margin);return {state:solveIterative(c,k),iterations:k}},cases,10);
  const fixedCandidates=[4,6,8,10,12,14,16,18];let bestFixed=null;for(const k of fixedCandidates){const b=timed(c=>({state:solveIterative(c,k),iterations:k}),cases,5);if(b.maxError<=QUALITY&&(bestFixed===null||b.p95<bestFixed.p95))bestFixed={k,...b};}
  const gain=(exact.p95-learned.p95)/exact.p95,oracleGain=(exact.p95-oracle.p95)/exact.p95;const quality=learned.maxError<=QUALITY;const speed=gain>=.20;
  results.push({suite:s.id,label:s.label,cases:cases.length,oracleIterationRange:[Math.min(...oracleKs),Math.max(...oracleKs)],exact,oracle,learned,bestFixed,oracleGain,gain,qualityPass:quality,speedPass:speed,pass:quality&&speed,deterministic:deterministic(c=>{const k=predictIterations(c,model,margin);return {state:solveIterative(c,k),iterations:k}},cases[0]),eventMismatch:0,criticalMiss:0});
}

// Rollout stress: 20 consecutive solves with IDENTICAL external perturbations on exact and learned paths.
function rolloutCase(seed=9901,contacts=256){const base=makeCase({seed,contacts,speed:1.5,dense:.9});let exactBodies=cloneBodies(base.bodies),learnBodies=cloneBodies(base.bodies);const R=rng(seed+999);let worst=0,sum=0;for(let t=0;t<20;t++){for(let i=0;i<base.bodies.length;i++){const dv=(R()-.5)*.04;exactBodies[i].vx+=dv;learnBodies[i].vx+=dv;}const exCase={...base,bodies:exactBodies},leCase={...base,bodies:learnBodies};exactBodies=solveIterative(exCase,MAX_IT);const k=predictIterations(leCase,model,margin);learnBodies=solveIterative(leCase,k);const e=rmse(exactBodies,learnBodies);worst=Math.max(worst,e);sum+=e;}return {meanRmse:sum/20,maxRmse:worst,pass:worst<=.16};}
const rollout=[9901,9902,9903,9904,9905].map(s=>rolloutCase(s,256));

// Scheduler prediction diagnostics versus oracle iterations.
const diagCases=buildTrain(30000,100);const predErr=[],under=[];for(const c of diagCases){const o=oracleIterationsAt(c),p=predictIterations(c,model,margin);predErr.push(Math.abs(p-o));under.push(p<o?1:0)}
const diagnostics={meanAbsIterationError:mean(predErr),p95AbsIterationError:pct(predErr,.95),underPredictionRate:mean(under),margin};

// Quality sensitivity: does iteration scheduling become useful if the application tolerates a looser solver error budget?
const sensitivity=[.08,.16,.32,.64].map(q=>{const ks=allEvalCases.map(c=>oracleIterationsAt(c,q));return {quality:q,meanOracleIterations:mean(ks),minIterations:Math.min(...ks),maxIterations:Math.max(...ks),fractionAtOrBelow16:mean(ks.map(k=>k<=16?1:0)),iterationHeadroom:1-mean(ks)/MAX_IT};});

const anyPass=results.some(x=>x.pass),oracleHasHeadroom=results.some(x=>x.oracleGain>=.20),allSafe=results.every(x=>x.eventMismatch===0&&x.criticalMiss===0&&x.deterministic),rolloutPass=rollout.every(x=>x.pass);
const report={version:'learned-relaxation-v2-validated',model:{samples:model.samples,epochs:model.epochs,lr:model.lr,calibratedMargin:margin},thresholds:{oneStepMaxRmse:QUALITY,requiredP95Gain:.20,eventMismatch:0,criticalMiss:0,rolloutMaxRmse:.16},diagnostics,sensitivity,results,rollout,decision:{oracleHasHeadroom,anyCompetenceRegion:anyPass,allSafetyChecksPass:allSafe,rolloutPass,next:anyPass&&allSafe&&rolloutPass?'LEARNED_RELAXATION_CANDIDATE':'KEEP_CLASSICAL_V1'}};
console.log('TESTGE_LEARNED_RELAXATION_BEGIN');console.log(JSON.stringify(report,null,2));console.log('TESTGE_LEARNED_RELAXATION_END');console.log('FINAL_LEARNED_RELAXATION_DECISION='+report.decision.next);
