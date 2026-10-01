import assert from 'node:assert/strict';

const W=8,H=8,N=W*H;
const HOUSE_COUNTS={RESOURCE:20,PRODUCTION:14,MARKET:10,ADVENTURE:14,LEADER:6};
const DENSITIES=[.2,.3,.4,.5,.6];

function rng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function mean(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:0}
function median(a){if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y),m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])/2}
function stdev(a){if(a.length<2)return 0;const m=mean(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)*(x-m),0)/(a.length-1))}
function shuffle(a,R){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(R()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
function countActive(g){let n=0;for(const v of g)n+=v;return n}
function seededInitial(seed,density){const R=rng(seed),g=new Uint8Array(N);for(let i=0;i<N;i++)g[i]=R()<density?1:0;return g}
function xy(i){return[i%W,Math.floor(i/W)]}
function neighbors(i){const [x,y]=xy(i),out=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=(x+dx+W)%W,ny=(y+dy+H)%H;out.push(ny*W+nx)}return out}
const NEIGHBORS=Array.from({length:N},(_,i)=>neighbors(i));

function parseRule(rule){
  const m=rule.match(/^B([0-8]*)\/S([0-8]*)$/);if(!m)throw new Error('Bad rule '+rule);
  return {rule,b:new Set([...m[1]].map(Number)),s:new Set([...m[2]].map(Number))};
}
function step(g,spec){
  const n=new Uint8Array(N);
  for(let i=0;i<N;i++){let live=0;for(const j of NEIGHBORS[i])live+=g[j];n[i]=g[i]?(spec.s.has(live)?1:0):(spec.b.has(live)?1:0)}
  return n;
}
function baseRoster(){const a=[];let id=0;for(const [house,n] of Object.entries(HOUSE_COUNTS))for(let i=0;i<n;i++)a.push({npcId:'NPC-'+String(id++).padStart(2,'0'),house});return a}
function mapping(seed){return shuffle(baseRoster(),rng(seed)).map((p,cell)=>({...p,cell}))}
function components(g){
  const seen=new Uint8Array(N),out=[];
  for(let start=0;start<N;start++){
    if(!g[start]||seen[start])continue;
    const q=[start],cells=[];seen[start]=1;
    while(q.length){const i=q.pop();cells.push(i);for(const j of NEIGHBORS[i])if(g[j]&&!seen[j]){seen[j]=1;q.push(j)}}
    out.push(cells);
  }
  return out;
}
function entropyNormalized(counts,size){
  if(size<=1)return 0;const vals=Object.values(counts).filter(x=>x>0);if(vals.length<=1)return 0;
  let h=0;for(const n of vals){const p=n/size;h-=p*Math.log(p)}
  return h/Math.log(Math.min(5,size));
}
function frameMetrics(g,map){
  const cs=components(g),active=countActive(g);
  if(!active)return {groupCount:0,largestFraction:0,weightedEntropy:0,pairCount:0,pairKeys:new Set()};
  let largest=0,weightedEntropy=0,pairCount=0;const pairKeys=new Set();
  for(const cells of cs){
    largest=Math.max(largest,cells.length);
    const counts={RESOURCE:0,PRODUCTION:0,MARKET:0,ADVENTURE:0,LEADER:0};
    const ids=[];
    for(const cell of cells){counts[map[cell].house]++;ids.push(Number(map[cell].npcId.slice(4)))}
    weightedEntropy+=cells.length*entropyNormalized(counts,cells.length);
    ids.sort((a,b)=>a-b);
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){pairKeys.add(ids[i]*N+ids[j]);pairCount++}
  }
  return {groupCount:cs.length,largestFraction:largest/active,weightedEntropy:weightedEntropy/active,pairCount,pairKeys};
}
function runRule(ruleSpec,{activeSeed,mappingSeed,density,steps=120}){
  const map=mapping(mappingSeed);let g=seededInitial(activeSeed,density);
  let activeSum=0,turnoverSum=0,groupSum=0,entropySum=0,largestSum=0,persistSum=0,persistSamples=0;
  let prevFrame=null,extinctAt=null;
  for(let t=0;t<=steps;t++){
    const fm=frameMetrics(g,map),active=countActive(g);
    activeSum+=active/N;groupSum+=fm.groupCount;entropySum+=fm.weightedEntropy;largestSum+=fm.largestFraction;
    if(prevFrame&&prevFrame.pairCount>0){let kept=0;for(const p of prevFrame.pairKeys)if(fm.pairKeys.has(p))kept++;persistSum+=kept/prevFrame.pairCount;persistSamples++}
    if(t<steps){
      const next=step(g,ruleSpec);let changed=0;for(let i=0;i<N;i++)if(g[i]!==next[i])changed++;
      turnoverSum+=changed/N;g=next;
    }
    prevFrame=fm;
    if(active===0&&extinctAt===null)extinctAt=t;
  }
  const terminal=countActive(g)/N;
  return {
    density,activeSeed,mappingSeed,
    extinct:terminal===0,extinctAt,
    meanActiveRatio:activeSum/(steps+1),
    terminalActiveRatio:terminal,
    meanTurnover:turnoverSum/steps,
    meanGroupCount:groupSum/(steps+1),
    meanHouseEntropy:entropySum/(steps+1),
    meanLargestGroupFraction:largestSum/(steps+1),
    pairPersistence:persistSamples?persistSum/persistSamples:0
  };
}
function aggregateRuns(runs){
  return {
    runs:runs.length,
    extinctionFrequency:mean(runs.map(r=>r.extinct?1:0)),
    meanActiveRatio:mean(runs.map(r=>r.meanActiveRatio)),
    meanTerminalActiveRatio:mean(runs.map(r=>r.terminalActiveRatio)),
    meanTurnover:mean(runs.map(r=>r.meanTurnover)),
    meanGroupCount:mean(runs.map(r=>r.meanGroupCount)),
    meanHouseEntropy:mean(runs.map(r=>r.meanHouseEntropy)),
    meanLargestGroupFraction:mean(runs.map(r=>r.meanLargestGroupFraction)),
    meanPairPersistence:mean(runs.map(r=>r.pairPersistence))
  };
}
function localCandidates(){
  const births=['3','23','34','35','36','37','38','234','235','236','237','238','346','356','367','368','378'];
  const survivals=['23','123','234','235','236','245','345','2345','1234','2346','2356','2456'];
  const s=new Set(['B3/S23']);
  for(const b of births)for(const surv of survivals)s.add('B'+b+'/S'+surv);
  for(const r of ['B36/S23','B3678/S34678','B36/S125','B368/S245','B4678/S35678','B35678/S5678','B3/S12345','B3/S1234','B37/S23','B3/S45678','B1357/S1357','B3/S012345678','B2/S','B234/S','B378/S235678','B345/S5'])s.add(r);
  return [...s].sort();
}
function pairedCompare(baseRuns,candRuns){
  assert.equal(baseRuns.length,candRuns.length);
  const diffs={extinction:[],pairPersistence:[],entropy:[],active:[],turnover:[],largest:[]};
  for(let i=0;i<baseRuns.length;i++){
    const b=baseRuns[i],c=candRuns[i];
    diffs.extinction.push((b.extinct?1:0)-(c.extinct?1:0));
    diffs.pairPersistence.push(c.pairPersistence-b.pairPersistence);
    diffs.entropy.push(c.meanHouseEntropy-b.meanHouseEntropy);
    diffs.active.push(c.meanActiveRatio-b.meanActiveRatio);
    diffs.turnover.push(c.meanTurnover-b.meanTurnover);
    diffs.largest.push(b.meanLargestGroupFraction-c.meanLargestGroupFraction);
  }
  const stat=a=>({mean:mean(a),median:median(a),sd:stdev(a),winRate:mean(a.map(x=>x>0?1:0)),tieRate:mean(a.map(x=>x===0?1:0))});
  return Object.fromEntries(Object.entries(diffs).map(([k,a])=>[k,stat(a)]));
}
function perDensity(runs){
  return Object.fromEntries(DENSITIES.map(d=>[d,aggregateRuns(runs.filter(r=>r.density===d))]));
}

function stateSequence(ruleSpec,activeSeed,density,steps){
  let g=seededInitial(activeSeed,density),states=[Uint8Array.from(g)];
  for(let t=0;t<steps;t++){g=step(g,ruleSpec);states.push(Uint8Array.from(g))}
  return states;
}
function groupDescriptorFrame(g,map){
  return components(g).map(cells=>{
    const counts={RESOURCE:0,PRODUCTION:0,MARKET:0,ADVENTURE:0,LEADER:0},members=[];
    for(const cell of cells){counts[map[cell].house]++;members.push(map[cell].npcId)}
    members.sort();
    return {members,size:members.length,houseCounts:counts,houseEntropy:entropyNormalized(counts,members.length),trackId:null};
  });
}
function jaccard(a,b){
  const A=new Set(a),B=new Set(b);let inter=0;for(const x of A)if(B.has(x))inter++;
  return inter/(A.size+B.size-inter||1);
}
function trackFrames(states,map){
  let prev=[],nextId=1;const frames=[];
  for(let t=0;t<states.length;t++){
    const cur=groupDescriptorFrame(states[t],map),pairs=[];
    for(let i=0;i<prev.length;i++)for(let j=0;j<cur.length;j++){const score=jaccard(prev[i].members,cur[j].members);if(score>0)pairs.push({i,j,score})}
    pairs.sort((a,b)=>b.score-a.score||a.i-b.i||a.j-b.j);
    const usedPrev=new Set(),usedCur=new Set();
    for(const p of pairs){
      if(p.score<.5||usedPrev.has(p.i)||usedCur.has(p.j))continue;
      cur[p.j].trackId=prev[p.i].trackId;usedPrev.add(p.i);usedCur.add(p.j);
    }
    for(const g of cur)if(!g.trackId)g.trackId='G'+nextId++;
    frames.push(cur.map(g=>({...g,houseCounts:{...g.houseCounts},members:[...g.members]})));
    prev=cur;
  }
  return frames;
}
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
    const next=new Uint8Array(N),births=targetCount-targetOverlap;
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
function freshGroup(trackId,members,houseById){
  const houseCounts={RESOURCE:0,PRODUCTION:0,MARKET:0,ADVENTURE:0,LEADER:0};
  for(const id of members)houseCounts[houseById.get(id)]++;
  return {trackId,members:[...members].sort(),size:members.length,houseCounts,houseEntropy:entropyNormalized(houseCounts,members.length)};
}
function compositionMatchedFrames(candidateFrames,map,seed){
  const R=rng(seed^0x243f6a88),houseById=new Map(map.map(x=>[x.npcId,x.house])),byHouse={};
  for(const h of Object.keys(HOUSE_COUNTS))byHouse[h]=map.filter(x=>x.house===h).map(x=>x.npcId);
  return candidateFrames.map((frame,t)=>{
    const pools=Object.fromEntries(Object.keys(HOUSE_COUNTS).map(h=>[h,shuffle(byHouse[h],R)]));
    const at=Object.fromEntries(Object.keys(HOUSE_COUNTS).map(h=>[h,0]));
    return frame.map((spec,gi)=>{
      const members=[];
      for(const h of Object.keys(HOUSE_COUNTS)){
        const n=spec.houseCounts[h]||0,start=at[h],end=start+n;
        assert(end<=pools[h].length,'CM pool exhausted');
        members.push(...pools[h].slice(start,end));at[h]=end;
      }
      const g=freshGroup('CM-'+t+'-'+gi,members,houseById);
      assert.equal(g.size,spec.size);
      for(const h of Object.keys(HOUSE_COUNTS))assert.equal(g.houseCounts[h],spec.houseCounts[h]);
      return g;
    });
  });
}
function sizeLifetimeMatchedFrames(candidateFrames,map,seed){
  const R=rng(seed^0xb7e15162),houseById=new Map(map.map(x=>[x.npcId,x.house])),roster=map.map(x=>x.npcId);
  return candidateFrames.map(frame=>{
    const pool=shuffle(roster,R);let at=0;
    return frame.map(spec=>{
      const members=pool.slice(at,at+spec.size);at+=spec.size;
      assert.equal(members.length,spec.size);
      return freshGroup(spec.trackId,members,houseById);
    });
  });
}
function pairSet(frame){
  const pairs=new Set();
  for(const g of frame){
    const ids=g.members.map(x=>Number(x.slice(4))).sort((a,b)=>a-b);
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)pairs.add(ids[i]*N+ids[j]);
  }
  return pairs;
}
function summarizeFrames(frames,name){
  let activeSum=0,groupSum=0,sizePresent=[],entropyPresent=[],largestPresent=[],pairVals=[];
  const trackLife=new Map();
  for(let t=0;t<frames.length;t++){
    const frame=frames[t],members=new Set(frame.flatMap(g=>g.members)),active=members.size;
    activeSum+=active/N;groupSum+=frame.length;
    if(frame.length){
      sizePresent.push(mean(frame.map(g=>g.size)));
      entropyPresent.push(active?frame.reduce((z,g)=>z+g.size*g.houseEntropy,0)/active:0);
      largestPresent.push(active?Math.max(...frame.map(g=>g.size))/active:0);
    }
    for(const g of frame){
      if(!trackLife.has(g.trackId))trackLife.set(g.trackId,{first:t,last:t});
      else trackLife.get(g.trackId).last=t;
    }
    if(t>0){
      const a=pairSet(frames[t-1]);if(a.size){const b=pairSet(frame);let kept=0;for(const p of a)if(b.has(p))kept++;pairVals.push(kept/a.size)}
    }
  }
  const lives=[...trackLife.values()].map(x=>x.last-x.first+1);
  return {
    name,
    meanActiveRatio:activeSum/frames.length,
    meanGroupCount:groupSum/frames.length,
    meanGroupSizeWhenPresent:mean(sizePresent),
    meanHouseEntropyWhenPresent:mean(entropyPresent),
    meanLargestGroupFractionWhenPresent:mean(largestPresent),
    pairPersistence:mean(pairVals),
    medianTrackLifetime:median(lives),
    maxTrackLifetime:lives.length?Math.max(...lives):0
  };
}
function aggregateStrong(rows){
  const out={};
  for(const name of [...new Set(rows.map(r=>r.name))]){
    const a=rows.filter(r=>r.name===name);
    out[name]={
      runs:a.length,
      meanActiveRatio:mean(a.map(x=>x.meanActiveRatio)),
      meanGroupCount:mean(a.map(x=>x.meanGroupCount)),
      meanGroupSizeWhenPresent:mean(a.map(x=>x.meanGroupSizeWhenPresent)),
      meanHouseEntropyWhenPresent:mean(a.map(x=>x.meanHouseEntropyWhenPresent)),
      meanLargestGroupFractionWhenPresent:mean(a.map(x=>x.meanLargestGroupFractionWhenPresent)),
      pairPersistence:mean(a.map(x=>x.pairPersistence)),
      medianTrackLifetime:median(a.map(x=>x.medianTrackLifetime))
    };
  }
  return out;
}
function pairedStrong(rows,candidateName){
  const by=new Map(),key=r=>r.density+'|'+r.seedIndex+'|'+r.mappingIndex;
  for(const r of rows){const k=key(r);if(!by.has(k))by.set(k,new Map());by.get(k).set(r.name,r)}
  const nulls=['PERSISTENCE_MATCHED','COMPOSITION_MATCHED','SIZE_LIFETIME_MATCHED'],out={};
  for(const n of nulls){
    const ds=[];
    for(const m of by.values()){const c=m.get(candidateName),q=m.get(n);if(c&&q)ds.push(c.pairPersistence-q.pairPersistence)}
    out[n]={pairs:ds.length,meanDelta:mean(ds),medianDelta:median(ds),sdDelta:stdev(ds),winRate:mean(ds.map(x=>x>0?1:0)),tieRate:mean(ds.map(x=>x===0?1:0)),lossRate:mean(ds.map(x=>x<0?1:0))};
  }
  return out;
}
function strongNullForRule(rule,{seeds=8,mappings=4,steps=180,seedBase=371000,mappingBase=381000}={}){
  const spec=parseRule(rule),rows=[];let validations=0;
  for(const density of DENSITIES)for(let si=0;si<seeds;si++)for(let mi=0;mi<mappings;mi++){
    const activeSeed=seedBase+si*137+Math.round(density*1000),mappingSeed=mappingBase+mi*223,map=mapping(mappingSeed);
    const states=stateSequence(spec,activeSeed,density,steps),frames=trackFrames(states,map);
    const pm=persistenceMatchedStates(states,activeSeed+mi*1009),pmFrames=trackFrames(pm,map);
    const cm=compositionMatchedFrames(frames,map,activeSeed+mi*2017),sl=sizeLifetimeMatchedFrames(frames,map,activeSeed+mi*3011);
    for(let t=0;t<states.length;t++)assert.equal(countActive(pm[t]),countActive(states[t]));
    for(let t=1;t<states.length;t++)assert.equal(activeOverlap(pm[t-1],pm[t]),activeOverlap(states[t-1],states[t]));
    for(let t=0;t<frames.length;t++){
      assert.equal(cm[t].length,frames[t].length);assert.equal(sl[t].length,frames[t].length);
      for(let gi=0;gi<frames[t].length;gi++){
        assert.equal(cm[t][gi].size,frames[t][gi].size);
        assert.equal(sl[t][gi].size,frames[t][gi].size);
        assert.equal(sl[t][gi].trackId,frames[t][gi].trackId);
      }
    }
    validations++;
    const base={density,seedIndex:si,mappingIndex:mi};
    rows.push({...base,...summarizeFrames(frames,rule)});
    rows.push({...base,...summarizeFrames(pmFrames,'PERSISTENCE_MATCHED')});
    rows.push({...base,...summarizeFrames(cm,'COMPOSITION_MATCHED')});
    rows.push({...base,...summarizeFrames(sl,'SIZE_LIFETIME_MATCHED')});
  }
  return {rule,validationCases:validations,aggregate:aggregateStrong(rows),paired:pairedStrong(rows,rule)};
}

function screen({rules=localCandidates(),seeds=8,mappings=2,steps=120,seedBase=71000,mappingBase=81000}={}){
  const specs=rules.map(parseRule),runsByRule=new Map();
  for(const spec of specs){
    const runs=[];
    for(const density of DENSITIES)for(let si=0;si<seeds;si++)for(let mi=0;mi<mappings;mi++){
      runs.push(runRule(spec,{activeSeed:seedBase+si*131+Math.round(density*1000),mappingSeed:mappingBase+mi*211,density,steps}));
    }
    runsByRule.set(spec.rule,runs);
  }
  const baseline=runsByRule.get('B3/S23'),baseAgg=aggregateRuns(baseline),rows=[];
  for(const spec of specs){
    const runs=runsByRule.get(spec.rule),agg=aggregateRuns(runs),paired=pairedCompare(baseline,runs),bands=perDensity(runs),baseBands=perDensity(baseline);
    let competenceBands=0;
    for(const d of DENSITIES){
      const a=bands[d],b=baseBands[d];
      const ok=a.extinctionFrequency<=b.extinctionFrequency &&
        a.meanPairPersistence>=b.meanPairPersistence-0.02 &&
        a.meanHouseEntropy>=b.meanHouseEntropy-0.05 &&
        a.meanTurnover>=0.02&&a.meanTurnover<=0.50 &&
        a.meanActiveRatio>=0.06&&a.meanActiveRatio<=0.70 &&
        a.meanLargestGroupFraction<=0.92;
      if(ok)competenceBands++;
    }
    const guardrails=agg.meanTurnover>=0.02&&agg.meanTurnover<=0.50&&agg.meanActiveRatio>=0.06&&agg.meanActiveRatio<=0.70&&agg.meanLargestGroupFraction<=0.92;
    const extinctionReduction=baseAgg.extinctionFrequency-agg.extinctionFrequency;
    const screeningIndex=extinctionReduction + 0.50*paired.pairPersistence.mean + 0.25*paired.entropy.mean;
    rows.push({rule:spec.rule,aggregate:agg,pairedVsB3S23:paired,competenceBands,guardrails,screeningIndex,byDensity:bands});
  }
  rows.sort((a,b)=>b.competenceBands-a.competenceBands||b.screeningIndex-a.screeningIndex);
  return {config:{rules:specs.length,seeds,mappings,steps,densities:DENSITIES},baseline:{aggregate:baseAgg,byDensity:perDensity(baseline)},ranking:rows.slice(0,20),eligible:rows.filter(r=>r.rule!=='B3/S23'&&r.guardrails&&r.competenceBands>=4&&r.aggregate.extinctionFrequency<baseAgg.extinctionFrequency).slice(0,12)};
}

const discovery=screen();
const finalistRules=['B3/S23',...discovery.eligible.slice(0,6).map(x=>x.rule)];
const holdout=screen({rules:finalistRules,seeds:12,mappings:4,steps:160,seedBase:171000,mappingBase:181000});
const deepRules=['B3/S23','B37/S1234','B378/S1234','B237/S1234','B238/S234','B38/S123'];
const deepHoldout=screen({rules:deepRules,seeds:16,mappings:6,steps:240,seedBase:271000,mappingBase:281000});
const strongNullFinalists=['B37/S1234','B378/S1234','B237/S1234','B238/S234','B38/S123'].map((rule,i)=>strongNullForRule(rule,{seedBase:371000+i*10000,mappingBase:381000+i*10000}));

const report={
  version:'social-life-rule-search-v2',
  purpose:'Find Life-like rules that outperform B3/S23 for dynamic social grouping without sacrificing diversity or becoming static/chaotic.',
  discovery,
  finalistRules,
  holdout,
  deepRules,
  deepHoldout,
  strongNullFinalists,
  interpretation:{
    status:'CANDIDATE_SEARCH_ONLY',
    passRule:'A replacement candidate must beat B3/S23 on discovery + independent + deep holdout, remain dynamic rather than frozen/giant, and survive persistence/composition/size+lifetime matched nulls before Resource→Production coupling.',
    final:'UNKNOWN'
  }
};
console.log('TESTGE_RULE_SEARCH_BEGIN');
console.log(JSON.stringify(report,null,2));
console.log('TESTGE_RULE_SEARCH_END');
