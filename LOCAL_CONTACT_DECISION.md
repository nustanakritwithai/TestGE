# TestGE — Local Residual Contact Solver Decision

วันที่ทดสอบ: 2026-09-14

## เป้าหมาย

ทดสอบแนวคิดใหม่หลังจากผลรอบก่อนชี้ว่า GNN ไม่ควรแทน physics ทั้งโลก แต่ควรทำหน้าที่เป็น learned accelerator/corrector สำหรับ interaction ที่แพง โดยยังให้ geometry / contact graph / critical authority เป็น Classical

## สถาปัตยกรรมที่ทดสอบ

- Classical contact graph เป็นข้อมูลอ้างอิงร่วม
- Exact solver = iterative contact solve 20 รอบ
- Approx solver = iterative contact solve 2 รอบ
- Residual contact corrector = Approx 2 รอบ + learned residual correction
- Event/critical contact set คงเป็น Classical จึงไม่ให้ learned model ตัดสิน event authority

Training:
- 6,638 samples
- 90 training cases
- 28 epochs
- เรียน residual velocity correction จาก Exact − Approx

Gate:
- mean velocity RMSE <= 0.08
- max RMSE <= 0.16
- p95 runtime ต้องเร็วกว่า Exact >= 20%
- event mismatch = 0
- critical miss = 0
- deterministic = true

## Coverage ที่ทดสอบ

1. IID: 32 / 64 / 128 / 256 contacts
2. Scale: 512 contacts
3. High velocity OOD
4. Dense-contact OOD
5. Material OOD (restitution/friction สูงกว่าชุดฝึก)
6. Scaling curve 32 → 512 contacts
7. p50 / p95 / p99 latency
8. Mean / worst-case state error
9. Event mismatch / critical miss
10. Determinism
11. Heap-memory smoke test

## ผลสำคัญ

### IID
- Exact p95: 0.108 ms
- Residual p95: 0.041 ms
- Speed gain: +61.9%
- Residual mean RMSE: 1.245
- max RMSE: 1.475
- Speed PASS / Quality FAIL

### 512 contacts
- Exact p95: 0.231 ms
- Residual p95: 0.099 ms
- Speed gain: +57.3%
- Residual mean RMSE: 1.301
- max RMSE: 1.373
- Speed PASS / Quality FAIL

### High velocity OOD
- Exact p95: 0.127 ms
- Residual p95: 0.041 ms
- Speed gain: +67.9%
- mean RMSE: 1.645
- Quality FAIL

### Dense OOD
- Exact p95: 0.225 ms
- Residual p95: 0.278 ms
- Speed gain: -23.7%
- mean RMSE: 1.364
- ทั้ง Speed และ Quality FAIL

### Material OOD
- Exact p95: 0.115 ms
- Residual p95: 0.098 ms
- Speed gain: +15.0%
- mean RMSE: 1.291
- ไม่ถึง speed gate และ quality ไม่ผ่าน

### Scaling 32 → 512 contacts
Residual เร็วกว่า Exact ราว 57–67% ในหลาย contact counts แต่ RMSE อยู่ราว 1.23–1.53 จึงไม่มีจุดใดผ่าน quality gate

## Safety / stability

- event mismatch = 0 ทุก suite เพราะ event/contact authority ยังอยู่ฝั่ง Classical
- critical miss = 0 ภายใน benchmark นี้
- deterministic = true ทุก suite
- memory smoke test ไม่พบสัญญาณการเติบโตแบบชัดเจน (heap delta ติดลบหลัง GC จึงใช้เป็นเพียง smoke check ไม่ใช่ peak-memory proof)

## คำตัดสิน

**KEEP_CLASSICAL_V1**

ยังไม่พบ competence region ของ Local Residual Contact Solver ที่ผ่านทั้งคุณภาพและความเร็วพร้อมกัน

ผลรอบนี้สำคัญเพราะแสดงว่าแนวคิด local accelerator แก้ปัญหา runtime ได้จริงบางส่วน: residual path เร็วกว่า Exact ได้มากกว่า 50% หลายกรณี แต่ model capacity / representation ยังไม่พอรักษาความถูกต้องของ coupled contact dynamics

ดังนั้น:

- Exact Classical = runtime authority ต่อไป
- Local Residual Contact = Research Slot เท่านั้น
- ห้ามสร้าง Adaptive Router / Agent Controller จากผลนี้
- ถ้าจะวิจัยต่อ ให้แก้เฉพาะ learned solver capacity และ message propagation

## งานวิจัยถัดไปที่มีเหตุผล

1. multi-pass message correction แทน linear per-body residual
2. learned relaxation / solver schedule เพื่อเร่ง iterative solver แทนการทำนาย final state โดยตรง
3. shared SoA / typed-array contact graph เพื่อลด allocation/GC
4. fused WebGPU kernel เมื่อ CPU model ผ่าน quality gate ก่อน
5. ทดสอบ rollout stability หลาย tick หลัง one-step quality ผ่าน

ไฟล์ benchmark: `research/local-contact.mjs`
Workflow: `.github/workflows/local-contact.yml`
GitHub Actions run: 34834202234
