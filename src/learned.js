import {createWorld,cloneWorld,buildRelations,applyBounds,makeProposal} from './world.js';

const FEATURE_N=10;
function zeroW(){return {vx:new Float64Array(FEATURE_N),vy:new Float64Array(FEATURE_N)}}
function featFor(world){
  const rel=buildRelations(world,.16), by=new Map(world.entities.map(e=>[e.id,{sx:0,sy:0,svx:0,svy:0,n:0}]));
  for(const r of rel){const a=by.get(r.a),b=by.get(r.b);a.sx+=r.dx;a.sy+=r.dy;a.svx+=r.rvx;a.svy+=r.rvy;a.n++;b.sx-=r.dx;b.sy-=r.dy;b.svx-=r.rvx;b.svy-=r.rvy;b.n++;}
  return world.entities.map(e=>{const m=by.get(e.id),k=Math.max(1,m.n);return [1,e.x,e.y,e.vx,e.vy,m.sx/k,m.sy/k,m.svx/k,m.svy/k,Math.min(1,m.n/12)]});
}
function dot(w,x){let s=0;for(let i=0;i<w.length;i++)s+=w[i]*x[i];return s}
function sgd(weights,samples,epochs=14,lr=.025){
  for(let ep=0;ep<epochs;ep++){
    const eta=lr/(1+ep*.08);
    for(const s of samples){
      const px=dot(weights.vx,s.f),py=dot(weights.vy,s.f),ex=px-s.tx,ey=py-s.ty;
      for(let j=0;j<FEATURE_N;j++){weights.vx[j]-=eta*(2*ex*s.f[j]+1e-5*weights.vx[j]);weights.vy[j]-=eta*(2*ey*s.f[j]+1e-5*weights.vy[j]);}
    }
  }
  return weights;
}
function collectSamples(exactSkill,approxSkill,{episodes=72,count=64,density=.55,speed=1.1,seed=7001}={}){
  const direct=[],residual=[];
  for(let ep=0;ep<episodes;ep++){
    const w=createWorld({seed:seed+ep,count,density,speed}), f=featFor(w), ex=exactSkill.run({world:cloneWorld(w)}), ap=approxSkill.run({world:cloneWorld(w)});
    for(let i=0;i<w.entities.length;i++){
      const e=w.entities[i],xe=ex.stateDelta[i],xa=ap.stateDelta[i];
      direct.push({f:f[i],tx:xe.vx,ty:xe.vy});
      residual.push({f:f[i],tx:xe.vx-xa.vx,ty:xe.vy-xa.vy});
    }
  }
  return {direct,residual};
}

export function trainGraphModels(exactSkill,approxSkill,opts={}){
  const data=collectSamples(exactSkill,approxSkill,opts);
  const gnn=sgd(zeroW(),data.direct,opts.epochs||16,opts.lr||.02);
  const residual=sgd(zeroW(),data.residual,opts.epochs||16,opts.lr||.02);
  return {gnn,residual,meta:{samples:data.direct.length,episodes:opts.episodes||72,trainedAt:new Date().toISOString()}};
}

export class TrainedGraphSkill{
  constructor({id,label,weights,residual=false,approxSkill=null}){this.id=id;this.label=label;this.weights=weights;this.residual=residual;this.approxSkill=approxSkill;this.approved=false;}
  run({world}){
    const base=this.residual?this.approxSkill.run({world:cloneWorld(world)}):null,w=cloneWorld(world),F=featFor(world),events=[];
    for(let i=0;i<w.entities.length;i++){
      const e=w.entities[i],f=F[i];
      let vx=dot(this.weights.vx,f),vy=dot(this.weights.vy,f);
      if(this.residual){vx=base.stateDelta[i].vx+vx;vy=base.stateDelta[i].vy+vy;}
      e.vx=vx;e.vy=vy;e.x+=e.vx*w.dt;e.y+=e.vy*w.dt;applyBounds(e);
    }
    // Learned skills propose collision-like events from close relations; authority remains false.
    for(const r of buildRelations(w,.05)) events.push({type:'collision_proposal',a:r.a,b:r.b});
    return makeProposal(w,events,{authority:false,mode:this.residual?'residual_gnn':'gnn',trained:true});
  }
}
