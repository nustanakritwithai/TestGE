import './battle-v5.js';
import {EQUIPMENT,makeMental,mentalMods,createOpponentModel,observeOpponent,aiAwareness} from './stat-v3-addon.js';

// S8-S10 integration layer intentionally observes public battle UI/events rather than reading opponent internals.
const playerMental=makeMental({focus:65,morale:72,stress:18,confidence:64});
const enemyMental=makeMental({focus:74,morale:68,stress:16,confidence:66});
const model=createOpponentModel();
let lastPlayerState='',lastLog='',lastHP=null,lastMove=null;
const build=document.getElementById('buildInspector'),ai=document.getElementById('aiInspector');
function equipmentSummary(){const e=EQUIPMENT.knight,m=mentalMods(playerMental);return `${e.weapon.name} · ${e.armor.name} · ${e.accessory.name}\nFocus ${playerMental.focus} · Morale ${playerMental.morale} · Stress ${playerMental.stress} · Confidence ${playerMental.confidence}\nMental Mod: Accuracy ${(m.accuracy*100).toFixed(1)}% · Damage ×${m.damage.toFixed(2)} · Move ×${m.move.toFixed(2)}`;}
function parseHP(){const t=document.getElementById('pHP')?.textContent||'';const n=Number(t.split('/')[0]);return Number.isFinite(n)?n:null;}
function parseMove(){const t=document.getElementById('playerState')?.textContent||'';const m=t.match(/Move\s+([0-9.]+)/);return m?Number(m[1]):null;}
function observePublicBattle(){const state=document.getElementById('playerState')?.textContent||'',log=document.getElementById('log')?.firstElementChild?.textContent||'',hp=parseHP(),move=parseMove();if(lastMove!==null&&move!==null&&move<lastMove-.35)observeOpponent(model,{type:'move',distance:lastMove-move});if(log&&log!==lastLog){if(/ป้องกัน|guard/i.test(log))observeOpponent(model,{type:'guard'});if(/ใช้ ฟัน|ใช้ คมดาบ/i.test(log))observeOpponent(model,{type:'attack'});if(/INJURY:leg/i.test(log))observeOpponent(model,{type:'legInjury'});}if(lastHP!==null&&hp!==null&&hp<lastHP)observeOpponent(model,{type:'damageTaken',amount:lastHP-hp});lastHP=hp;lastMove=move;lastLog=log;lastPlayerState=state;}
function renderInspector(){observePublicBattle();const hp=parseHP(),hpMax=Number((document.getElementById('pHP')?.textContent||'/1').split('/')[1])||1,stText=document.getElementById('pST')?.textContent||'1/1',st=Number(stText.split('/')[0])||1,stMax=Number(stText.split('/')[1])||1;const ranked=aiAwareness(model,{selfHpRatio:1,selfStaminaRatio:1,enemyInjuredLeg:/LEG-[1-3]/.test(lastPlayerState)});if(build)build.textContent=equipmentSummary();if(ai)ai.textContent=`Observation confidence ${(model.confidence*100).toFixed(0)}%\nEstimated: AGI ${(model.estimates.agility*100).toFixed(0)} · DEF ${(model.estimates.defense*100).toFixed(0)} · Guard ${(model.estimates.guardHabit*100).toFixed(0)} · Aggression ${(model.estimates.aggression*100).toFixed(0)}\nPlayer HP ${(hp/hpMax*100||0).toFixed(0)}% · ST ${(st/stMax*100||0).toFixed(0)}%\nAI Intent ranking:\n${ranked.slice(0,3).map(([k,v],i)=>`${i+1}. ${k.toUpperCase()} ${v.toFixed(0)}`).join('\n')}\nAI ใช้ observation model ไม่อ่าน Primary Stats ผู้เล่นโดยตรง`;}
new MutationObserver(renderInspector).observe(document.body,{subtree:true,childList:true,characterData:true});
renderInspector();
