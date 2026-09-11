// Trusted test-only validation entrypoint. Never installed as production policy.
import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const profile=process.argv[2];if(!['core','integration'].includes(profile))throw Error('Unknown fixture profile');
const hash=createHash('sha256');let files=0,bytes=0,failed=false;
/** @param {string} path */
async function walk(path){
 for(const entry of (await readdir(path,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
  const file=join(path,entry.name);if(entry.isDirectory())await walk(file);
  else if(entry.isFile()){const data=await readFile(file);files++;bytes+=data.length;hash.update(file);hash.update(data);if(data.includes(Buffer.from('FAIL_'+profile.toUpperCase())))failed=true;}
  else throw Error('Unexpected fixture file type');
 }
}
await walk('.');console.log(JSON.stringify({profile,files,bytes,digest:hash.digest('hex')}));process.exitCode=failed?1:0;
