import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const W=8,H=8,N=W*H;
const HORIZON=1200;
const OBSERVE_EVERY=10;
const DISCOVERY_EVERY=100;
const BASE_DECISION_DELAY=6;
const HANDOFF_BASE_DELAY=6;
const CRAFT_DELAY=24;
const SOCIAL_BOOST=12;
const HOUSE_COUNTS={RESOURCE:20,PRODUCTION:14,MARKET:10,ADVENTURE:14,LEADER:6};
const RULES={
  B3S23:'B3/S23',
  B238S234:'B238/S234',
  B38S123:'B38/S123'
};

function rng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function mean(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:0}
function median(a){if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y),m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])/2}
function hash(v){return createHash('sha256').update(JSON.stringify(v)).digest('hex')}
function clone(v){return JSON.parse(JSON.stringify(v))}
function shuffle(a,R){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(R()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
function idNum(id){return Number(id.slice(4))}
function xy(i){return[i%W,Math.floor(i/W)]}
function distance(a,b){const dx=a.x-b.x,dy=a.y-b.y;return Math.sqrt(dx*dx+dy*dy)}

const NEIGHBORS=Array.from({length:N},(_,i)=>{
  const [x,y]=xy(i),out=[];
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(dx===0&&dy===0)continue;
    out.push(((y+dy+H)%H)*W+((x+dx+W)%W));
  }
  return out;
});

function parseRule(rule){
  const m=rule.match(/^B([0-8]*)\/S([0-8]*)$/);if(!m)throw new Error('bad rule '+rule);
  return {rule,b:new Set([...m[1]].map(Number)),s:new Set([...m[2]].map(Number))};
}
function seededInitial(seed,density){const R=rng(seed),g=new Uint8Array(N);for(let i=0;i<N;i++)g[i]=R()<density?1:0;return g}
function stepRule(g,spec){
  const next=new Uint8Array(N);
  for(let i=0;i<N;i++){
    let live=0;for(const j of NEIGHBORS[i])live+=g[j];
    next[i]=g[i]?(spec.s.has(live)?1:0):(spec.b.has(live)?1:0);
  }
  return next;
}
function stateSequence(rule,seed,density,generations){
  const spec=parseRule(rule);let g=seededInitial(seed,density),states=[Uint8Array.from(g)];
  for(let k=0;k<generations;k++){g=stepRule(g,spec);states.push(Uint8Array.from(g))}
  return states;
}
function countActive(g){let n=0;for(const v of g)n+=v;return n}
function activeIndices(g){const a=[];for(let i=0;i<N;i++)if(g[i])a.push(i);return a}
function activeOverlap(a,b){let n=0;for(let i=0;i<N;i++)if(a[i]&&b[i])n++;return n}
function persistenceMatchedStates(states,seed){
  const R=rng(seed^0x9e3779b9),out=[];
  const first=new Uint8Array(N);
  for(const i of shuffle([...Array(N).keys()],R).slice(0,countActive(states[0])))first[i]=1;
  out.push(first);
  for(let t=1;t<states.length;t++){
    const targetCount=countActive(states[t]),targetOverlap=activeOverlap(states[t-1],states[t]);
    const prevA=activeIndices(out[t-1]),prevI=[];for(let i=0;i<N;i++)if(!out[t-1][i])prevI.push(i);
    const births=targetCount-targetOverlap,next=new Uint8Array(N);
    assert(targetOverlap<=Math.min(prevA.length,targetCount),'PM overlap infeasible');
    assert(births<=prevI.length,'PM births infeasible');
    for(const i of shuffle(prevA,R).slice(0,targetOverlap))next[i]=1;
    for(const i of shuffle(prevI,R).slice(0,births))next[i]=1;
    assert.equal(countActive(next),targetCount);
    assert.equal(activeOverlap(out[t-1],next),targetOverlap);
    out.push(next);
  }
  return out;
}
function componentLabels(g){
  const labels=new Int16Array(N);labels.fill(-1);let group=0;
  for(let start=0;start<N;start++){
    if(!g[start]||labels[start]>=0)continue;
    const q=[start];labels[start]=group;
    while(q.length){
      const i=q.pop();
      for(const j of NEIGHBORS[i])if(g[j]&&labels[j]<0){labels[j]=group;q.push(j)}
    }
    group++;
  }
  return {labels,groupCount:group};
}
function baseRoster(){
  const a=[];let id=0;
  for(const [house,n] of Object.entries(HOUSE_COUNTS))for(let i=0;i<n;i++)a.push({npcId:'NPC-'+String(id++).padStart(2,'0'),house});
  assert.equal(a.length,N);return a;
}
function socialMapping(seed){return shuffle(baseRoster(),rng(seed)).map((p,cell)=>({...p,cell}))}
function socialProfile({condition,activeSeed,mappingSeed,density,cadence,horizon}){
  const mapping=socialMapping(mappingSeed),cellByNpc=Object.fromEntries(mapping.map(x=>[x.npcId,x.cell]));
  const generations=Math.ceil(horizon/cadence)+2;
  let states;
  if(condition==='NO_SOCIAL')states=Array.from({length:generations+1},()=>new Uint8Array(N));
  else if(condition==='B3/S23'||condition==='B238/S234'||condition==='B38/S123')states=stateSequence(condition,activeSeed,density,generations);
  else if(condition==='PM_B238'){
    const base=stateSequence(RULES.B238S234,activeSeed,density,generations);
    states=persistenceMatchedStates(base,activeSeed+mappingSeed+7301);
  } else if(condition==='PM_B38'){
    const base=stateSequence(RULES.B38S123,activeSeed,density,generations);
    states=persistenceMatchedStates(base,activeSeed+mappingSeed+9109);
  } else throw new Error('unknown condition '+condition);
  const frames=states.map(componentLabels);
  return {condition,mapping,cellByNpc,states,frames,cadence,horizon};
}
function groupAt(profile,step,npcId){
  const gi=Math.min(Math.floor(step/profile.cadence),profile.frames.length-1),cell=profile.cellByNpc[npcId];
  return profile.frames[gi].labels[cell];
}
function sameSocialGroup(profile,step,a,b){
  if(profile.condition==='NO_SOCIAL')return false;
  const ga=groupAt(profile,step,a);return ga>=0&&ga===groupAt(profile,step,b);
}
function socialResourceCandidates(profile,step,producerId,resourceIds){
  const g=groupAt(profile,step,producerId);if(g<0)return [];
  const gi=Math.min(Math.floor(step/profile.cadence),profile.frames.length-1);
  return resourceIds.filter(id=>profile.frames[gi].labels[profile.cellByNpc[id]]===g);
}
function socialRemaining(profile,step,a,b){
  if(!sameSocialGroup(profile,step,a,b))return 0;
  const startGen=Math.floor(step/profile.cadence);
  for(let g=startGen+1;g<profile.frames.length;g++){
    const la=profile.frames[g].labels[profile.cellByNpc[a]],lb=profile.frames[g].labels[profile.cellByNpc[b]];
    if(la<0||la!==lb)return g*profile.cadence-step;
  }
  return profile.horizon-step;
}

function worldPositions(seed){
  const R=rng(seed^0xa5a5a5a5),out={};
  for(const p of baseRoster())out[p.npcId]={x:Math.floor(R()*100),y:Math.floor(R()*100)};
  return out;
}
function discoveryOrder(producerId,resourceIds,seed){
  const R=rng(seed+idNum(producerId)*1009);
  return shuffle(resourceIds,R);
}
function emptyResource(id,pos){return{id,material:'NONE',stock:0,reserve:0,reserved:0,pos:{...pos}}}
function resource(id,pos,material,stock,reserve=2){return{id,material,stock,reserve,reserved:0,pos:{...pos}}}
function producer(id,pos,jobs){return{id,pos:{...pos},jobs:jobs.map((j,i)=>({...j,jobId:id+'-J'+i,createdAt:i===0?0:null})),jobIndex:0,inventory:{WOOD:0,STONE:0,ORE:0},pending:null,intent:null,crafting:null,outputs:0,lastPartner:null,partners:[]}}

function makeScenario(name,seed){
  const positions=worldPositions(seed),resources={},producers={};
  for(let i=0;i<20;i++){const id='NPC-'+String(i).padStart(2,'0');resources[id]=emptyResource(id,positions[id])}
  for(let i=20;i<34;i++){const id='NPC-'+String(i).padStart(2,'0');producers[id]=producer(id,positions[id],[])}
  const setR=(i,mat,stock,reserve=2)=>{const id='NPC-'+String(i).padStart(2,'0');resources[id]=resource(id,positions[id],mat,stock,reserve)};
  const setP=(i,jobs)=>{const id='NPC-'+String(i).padStart(2,'0');producers[id]=producer(id,positions[id],jobs)};
  if(name==='S1_EASY'){
    setR(0,'WOOD',8,2);setP(20,[{material:'WOOD',qty:2}]);
  } else if(name==='S2_MULTI'){
    setR(0,'WOOD',10,2);setR(1,'WOOD',8,2);setR(2,'STONE',10,2);setR(3,'STONE',8,2);
    setP(20,[{material:'WOOD',qty:2},{material:'WOOD',qty:2}]);
    setP(21,[{material:'WOOD',qty:2}]);
    setP(22,[{material:'STONE',qty:2},{material:'STONE',qty:2}]);
    setP(23,[{material:'STONE',qty:2}]);
  } else if(name==='S3_SCARCITY'){
    setR(0,'WOOD',4,2);setR(1,'WOOD',4,2);
    for(let i=20;i<24;i++)setP(i,[{material:'WOOD',qty:2}]);
  } else if(name==='S4_INVALID'){
    setR(0,'WOOD',2,2);setR(1,'STONE',10,2);setR(2,'WOOD',6,2);setR(3,'ORE',10,2);
    setP(20,[{material:'WOOD',qty:2}]);
  } else if(name==='S5_CONTENTION'){
    setR(0,'WOOD',8,2);setR(1,'WOOD',8,2);setR(2,'WOOD',8,2);
    for(let i=20;i<26;i++)setP(i,[{material:'WOOD',qty:2},{material:'WOOD',qty:2}]);
  } else throw new Error('unknown scenario '+name);
  const resourceIds=Object.keys(resources),producerIds=Object.keys(producers).filter(id=>producers[id].jobs.length);
  const orders=Object.fromEntries(producerIds.map(id=>[id,discoveryOrder(id,resourceIds,seed^0x55aa33)]));
  const totalJobs=producerIds.reduce((n,id)=>n+producers[id].jobs.length,0);
  return {name,step:0,resources,producers,resourceIds,producerIds,orders,totalJobs,events:[],metrics:{
    searches:0,validSelections:0,failedSearches:0,refusals:0,commitFailures:0,transfers:0,crafts:0,
    invalidTransfers:0,forcedActions:0,authorityBypass:0,candidatesConsidered:0,travelCost:0,
    socialChangedSelections:0,socialCompleted:0,socialCommitWindows:0,socialCommitWindowSuccess:0,
    discoveryTimes:[],completionTimes:[],windowRatios:[],repeatPartnerEvents:0,repeatPartnerOpportunities:0
  }};
}
function currentJob(p){return p.jobIndex<p.jobs.length?p.jobs[p.jobIndex]:null}
function availableSurplus(r){return Math.max(0,r.stock-r.reserve-r.reserved)}
function validSupplier(world,pid,rid){
  const p=world.producers[pid],r=world.resources[rid],job=currentJob(p);
  return !!job&&r.material===job.material&&availableSurplus(r)>=job.qty;
}
function normalCandidates(world,pid,step){
  const order=world.orders[pid],known=Math.min(order.length,1+Math.floor(step/DISCOVERY_EVERY));
  return order.slice(0,known);
}
function choosePartner(world,profile,pid,step,useSocial){
  const p=world.producers[pid],job=currentJob(p);if(!job)return{choice:null,considered:0,socialCandidates:[]};
  const normal=normalCandidates(world,pid,step),social=useSocial?socialResourceCandidates(profile,step,pid,world.resourceIds):[];
  const set=new Set([...normal,...social]);let best=null,bestScore=-Infinity;
  for(const rid of set){
    if(!validSupplier(world,pid,rid))continue;
    const d=distance(p.pos,world.resources[rid].pos);
    const bonus=useSocial&&social.includes(rid)?SOCIAL_BOOST:0;
    const score=100-d+bonus;
    if(score>bestScore||(score===bestScore&&rid<best)){best=rid;bestScore=score}
  }
  return {choice:best,considered:set.size,socialCandidates:social,normalCandidates:normal};
}
function trace(world,type,data){world.events.push({step:world.step,type,...data})}
function verifyReservation(world,pid,rid){
  const p=world.producers[pid],job=currentJob(p),r=world.resources[rid];
  if(!job||!r)return false;
  return r.material===job.material&&availableSurplus(r)>=job.qty;
}
function commitReservation(world,pid,rid,meta){
  if(!verifyReservation(world,pid,rid))return false;
  const p=world.producers[pid],job=currentJob(p),r=world.resources[rid];
  r.reserved+=job.qty;
  p.intent={rid,jobId:job.jobId,material:job.material,qty:job.qty,committedAt:world.step,
    handoffAt:world.step+HANDOFF_BASE_DELAY+Math.ceil(distance(p.pos,r.pos)/10),
    decisionChanged:meta.decisionChanged,socialDependent:meta.socialDependent,observedAt:meta.observedAt,
    remainingAtObservation:meta.remainingAtObservation};
  trace(world,'COOPERATION_COMMITTED',{pid,rid,jobId:job.jobId,proposedBy:'NPC_AI',verifiedBy:'RESOURCE_AUTHORITY',committedBy:'RESOURCE_RESERVATION',socialDependent:meta.socialDependent,decisionChanged:meta.decisionChanged});
  return true;
}
function commitTransfer(world,pid){
  const p=world.producers[pid],intent=p.intent;if(!intent)return false;
  const r=world.resources[intent.rid],job=currentJob(p);
  if(!job||job.jobId!==intent.jobId||r.material!==intent.material||r.stock-r.reserve<intent.qty||r.reserved<intent.qty){
    world.metrics.invalidTransfers++;return false;
  }
  r.reserved-=intent.qty;r.stock-=intent.qty;p.inventory[intent.material]+=intent.qty;
  p.crafting={jobId:intent.jobId,material:intent.material,qty:intent.qty,completeAt:world.step+CRAFT_DELAY,partner:intent.rid,
    decisionChanged:intent.decisionChanged,socialDependent:intent.socialDependent,committedAt:intent.committedAt,observedAt:intent.observedAt,remainingAtObservation:intent.remainingAtObservation};
  world.metrics.transfers++;world.metrics.travelCost+=Math.ceil(distance(p.pos,r.pos));
  trace(world,'TRANSFER_COMMITTED',{pid,rid:intent.rid,jobId:intent.jobId,verifiedBy:'POSSESSION_AUTHORITY',committedBy:'POSSESSION_AUTHORITY'});
  p.intent=null;return true;
}
function commitCraft(world,pid){
  const p=world.producers[pid],c=p.crafting,job=currentJob(p);if(!c||!job||c.jobId!==job.jobId)return false;
  if((p.inventory[c.material]||0)<c.qty){world.metrics.authorityBypass++;return false}
  p.inventory[c.material]-=c.qty;p.outputs++;world.metrics.crafts++;
  const completedAt=world.step,needCreatedAt=job.createdAt??0;
  world.metrics.completionTimes.push(completedAt-needCreatedAt);
  if(c.decisionChanged){world.metrics.socialCompleted++;world.metrics.socialChangedSelections++}
  if(p.lastPartner!==null){world.metrics.repeatPartnerOpportunities++;if(p.lastPartner===c.partner)world.metrics.repeatPartnerEvents++}
  p.lastPartner=c.partner;p.partners.push(c.partner);
  trace(world,'CRAFT_COMMITTED',{pid,rid:c.partner,jobId:c.jobId,verifiedBy:'CRAFT_AUTHORITY',committedBy:'CRAFT_AUTHORITY',socialDependent:c.socialDependent,decisionChanged:c.decisionChanged});
  p.jobIndex++;p.crafting=null;
  const next=currentJob(p);if(next&&next.createdAt===null)next.createdAt=world.step;
  return true;
}
function processProducer(world,profile,pid){
  const p=world.producers[pid],job=currentJob(p);if(!job)return;
  if(p.crafting&&world.step>=p.crafting.completeAt){commitCraft(world,pid);return}
  if(p.intent&&world.step>=p.intent.handoffAt){commitTransfer(world,pid);return}
  if(p.pending&&world.step>=p.pending.commitAt){
    const q=p.pending;p.pending=null;
    if(q.socialDependent&&!sameSocialGroup(profile,world.step,pid,q.rid)){
      world.metrics.commitFailures++;trace(world,'SOCIAL_WINDOW_EXPIRED',{pid,rid:q.rid,jobId:job.jobId});return;
    }
    if(commitReservation(world,pid,q.rid,q)){
      world.metrics.validSelections++;
      world.metrics.discoveryTimes.push(world.step-(job.createdAt??0));
      if(q.socialDependent){
        world.metrics.socialCommitWindows++;
        world.metrics.socialCommitWindowSuccess++;
        const latency=Math.max(1,world.step-q.observedAt);
        world.metrics.windowRatios.push(q.remainingAtObservation/latency);
      }
    } else world.metrics.commitFailures++;
    return;
  }
  if(p.pending||p.intent||p.crafting||world.step%OBSERVE_EVERY!==0)return;

  world.metrics.searches++;
  const withSocial=choosePartner(world,profile,pid,world.step,true);
  const shadow=choosePartner(world,profile,pid,world.step,false);
  world.metrics.candidatesConsidered+=withSocial.considered;

  if(withSocial.socialCandidates.length>0&&!withSocial.choice)world.metrics.refusals++;
  if(!withSocial.choice){world.metrics.failedSearches++;return}

  const rid=withSocial.choice;
  const decisionChanged=shadow.choice!==rid;
  const socialDependent=withSocial.socialCandidates.includes(rid)&&(!shadow.normalCandidates.includes(rid)||decisionChanged);
  const delay=BASE_DECISION_DELAY+Math.ceil(withSocial.considered/4);
  const remaining=socialDependent?socialRemaining(profile,world.step,pid,rid):0;
  p.pending={rid,commitAt:world.step+delay,observedAt:world.step,decisionChanged,socialDependent,remainingAtObservation:remaining};
  trace(world,'PARTNER_SELECTED',{pid,rid,jobId:job.jobId,shadowChoice:shadow.choice,decisionChanged,socialDependent,considered:withSocial.considered,remaining});
}
function tick(world,profile){
  for(const pid of world.producerIds)processProducer(world,profile,pid);
  world.step++;
}
function summarize(world,condition,cadence,density,scenario){
  const m=world.metrics,completed=m.crafts,total=world.totalJobs;
  const uniquePartners=new Set(Object.values(world.producers).flatMap(p=>p.partners)).size;
  return {
    condition,cadence,density,scenario,
    completedJobs:completed,totalJobs:total,
    productionCompletionRate:total?completed/total:0,
    cooperationCompletionRate:m.validSelections?m.transfers/m.validSelections:0,
    partnerDiscoveryTimeMedian:median(m.discoveryTimes),
    partnerDiscoveryTimeMean:mean(m.discoveryTimes),
    failedSearchCost:m.failedSearches+m.candidatesConsidered/10+m.travelCost/100,
    searches:m.searches,validSelections:m.validSelections,failedSearches:m.failedSearches,refusals:m.refusals,
    commitFailures:m.commitFailures,candidatesConsidered:m.candidatesConsidered,travelCost:m.travelCost,
    socialAttributionRate:completed?m.socialCompleted/completed:0,
    socialChangedSelections:m.socialChangedSelections,
    socialCommitWindowRate:m.socialCommitWindows?m.socialCommitWindowSuccess/m.socialCommitWindows:0,
    meanSocialActionWindowRatio:mean(m.windowRatios),
    repeatPartnerRate:m.repeatPartnerOpportunities?m.repeatPartnerEvents/m.repeatPartnerOpportunities:0,
    uniquePartners,forcedActionCount:m.forcedActions,invalidTransfers:m.invalidTransfers,authorityBypass:m.authorityBypass,
    traceHash:hash(world.events)
  };
}
function runOne({condition,scenario,density=.4,cadence=100,worldSeed,activeSeed,mappingSeed,horizon=HORIZON,checkpoint=false}){
  const profile=socialProfile({condition,activeSeed,mappingSeed,density,cadence,horizon});
  let world=makeScenario(scenario,worldSeed);
  while(world.step<horizon){
    tick(world,profile);
    if(checkpoint&&world.step===Math.floor(horizon/2))world=clone(world);
  }
  const result=summarize(world,condition,cadence,density,scenario);
  result.finalWorldHash=hash({resources:world.resources,producers:world.producers,metrics:world.metrics,events:world.events});
  return result;
}
function determinismGate(){
  const cfg={condition:'B38/S123',scenario:'S2_MULTI',density:.4,cadence:100,worldSeed:99101,activeSeed:99201,mappingSeed:99301,horizon:800};
  const a=runOne({...cfg,checkpoint:false}),b=runOne({...cfg,checkpoint:true}),c=runOne({...cfg,checkpoint:false});
  assert.equal(a.finalWorldHash,b.finalWorldHash,'checkpoint replay diverged');
  assert.equal(a.finalWorldHash,c.finalWorldHash,'repeat replay diverged');
  return {pass:true,hash:a.finalWorldHash};
}
function refusalGate(){
  const r=runOne({condition:'B238/S234',scenario:'S4_INVALID',density:.4,cadence:100,worldSeed:88101,activeSeed:88201,mappingSeed:88301,horizon:800});
  assert.equal(r.forcedActionCount,0);assert.equal(r.invalidTransfers,0);assert.equal(r.authorityBypass,0);
  return {pass:true,refusals:r.refusals,completed:r.completedJobs,traceHash:r.traceHash};
}
function pairedKey(r){return[r.scenario,r.seedIndex,r.mappingIndex].join('|')}
function aggregate(rows){
  const names=[...new Set(rows.map(r=>r.condition))],out={};
  for(const n of names){
    const a=rows.filter(r=>r.condition===n);
    out[n]={
      runs:a.length,
      productionCompletionRate:mean(a.map(x=>x.productionCompletionRate)),
      cooperationCompletionRate:mean(a.map(x=>x.cooperationCompletionRate)),
      partnerDiscoveryTimeMedian:median(a.map(x=>x.partnerDiscoveryTimeMedian)),
      failedSearchCost:mean(a.map(x=>x.failedSearchCost)),
      socialAttributionRate:mean(a.map(x=>x.socialAttributionRate)),
      socialCommitWindowRate:mean(a.map(x=>x.socialCommitWindowRate)),
      meanSocialActionWindowRatio:mean(a.map(x=>x.meanSocialActionWindowRatio)),
      repeatPartnerRate:mean(a.map(x=>x.repeatPartnerRate)),
      forcedActions:a.reduce((s,x)=>s+x.forcedActionCount,0),
      invalidTransfers:a.reduce((s,x)=>s+x.invalidTransfers,0),
      authorityBypass:a.reduce((s,x)=>s+x.authorityBypass,0)
    };
  }
  return out;
}
function pairedDelta(rows,aName,bName){
  const by=new Map();
  for(const r of rows){const k=pairedKey(r);if(!by.has(k))by.set(k,{});by.get(k)[r.condition]=r}
  const metrics=['productionCompletionRate','partnerDiscoveryTimeMean','failedSearchCost','socialAttributionRate'];
  const out={};
  for(const metric of metrics){
    const d=[];
    for(const x of by.values())if(x[aName]&&x[bName]){
      let v=x[aName][metric]-x[bName][metric];
      if(metric==='partnerDiscoveryTimeMean'||metric==='failedSearchCost')v=-v;
      d.push(v);
    }
    out[metric]={pairs:d.length,meanDelta:mean(d),medianDelta:median(d),winRate:mean(d.map(x=>x>0?1:0)),tieRate:mean(d.map(x=>x===0?1:0)),lossRate:mean(d.map(x=>x<0?1:0))};
  }
  return out;
}
function round1({seeds=8,mappings=8}={}){
  const conditions=['NO_SOCIAL','B3/S23','B238/S234','B38/S123','PM_B238','PM_B38'];
  const scenarios=['S1_EASY','S2_MULTI','S3_SCARCITY','S4_INVALID','S5_CONTENTION'];
  const rows=[];
  for(let si=0;si<seeds;si++)for(let mi=0;mi<mappings;mi++)for(const scenario of scenarios){
    const base={scenario,density:.4,cadence:100,worldSeed:41000+si*409+mi*17,activeSeed:51000+si*521+Math.round(.4*1000),mappingSeed:61000+mi*613};
    for(const condition of conditions){
      const r=runOne({...base,condition});
      rows.push({...r,seedIndex:si,mappingIndex:mi});
      assert.equal(r.forcedActionCount,0,'forced action');
      assert.equal(r.invalidTransfers,0,'invalid transfer');
      assert.equal(r.authorityBypass,0,'authority bypass');
    }
  }
  return {config:{seeds,mappings,density:.4,cadence:100,scenarios,conditions},rows};
}

const determinism=determinismGate();
const refusal=refusalGate();
const r1=round1();
const agg=aggregate(r1.rows);
const report={
  version:'fa-r3-resource-production-v1',
  scope:'TestGE behavioral proxy only; not Simclone canonical economy proof.',
  gates:{determinism,refusal,forcedActionCount:0,authorityBypass:0},
  round1:{
    config:r1.config,
    aggregate:agg,
    comparisons:{
      B238_vs_B3:pairedDelta(r1.rows,'B238/S234','B3/S23'),
      B38_vs_B3:pairedDelta(r1.rows,'B38/S123','B3/S23'),
      B238_vs_NoSocial:pairedDelta(r1.rows,'B238/S234','NO_SOCIAL'),
      B38_vs_NoSocial:pairedDelta(r1.rows,'B38/S123','NO_SOCIAL'),
      B238_vs_PM:pairedDelta(r1.rows,'B238/S234','PM_B238'),
      B38_vs_PM:pairedDelta(r1.rows,'B38/S123','PM_B38')
    }
  },
  interpretation:{
    current:'ROUND_1_ONLY',
    final:'UNKNOWN',
    rule:'Do not promote to FA-R3 PASS until density/cadence expansion and independent holdout reproduce functional advantage.'
  }
};
console.log('TESTGE_FA_R3_BEGIN');
console.log(JSON.stringify(report,null,2));
console.log('TESTGE_FA_R3_END');
console.log('FA_R3_FINAL=UNKNOWN');
