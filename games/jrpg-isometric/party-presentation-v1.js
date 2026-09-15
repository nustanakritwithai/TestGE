// 2v2 Presentation/Control v1 — no renderer monkey patches.
import {PARTY_2V2} from './party-2v2-spec.js';
export const PARTY_VISUALS={p1:{color:0x285c91,marker:0x61c9ff},p2:{color:0x6b4ca0,marker:0xbca4ff},e1:{color:0x8a2b20,marker:0xff7168},e2:{color:0x55202d,marker:0xff7cab}};
export function formation(){return[...PARTY_2V2.player.map(x=>({...x,team:'player'})),...PARTY_2V2.enemy.map(x=>({...x,team:'enemy'}))];}
export function createSelectionState(){return{activeActorId:'p1',targetId:'e1',committed:new Set()};}
export function selectActor(state,id,party){const a=party.members.find(x=>x.id===id&&x.hp>0);if(a&&!state.committed.has(id))state.activeActorId=id;return state;}
export function selectTarget(state,id,enemyParty){const t=enemyParty.members.find(x=>x.id===id&&x.hp>0);if(t)state.targetId=id;return state;}
export function commitActor(state,id){state.committed.add(id);return state;}
export function nextUncommitted(state,party){return party.members.find(a=>a.hp>0&&!state.committed.has(a.id))||null;}
export function resetRoundSelection(state,party,enemyParty){state.committed.clear();state.activeActorId=party.members.find(a=>a.hp>0)?.id||null;state.targetId=enemyParty.members.find(a=>a.hp>0)?.id||null;return state;}
export const CONTROL_FLOW='แตะสมาชิกฝ่ายเรา → Move → Action → แตะศัตรู → Commit → สมาชิกถัดไป';
