const ACTIONS = [
  {id:'QUICK_ATTACK',label:'โจมตีเร็ว',cost:12,damage:70,posture:8,tempo:7,commit:45,kind:'attack'},
  {id:'HEAVY_ATTACK',label:'โจมตีหนัก',cost:24,damage:145,posture:20,tempo:11,commit:90,kind:'attack'},
  {id:'GUARD_BREAK',label:'ทำลายการ์ด',cost:18,damage:35,posture:34,tempo:14,commit:70,kind:'attack'},
  {id:'BLOCK',label:'บล็อก',cost:8,damage:0,posture:0,tempo:2,commit:35,kind:'defense'},
  {id:'DODGE',label:'หลบ',cost:14,damage:0,posture:0,tempo:5,commit:55,kind:'defense'},
  {id:'PARRY',label:'ปัดป้อง',cost:16,damage:0,posture:0,tempo:9,commit:75,kind:'defense'},
  {id:'FEINT',label:'หลอกโจมตี',cost:9,damage:0,posture:4,tempo:10,commit:30,kind:'setup'},
  {id:'RECOVER',label:'ฟื้นตัว',cost:-24,damage:0,posture:-12,tempo:-4,commit:20,kind:'recover'}
];

const ACTION_NAMES = Object.fromEntries(ACTIONS.map(a=>[a.id,a.label]));
const INTENT_NAMES = {
  TEST:'ทดสอบคู่ต่อสู้', DAMAGE:'ทำความเสียหาย', BREAK:'ทำลายการป้องกัน', BAIT:'ล่อให้ตอบสนอง',
  CONTROL:'ควบคุมจังหวะ', RECOVER:'ฟื้นทรัพยากร', FINISH:'ปิดฉาก', SURVIVE:'เอาตัวรอด'
};

const $ = id => document.getElementById(id);
const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));
const fmt = n => Math.round(n);

let seedBase = Number(new URLSearchParams(location.search).get('seed')) || 424242;
let rngState = seedBase >>> 0;
function rand(){ rngState = (rngState + 0x6D2B79F5) >>> 0; let t=rngState; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }

function fighter(name, side, hp, atk, def, spd){
  return {
    name,side,maxHP:hp,hp,stamina:100,posture:100,atk,def,spd,tempo:0,confidence:60,
    intent:'TEST',commitment:0,infoCertainty:65,causal:0,
    memory:{total:0,counts:Object.fromEntries(ACTIONS.map(a=>[a.id,1])),lowStamina:Object.fromEntries(ACTIONS.map(a=>[a.id,1])),lowPosture:Object.fromEntries(ACTIONS.map(a=>[a.id,1]))},
    lastAction:null,lastPrediction:null,lastCandidates:[],reason:'',planStability:100
  };
}

let A,B,turn=0,running=true,timer=null,speed=1,finished=false,history=[];

function reset(){
  rngState = seedBase >>> 0; turn=0; finished=false; history=[];
  A=fighter('อัศวิน','a',1000,108,112,92);
  B=fighter('ซามูไร','b',900,116,96,108);
  log(`Seed ${seedBase} — เริ่มการดวลแบบกำหนดผลซ้ำได้`);
  render(); schedule();
}

function probabilityModel(self, enemy){
  const m=self.memory; const src = enemy.stamina<35 ? m.lowStamina : enemy.posture<35 ? m.lowPosture : m.counts;
  const total=Object.values(src).reduce((a,b)=>a+b,0);
  const p={}; for(const a of ACTIONS) p[a.id]=src[a.id]/total;
  const top=Object.entries(p).sort((x,y)=>y[1]-x[1]).slice(0,3);
  return {p,top,confidence:clamp(52 + m.total*2.5,52,91)};
}

function chooseIntent(self,enemy,pred){
  if(self.hp/self.maxHP<0.22) return 'SURVIVE';
  if(self.stamina<28) return 'RECOVER';
  if(enemy.hp/enemy.maxHP<0.22) return 'FINISH';
  if(enemy.posture<32) return 'BREAK';
  const defensive=pred.p.BLOCK+pred.p.PARRY+pred.p.DODGE;
  if(defensive>0.52) return 'BAIT';
  if(self.tempo<-15) return 'CONTROL';
  return turn<4?'TEST':'DAMAGE';
}

function estimateUtility(action,self,enemy,pred){
  let u=0;
  const staminaCost=Math.max(0,action.cost);
  const hitBase=0.78 + (self.spd-enemy.spd)*0.0015;
  const pBlock=pred.p.BLOCK,pDodge=pred.p.DODGE,pParry=pred.p.PARRY,pRecover=pred.p.RECOVER;
  let expectedHit=hitBase;
  if(action.kind==='attack') expectedHit -= pBlock*0.18 + pDodge*0.34 + pParry*0.26;
  expectedHit=clamp(expectedHit,0.08,0.95);

  const damage = action.damage * expectedHit * (self.atk/(self.atk+enemy.def*0.72));
  const posture = action.posture * (1 + pBlock*0.55);
  const killChance = enemy.hp<action.damage*1.25 ? 34 : 0;
  const causal = action.id==='GUARD_BREAK' ? (100-enemy.posture)*0.34 + pBlock*30 : action.id==='FEINT' ? (pBlock+pParry)*42 : action.id==='QUICK_ATTACK' ? pRecover*22 : 0;
  const infoGain = action.id==='FEINT' ? 18 : turn<5 ? 7 : 2;
  const resource = action.id==='RECOVER' ? (100-self.stamina)*0.72 + (100-self.posture)*0.24 : 0;
  const defenseNeed = 1-self.hp/self.maxHP;
  const danger = pred.p.HEAVY_ATTACK*28 + pred.p.GUARD_BREAK*18 + pred.p.QUICK_ATTACK*12;
  const defense = action.kind==='defense' ? danger*(0.7+defenseNeed) : 0;
  const predictability = self.lastAction===action.id ? 12 : 0;
  const staminaRisk = self.stamina < staminaCost+8 ? 55 : staminaCost*0.35;

  u += damage*0.58 + posture*0.72 + action.tempo*1.15 + causal + infoGain + resource + defense + killChance;
  u -= staminaRisk + predictability;

  if(self.intent==='RECOVER' && action.id==='RECOVER') u+=55;
  if(self.intent==='FINISH' && action.id==='HEAVY_ATTACK') u+=28;
  if(self.intent==='BREAK' && action.id==='GUARD_BREAK') u+=34;
  if(self.intent==='BAIT' && action.id==='FEINT') u+=38;
  if(self.intent==='SURVIVE' && action.kind==='defense') u+=32;
  if(action.id==='HEAVY_ATTACK' && pred.p.PARRY>0.28) u-=32;
  if(action.id==='PARRY' && pred.p.HEAVY_ATTACK+pred.p.QUICK_ATTACK<0.28) u-=18;
  if(action.id==='RECOVER' && self.stamina>82) u-=45;

  return {score:u,causal,damage,posture,infoGain};
}

function decide(self,enemy){
  const pred=probabilityModel(self,enemy);
  self.lastPrediction=pred;
  self.infoCertainty=fmt(pred.confidence);
  self.intent=chooseIntent(self,enemy,pred);
  const candidates=ACTIONS.map(a=>({action:a,...estimateUtility(a,self,enemy,pred)})).sort((x,y)=>y.score-x.score);
  self.lastCandidates=candidates;
  const pick=candidates[0];
  self.commitment=pick.action.commit;
  self.causal=fmt(pick.causal);
  const top=pred.top[0];
  self.reason=`เจตนา: ${INTENT_NAMES[self.intent]}; คาดว่าอีกฝ่ายจะใช้ ${ACTION_NAMES[top[0]]} ${fmt(top[1]*100)}%; ${pick.causal>12?'การกระทำนี้สร้างความได้เปรียบให้เทิร์นถัดไป':'การกระทำนี้มีคะแนน Utility ปัจจุบันดีที่สุด'}`;
  return pick.action;
}

function hitChance(attacker,defender,act,react){
  let p=0.82+(attacker.spd-defender.spd)*0.0015;
  if(react.id==='DODGE') p-= act.id==='HEAVY_ATTACK'?0.48:0.32;
  if(react.id==='BLOCK') p-=0.08;
  if(react.id==='PARRY') p-= act.id==='HEAVY_ATTACK'?0.20:0.34;
  if(attacker.stamina<15) p-=0.12;
  return clamp(p,0.05,0.96);
}

function applyRecover(f){ f.stamina=clamp(f.stamina+24,0,100); f.posture=clamp(f.posture+12,0,100); f.tempo-=4; }
function spend(f,a){ if(a.id!=='RECOVER') f.stamina=clamp(f.stamina-a.cost,0,100); }

function resolveOne(attacker,defender,act,react){
  if(act.id==='RECOVER'){ applyRecover(attacker); return `${attacker.name} ฟื้นพลังงานและสมดุลร่างกาย`; }
  if(act.kind==='defense'){ attacker.posture=clamp(attacker.posture+5,0,100); attacker.tempo+=1; return `${attacker.name} ตั้งท่า ${act.label}`; }
  if(act.id==='FEINT'){
    attacker.tempo+=10; attacker.causal=clamp(attacker.causal+12,0,100);
    if(['PARRY','BLOCK','DODGE'].includes(react.id)){ defender.stamina=clamp(defender.stamina-6,0,100); defender.tempo-=7; attacker.tempo+=7; return `${attacker.name} หลอกสำเร็จ ทำให้ ${defender.name} ตอบสนองด้วย ${react.label}`; }
    return `${attacker.name} ใช้การหลอกเพื่อทดสอบปฏิกิริยา`;
  }

  if(react.id==='PARRY' && rand() < (act.id==='HEAVY_ATTACK'?0.48:0.62)){
    attacker.posture=clamp(attacker.posture-18,0,100); attacker.tempo-=12; defender.tempo+=14;
    return `${defender.name} ปัดป้อง ${act.label} ของ ${attacker.name} สำเร็จ`;
  }

  const landed=rand()<hitChance(attacker,defender,act,react);
  if(!landed){ attacker.tempo-=5; defender.tempo+=6; return `${defender.name} หลบ ${act.label} ของ ${attacker.name} ได้`;
  }

  let dmg=act.damage*(attacker.atk/(attacker.atk+defender.def*0.72));
  let po=act.posture;
  if(react.id==='BLOCK'){ dmg*=0.34; po*=1.45; defender.stamina=clamp(defender.stamina-7,0,100); }
  if(react.id==='DODGE'){ dmg*=0.72; }
  if(act.id==='GUARD_BREAK' && react.id==='BLOCK'){ po*=1.8; attacker.causal=clamp(attacker.causal+22,0,100); }
  if(defender.posture<=0) dmg*=1.25;
  defender.hp=clamp(defender.hp-dmg,0,defender.maxHP);
  defender.posture=clamp(defender.posture-po,0,100);
  attacker.tempo+=act.tempo; defender.tempo-=Math.max(2,act.tempo*0.55);
  if(defender.posture===0){ defender.tempo-=12; attacker.causal=clamp(attacker.causal+28,0,100); }
  return `${attacker.name} ใช้ ${act.label} โดน ${fmt(dmg)} ดาเมจ${defender.posture===0?' — สมดุลแตก!':''}`;
}

function updateMemory(observer,enemy,enemyAction){
  const m=observer.memory; m.total++; m.counts[enemyAction.id]++;
  if(enemy.stamina<35) m.lowStamina[enemyAction.id]++;
  if(enemy.posture<35) m.lowPosture[enemyAction.id]++;
  observer.confidence=clamp(55+m.total*2,55,90);
}

function step(){
  if(finished) return;
  turn++;
  const aAct=decide(A,B), bAct=decide(B,A);
  spend(A,aAct); spend(B,bAct);
  const first=A.spd>=B.spd?[A,B,aAct,bAct]:[B,A,bAct,aAct];
  const second=A.spd>=B.spd?[B,A,bAct,aAct]:[A,B,aAct,bAct];
  const l1=resolveOne(...first);
  let l2=''; if(second[0].hp>0 && second[1].hp>0) l2=resolveOne(...second);
  updateMemory(A,B,bAct); updateMemory(B,A,aAct);
  A.lastAction=aAct.id; B.lastAction=bAct.id;
  A.stamina=clamp(A.stamina+4,0,100); B.stamina=clamp(B.stamina+4,0,100);
  A.posture=clamp(A.posture+2,0,100); B.posture=clamp(B.posture+2,0,100);
  const tx={turn,a:aAct.id,b:bAct.id,aHP:fmt(A.hp),bHP:fmt(B.hp),rng:rngState}; history.push(tx);
  log(`เทิร์น ${turn} | ${A.name}: ${aAct.label} ปะทะ ${B.name}: ${bAct.label} | ${l1}${l2?` · ${l2}`:''}`);
  if(A.hp<=0||B.hp<=0||turn>=120){
    finished=true; running=false;
    const winner=A.hp===B.hp?'เสมอ':A.hp>B.hp?A.name:B.name;
    $('result').textContent=`ผู้ชนะ: ${winner} — ${turn} เทิร์น — Seed ${seedBase}`;
    log(`บันทึกผลสุดท้าย | ผู้ชนะ=${winner} | replay-hash=${history.map(x=>`${x.a[0]}${x.b[0]}${x.aHP}${x.bHP}`).join('-')}`);
  }
  render();
}

function predictionText(f){
  if(!f.lastPrediction) return 'กำลังเก็บข้อมูลพฤติกรรมคู่ต่อสู้…';
  return f.lastPrediction.top.map(([id,p])=>`${ACTION_NAMES[id]} ${fmt(p*100)}%`).join(' · ')+` | ความแน่นอน ${f.infoCertainty}%`;
}

function candidatesHTML(f){
  if(!f.lastCandidates.length) return '<div class="muted">รอการตัดสินใจครั้งแรก…</div>';
  return f.lastCandidates.slice(0,5).map((c,i)=>`<div class="candidate ${i===0?'chosen':''}"><span>${i===0?'▶ ':''}${c.action.label}</span><b>${fmt(c.score)}</b></div>`).join('')+`<div class="muted" style="margin-top:7px">${f.reason}</div>`;
}

function setBar(id,value,max=100){ $(id).style.width=`${clamp(value/max*100,0,100)}%`; }
function renderF(f){
  $(f.side+'HP').textContent=fmt(f.hp); $(f.side+'ST').textContent=fmt(f.stamina); $(f.side+'PO').textContent=fmt(f.posture);
  setBar(f.side+'HPBar',f.hp,f.maxHP); setBar(f.side+'STBar',f.stamina); setBar(f.side+'POBar',f.posture);
  $(f.side+'Tempo').textContent=fmt(f.tempo); $(f.side+'Conf').textContent=fmt(f.confidence); $(f.side+'Intent').textContent=INTENT_NAMES[f.intent] || f.intent;
  $(f.side+'Predict').textContent=predictionText(f); $(f.side+'Candidates').innerHTML=candidatesHTML(f);
}
function render(){
  renderF(A); renderF(B); $('turn').textContent=`เทิร์น ${turn}`;
  const focus=A.lastCandidates[0]?.score>=B.lastCandidates[0]?.score?A:B;
  $('sigIntent').textContent=INTENT_NAMES[focus.intent] || focus.intent; $('sigCommit').textContent=`${focus.commitment}%`; $('sigInfo').textContent=`${focus.infoCertainty}%`; $('sigTempo').textContent=fmt(A.tempo-B.tempo); $('sigCausal').textContent=fmt(focus.causal);
  $('phase').textContent=finished?'การดวลจบแล้ว — ผลลัพธ์ทำซ้ำได้ด้วย Seed เดิม':'สังเกต → คาดการณ์ → วางแผน → ตัดสินผล → เรียนรู้';
  $('pause').textContent=running?'⏸ หยุด':'▶ เล่นต่อ'; $('speed').textContent=`▶ ${speed}×`;
}
function log(text){ const e=document.createElement('div'); e.className='entry'; e.textContent=text; $('log').prepend(e); }

function schedule(){ clearInterval(timer); timer=setInterval(()=>{ if(running&&!finished) step(); },1000/speed); }
$('pause').addEventListener('click',()=>{running=!running;render();});
$('step').addEventListener('click',()=>{running=false;step();render();});
$('speed').addEventListener('click',()=>{speed=speed===1?2:speed===2?4:1;schedule();render();});
$('reset').addEventListener('click',()=>{running=true;$('log').innerHTML='';$('result').textContent='';reset();});

reset();