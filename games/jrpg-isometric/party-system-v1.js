// 2v2 Party Core v1 — combat-domain only, renderer independent.
export function createParty(id,members=[]){return{id,members:[...members]};}
export function living(party){return party.members.filter(a=>a.hp>0);}
export function defeated(party){return living(party).length===0;}
export function validTargets(enemyParty){return living(enemyParty);}
export function nearestTarget(actor,enemyParty){return validTargets(enemyParty).sort((a,b)=>Math.hypot(actor.x-a.x,actor.z-a.z)-Math.hypot(actor.x-b.x,actor.z-b.z))[0]||null;}
export function lowestHpTarget(enemyParty){return validTargets(enemyParty).sort((a,b)=>(a.hp/a.stats.derived.maxHP)-(b.hp/b.stats.derived.maxHP))[0]||null;}
export function buildInitiative(parties,actionMap,rand=()=>0){const q=[];for(const party of parties)for(const actor of living(party)){const action=actionMap.get(actor);if(!action)continue;q.push({actor,action,target:action.target,initiative:(actor.stats?.derived?.spd||0)+(action.speedMod||0)+rand()*8});}return q.sort((a,b)=>b.initiative-a.initiative);}
export function selectTarget(actor,enemyParty,policy='nearest'){if(policy==='weakest')return lowestHpTarget(enemyParty);return nearestTarget(actor,enemyParty);}
export function partySnapshot(party){return{id:party.id,alive:living(party).length,members:party.members.map(a=>({name:a.name,hp:a.hp,maxHP:a.stats.derived.maxHP,alive:a.hp>0,x:a.x,z:a.z}))};}
export function battleOutcome(playerParty,enemyParty){if(defeated(playerParty))return'ENEMY_WIN';if(defeated(enemyParty))return'PLAYER_WIN';return'ONGOING';}
