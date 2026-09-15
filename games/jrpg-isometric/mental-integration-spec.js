// P1.2 direct-integration contract. This file is deliberately pure and does not wrap battle-v5.
import {createMental,mentalModifiers,applyMentalEvent,settleMentalTurn,mentalLabel} from './mental-system-v1.js';
export function attachMental(actor,seed){actor.mental=createMental(seed);return actor;}
export function applyMentalToBattleStats(stats,actor){const m=mentalModifiers(actor.mental);return{...stats,accuracy:Math.max(.01,Math.min(.99,stats.accuracy+m.accuracy)),reaction:stats.reaction*(1+m.reaction),move:stats.move*m.move,guardEff:Math.max(.01,Math.min(.95,stats.guardEff*m.guard)),mentalDamage:m.damage,mentalRisk:m.risk,mentalLabel:mentalLabel(actor.mental)};}
export function mentalEvent(actor,event){actor.mental=applyMentalEvent(actor.mental,event);return actor.mental;}
export function mentalTurn(actor){actor.mental=settleMentalTurn(actor.mental);return actor.mental;}
export const DEFAULT_MENTAL={player:{focus:66,morale:74,stress:18,confidence:62},enemy:{focus:72,morale:68,stress:20,confidence:66}};
