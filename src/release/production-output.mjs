import {canonicalJson,parseRecord} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {SCHEMA_DIGEST,TOOL_DESCRIPTORS} from '../mcp/outputs.mjs';
import {BUILD_NAMES,encodeBuildOutput,decodeBuildOutput} from './build-output.mjs';
/** Decode only actual receipt-bound stored bytes, never candidate object locators.
 * Caller must first authenticate the complete outer receipt via ProductionReceipts.
 * @param {import('../execution/outer-receipt.mjs').OuterReceipt} outer
 * @param {import('../contracts/ports.js').ObjectStorePort} objects */
export async function productionBuildOutput(outer,objects){
 /** @type {Record<string,Uint8Array>} */const files={};
 for(const name of BUILD_NAMES){const out=outer.outputs.find(o=>o.name===name);requireThat(out,'INTEGRITY_FAILURE');files[name]=await objects.get(out.digest);requireThat(files[name].length===out.size,'INTEGRITY_FAILURE');}
 const decoded=decodeBuildOutput(encodeBuildOutput(SCHEMA_DIGEST,files),SCHEMA_DIGEST);
 requireThat(decoded.artifacts.every(a=>outer.outputs.some(o=>o.name===a.name&&o.digest===a.digest&&o.size===a.size))&&canonicalJson(parseRecord(files['tools.json'],262144))===canonicalJson(TOOL_DESCRIPTORS),'INTEGRITY_FAILURE','Frozen receipt-bound descriptor bytes differ');
 return decoded;
}
