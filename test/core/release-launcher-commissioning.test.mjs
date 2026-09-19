import test from 'node:test';
import assert from 'node:assert/strict';
import {bytesDigest,recordDigest} from '../../src/contracts/canonical.mjs';
import {releaseLauncherCommissioning} from '../../src/release/launcher-commissioning.mjs';
const D=n=>'sha256:'+String(n).repeat(64);
function fixture(){
 const root='/data/data/com.termux/files/home/.local/share/tdev/release-control-tdev-epoch3',fixed=root+'/fixed',service='/data/data/com.termux/files/usr/var/service/tdev';
 const sealBody={schemaVersion:1,kind:'tdev.operator-installed-release-boundary',installationId:'i',repositoryId:'r',bindingEpoch:'3',serviceRunDigest:D(3),fixedFiles:{runitConfig:D(2)}},installationSeal={...sealBody,installationSealDigest:recordDigest('tdev.operator-installed-release-boundary.v1',sealBody)};
 const helper={installationId:'i',repositoryId:'r',bindingEpoch:'3',installationSealDigest:installationSeal.installationSealDigest,baseline:{schemaDigest:D(1)},baselinePointer:{schemaVersion:1},environment:{PATH:'/data/data/com.termux/files/usr/bin',HOME:root+'/home',TMPDIR:root+'/tmp',LANG:'C.UTF-8',PREFIX:'/data/data/com.termux/files/usr'},fixedFiles:{runitConfig:D(2)},paths:{pointerFile:root+'/device-pointer.json',artifactDirectory:root+'/artifacts',nativeConfigDirectory:root+'/native-configs',pythonExecutable:'/data/data/com.termux/files/usr/bin/python',commonModuleFile:fixed+'/release_native.py',runitConfigFile:fixed+'/runit.json',writerFenceConfigFile:fixed+'/writer-fence.json',journalFile:root+'/activation.json'}};
 const runit={schemaVersion:1,installationId:'i',repositoryId:'r',bindingEpoch:'3',pointerFile:helper.paths.pointerFile,serviceDirectory:service,serviceRunDigest:D(3),stateDirectory:root+'/runit-effects'};
 const writer={schemaVersion:1,installationId:'i',repositoryId:'r',bindingEpoch:'3',pointerFile:helper.paths.pointerFile,launcherLockFile:root+'/launcher.lock',artifactDirectory:helper.paths.artifactDirectory,nativeConfigDirectory:helper.paths.nativeConfigDirectory};
 return {helper,runit,writer,installationSeal};
}
test('release launcher commissioning binds the pointer-aware launcher into the sealed runit/helper chain',()=>{
 const f=fixture(),launcherBytes=Buffer.from('fixed-launcher'),p=releaseLauncherCommissioning({...f,launcherBytes,nodeExecutable:'/data/data/com.termux/files/usr/bin/node',nodeDigest:D(4)});
 assert.equal(p.launcherDigest,bytesDigest(launcherBytes));assert.equal(p.launcherConfig.launcherLockFile,f.writer.launcherLockFile);assert.equal(p.runitConfig.serviceRunDigest,p.serviceRunDigest);assert.equal(p.helperConfig.fixedFiles.runitConfig,p.runitConfigDigest);
 assert.equal(p.commissioningSeal.baseInstallationSealDigest,f.helper.installationSealDigest);assert.equal(p.commissioningSeal.serviceRunDigest,p.serviceRunDigest);assert.equal(p.commissioningSeal.runitConfigDigest,p.runitConfigDigest);assert.equal(p.commissioningSeal.helperConfigDigest,p.helperConfigDigest);assert.equal(p.commissioningSeal.launcherDigest,p.launcherDigest);assert.equal(p.commissioningSeal.launcherConfigDigest,p.launcherConfigDigest);assert.equal(p.commissioningSeal.commissioningSealDigest,p.commissioningSealDigest);
 assert.match(p.serviceRun,/release-device-launcher\.py/);assert.ok(p.serviceRun.includes(p.launcherDigest));assert.ok(p.serviceRun.includes(p.launcherConfigDigest));
 assert.equal(p.serviceRun.includes(f.writer.launcherLockFile),false);
});
test('release launcher commissioning rejects cross-installation and cross-pointer composition',()=>{
 for(const mutate of [f=>f.runit.installationId='other',f=>f.writer.repositoryId='other',f=>f.writer.pointerFile='/tmp/foreign',f=>f.writer.launcherLockFile='relative',f=>f.installationSeal.bindingEpoch='4',f=>f.installationSeal.serviceRunDigest=D(9)]){
  const f=fixture();mutate(f);assert.throws(()=>releaseLauncherCommissioning({...f,launcherBytes:Buffer.from('x'),nodeExecutable:'/data/data/com.termux/files/usr/bin/node',nodeDigest:D(4)}));
 }
});
