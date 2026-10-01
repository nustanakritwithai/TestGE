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

const report={
  version:'social-life-rule-search-v1',
  purpose:'Find Life-like rules that outperform B3/S23 for dynamic social grouping without sacrificing diversity or becoming static/chaotic.',
  discovery,
  finalistRules,
  holdout,
  interpretation:{
    status:'CANDIDATE_SEARCH_ONLY',
    passRule:'A replacement candidate must beat B3/S23 on independent holdout and later survive the same FA-R2 strong-null protocol before Resource→Production coupling.',
    final:'UNKNOWN'
  }
};
console.log('TESTGE_RULE_SEARCH_BEGIN');
console.log(JSON.stringify(report,null,2));
console.log('TESTGE_RULE_SEARCH_END');
