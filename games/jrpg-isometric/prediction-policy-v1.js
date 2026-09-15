// R10.0 Prediction-aware policy. Pure bounded utility modifier; never mutates battle state.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const PREDICTION_WEIGHT={VANGUARD:.65,SUPPORT:.55,DUELIST:1,FLANKER:.8};
export function predictionUtility({actor,target,skill,prediction,role='VANGUARD'}={}){
 if(!prediction||!target||!skill)return{modifier:0,confidence:0,reason:'NO_PREDICTION'};
 const confidence=clamp((prediction.confidence||0)*(prediction.evidenceConfidence||0),0,1);
 if(confidence<.08)return{modifier:0,confidence,reason:'LOW_CONFIDENCE'};
 const top=String(prediction.topAction||'').toLowerCase(),key=String(skill.key||skill||'').toLowerCase();let raw=0,reason='NEUTRAL';
 if(/heavy|break|shadow/.test(top)){if(/quick|shadow/.test(key)){raw=7;reason='PUNISH_COMMITMENT'}else if(/heavy/.test(key)){raw=-5;reason='AVOID_TRADE'}}
 else if(/quick|bolt/.test(top)){if(/quick/.test(key)){raw=3;reason='TEMPO_MATCH'}else if(/heavy|break/.test(key)){raw=-3;reason='SLOW_VS_FAST'}}
 const roleWeight=PREDICTION_WEIGHT[role]??.65,modifier=clamp(raw*confidence*roleWeight,-6,6);
 return{modifier,confidence,reason,topAction:prediction.topAction,topProbability:prediction.confidence};
}
