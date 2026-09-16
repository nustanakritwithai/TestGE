// R11.3b validation accumulator. Fixed-size counters only; no growing history.
export function createShadowValidation(){return{decisions:0,changes:0,unsafe:0,updates:0,maxAbsDrift:0}}
export function observeShadow(v,shadow,state){v.decisions++;if(shadow?.wouldChange)v.changes++;if(shadow&&!shadow.safe)v.unsafe++;v.updates=Math.max(v.updates,state?.updates||0);for(const x of Object.values(state?.actions||{})){const d=Math.abs((x?.weight??1)-1);if(Number.isFinite(d))v.maxAbsDrift=Math.max(v.maxAbsDrift,d);else v.unsafe++}return v}
export function validationSummary(v){return{...v,changeRate:v.decisions?v.changes/v.decisions:0,safe:v.unsafe===0}}
