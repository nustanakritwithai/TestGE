import {computeExact,computeApprox,proposalsFromCommands} from './twa-core.js';

self.onmessage=(ev)=>{
  const {id,task,snapshot,commands=[]}=ev.data||{};
  try{
    let result;
    if(task==='physics-exact') result=computeExact(snapshot);
    else if(task==='physics-approx') result=computeApprox(snapshot);
    else if(task==='commands') result=proposalsFromCommands(snapshot,commands);
    else throw new Error(`Unknown task: ${task}`);
    self.postMessage({id,ok:true,result});
  }catch(error){
    self.postMessage({id,ok:false,error:String(error?.stack||error)});
  }
};
