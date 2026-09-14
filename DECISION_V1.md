# TestGE — Decision V1

วันที่ตัดสิน: 2026-09-14

## วิธีทดสอบ

ทดสอบ implementation ปัจจุบันของ Exact Classical, Approx Classical, GNN และ Residual GNN โดยจำลอง logic เดียวกับโค้ดใน `src/world.js`, `src/skills.js`, `src/learned.js` และ `src/benchmark.js` แล้วรัน 5 seeds × 60 repetitions ต่อ workload บน runtime Node.js แบบ local benchmark

เกณฑ์ผ่าน:
- State Error <= 0.05
- Event mismatch <= 0.25
- Learned Compute ต้องเร็วกว่า Classical ที่ดีที่สุดอย่างน้อย 20% จึงถือว่าพบ competence region

## ผล

### Simple
- Exact: p95 ≈ 0.0656 ms, error 0, event mismatch 0
- Approx: p95 ≈ 0.1117 ms, error ≈ 0.0491, event mismatch ≈ 0.0667
- GNN: p95 ≈ 0.0734 ms, error ≈ 0.0523, event mismatch ≈ 0.5967
- Residual GNN: p95 ≈ 0.3557 ms, error ≈ 0.0540, event mismatch ≈ 0.5967
- ผู้ชนะที่ผ่านเกณฑ์: Exact Classical

### Dense
- Exact: p95 ≈ 0.3962 ms, error 0, event mismatch 0
- Approx: p95 ≈ 0.4606 ms, error ≈ 0.2150, event mismatch ≈ 0.2051
- GNN: p95 ≈ 0.6494 ms, error ≈ 0.1960, event mismatch ≈ 0.5550
- Residual GNN: p95 ≈ 0.8636 ms, error ≈ 0.2021, event mismatch ≈ 0.5550
- ผู้ชนะที่ผ่านเกณฑ์: Exact Classical

### Extreme
- Exact: p95 ≈ 0.7420 ms, error 0, event mismatch 0
- Approx: p95 ≈ 1.2974 ms, error ≈ 0.5764, event mismatch ≈ 0.2493
- GNN: p95 ≈ 2.9587 ms, error ≈ 0.5026, event mismatch ≈ 0.5768
- Residual GNN: p95 ≈ 3.7933 ms, error ≈ 0.5334, event mismatch ≈ 0.5639
- ผู้ชนะที่ผ่านเกณฑ์: Exact Classical

## คำตัดสิน

**Learned Compute รุ่นปัจจุบันไม่ผ่าน Gate**

ไม่มี workload ใดที่ GNN หรือ Residual GNN ผ่านทั้งคุณภาพและต้นทุน และไม่มี competence region ที่ Learned Compute ชนะ Classical >=20%

ดังนั้นสถาปัตยกรรม V1 ให้ล็อกเป็น:

- Exact Classical = Ground Truth / Authority / runtime หลัก
- Approx Classical = research/optimization path เฉพาะจุดที่ผ่านคุณภาพ
- GNN / Residual GNN = Research Slot เท่านั้น ห้ามเป็น runtime default
- ไม่สร้าง Adaptive Router / Agent Controller ต่อใน V1

## สิ่งที่ทำต่อได้ถ้าจะวิจัย Learned Compute อีกครั้ง

ให้แก้เฉพาะ Learned Skill โดยเฉพาะ event prediction, graph-build overhead และ training target แล้ว rerun Gate เดิม ห้ามเพิ่ม control-plane complexity จนกว่า Learned Skill จะสร้าง competence region จริง
