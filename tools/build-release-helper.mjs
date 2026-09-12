import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {bytesDigest} from '../src/contracts/canonical.mjs';
import {SCHEMA_DIGEST} from '../src/mcp/outputs.mjs';
// The fixed helper is commissioned separately from ordinary paired runtime
// artifacts. This script runs only in approved build/qualification or explicit
// missing-capability installation bootstrap; it never executes a candidate.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(root,process.argv[2]??'.artifacts/helper');await mkdir(out,{recursive:true});
await build({entryPoints:[join(root,'tools/release-helper-main.mjs')],outfile:join(out,'helper.mjs'),bundle:true,platform:'node',format:'esm',target:'node24',legalComments:'none'});
const bytes=await readFile(join(out,'helper.mjs')),manifest={schemaDigest:SCHEMA_DIGEST,bundleDigest:bytesDigest(bytes),bytes:bytes.length,builder:'esbuild-0.28.2'};
await writeFile(join(out,'helper-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest));
