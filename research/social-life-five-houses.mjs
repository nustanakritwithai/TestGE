import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const W=8,H=8,N=W*H;
const HOUSE_COUNTS={RESOURCE:20,PRODUCTION:14,MARKET:10,ADVENTURE:14,LEADER:6};

function rng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function xy(i,w=W){return[i%w,Math.floor(i/w)]}
function cloneGrid(g){return Uint8Array.from(g)}
function gridFromCoords(w,h,coords){const g=new Uint8Array(w*h);for(const [x,y] of coords)g[y*w+x]=1;return g}
function countActive(g){let n=0;for(const v of g)n+=v;return n}
function sameGrid(a,b){if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true}
function hashObject(v){return createHash('sha256').update(JSON.stringify(v)).digest('hex')}
function bitString(g){return Array.from(g).join('')}

function neighborIndices(i,w,h,boundary='torus'){
  const [x,y]=xy(i,w),out=[];
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(dx===0&&dy===0)continue;
    let nx=x+dx,ny=y+dy;
    if(boundary==='torus'){nx=(nx+w)%w;ny=(ny+h)%h;out.push(ny*w+nx)}
    else if(nx>=0&&nx<w&&ny>=0&&ny<h)out.push(ny*w+nx);
  }
  return out;
}
function stepLife(current,{w=W,h=H,boundary='torus'}={}){
  const next=new Uint8Array(current.length);
  for(let i=0;i<current.length;i++){
    let live=0;for(const j of neighborIndices(i,w,h,boundary))live+=current[j];
    next[i]=current[i]?(live===2||live===3?1:0):(live===3?1:0);
  }
  return next;
}
function runLife(initial,steps,opts={}){let g=cloneGrid(initial);for(let s=0;s<steps;s++)g=stepLife(g,opts);return g}

function validatePatterns(){
  const block=gridFromCoords(6,6,[[2,2],[3,2],[2,3],[3,3]]);
  assert(sameGrid(runLife(block,10,{w:6,h:6,boundary:'fixed'}),block),'Block still life failed');
  const blinkH=gridFromCoords(7,7,[[2,3],[3,3],[4,3]]);
  const blinkV=gridFromCoords(7,7,[[3,2],[3,3],[3,4]]);
  assert(sameGrid(runLife(blinkH,1,{w:7,h:7,boundary:'fixed'}),blinkV),'Blinker phase 1 failed');
  assert(sameGrid(runLife(blinkH,2,{w:7,h:7,boundary:'fixed'}),blinkH),'Blinker period 2 failed');
  const glider0=gridFromCoords(10,10,[[2,1],[3,2],[1,3],[2,3],[3,3]]);
  const glider4=gridFromCoords(10,10,[[3,2],[4,3],[2,4],[3,4],[4,4]]);
  assert(sameGrid(runLife(glider0,4,{w:10,h:10,boundary:'fixed'}),glider4),'Glider translation failed');
  return {block:true,blinker:true,glider:true};
}

function seededInitial(seed,density,w=W,h=H){const R=rng(seed),g=new Uint8Array(w*h);for(let i=0;i<g.length;i++)g[i]=R()<density?1:0;return g}
function serialize(state){return JSON.stringify({generation:state.generation,w:state.w,h:state.h,boundary:state.boundary,active:Array.from(state.active)})}
function deserialize(s){const q=JSON.parse(s);return{...q,active:Uint8Array.from(q.active)}}
function advanceState(state,steps){let out={...state,active:cloneGrid(state.active)};for(let i=0;i<steps;i++){out.active=stepLife(out.active,out);out.generation++}return out}
function determinismGate(){
  const start={generation:0,w:W,h:H,boundary:'torus',active:seededInitial(9101,.37)};
  const continuous=advanceState(start,2000);
  const first=advanceState(start,1000);
  const resumed=advanceState(deserialize(serialize(first)),1000);
  const a=hashObject({generation:continuous.generation,bits:bitString(continuous.active)});
  const b=hashObject({generation:resumed.generation,bits:bitString(resumed.active)});
  assert.equal(a,b,'Save/load replay diverged');
  return {continuousHash:a,resumedHash:b,identical:true};
}

function baseHouses(){const a=[];for(const [house,n] of Object.entries(HOUSE_COUNTS))for(let i=0;i<n;i++)a.push(house);assert.equal(a.length,N);return a}
function shuffle(a,R){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(R()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
function mapping(seed){const houses=shuffle(baseHouses(),rng(seed));return houses.map((house,cell)=>({npcId:'NPC-'+String(cell).padStart(2,'0'),house,cell}))}

function components(active,{w=W,h=H,boundary='torus'}={}){
  const seen=new Uint8Array(active.length),out=[];
  for(let start=0;start<active.length;start++){
    if(!active[start]||seen[start])continue;
    const q=[start],cells=[];seen[start]=1;
    while(q.length){const i=q.shift();cells.push(i);for(const j of neighborIndices(i,w,h,boundary))if(active[j]&&!seen[j]){seen[j]=1;q.push(j)}}
    cells.sort((a,b)=>a-b);out.push(cells);
  }
  out.sort((a,b)=>a[0]-b[0]);return out;
}
function entropyNormalized(counts){
  const vals=Object.values(counts).filter(x=>x>0),total=vals.reduce((a,b)=>a+b,0);
  if(total<=1||vals.length<=1)return 0;
  let h=0;for(const n of vals){const p=n/total;h-=p*Math.log(p)}
  return h/Math.log(Math.min(5,total));
}
function groupDescriptors(active,map){
  return components(active).map(cells=>{
    const counts={RESOURCE:0,PRODUCTION:0,MARKET:0,ADVENTURE:0,LEADER:0},members=[];
    for(const cell of cells){counts[map[cell].house]++;members.push(map[cell].npcId)}
    return {cells,members,size:cells.length,houseCounts:counts,houseRichness:Object.values(counts).filter(x=>x>0).length,houseEntropy:entropyNormalized(counts)};
  });
}
function jaccard(a,b){const A=new Set(a),B=new Set(b);let inter=0;for(const x of A)if(B.has(x))inter++;return inter/(A.size+B.size-inter||1)}
function mean(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:0}
function median(a){if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y),m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])/2}

function trackSequence(states,map){
  let prev=[],nextId=1,splits=0,merges=0;const tracks=new Map(),perGen=[];
  for(let generation=0;generation<states.length;generation++){
    const gs=groupDescriptors(states[generation],map).map(g=>({...g,trackId:null})),pairs=[];
    for(let i=0;i<prev.length;i++)for(let j=0;j<gs.length;j++){const score=jaccard(prev[i].members,gs[j].members);if(score>0)pairs.push({i,j,score})}
    for(let i=0;i<prev.length;i++)if(pairs.filter(p=>p.i===i&&p.score>=.25).length>1)splits++;
    for(let j=0;j<gs.length;j++)if(pairs.filter(p=>p.j===j&&p.score>=.25).length>1)merges++;
    pairs.sort((a,b)=>b.score-a.score||a.i-b.i||a.j-b.j);
    const usedPrev=new Set(),usedCur=new Set();
    for(const p of pairs){
      if(p.score<.5||usedPrev.has(p.i)||usedCur.has(p.j))continue;
      gs[p.j].trackId=prev[p.i].trackId;usedPrev.add(p.i);usedCur.add(p.j);
    }
    for(const g of gs){
      if(!g.trackId){g.trackId='G'+nextId++;tracks.set(g.trackId,{born:generation,last:generation,lifetime:1})}
      else{const t=tracks.get(g.trackId);t.last=generation;t.lifetime=t.last-t.born+1}
    }
    perGen.push({active:countActive(states[generation]),groups:gs.length,meanGroupSize:mean(gs.map(g=>g.size)),meanRichness:mean(gs.map(g=>g.houseRichness)),meanEntropy:mean(gs.map(g=>g.houseEntropy))});
    prev=gs;
  }
  const lifetimes=[...tracks.values()].map(x=>x.lifetime);
  return {perGen,lifetimes,splits,merges,meanLifetime:mean(lifetimes),medianLifetime:median(lifetimes),maxLifetime:lifetimes.length?Math.max(...lifetimes):0};
}

function conwayStates(seed,density,steps){let g=seededInitial(seed,density),a=[cloneGrid(g)];for(let i=0;i<steps;i++){g=stepLife(g);a.push(cloneGrid(g))}return a}
function fixedStates(seed,density,steps){const g=seededInitial(seed,density);return Array.from({length:steps+1},()=>cloneGrid(g))}
function randomStates(seed,density,steps){const R=rng(seed^0xabcddcba),a=[];for(let s=0;s<=steps;s++){const g=new Uint8Array(N);for(let i=0;i<N;i++)g[i]=R()<density?1:0;a.push(g)}return a}
function shuffleStates(conway,seed){const R=rng(seed^0x55aa55aa),out=[];for(const src of conway){const n=countActive(src),positions=shuffle([...Array(N).keys()],R).slice(0,n),g=new Uint8Array(N);for(const p of positions)g[p]=1;out.push(g)}return out}
function noSocialStates(steps){return Array.from({length:steps+1},()=>new Uint8Array(N))}

function summarizeControl(name,states,map){
  const tr=trackSequence(states,map),pg=tr.perGen;
  return {name,activeRatio:mean(pg.map(x=>x.active/N)),meanGroupCount:mean(pg.map(x=>x.groups)),meanGroupSize:mean(pg.map(x=>x.meanGroupSize)),meanHouseRichness:mean(pg.map(x=>x.meanRichness)),meanHouseEntropy:mean(pg.map(x=>x.meanEntropy)),medianGroupLifetime:tr.medianLifetime,maxGroupLifetime:tr.maxLifetime,splits:tr.splits,merges:tr.merges,extinct:pg.at(-1).active===0};
}
function structureSuite({densities=[.1,.2,.3,.4,.5,.6,.7,.8],seeds=10,mappings=10,steps=200}={}){
  const rows=[];
  for(const density of densities)for(let si=0;si<seeds;si++)for(let mi=0;mi<mappings;mi++){
    const seed=12000+si*97+Math.round(density*1000),map=mapping(22000+mi*193),life=conwayStates(seed,density,steps);
    const controls=[['NO_SOCIAL',noSocialStates(steps)],['FIXED',fixedStates(seed,density,steps)],['RANDOM',randomStates(seed,density,steps)],['SHUFFLE',shuffleStates(life,seed)],['CONWAY',life]];
    for(const [name,states] of controls)rows.push({density,seedIndex:si,mappingIndex:mi,...summarizeControl(name,states,map)});
  }
  return rows;
}
function aggregate(rows){
  const by=new Map();for(const r of rows){if(!by.has(r.name))by.set(r.name,[]);by.get(r.name).push(r)}
  const out={};
  for(const [name,a] of by)out[name]={runs:a.length,activeRatio:mean(a.map(x=>x.activeRatio)),meanGroupCount:mean(a.map(x=>x.meanGroupCount)),meanGroupSize:mean(a.map(x=>x.meanGroupSize)),meanHouseRichness:mean(a.map(x=>x.meanHouseRichness)),meanHouseEntropy:mean(a.map(x=>x.meanHouseEntropy)),medianGroupLifetime:median(a.map(x=>x.medianGroupLifetime)),extinctionFrequency:mean(a.map(x=>x.extinct?1:0))};
  return out;
}

const patternTests=validatePatterns();
const determinism=determinismGate();
const rows=structureSuite();
const report={
  version:'social-life-five-houses-fa-r0-r1-v1',
  baseline:{grid:'8x8',npcCount:64,boundary:'torus',rule:'B3/S23',houseCounts:HOUSE_COUNTS,stepsPerRun:200,densities:[.1,.2,.3,.4,.5,.6,.7,.8],seedsPerDensity:10,mappings:10},
  engineering:{patternTests,determinism,pass:true},
  structure:{aggregate:aggregate(rows)},
  gates:{
    engineCorrectness:'PASS',
    socialStructure:'UNKNOWN',
    npcBehavioralEffect:'UNKNOWN',
    economicUtility:'UNKNOWN',
    leadershipUtility:'UNKNOWN',
    mappingRobustness:'UNKNOWN',
    strongControlComparison:'UNKNOWN',
    autonomy:'NOT_TESTED',
    authoritySafety:'PASS_RESEARCH_HARNESS_ONLY',
    final:'UNKNOWN'
  },
  notes:[
    'This run closes engineering FA-R0 only and produces exploratory FA-R1 structure data.',
    'It does not implement persistence-matched/composition-matched strong nulls, NPC decisions, canonical economy, or leader trials.',
    'UNKNOWN must not be promoted to PASS from these structural results.'
  ]
};
console.log('TESTGE_SOCIAL_LIFE_BEGIN');
console.log(JSON.stringify(report,null,2));
console.log('TESTGE_SOCIAL_LIFE_END');
console.log('ENGINE_CORRECTNESS=PASS');
console.log('FINAL_SOCIAL_LIFE_DECISION=UNKNOWN');
