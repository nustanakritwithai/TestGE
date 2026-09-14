import {cloneWorld,buildRelations,applyBounds,makeProposal} from './world.js';
import {TrainedGraphSkill} from './learned.js';

export class ComputeSkill{
  constructor(id,label){this.id=id;this.label=label;this.approved=true}
  run(_request){throw new Error('Not implemented')}
}

export class ExactClassicalSkill extends ComputeSkill{
  constructor(){super('exact','Exact Classical')}
  run({world}){const w=cloneWorld(world),events=[];for(const e of w.entities){e.x+=e.vx*w.dt;e.y+=e.vy*w.dt;applyBounds(e)}
    for(let i=0;i<w.entities.length;i++)for(let j=i+1;j<w.entities.length;j++){const a=w.entities[i],b=w.entities[j],dx=b.x-a.x,dy=b.y-a.y,rr=a.r+b.r;if(dx*dx+dy*dy<rr*rr){const avx=a.vx,avy=a.vy;a.vx=b.vx;a.vy=b.vy;b.vx=avx;b.vy=avy;events.push({type:'collision',a:a.id,b:b.id})}}
    w.relations=buildRelations(w);return makeProposal(w,events,{authority:true,mode:'exact'})
  }
}

export class ApproxClassicalSkill extends ComputeSkill{
  constructor(){super('approx','Approx Classical')}
  run({world}){const w=cloneWorld(world),events=[],cell=.12,grid=new Map();for(const e of w.entities){e.x+=e.vx*w.dt;e.y+=e.vy*w.dt;applyBounds(e);const k=Math.floor(e.x/cell)+','+Math.floor(e.y/cell);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(e)}
    for(const bucket of grid.values())for(let i=0;i<bucket.length;i++)for(let j=i+1;j<bucket.length;j++){const a=bucket[i],b=bucket[j],dx=b.x-a.x,dy=b.y-a.y,rr=a.r+b.r;if(dx*dx+dy*dy<rr*rr){a.vx*=-.96;b.vx*=-.96;events.push({type:'collision_approx',a:a.id,b:b.id})}}
    w.relations=buildRelations(w);return makeProposal(w,events,{authority:false,mode:'approx'})
  }
}

export class ResearchSkill extends ComputeSkill{
  constructor(id,label){super(id,label);this.approved=false}
  run(){throw new Error(`${this.label} ยังไม่มี trained checkpoint`)}
}

export const registry={
  exact:new ExactClassicalSkill(),
  approx:new ApproxClassicalSkill(),
  gnn:new ResearchSkill('gnn','GNN'),
  residual:new ResearchSkill('residual','Residual GNN')
};

export function installTrainedModels(models){
  registry.gnn=new TrainedGraphSkill({id:'gnn',label:'GNN ที่ฝึกแล้ว',weights:models.gnn,residual:false});
  registry.residual=new TrainedGraphSkill({id:'residual',label:'Residual GNN ที่ฝึกแล้ว',weights:models.residual,residual:true,approxSkill:registry.approx});
  return registry;
}

export function setApproval(id,approved){if(registry[id])registry[id].approved=!!approved;}

export function verifyProposal(world,proposal,{critical=false}={}){
  if(!proposal||!Array.isArray(proposal.stateDelta))return {ok:false,reason:'โครงสร้างผลลัพธ์ไม่ถูกต้อง'};
  for(const e of proposal.stateDelta){if(!Number.isFinite(e.x)||!Number.isFinite(e.y)||!Number.isFinite(e.vx)||!Number.isFinite(e.vy))return {ok:false,reason:'พบ NaN/Infinity'};if(Math.abs(e.x)>1.05||Math.abs(e.y)>1.05)return {ok:false,reason:'สถานะหลุดขอบโลก'}}
  if(critical&&!proposal.diagnostics?.authority)return {ok:false,reason:'เหตุการณ์วิกฤตต้องใช้ Exact Authority'};
  return {ok:true,reason:'ผ่าน'}
}
