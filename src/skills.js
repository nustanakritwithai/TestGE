import {cloneWorld,applyBounds,makeProposal} from './world.js';

export class ComputeSkill{
  constructor(id,label){this.id=id;this.label=label;this.approved=true}
  run(_request){throw new Error('Not implemented')}
}

function collisionPairsGrid(entities,cell=.12){
  const grid=new Map(),pairs=[],seen=new Set();
  for(const e of entities){const cx=Math.floor(e.x/cell),cy=Math.floor(e.y/cell),k=cx+','+cy;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(e)}
  for(const e of entities){const cx=Math.floor(e.x/cell),cy=Math.floor(e.y/cell);for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){
    const bucket=grid.get((cx+ox)+','+(cy+oy));if(!bucket)continue;
    for(const b of bucket){if(b.id===e.id)continue;const aId=Math.min(e.id,b.id),bId=Math.max(e.id,b.id),key=aId+':'+bId;if(seen.has(key))continue;seen.add(key);pairs.push([e,b]);}
  }}
  return pairs;
}

export class ExactClassicalSkill extends ComputeSkill{
  constructor(){super('exact','Exact Classical')}
  run({world}){const w=cloneWorld(world),events=[];for(const e of w.entities){e.x+=e.vx*w.dt;e.y+=e.vy*w.dt;applyBounds(e)}
    for(let i=0;i<w.entities.length;i++)for(let j=i+1;j<w.entities.length;j++){const a=w.entities[i],b=w.entities[j],dx=b.x-a.x,dy=b.y-a.y,rr=a.r+b.r;if(dx*dx+dy*dy<rr*rr){const avx=a.vx,avy=a.vy;a.vx=b.vx;a.vy=b.vy;b.vx=avx;b.vy=avy;events.push({type:'collision',a:a.id,b:b.id})}}
    return makeProposal(w,events,{authority:true,mode:'exact'})
  }
}

export class ApproxClassicalSkill extends ComputeSkill{
  constructor(){super('approx','Approx Classical (Spatial)')}
  run({world}){const w=cloneWorld(world),events=[];for(const e of w.entities){e.x+=e.vx*w.dt;e.y+=e.vy*w.dt;applyBounds(e)}
    const pairs=collisionPairsGrid(w.entities,.12);
    for(const [a,b] of pairs){const dx=b.x-a.x,dy=b.y-a.y,rr=a.r+b.r;if(dx*dx+dy*dy<rr*rr){const avx=a.vx,avy=a.vy;a.vx=b.vx;a.vy=b.vy;b.vx=avx;b.vy=avy;events.push({type:'collision',a:a.id,b:b.id})}}
    return makeProposal(w,events,{authority:false,mode:'approx_spatial',broadphasePairs:pairs.length})
  }
}

export class ResearchSkill extends ComputeSkill{
  constructor(id,label){super(id,label);this.approved=false}
  run(){throw new Error(`${this.label} ยังเป็น Research Slot และยังไม่ได้รับอนุมัติจาก benchmark`)}
}

export const registry={
  exact:new ExactClassicalSkill(),
  approx:new ApproxClassicalSkill(),
  gnn:new ResearchSkill('gnn','GNN'),
  residual:new ResearchSkill('residual','Residual GNN')
};

export function verifyProposal(world,proposal,{critical=false}={}){
  if(!proposal||!Array.isArray(proposal.stateDelta))return {ok:false,reason:'โครงสร้างผลลัพธ์ไม่ถูกต้อง'};
  for(const e of proposal.stateDelta){if(!Number.isFinite(e.x)||!Number.isFinite(e.y)||!Number.isFinite(e.vx)||!Number.isFinite(e.vy))return {ok:false,reason:'พบ NaN/Infinity'};if(Math.abs(e.x)>1.05||Math.abs(e.y)>1.05)return {ok:false,reason:'สถานะหลุดขอบโลก'}}
  if(critical&&!proposal.diagnostics?.authority)return {ok:false,reason:'เหตุการณ์วิกฤตต้องใช้ Exact Authority'};
  return {ok:true,reason:'ผ่าน'}
}
