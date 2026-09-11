#!/usr/bin/env node
/** Fixed installation helper. No Git/network/download/model/shell capability. */
import {open,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {isAbsolute,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseRecord} from '../src/contracts/canonical.mjs';
import {requireThat,Dev2Error} from '../src/contracts/errors.mjs';
import {id} from '../src/contracts/identity.mjs';
import {ReleaseStore} from '../src/runtime/release-store.mjs';
import {ActivationController} from '../src/runtime/activation.mjs';
import {SystemdServices} from '../src/runtime/systemd.mjs';
/** @param {string} path @param {number} maximum */
export async function privateFile(path,maximum){requireThat(isAbsolute(path)&&await realpath(path)===resolve(path),'FORBIDDEN');const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const stat=await fd.stat();requireThat(stat.isFile()&&stat.size<=maximum&&(stat.mode&0o077)===0&&stat.uid===process.getuid?.(),'FORBIDDEN','Installation material must be owned and private');return await fd.readFile();}finally{await fd.close();}}
/** @param {string[]} argv */
export function argumentsFor(argv){requireThat(argv.length===4&&argv[0]==='--installation'&&argv[2]==='--activation','INVALID_ARGUMENT');requireThat(isAbsolute(argv[1]),'INVALID_ARGUMENT');id(argv[3]);return {installation:argv[1],activation:argv[3]};}
/** @param {string[]} argv */
export async function activate(argv){
 const args=argumentsFor(argv),raw=/** @type {Record<string,unknown>} */(parseRecord(await privateFile(args.installation,65536)));
 requireThat(Object.keys(raw).every(k=>['releaseRoot','keyFile','unit','socket','ledgerVersion','user'].includes(k)),'INVALID_ARGUMENT');
 requireThat(typeof raw.releaseRoot==='string'&&typeof raw.keyFile==='string'&&typeof raw.unit==='string'&&typeof raw.socket==='string'&&Number.isSafeInteger(raw.ledgerVersion)&&typeof raw.ledgerVersion==='number'&&raw.ledgerVersion>=1&&typeof raw.user==='boolean','INVALID_ARGUMENT');
 const key=await privateFile(raw.keyFile,4096),store=new ReleaseStore(raw.releaseRoot,key);await store.init();
 const services=new SystemdServices({unit:raw.unit,socket:raw.socket,store,user:raw.user});
 const controller=new ActivationController({store,services,ledgerVersion:raw.ledgerVersion});
 return controller.run(args.activation);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const record=await activate(process.argv.slice(2));console.log(JSON.stringify(record));process.exitCode=['active','rolled_back'].includes(record.phase)?0:2;}
 catch(error){console.error(JSON.stringify({status:'blocked',code:error instanceof Dev2Error?error.code:'EXECUTION_UNAVAILABLE'}));process.exitCode=2;}
}
