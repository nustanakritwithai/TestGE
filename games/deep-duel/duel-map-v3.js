export const ARENA={minX:-6,maxX:6,minY:-3.6,maxY:3.6};
export const ZONES=[
{id:'HIGH_WEST',label:'สันสูงตะวันตก',x:-3.8,y:-0.7,r:1.45,height:1.18,type:'HIGH_GROUND',control:.86,risk:.22},
{id:'HIGH_EAST',label:'สันสูงตะวันออก',x:3.8,y:.8,r:1.45,height:1.28,type:'HIGH_GROUND',control:.90,risk:.24},
{id:'CENTER',label:'ลานกลาง',x:0,y:0,r:1.7,height:.34,type:'OPEN',control:.62,risk:.62},
{id:'NORTH_PASS',label:'ช่องผ่านเหนือ',x:0,y:-2.45,r:1.0,height:.55,type:'CHOKE',control:.76,risk:.48},
{id:'SOUTH_PASS',label:'ช่องผ่านใต้',x:0,y:2.45,r:1.0,height:.50,type:'CHOKE',control:.73,risk:.50},
{id:'WEST_SAFE',label:'แนวพักตะวันตก',x:-5.0,y:2.6,r:.95,height:.18,type:'RECOVERY',control:.25,risk:.18},
{id:'EAST_SAFE',label:'แนวพักตะวันออก',x:5.0,y:-2.6,r:.95,height:.18,type:'RECOVERY',control:.25,risk:.18}
];
export const WAYPOINTS=[
{id:'W_SAFE',x:-5, y:2.6,zone:'WEST_SAFE'}, {id:'W_RIDGE',x:-3.7,y:-.7,zone:'HIGH_WEST'},
{id:'N_PASS',x:0,y:-2.45,zone:'NORTH_PASS'}, {id:'CENTER',x:0,y:0,zone:'CENTER'}, {id:'S_PASS',x:0,y:2.45,zone:'SOUTH_PASS'},
{id:'E_RIDGE',x:3.7,y:.8,zone:'HIGH_EAST'}, {id:'E_SAFE',x:5,y:-2.6,zone:'EAST_SAFE'}
];
export const EDGES=[['W_SAFE','S_PASS'],['W_SAFE','W_RIDGE'],['W_RIDGE','N_PASS'],['W_RIDGE','CENTER'],['N_PASS','E_RIDGE'],['N_PASS','CENTER'],['S_PASS','CENTER'],['S_PASS','E_SAFE'],['CENTER','E_RIDGE'],['CENTER','E_SAFE'],['E_RIDGE','E_SAFE']];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const gauss=(x,y,c,s)=>Math.exp(-((x-c.x)**2+(y-c.y)**2)/(2*s*s));
export function terrainHeight(x,y){const west=1.08*gauss(x,y,{x:-3.7,y:-.7},1.35),east=1.18*gauss(x,y,{x:3.7,y:.8},1.35),center=.24*gauss(x,y,{x:0,y:0},1.9),north=.34*gauss(x,y,{x:0,y:-2.35},.9),south=.30*gauss(x,y,{x:0,y:2.35},.9),basin=.12*Math.cos(y*.9)-.08*Math.cos(x*.65);return clamp(.08+west+east+center+north+south+basin,0,1.55)}
export function slopeAt(x,y){const e=.12,h=terrainHeight(x,y),dx=(terrainHeight(x+e,y)-terrainHeight(x-e,y))/(2*e),dy=(terrainHeight(x,y+e)-terrainHeight(x,y-e))/(2*e);return{grade:Math.hypot(dx,dy),dx,dy,height:h}}
export function zoneAt(x,y){let best=null,bestD=Infinity;for(const z of ZONES){const d=Math.hypot(x-z.x,y-z.y);if(d<z.r&&d<bestD){best=z;bestD=d}}return best||{id:'FIELD',label:'พื้นที่เปิด',type:'FIELD',control:.45,risk:.45,height:terrainHeight(x,y)}}
export function clampPoint(x,y){return{x:clamp(x,ARENA.minX,ARENA.maxX),y:clamp(y,ARENA.minY,ARENA.maxY)}}
export function chokePressure(self,enemy){const zone=zoneAt(self.x,self.y);if(zone.type!=='CHOKE')return 0;const d=Math.hypot(self.x-enemy.x,self.y-enemy.y);return clamp((2.8-d)/2.8,0,1)}
export function terrainScore(self,enemy){const zone=zoneAt(self.x,self.y),s=slopeAt(self.x,self.y),h=self.z-enemy.z,choke=chokePressure(self,enemy);let score=zone.control*18-zone.risk*8+clamp(h,-1.2,1.2)*14-s.grade*8+choke*10;if(zone.type==='RECOVERY'&&self.stamina<35)score+=22;if(zone.type==='OPEN'&&self.hp/self.maxHP<.35)score-=10;return{score,zone,heightAdv:h,slope:s.grade,choke}}
function wp(id){return WAYPOINTS.find(w=>w.id===id)}
function neighbors(id){return EDGES.flatMap(([a,b])=>a===id?[b]:b===id?[a]:[])}
function nearestWaypoint(x,y){return WAYPOINTS.slice().sort((a,b)=>Math.hypot(x-a.x,y-a.y)-Math.hypot(x-b.x,y-b.y))[0]}
function edgeCost(a,b,enemy,mode){const A=wp(a),B=wp(b),mx=(A.x+B.x)/2,my=(A.y+B.y)/2,za=terrainHeight(A.x,A.y),zb=terrainHeight(B.x,B.y),s=Math.abs(zb-za),zone=zoneAt(mx,my);let c=Math.hypot(A.x-B.x,A.y-B.y)*(1+s*.9)+zone.risk*2.2;const enemyD=Math.hypot(mx-enemy.x,my-enemy.y);if(zone.type==='CHOKE')c+=(enemyD<2.3?2.5:0);if(mode==='SURVIVE'||mode==='RECOVER'){if(zone.type==='RECOVERY')c-=2;if(zone.type==='OPEN')c+=2.5}else if(mode==='CONTROL'){if(zone.type==='HIGH_GROUND'||zone.type==='CHOKE')c-=1.8}return Math.max(.2,c)}
export function planRoute(self,enemy,target,mode){const start=nearestWaypoint(self.x,self.y),goal=nearestWaypoint(target.x,target.y);const distMap=Object.fromEntries(WAYPOINTS.map(w=>[w.id,Infinity])),prev={};distMap[start.id]=0;const open=new Set(WAYPOINTS.map(w=>w.id));while(open.size){let cur=[...open].sort((a,b)=>distMap[a]-distMap[b])[0];open.delete(cur);if(cur===goal.id)break;for(const n of neighbors(cur)){if(!open.has(n))continue;const alt=distMap[cur]+edgeCost(cur,n,enemy,mode);if(alt<distMap[n]){distMap[n]=alt;prev[n]=cur}}}const path=[];let u=goal.id;path.unshift(wp(u));while(prev[u]){u=prev[u];path.unshift(wp(u))}if(path[0]?.id===start.id)path.shift();return path.length?path:[goal]}
export function chooseTacticalPoint(self,enemy,mode){let candidates=ZONES.map(z=>({zone:z,d:Math.hypot(self.x-z.x,self.y-z.y),enemyD:Math.hypot(enemy.x-z.x,enemy.y-z.y)}));if(mode==='RECOVER'||mode==='SURVIVE')candidates=candidates.filter(c=>c.zone.type==='RECOVERY'||c.zone.type==='HIGH_GROUND');else if(mode==='CONTROL')candidates=candidates.filter(c=>c.zone.type==='HIGH_GROUND'||c.zone.type==='CHOKE');else candidates=candidates.filter(c=>c.zone.type!=='RECOVERY');candidates.sort((a,b)=>{const av=a.zone.control*18-a.zone.risk*7-a.d*1.1+(a.enemyD<3?4:0)+(a.zone.type==='HIGH_GROUND'?6:0),bv=b.zone.control*18-b.zone.risk*7-b.d*1.1+(b.enemyD<3?4:0)+(b.zone.type==='HIGH_GROUND'?6:0);return bv-av});return candidates[0]?.zone||ZONES[2]}
