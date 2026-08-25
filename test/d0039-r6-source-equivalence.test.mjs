import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { canonicalJson } from '../src/canonical.mjs';
import { checkD0039R6SourceEquivalentEvidenceDescendant } from '../qualification/d0039-r6-source-equivalence.mjs';

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function write(pathname, text) {
  await fs.mkdir(path.dirname(pathname), { recursive: true });
  await fs.writeFile(pathname, text);
}

async function commitAll(repo, message) {
  git(repo, 'add', '-A');
  git(repo, '-c', 'user.name=tdev-test', '-c', 'user.email=tdev-test@example.invalid', 'commit', '-m', message);
  return git(repo, 'rev-parse', 'HEAD');
}

async function fixture(t) {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'tdev-d0039-r6-equivalence-'));
  t.after(() => fs.rm(repo, { recursive: true, force: true }));
  git(repo, 'init', '-q');
  await write(path.join(repo, 'WORKBOARD.md'), [
    '# Workboard',
    '<!-- D0039-R6-CURRENT-STATUS:BEGIN -->',
    '- source implementation pending',
    '<!-- D0039-R6-CURRENT-STATUS:END -->',
    '- immutable routing text',
    '',
  ].join('\n'));
  await write(path.join(repo, 'src', 'owner.mjs'), 'export const owner = "r6";\n');
  const sourceSha = await commitAll(repo, 'source');
  return { repo, sourceSha };
}

test('D0039 R6 source-equivalence accepts only bounded status plus canonical additive R6 evidence', async (t) => {
  const { repo, sourceSha } = await fixture(t);
  const workboard = await fs.readFile(path.join(repo, 'WORKBOARD.md'), 'utf8');
  await fs.writeFile(path.join(repo, 'WORKBOARD.md'), workboard.replace('- source implementation pending', '- source gate PASS and A6 recorded'));
  const evidence = { classification: 'd0039_r6_source_gate', sourceSha, secretValues: 'excluded' };
  await write(path.join(repo, 'docs/evidence/group-f-d0039-r6-source-gate-test.json'), `${canonicalJson(evidence)}\n`);
  const evidenceSha = await commitAll(repo, 'evidence');
  const result = checkD0039R6SourceEquivalentEvidenceDescendant({ repo, sourceSha, evidenceSha });
  assert.equal(result.sourceSha, sourceSha);
  assert.equal(result.evidenceSha, evidenceSha);
  assert.deepEqual(result.evidenceFiles, ['docs/evidence/group-f-d0039-r6-source-gate-test.json']);
});

test('D0039 R6 source-equivalence rejects source mutation even when bounded evidence is also present', async (t) => {
  const { repo, sourceSha } = await fixture(t);
  const workboard = await fs.readFile(path.join(repo, 'WORKBOARD.md'), 'utf8');
  await fs.writeFile(path.join(repo, 'WORKBOARD.md'), workboard.replace('- source implementation pending', '- evidence claims PASS'));
  await write(path.join(repo, 'docs/evidence/group-f-d0039-r6-source-gate-test.json'), `${canonicalJson({ classification: 'test' })}\n`);
  await write(path.join(repo, 'src/owner.mjs'), 'export const owner = "mutated-after-source";\n');
  const evidenceSha = await commitAll(repo, 'invalid evidence descendant');
  assert.throws(
    () => checkD0039R6SourceEquivalentEvidenceDescendant({ repo, sourceSha, evidenceSha }),
    (error) => error?.code === 'd0039_source_equivalence_non_additive_evidence',
  );
});

test('D0039 R6 source-equivalence rejects WORKBOARD escape and non-R6 evidence namespaces', async (t) => {
  const escaped = await fixture(t);
  await fs.appendFile(path.join(escaped.repo, 'WORKBOARD.md'), '- escaped routing mutation\n');
  await write(path.join(escaped.repo, 'docs/evidence/group-f-d0039-r6-source-gate-test.json'), `${canonicalJson({ classification: 'test' })}\n`);
  const escapedSha = await commitAll(escaped.repo, 'escaped');
  assert.throws(
    () => checkD0039R6SourceEquivalentEvidenceDescendant({ repo: escaped.repo, sourceSha: escaped.sourceSha, evidenceSha: escapedSha }),
    (error) => error?.code === 'd0039_source_equivalence_workboard_escape',
  );

  const wrong = await fixture(t);
  const workboard = await fs.readFile(path.join(wrong.repo, 'WORKBOARD.md'), 'utf8');
  await fs.writeFile(path.join(wrong.repo, 'WORKBOARD.md'), workboard.replace('- source implementation pending', '- evidence claims PASS'));
  await write(path.join(wrong.repo, 'docs/evidence/group-f-d0039-r5-wrong.json'), `${canonicalJson({ classification: 'test' })}\n`);
  const wrongSha = await commitAll(wrong.repo, 'wrong namespace');
  assert.throws(
    () => checkD0039R6SourceEquivalentEvidenceDescendant({ repo: wrong.repo, sourceSha: wrong.sourceSha, evidenceSha: wrongSha }),
    (error) => error?.code === 'd0039_source_equivalence_path_forbidden',
  );
});
