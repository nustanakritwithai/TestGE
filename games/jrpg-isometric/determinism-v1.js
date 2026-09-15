// R6.6 deterministic utilities for replay/regression.
export function mulberry32(seed=1){let a=seed>>>0;return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export function stableActor(a){return{id:a.id,hp:Math.round(a.hp*100)/100,stamina:Math.round((a.stamina||0)*100)/100,posture:Math.round((a.posture||0)*100)/100,mp:Math.round((a.mp||0)*100)/100,x:Math.round(a.x*1000)/1000,z:Math.round(a.z*1000)/1000,statuses:(a.statuses||[]).map(s=>[s.id,s.turns||0]).sort()}}
export function stateString(parties,round=0){return JSON.stringify({round,actors:parties.flatMap(p=>p.members).map(stableActor).sort((a,b)=>a.id.localeCompare(b.id))})}
export function hashString(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16).padStart(8,'0')}
export function stateHash(parties,round=0){return hashString(stateString(parties,round))}
