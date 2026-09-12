import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('unimplemented layers never pass an empty suite', () => {
  const dir=mkdtempSync(join(tmpdir(),'dev2-entrypoint-'));
  try {
    for(const profile of ['release','live','benchmark']) {
      const out=join(dir,profile);
      const r=spawnSync(process.execPath,['tools/validate.mjs','--profile',profile,'--output',out],{encoding:'utf8',timeout:20000});
      assert.equal(r.status,2,r.stderr);
      const data=JSON.parse(readFileSync(join(out,'result.json'),'utf8'));
      assert.equal(data.status,'not_run'); assert.equal(data.layer,profile); assert.equal(data.installationEligibility,false);
      assert.equal(data.inputDigest,data.outputInputDigest);
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('closed CLI rejects unknown profile or option', () => {
  for(const args of [[],['--profile','other','--output','.artifacts/invalid'],['--profile','core','--output','.artifacts/invalid','--skip-tests']]) {
    const r=spawnSync(process.execPath,['tools/validate.mjs',...args],{encoding:'utf8',timeout:10000}); assert.equal(r.status,1);
  }
});
