import {canonicalJson,parseRecord,bytesDigest} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {BUILD_NAMES,encodeBuildOutput,decodeBuildOutput} from './build-output.mjs';
/** Decode only actual receipt-bound stored bytes, never candidate object locators.
 * The staged release may intentionally carry a newer Design-authorized public
 * schema than the installed runtime. Derive that schema identity from the exact
 * receipt-bound tools bytes instead of comparing them to installed descriptors.
 * Caller must first authenticate the complete outer receipt via ProductionReceipts.
 * @param {import('../execution/outer-receipt.mjs').OuterReceipt} outer
 * @param {import('../contracts/ports.js').ObjectStorePort} objects */
export async function productionBuildOutput(outer,objects){
 /** @type {Record<string,Uint8Array>} */const files={};
 for(const name of BUILD_NAMES){const out=outer.outputs.find(o=>o.name===name);requireThat(out,'INTEGRITY_FAILURE');files[name]=await objects.get(out.digest);requireThat(files[name].length===out.size,'INTEGRITY_FAILURE');}
 const tools=parseRecord(files['tools.json'],262144),schemaDigest=bytesDigest(Buffer.from(canonicalJson(tools)));
 const decoded=decodeBuildOutput(encodeBuildOutput(schemaDigest,files),schemaDigest);
 requireThat(decoded.artifacts.every(a=>outer.outputs.some(o=>o.name===a.name&&o.digest===a.digest&&o.size===a.size)),'INTEGRITY_FAILURE','Receipt-bound release bytes differ');
 return decoded;
}
