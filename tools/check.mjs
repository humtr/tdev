import { spawnSync } from 'node:child_process';
let result=0;
for(const profile of ['core','integration']) {
  const child=spawnSync(process.execPath,['tools/validate.mjs','--profile',profile,'--output','.artifacts/'+profile],{stdio:'inherit',timeout:360000,killSignal:'SIGKILL'});
  const status=child.status??3;
  if(status===1) result=1;
  else if(status!==0 && result!==1) result=Math.max(result,status);
}
process.exitCode=result;
