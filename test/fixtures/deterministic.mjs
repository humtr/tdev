import { recordDigest } from '../../src/contracts/canonical.mjs';
/** @param {string} [seed] Test-only identities. Never imported by product modules. */
export function fixture(seed = 'dev2-f0-20260911') {
  let sequence = 0; let time = 0;
  return {
    seed,
    nextId: () => recordDigest('dev2.fixture-id.v1', {seed,sequence:sequence++}).slice(7,39),
    clock: {now: () => time},
    /** @param {number} ms */
    advance: (ms) => { if (!Number.isSafeInteger(ms) || ms < 0) throw new TypeError('clock'); time += ms; }
  };
}
/** @param {string} head Minimal async provider fixture; not a Git/provider proof. */
export function fakeRef(head) {
  return {
    read: async () => head,
    /** @param {string} expected @param {string} next */
    cas: async (expected, next) => { if (head !== expected) return false; head = next; return true; }
  };
}
