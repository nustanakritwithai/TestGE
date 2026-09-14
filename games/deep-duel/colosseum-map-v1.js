export const ARENA={radius:6.2};
export const ZONES=[
{id:'CENTER_SIGIL',label:'วงแหวนกลาง',x:0,y:0,r:1.45,height:.18,type:'CENTER',control:.78,risk:.58},
{id:'NORTH_DAIS',label:'แท่นสูงเหนือ',x:0,y:-3.35,r:1.15,height:1.05,type:'HIGH_GROUND',control:.90,risk:.34},
{id:'SOUTH_DAIS',label:'แท่นสูงใต้',x:0,y:3.25,r:1.15,height:.92,type:'HIGH_GROUND',control:.86,risk:.36},
{id:'WEST_PILLARS',label:'แนวเสาตะวันตก',x:-3.6,y:0,r:1.25,height:.42,type:'COVER',control:.70,risk:.28},
{id:'EAST_PILLARS',label:'แนวเสาตะวันออก',x:3.6,y:0,r:1.25,height:.46,type:'COVER',control:.72,risk:.30},
{id:'NW_RAMP',label:'ทางลาดตะวันตกเฉียงเหนือ',x:-2.7,y:-2.7,r:.95,height:.64,type:'RAMP',control:.62,risk:.32},
{id:'SE_RAMP',label:'ทางลาดตะวันออกเฉียงใต้',x:2.7,y:2.7,r:.95,height:.58,type:'RAMP',control:.60,risk:.34},
{id:'WEST_RECOVERY',label:'ขอบสนามตะวันตก',x:-5.0,y:1.65,r:.85,height:.16,type:'RECOVERY',control:.24,risk:.20},
{id:'EAST_RECOVERY',label:'ขอบสนามตะวันออก',x:5.0,y:-1.65,r:.85,height:.16,type:'RECOVERY',control:.24,risk:.20}
];
export const OBSTACLES=[
{x:-2.7,y:.2,r:.42,type:'PILLAR'},{x:2.7,y:-.2,r:.42,type:'PILLAR'},
{x:-1.8,y:2.0,r:.34,type:'BRAZIER'},{x:1.8,y:-2.0,r:.34,type:'BRAZIER'}
];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const gauss=(x,y,c,s)=>Math.exp(-((x-c.x)**2+(y-c.y)**2)/(2*s*s));
export function terrainHeight(x,y){
 const north=.95*gauss(x,y,{x:0,y:-3.35},1.05),south=.82*gauss(x,y,{x:0,y:3.25},1.05),west=.28*gauss(x,y,{x:-3.5,y:0},1.25),east=.31*gauss(x,y,{x:3.5,y:0},1.25),center=.10*gauss(x,y,{x:0,y:0},1.8);
 return clamp(.08+north+south+west+east+center,0,1.25);
}
export function zoneAt(x,y){let best=null,bd=Infinity;for(const z of ZONES){const d=Math.hypot(x-z.x,y-z.y);if(d<z.r&&d<bd){best=z;bd=d}}return best||{id:'SAND',label:'พื้นทรายอารีน่า',type:'SAND',control:.48,risk:.42,height:terrainHeight(x,y)}}
export function clampArena(x,y){const d=Math.hypot(x,y);if(d<=ARENA.radius)return{x,y};const s=ARENA.radius/d;return{x:x*s,y:y*s}}
export function blocked(x,y){return OBSTACLES.some(o=>Math.hypot(x-o.x,y-o.y)<o.r+.28)}
export function tacticalScore(self,enemy){const z=zoneAt(self.x,self.y),h=self.z-enemy.z;let score=z.control*18-z.risk*8+h*15;if(z.type==='COVER')score+=7;if(z.type==='RECOVERY'&&self.stamina<35)score+=22;if(z.type==='CENTER'&&self.hp/self.maxHP<.35)score-=9;return{score,zone:z,heightAdv:h}}
export function chooseTacticalPoint(self,enemy,intent){let cs=ZONES.slice();if(intent==='SURVIVE'||intent==='RECOVER')cs=cs.filter(z=>['RECOVERY','COVER','HIGH_GROUND'].includes(z.type));else if(intent==='CONTROL')cs=cs.filter(z=>['HIGH_GROUND','COVER','CENTER'].includes(z.type));else cs=cs.filter(z=>z.type!=='RECOVERY');cs.sort((a,b)=>scoreZone(b,self,enemy,intent)-scoreZone(a,self,enemy,intent));return cs[0]||ZONES[0]}
function scoreZone(z,self,enemy,intent){const d=Math.hypot(self.x-z.x,self.y-z.y),ed=Math.hypot(enemy.x-z.x,enemy.y-z.y);let s=z.control*18-z.risk*7-d*1.25+(z.type==='HIGH_GROUND'?6:0)+(z.type==='COVER'?5:0);if(intent==='SURVIVE')s+=ed*.7;if(intent==='DAMAGE')s-=ed*.55;return s}
