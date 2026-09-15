// 2v2 Tactical Core v1 — reusable by live preview and future full engine.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const TERRAIN={grass:{cost:1,accuracy:0,evasion:0},stone:{cost:.82,accuracy:.005,evasion:0},mud:{cost:1.55,accuracy:-.015,evasion:-.035},rune:{cost:1.08,accuracy:.015,evasion:0}};
export const PLATFORMS=[{x:-2.7,z:2.8,r:2,h:.9},{x:3,z:-2.7,r:1.85,h:1.2}],MUD=[{x:-4.4,z:-3.2,r:1.65},{x:4.7,z:3.4,r:1.5}],OBSTACLES=[{x:-1.1,z:-3.8,r:.72},{x:1.45,z:3.85,r:.72},{x:-5.6,z:1.8,r:.8},{x:5.6,z:-1.6,r:.8}];
export function heightAt(x,z){for(const p of PLATFORMS)if(Math.hypot(x-p.x,z-p.z)<=p.r-.08)return p.h;return 0;}
export function terrainAt(x,z){for(const m of MUD)if(Math.hypot(x-m.x,z-m.z)<=m.r)return TERRAIN.mud;if(Math.abs(z)<.62||Math.abs(x)<.58)return TERRAIN.stone;if(Math.hypot(x,z)<2.5)return TERRAIN.rune;return TERRAIN.grass;}
export function occupied(x,z,actors,self,min=1.1){return actors.some(a=>a!==self&&a.hp>0&&Math.hypot(x-a.x,z-a.z)<min);}
export function blocked(x,z,actors,self,arenaR=8.6){return Math.hypot(x,z)>arenaR||occupied(x,z,actors,self)||OBSTACLES.some(o=>Math.hypot(x-o.x,z-o.z)<o.r+.32);}
export function movementCost(actor,x,z){const d=Math.hypot(x-actor.x,z-actor.z),dh=heightAt(x,z)-heightAt(actor.x,actor.z),jump=actor.jump??.9;if(Math.abs(dh)>jump)return Infinity;return d*terrainAt(x,z).cost+(dh>0?dh*.85:Math.abs(dh)*.28)+(Math.abs(dh)>.34?(dh>0?.65:.22):0);}
export function enemiesInZoC(actor,actors){return actors.filter(a=>a.team!==actor.team&&a.hp>0&&Math.hypot(actor.x-a.x,actor.z-a.z)<=((a.zoc??1.75)));}
export function leavingZoC(actor,nx,nz,actors){return enemiesInZoC(actor,actors).filter(e=>Math.hypot(nx-e.x,nz-e.z)>(e.zoc??1.75));}
export function highGround(attacker,defender){const d=heightAt(attacker.x,attacker.z)-heightAt(defender.x,defender.z);return d>.4?1:d<-.4?-1:0;}
export function positionalRelation(attacker,defender){const dx=attacker.x-defender.x,dz=attacker.z-defender.z,l=Math.hypot(dx,dz)||1,fx=defender.facing?.x??(defender.team==='p'?1:-1),fz=defender.facing?.z??0,dot=fx*dx/l+fz*dz/l;if(dot<-.45)return'BACK';if(Math.abs(dot)<.45)return'SIDE';return'FRONT';}
export function positionalDamage(rel){return rel==='BACK'?1.22:rel==='SIDE'?1.1:1;}
export function moveBudget(actor){const base=actor.move??3.8,st=actor.stamina??100,max=actor.maxStamina??100;return base*(st/max<.25?.84:1);}
export function applyMove(actor,nx,nz,actors){if(blocked(nx,nz,actors,actor))return{ok:false,reason:'BLOCKED'};const cost=movementCost(actor,nx,nz);if(!Number.isFinite(cost)||cost>(actor.moveLeft??moveBudget(actor)))return{ok:false,reason:'COST'};const aoo=leavingZoC(actor,nx,nz,actors);actor.x=nx;actor.z=nz;actor.moveLeft=clamp((actor.moveLeft??moveBudget(actor))-cost,0,99);return{ok:true,cost,aoo,height:heightAt(nx,nz),terrain:terrainAt(nx,nz)};}
