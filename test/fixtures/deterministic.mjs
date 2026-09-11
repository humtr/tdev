import { createHash } from 'node:crypto';
/** Test-only seeded identities. Production IDs use crypto randomness. @param {string} [seed] */
export function fixtureIds(seed = "dev2-f0") { let n = 0; return (kind = 'work') => `${kind}-${createHash('sha256').update(`${seed}:${n++}`).digest('hex').slice(0, 32)}`; }
/** @param {number} [start] */
export function fakeClock(start = 0) { let n = start; return { now: () => n, monotonic: () => n, advance: (delta = 1) => { n += delta; } }; }
/** Test-only ref; does not prove a provider writer boundary. @param {string} initial */
export function fakeRef(initial) {
    let head = initial;
    /** @type {Array<{expected:string,next:string}>} */
    const calls = [];
    return { calls, read: () => head, compareUpdate: /** @param {string} expected @param {string} next */ (expected, next) => { calls.push({ expected, next }); if (head !== expected)
            return false; head = next; return true; } };
}
