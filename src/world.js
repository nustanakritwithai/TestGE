export const DT = 1/60;

export function mulberry32(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

export function createWorld({seed=42,count=48,density=.45,speed=1}={}){
  const r=mulberry32(seed), entities=[];
  for(let i=0;i<count;i++){
    const spread=1-density*.55;
    entities.push({id:i,type:i===0?'player':'enemy',x:(r()-.5)*spread,y:(r()-.5)*spread,vx:(r()-.5)*speed,vy:(r()-.5)*speed,r:.012+r()*.008,mass:1,hp:100,team:i===0?0:1,active:true});
  }
  return {tick:0,dt:DT,seed,entities,relations:[],actions:[],events:[],parameters:{density,speed}};
}

export function cloneWorld(w){return JSON.parse(JSON.stringify(w))}
export function stateHash(w){let h=2166136261>>>0;for(const e of w.entities){for(const v of [e.id,e.x,e.y,e.vx,e.vy,e.hp]){let s=String(Math.round(Number(v)*1e6));for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}}}return (h>>>0).toString(16).padStart(8,'0')}

export function buildRelations(w, radius=.14){const rel=[];const E=w.entities;for(let i=0;i<E.length;i++)for(let j=i+1;j<E.length;j++){const a=E[i],b=E[j],dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy;if(d2<=radius*radius)rel.push({a:a.id,b:b.id,dx,dy,distance:Math.sqrt(d2),rvx:b.vx-a.vx,rvy:b.vy-a.vy})}return rel}

export function applyBounds(e){if(e.x<-1){e.x=-1;e.vx=Math.abs(e.vx)} if(e.x>1){e.x=1;e.vx=-Math.abs(e.vx)} if(e.y<-1){e.y=-1;e.vy=Math.abs(e.vy)} if(e.y>1){e.y=1;e.vy=-Math.abs(e.vy)}}

export function makeProposal(next,events,diagnostics={}){return {stateDelta:next.entities.map(e=>({id:e.id,x:e.x,y:e.y,vx:e.vx,vy:e.vy,hp:e.hp,active:e.active})),events,diagnostics}}

export function commitProposal(world, proposal){const byId=new Map(proposal.stateDelta.map(x=>[x.id,x]));for(const e of world.entities){const n=byId.get(e.id);if(n)Object.assign(e,n)}world.events=proposal.events||[];world.relations=buildRelations(world);world.tick++;return world}
