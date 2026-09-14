# TestGE — Learned Relaxation / Iteration Scheduler Decision

วันที่ทดสอบ: 2026-09-14

## คำถามวิจัย

หลังจาก Local Residual Contact Solver เร็วขึ้นแต่ accuracy ไม่ผ่าน จึงเปลี่ยนแนวคิดจาก "ทำนาย final contact state" เป็น "ให้ learned model ช่วย classical iterative solver" โดยเรียนจำนวน iteration ที่ควรใช้ในแต่ละ contact problem

แนวคิดที่ทดสอบ:

- Exact Classical = iterative contact solver 20 iterations
- Oracle Schedule = จำนวน iteration ต่ำสุดที่ยังอยู่ใน quality budget
- Learned Schedule = model ทำนายจำนวน iteration จากโครงสร้าง contact, velocity, density, material และ topology
- Event/contact authority ยังเป็น Classical

## Coverage

ทดสอบ:

1. IID
2. Scale 512/1024 contacts
3. High velocity OOD
4. Dense OOD
5. Material OOD
6. Hub-topology OOD
7. p50 / p95 / p99
8. Determinism
9. Event mismatch / critical miss
10. 20-step rollout
11. Quality sensitivity ที่ RMSE budget 0.08 / 0.16 / 0.32 / 0.64
12. Oracle headroom ก่อนตัดสินว่าการเรียน schedule มีเหตุผลหรือไม่

## เกณฑ์หลัก

- one-step max RMSE <= 0.08
- p95 runtime gain >= 20%
- event mismatch = 0
- critical miss = 0
- rollout max RMSE <= 0.16

## ผลสำคัญ

### 1. ที่ quality budget 0.08 ไม่มี iteration headroom

ทุก evaluation case ต้องใช้ครบ 20 iterations เพื่ออยู่ใน RMSE <= 0.08

- mean oracle iterations = 20
- min = 20
- max = 20
- iteration headroom = 0%

ดังนั้นแม้มี Perfect Oracle ก็ไม่มี iteration ให้ตัดออกอย่างปลอดภัย

### 2. Learned scheduler จึงเรียนคำตอบเป็น 20 iterations

Diagnostics:

- mean absolute iteration error = 0
- p95 iteration error = 0
- under-prediction rate = 0 ใน held-out diagnostic set

แต่สิ่งนี้ไม่ได้สร้าง speedup เพราะคำตอบที่ถูกต้องคือใช้ full solve

### 3. Runtime ไม่ชนะ 20%

ทุก suite quality ผ่าน one-step เพราะ scheduler ใช้ 20 iterations แต่ runtime gain ไม่ถึง 20%

ตัวอย่าง:

- IID: gain ประมาณ -3%
- Scale 512/1024: gain ประมาณ -1%
- High velocity OOD: gain ประมาณ -2%
- Dense OOD: gain ประมาณ +15% แต่ยังต่ำกว่า gate 20% และเกิดจาก runtime noise เพราะ iteration count เท่ากัน
- Material OOD: gain ใกล้ 0%
- Hub topology: gain ติดลบเล็กน้อย

สรุป: ไม่มี competence region

### 4. Quality sensitivity

ถ้าผ่อน quality budget:

- RMSE 0.08 -> mean oracle 20.00 iterations, headroom 0%
- RMSE 0.16 -> mean oracle 19.12, headroom ~4.4%
- RMSE 0.32 -> mean oracle 18.10, headroom ~9.5%
- RMSE 0.64 -> mean oracle 15.85, headroom ~20.7%

ดังนั้น iteration scheduling จะเริ่มมี headroom >=20% ก็ต่อเมื่อยอม error สูงประมาณ 0.64 ซึ่งสูงเกินเป้าหมาย physics fidelity ของเรา

### 5. Rollout เปิดเผย distribution shift

แม้ scheduler จะทำนาย 20 iterations ได้ถูกต้องบน one-step holdout แต่เมื่อรันต่อเนื่อง 20 steps state distribution เปลี่ยน และ scheduler เริ่มเลือก iteration ไม่เหมาะสมในบาง state ทำให้ error สะสมสูงมาก

ดังนั้น static one-step scheduler ไม่เพียงพอสำหรับ runtime จริง

### 6. Safety boundary ยังถูกต้อง

- event mismatch = 0
- critical miss = 0
- deterministic = true ใน one-step suites

เพราะ event/contact authority ยังอยู่ฝั่ง Classical

## คำตัดสิน

**KEEP_CLASSICAL_V1**

ไม่ควรลงทุนต่อกับ "เรียนจำนวน iteration" บน solver formulation ปัจจุบัน เพราะ Perfect Oracle เองไม่มี headroom ภายใต้ quality budget ที่เราต้องการ

นี่เป็น stop condition ที่สำคัญ: ปัญหาไม่ใช่ model ยังฉลาดไม่พอ แต่ solver ปัจจุบันต้องการเกือบทุก iteration จริง ๆ เพื่อให้ได้ fidelity ตามเกณฑ์

## สิ่งที่ควรวิจัยต่อ

อย่าทำ scheduler ฉลาดขึ้นบน solver เดิม

ให้เปลี่ยนโจทย์เป็นหนึ่งในสองแนวทางที่มีเหตุผลกว่า:

1. Learned preconditioner / learned inverse approximation เพื่อทำให้แต่ละ iteration มีประสิทธิภาพมากขึ้น
2. Multi-scale / hierarchical message propagation สำหรับ coupled contact เพื่อส่งข้อมูลระยะไกลในจำนวน pass น้อยลง

ลำดับถัดไปที่แนะนำ:

Classical operator / constraint system
→ learned preconditioner
→ classical iterative solve
→ exact residual / verifier
→ fallback ถ้า convergence ไม่ถึงเกณฑ์

ไฟล์ benchmark: `research/learned-relaxation.mjs`
Workflow: `.github/workflows/learned-relaxation.yml`
Validated GitHub Actions run: `34835301595`
Commit benchmark fix: `8cd8e8a1`
