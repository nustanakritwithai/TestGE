// P1.1 Mental System — pure deterministic combat-domain module. No renderer hooks.
export const MENTAL_LIMITS={min:0,max:100};
export function createMental(seed={}){return{focus:seed.focus??65,morale:seed.morale??70,stress:seed.stress??20,confidence:seed.confidence??60};}
const c=v=>Math.max(0,Math.min(100,v));
export function mentalModifiers(m){return{accuracy:(m.focus-50)*.0012,reaction:(m.focus-50)*.002+(m.confidence-50)*.001,risk:1+(m.stress-40)*.005,damage:1+(m.confidence-50)*.0015,move:1-Math.max(0,m.stress-60)*.003,guard:1+(m.morale-50)*.0015};}
export function applyMentalEvent(m,event){const n={...m};switch(event){case'HIT':n.confidence+=4;n.stress-=2;break;case'HEAVY_HIT':n.morale-=5;n.confidence-=5;n.stress+=10;break;case'MISS':n.focus-=2;n.stress+=2;break;case'PARRY':n.focus+=4;n.confidence+=6;n.stress-=3;break;case'PARRIED':n.confidence-=4;n.stress+=5;break;case'LOW_HP':n.morale-=3;n.stress+=5;break;case'GUARD_SUCCESS':n.morale+=2;n.focus+=2;break;case'RECOVER':n.focus+=5;n.stress-=7;break;}for(const k of Object.keys(n))n[k]=c(n[k]);return n;}
export function settleMentalTurn(m){return{focus:c(m.focus+(m.stress<35?1:0)),morale:c(m.morale),stress:c(m.stress-1),confidence:c(m.confidence)};}
export function mentalLabel(m){if(m.stress>=75)return'PANICKED';if(m.focus>=80&&m.confidence>=65)return'IN_FLOW';if(m.morale<=30)return'SHAKEN';if(m.confidence>=80)return'BOLD';return'STEADY';}
