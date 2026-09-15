# R11 Adaptation Runtime Gate

R11 ห้ามเชื่อม `auto-battle-m1.js` จนกว่าจะผ่าน gate นี้

1. **Isolation** — lab ห้าม import live battle runtime และห้าม mutate actor/memory objects
2. **Finite** — weight/utility ทุกค่าต้อง finite
3. **Evidence gate** — samples < 3 หรือ confidence < .30 ห้ามปรับ
4. **Bounded** — weight อยู่ 0.85–1.15 และ step ต่อ evidence ไม่เกิน .025
5. **Decay** — preference ต้องค่อยกลับ 1.0 เมื่อไม่มี evidence ใหม่
6. **Direction** — repeated negative prediction error ต้องลด weight; positive ต้องเพิ่ม
7. **Determinism** — input samples เดิมต้องได้ weights/history เดิม
8. **Policy-only** — integration รอบหน้าแก้ได้เฉพาะ candidate utility; ห้ามแก้ play/timer/movement/resolve order
9. **Shadow mode first** — รอบแรกคำนวณ adaptation แต่ไม่ใช้เลือก action; compare chosen action baseline vs adapted candidate ranking
10. **Live enable** — เปิดใช้จริงหลัง shadow trace หลาย battle ไม่มี crash/stall และ battle convergence ไม่ถอย

Known-good live checkpoint: `ec8687a` (R10.1)
