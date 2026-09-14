# TestGE — Decision V1

วันที่ตัดสิน: 2026-09-14

## สถานะสุดท้าย

**FINAL_DECISION = CLASSICAL_V1**

รอบนี้ใช้ GitHub Actions รัน `research/decisive.mjs` แบบ reproducible บน Node.js 22 หลังปรับ Learned Compute เป็น `learned-v2-spatial` แล้ว ไม่ได้อ้างผลจากค่าจำลอง

เกณฑ์ผ่าน:
- State Error <= 0.05
- Event mismatch <= 0.25
- Learned Compute ต้องเร็วกว่า Classical ที่ดีที่สุดอย่างน้อย 20% จึงถือว่าพบ competence region

การฝึก:
- 12,480 samples
- 120 episodes
- 30 epochs
- learning rate 0.01
- workloads ฝึกสลับ Simple / Dense / Extreme
- ใช้ spatial-hash message features
- event head เปลี่ยนเป็น hybrid geometric overlap จึงไม่เกิด event mismatch แบบ proximity heuristic เดิม

## ผล Decisive Benchmark v2

### Simple
- Exact Classical: p95 = 0.06313 ms, error = 0, event mismatch = 0
- Approx Classical (Spatial): p95 = 0.08176 ms, error = 0, event mismatch = 0
- GNN v2 Spatial: p95 = 0.09370 ms, error = 0.10382, event mismatch = 0
- Residual GNN v2 Spatial: p95 = 0.22077 ms, error = 0.00542, event mismatch = 0

ผู้ชนะ: **Exact Classical**

Residual ผ่านคุณภาพ แต่ช้ากว่า Classical ประมาณ 2.5 เท่า จึงไม่ผ่าน Gate

### Dense
- Exact Classical: p95 = 0.23668 ms, error = 0, event mismatch = 0
- Approx Classical (Spatial): p95 = 0.53165 ms, error = 0.03547, event mismatch = 0
- GNN v2 Spatial: p95 = 0.92974 ms, error = 0.20778, event mismatch = 0
- Residual GNN v2 Spatial: p95 = 1.71328 ms, error = 0.03919, event mismatch = 0

ผู้ชนะ: **Exact Classical**

Residual ผ่านคุณภาพ แต่ช้ากว่า Classical มากกว่า 7 เท่า จึงไม่ผ่าน Gate

### Extreme
- Exact Classical: p95 = 0.53622 ms, error = 0, event mismatch = 0
- Approx Classical (Spatial): p95 = 2.71371 ms, error = 0.30784, event mismatch = 0
- GNN v2 Spatial: p95 = 4.24831 ms, error = 0.43982, event mismatch = 0
- Residual GNN v2 Spatial: p95 = 6.67737 ms, error = 0.30766, event mismatch = 0

ผู้ชนะ: **Exact Classical**

ไม่มี Learned Skill ใดผ่าน quality gate ใน Extreme

## ข้อสรุป

การแก้ event prediction สำเร็จ: event mismatch ลดจากประมาณ 55–60% เหลือ 0% ใน benchmark นี้

แต่คอขวดหลักเปลี่ยนมาเป็น **state prediction + graph/message overhead** และเมื่อใช้ Classical baseline ที่แข็งแรงขึ้น Learned Compute ยังไม่สร้าง competence region ที่คุ้มจริง

ดังนั้น V1 ให้ล็อกเป็น:

- Exact Classical = Ground Truth / Authority / runtime หลัก
- Approx Classical = optimization/research path เฉพาะบริบทที่พิสูจน์ว่าคุ้มและคุณภาพผ่าน
- GNN / Residual GNN = Research Slot เท่านั้น
- ไม่สร้าง Adaptive Router / Capability Model / Agent Controller ใน V1

## ถ้าจะเปิด Learned Research รอบใหม่

ต้องเปลี่ยนโจทย์ระดับ Compute Skill ไม่ใช่เพิ่ม Control Plane เช่น:
- ใช้ model architecture ที่เหมาะกับ collision impulse แบบ discontinuous มากกว่า linear message model
- ลด graph construction และ JS object allocation อย่างจริงจัง เช่น typed arrays / packed SoA / WebGPU
- ฝึกเฉพาะ workload ที่ Classical scaling เริ่มเสียเปรียบจริง
- วัด end-to-end เทียบ optimized Classical baseline เดิม

จนกว่าจะมี workload ที่ Learned ชนะ Classical >=20% ภายใต้ quality gate เดียวกัน ให้ถือว่า **Classical V1 คือคำตอบของโครงการรอบนี้**
