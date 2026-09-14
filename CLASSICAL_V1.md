# TestGE V1 — Classical-first Game Engine

## สถานะ

TestGE V1 ปิดสาย Learned Physics ออกจาก runtime แล้วอย่างเป็นทางการ

Runtime ที่รองรับ:
- Canonical World State
- Exact Classical
- Approx Classical (Spatial Broad Phase)
- Transition Proposal
- Verifier / Authority Gate
- Exact Fallback
- World Commit
- Deterministic state hash / replay-oriented validation
- Classical benchmark (p50 / p95 / p99 + event mismatch)

## หลักการ

1. Exact Classical เป็น Authority, Ground Truth และ Fallback
2. Approx Classical เป็น optimization path เท่านั้น
3. C3/Critical ต้องใช้ Exact Classical
4. Compute Skill ห้ามแก้ World State โดยตรง ต้องคืน Transition Proposal
5. World Commit เป็นจุดเดียวที่เขียนสถานะโลก
6. Learned/GNN ไม่มีสิทธิ์อยู่ใน Runtime V1
7. งานวิจัย Learned เปิดกลับมาได้เฉพาะเมื่อมี subsystem ใหม่ที่ Classical มีต้นทุนสูงจริงและมี benchmark พิสูจน์ประโยชน์

## Runtime Flow

```text
Input / Actions
      ↓
Canonical World State
      ↓
Classical Compute Skill
  ├─ Exact Classical
  └─ Approx Classical
      ↓
Transition Proposal
      ↓
Verifier / Authority Gate
      ↓
 PASS ───────── FAIL
  ↓              ↓
World Commit   Exact Fallback
  ↓              ↓
  └──────→ Next World State
```

## Research Archive

งานต่อไปนี้เก็บไว้เป็นหลักฐานและไม่ถูกเรียกจาก Runtime V1:
- Full GNN solver
- Residual GNN
- Local Residual Contact Solver
- Learned Relaxation / Iteration Scheduler

ผลร่วมของงานเหล่านี้คือยังไม่สามารถสร้าง competence region ที่ผ่าน quality + runtime gate พร้อมกันได้ในโจทย์ปัจจุบัน

## เป้าหมายต่อจากนี้

พัฒนา Classical V1 ให้เป็น engine ใช้งานจริง:
1. fixed-step world loop
2. entity lifecycle (spawn/despawn)
3. event bus
4. spatial index ที่ reusable
5. collision layers / masks
6. deterministic replay log
7. snapshot / restore
8. performance budgets และ regression tests
9. public engine API
10. integration demo เกมขนาดเล็ก

Learned Physics จะไม่เป็น dependency ของ roadmap นี้
