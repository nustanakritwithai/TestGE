import {createWorld,cloneWorld,applyBounds,makeProposal} from './world.js';

const FEATURE_N=12;
function zeroW(){return {vx:new Float64Array(FEATURE_N),vy:new Float64Array(FEATURE_N)}}
function dot(w,x){let s=0;for(let i=0;i<w.length;i++)s+=w[i]*x[i];return s}

function spatialPairs(entities,cell=.16){
  const grid=new Map(),pairs=[],seen=new Set();
  for(const e of entities){const cx=Math.floor(e.x/cell),cy=Math.floor(e.y/cell),k=cx+','+cy;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(e)}
  for(const e of entities){const cx=Math.floor(e.x/cell),cy=Math.floor(e.y/cell);for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){
    const bucket=grid.get((cx+ox)+','+(cy+oy));if(!bucket)continue;
    for(const b of bucket){if(b.id===e.id)continue;const lo=Math.min(e.id,b.id),hi=Math.max(e.id,b.id),key=lo+':'+hi;if(seen.has(key))continue;seen.add(key);pairs.push([e,b]);}
  }}
  return pairs;
}

function ballistic(world){
  const w=cloneWorld(world);for(const e of w.entities){e.x+=e.vx*w.dt;e.y+=e.vy*w.dt;applyBounds(e)}return w;
}

function graphFeatures(world){
  const moved=ballistic(world), by=new Map(moved.entities.map(e=>[e.id,{sx:0,sy:0,svx:0,svy:0,n:0,hitN:0,hdvx:0,hdvy:0,overlap:0}]));
  const pairs=spatialPairs(moved.entities,.16), events=[];
  for(const [a,b] of pairs){
    const dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy,d=Math.sqrt(d2),rr=a.r+b.r;
    if(d>.16)continue;
    const aa=by.get(a.id),bb=by.get(b.id);aa.sx+=dx;aa.sy+=dy;aa.svx+=b.vx-a.vx;aa.svy+=b.vy-a.vy;aa.n++;bb.sx-=dx;bb.sy-=dy;bb.svx+=a.vx-b.vx;bb.svy+=a.vy-b.vy;bb.n++;
    if(d2<rr*rr){
      events.push({type:'collision',a:a.id,b:b.id});
      const ov=Math.max(0,rr-d)/Math.max(rr,1e-6);aa.hitN++;bb.hitN++;aa.hdvx+=b.vx-a.vx;aa.hdvy+=b.vy-a.vy;bb.hdvx+=a.vx-b.vx;bb.hdvy+=a.vy-b.vy;aa.overlap+=ov;bb.overlap+=ov;
    }
  }
  const features=moved.entities.map(e=>{const m=by.get(e.id),k=Math.max(1,m.n),hk=Math.max(1,m.hitN);return [1,e.x,e.y,e.vx,e.vy,m.sx/k,m.sy/k,m.svx/k,m.svy/k,Math.min(1,m.n/12),Math.min(1,m.hitN/4),(m.overlap/hk)||0]});
  return {moved,features,events,meta:by};
}

function sgd(weights,samples,epochs=24,lr=.012){
  for(let ep=0;ep<epochs;ep++){
    const eta=lr/(1+ep*.06);
    for(const s of samples){const px=dot(weights.vx,s.f),py=dot(weights.vy,s.f),ex=px-s.tx,ey=py-s.ty;for(let j=0;j<FEATURE_N;j++){const reg=2e-6;weights.vx[j]-=eta*(2*ex*s.f[j]+reg*weights.vx[j]);weights.vy[j]-=eta*(2*ey*s.f[j]+reg*weights.vy[j]);}}
  }
  return weights;
}

function collectSamples(exactSkill,approxSkill,{episodes=90,seed=7001}={}){
  const direct=[],residual=[];const workloads=[{count:24,density:.18,speed:.55},{count:96,density:.72,speed:1.05},{count:192,density:.9,speed:2.2}];
  for(let ep=0;ep<episodes;ep++){
    const spec=workloads[ep%workloads.length],w=createWorld({...spec,seed:seed+ep}), gf=graphFeatures(w), ex=exactSkill.run({world:cloneWorld(w)}), ap=approxSkill.run({world:cloneWorld(w)});
    for(let i=0;i<w.entities.length;i++){
      const e=w.entities[i],xe=ex.stateDelta[i],xa=ap.stateDelta[i],f=gf.features[i];
      // Direct GNN learns delta-v from ballistic state; residual learns correction over strong spatial classical baseline.
      direct.push({f,tx:xe.vx-e.vx,ty:xe.vy-e.vy});
      residual.push({f,tx:xe.vx-xa.vx,ty:xe.vy-xa.vy});
    }
  }
  return {direct,residual};
}

export function trainGraphModels(exactSkill,approxSkill,opts={}){
  const data=collectSamples(exactSkill,approxSkill,opts),epochs=opts.epochs||26,lr=opts.lr||.012;
  const gnn=sgd(zeroW(),data.direct,epochs,lr),residual=sgd(zeroW(),data.residual,epochs,lr);
  return {gnn,residual,meta:{samples:data.direct.length,episodes:opts.episodes||90,epochs,lr,trainedAt:new Date().toISOString(),version:'learned-v2-spatial'}};
}

export class TrainedGraphSkill{
  constructor({id,label,weights,residual=false,approxSkill=null}){this.id=id;this.label=label;this.weights=weights;this.residual=residual;this.approxSkill=approxSkill;this.approved=false;}
  run({world}){
    const gf=graphFeatures(world),w=gf.moved,base=this.residual?this.approxSkill.run({world:cloneWorld(world)}):null;
    for(let i=0;i<w.entities.length;i++){
      const e=w.entities[i],f=gf.features[i];let dvx=dot(this.weights.vx,f),dvy=dot(this.weights.vy,f);
      if(this.residual){e.vx=base.stateDelta[i].vx+dvx;e.vy=base.stateDelta[i].vy+dvy;}
      else {e.vx=world.entities[i].vx+dvx;e.vy=world.entities[i].vy+dvy;}
    }
    // Hybrid event head: cheap spatial broadphase + exact overlap on ballistic positions.
    // This keeps learned state prediction separate from critical event authority and removes the old proximity-event mismatch.
    return makeProposal(w,gf.events,{authority:false,mode:this.residual?'residual_gnn_v2':'gnn_v2',trained:true,graph:'spatial_hash',eventHead:'hybrid_geometric'});
  }
}
