// P1.2 Mental integration. Renderer remains battle-v5 stable path until this file is promoted after smoke test.
import {createMental,mentalModifiers,applyMentalEvent,settleMentalTurn,mentalLabel} from './mental-system-v1.js';
export function attachMental(actor,seed){actor.mental=createMental(seed);return actor;}
export function mentalBattleModifiers(actor){return mentalModifiers(actor.mental||createMental());}
export function applyMentalToBattleStats(stats,actor){const m=mentalBattleModifiers(actor);return{...stats,accuracy:Math.max(.01,Math.min(.99,stats.accuracy+m.accuracy)),reaction:stats.reaction*(1+m.reaction),move:stats.move*m.move,guardEff:Math.max(.1,Math.min(.95,stats.guardEff*m.guard)),mentalDamage:m.damage,mentalRisk:m.risk,mentalState:mentalLabel(actor.mental)};}
export function combatMentalEvent(actor,event){if(!actor.mental)attachMental(actor);actor.mental=applyMentalEvent(actor.mental,event);return actor.mental;}
export function settleActorMental(actor){if(!actor.mental)attachMental(actor);actor.mental=settleMentalTurn(actor.mental);return actor.mental;}
export function mentalDamageMultiplier(actor){return mentalBattleModifiers(actor).damage;}
export function mentalSnapshot(actor){const m=actor.mental||createMental();return{...m,label:mentalLabel(m),mods:mentalModifiers(m)};}
// Integration map for battle-v5 promotion:
// makeActor -> attachMental(actor, side profile)
// battleStats -> applyMentalToBattleStats(result, actor)
// resolveSkill damage -> damage *= mentalDamageMultiplier(attacker)
// hit/miss/parry/heavy-hit/low-hp -> combatMentalEvent
// end of resolveQueue turn -> settleActorMental(P/E)
