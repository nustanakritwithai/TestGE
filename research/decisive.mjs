import { registry } from '../src/skills.js';
import { trainGraphModels, TrainedGraphSkill } from '../src/learned.js';
import { runDecisiveBenchmark, summarizeDecision } from '../src/benchmark.js';

const trained=trainGraphModels(registry.exact,registry.approx,{episodes:120,epochs:30,lr:.01,seed:9101});
registry.gnn=new TrainedGraphSkill({id:'gnn',label:'GNN v2 Spatial',weights:trained.gnn,residual:false});
registry.residual=new TrainedGraphSkill({id:'residual',label:'Residual GNN v2 Spatial',weights:trained.residual,residual:true,approxSkill:registry.approx});

// Warm-up JIT before measuring.
runDecisiveBenchmark(registry,{reps:8,seeds:2});
const rows=runDecisiveBenchmark(registry,{reps:80,seeds:8});
const decision=summarizeDecision(rows,{qualityError:.05,eventMismatch:.25,requiredGain:.20});
const result={version:'decisive-v2',trained:trained.meta,rows,decision};
console.log('TESTGE_RESULT_BEGIN');
console.log(JSON.stringify(result,null,2));
console.log('TESTGE_RESULT_END');
if(decision.learnedApproved){
  console.log('FINAL_DECISION=LEARNED_COMPETENCE_REGION_FOUND');
}else{
  console.log('FINAL_DECISION=CLASSICAL_V1');
}
