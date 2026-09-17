#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {canonicalJson} from '../src/contracts/canonical.mjs';
import {requireThat} from '../src/contracts/errors.mjs';
import {readHelperConfig,createFixedHelper} from '../src/release/helper-runtime.mjs';
async function main(){process.umask(0o077);const {values}=parseArgs({options:{config:{type:'string'}},strict:true,allowPositionals:false});requireThat(values.config,'INVALID_ARGUMENT');requireThat(process.platform==='android','FORBIDDEN');const config=await readHelperConfig(values.config),owner=await createFixedHelper(config,{operatorOnly:true});try{const record=owner.journal.active();requireThat(record&&record.direction==='rollback'&&record.phase==='blocked'&&record.pending?.effect.step==='device.drain','FORBIDDEN','No startup-unverified rollback drain is retained');const result=await owner.controller.drive(record.intent.activationId);process.stdout.write(canonicalJson({kind:'tdev.startup-rollback-recovery',activationId:record.intent.activationId,phase:result.phase,direction:result.direction,cursor:result.cursor,observedPair:result.observedPair??null,reason:result.reason??null})+'\n');}finally{await owner.close();}}
main().catch(error=>{process.stderr.write(canonicalJson({kind:'tdev.startup-rollback-recovery-error',code:typeof error?.code==='string'?error.code:'INTEGRITY_FAILURE'})+'\n');process.exitCode=1;});
