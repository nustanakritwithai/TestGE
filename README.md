# TestGE — Transactional World Architecture (TWA)

TestGE เป็น **Deterministic, Data-Oriented, Transactional, Verifiable, Authoritative World Runtime** สำหรับเกมและ simulation ที่ต้องการ World Truth กลาง, rollback/replay, replication และการตรวจสอบย้อนหลังได้

## TWA V1 Architecture

```text
Input / Commands
      ↓
Canonical Snapshot
      ↓
Parallel Compute Workers
      ↓
Proposal / WriteSet
      ↓
Deterministic Conflict Resolution
      ↓
Verification
      ↓
Atomic Commit
      ↓
Unified Delta Log
      ├─ Rollback / Replay / Time Travel
      ├─ Delta Replication
      └─ Audit / Debugging
```

หลักการสำคัญ: Compute system ไม่มีสิทธิ์แก้ Canonical World โดยตรง ทุกการเปลี่ยนแปลงต้องผ่าน Proposal → Verify → Commit

## สถานะ V1

- ✅ Data-Oriented World / TypedArray storage
- ✅ Logical Snapshot
- ✅ Proposal / WriteSet
- ✅ Deterministic Conflict Resolver
- ✅ Hierarchical verification baseline
- ✅ Atomic Commit Authority
- ✅ Unified Delta Log
- ✅ Checkpoint / Multi-step Rollback / Replay
- ✅ Time-Travel Audit
- ✅ Transactional Spawn / Despawn + Generation
- ✅ Canonical Input / Event Log
- ✅ Parallel Web Worker Task Graph
- ✅ Delta Replication + Interest Filtering
- ✅ Client Prediction / Reconciliation demo
- ✅ Public Engine API (`src/twa-engine.js`)
- ✅ Browser Regression Suite
- ✅ TWA V1 Playable Runtime Demo

## Public Engine API

```js
import {createEngine} from './src/twa-engine.js';

const engine = createEngine({seed: 42, count: 64, workers: 2});
engine.submit('impulse', {entity: 0, dvx: .2, dvy: 0});
const result = await engine.step({parallel: true, mode: 'exact', critical: true});

console.log(engine.tick, engine.version, engine.hash);

engine.checkpoint('before-combat');
engine.rollback(30);
engine.replay(30);
```

Replication:

```js
engine.createClient('player-1', {mode:'radius', x:0, y:0, radius:.75});
engine.bootstrapClient('player-1');
await engine.step();
engine.replicateLatest('player-1');
```

## GitHub Pages

- Main Runtime: https://nustanakritwithai.github.io/TestGE/
- TWA V1 Playable Demo: https://nustanakritwithai.github.io/TestGE/v1-demo.html
- Regression Suite: https://nustanakritwithai.github.io/TestGE/regression.html
- Client Prediction Demo: https://nustanakritwithai.github.io/TestGE/prediction.html

## V1 Definition

TWA V1 ถือว่าเป็น runtime architecture ที่ล็อกแล้ว ไม่ย้อนกลับไปเปิดการแข่งขัน GNN / learned physics / adaptive router ใน core. Learned/approximate compute สามารถกลับมาได้ในอนาคตในฐานะ **Compute Backend Candidate** แต่ต้องผ่าน authority contract เดียวกันและไม่มีสิทธิ์ bypass verifier/commit gate.
