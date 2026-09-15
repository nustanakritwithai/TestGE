// 2v2 Vertical Slice contract.
export const PARTY_2V2={
 player:[{id:'p1',name:'อัศวินแห่งรุ่งอรุณ',role:'VANGUARD',start:{x:-5.3,z:-1.35}},{id:'p2',name:'นักเวทแห่งแสง',role:'RANGED',start:{x:-5.7,z:1.55}}],
 enemy:[{id:'e1',name:'ซามูไรเงา',role:'DUELIST',start:{x:5.3,z:1.25}},{id:'e2',name:'นักฆ่ารัตติกาล',role:'FLANKER',start:{x:5.7,z:-1.55}}]
};
export const TARGET_RULES={singleEnemy:'living enemy only',singleAlly:'living ally only',self:'actor',retargetOnKO:true};
export const VICTORY_RULE='A party loses when every member HP <= 0';
export const TURN_FLOW=['PLAYER_ACTOR','MOVE','CHOOSE_ACTION','CHOOSE_TARGET','COMMIT','NEXT_PLAYER_ACTOR','ENEMY_PLAN','INITIATIVE_RESOLVE','STATUS_TICK','NEXT_ROUND'];
