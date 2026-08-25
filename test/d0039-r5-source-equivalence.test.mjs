import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canonicalJson } from '../src/canonical.mjs';
import {
  D0039_R5_STATUS_BEGIN,
  D0039_R5_STATUS_END,
  checkD0039R5SourceEquivalentEvidenceDescendant,
} from '../qualification/d0039-r5-source-equivalence.mjs';

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function fixture(t) {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'tdev-d0039-r5-equivalence-'));
  t.after(() => fs.rm(repo, { recursive: true, force: true }));
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.email', 'qualification@example.invalid');
  git(repo, 'config', 'user.name', 'D0039 R5 Qualification');
  await fs.writeFile(path.join(repo, 'WORKBOARD.md'), `# WORKBOARD\n\n${D0039_R5_STATUS_BEGIN}\n- D0039@r5 source unverified.\n${D0039_R5_STATUS_END}\n\nStable outside status.\n`);
  await fs.writeFile(path.join(repo, 'product.mjs'), 'export const value = 1;\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'source');
  return { repo, sourceSha: git(repo, 'rev-parse', 'HEAD') };
}

async function addEvidence(repo, status = '- D0039@r5 Q1 verified.') {
  const workboard = await fs.readFile(path.join(repo, 'WORKBOARD.md'), 'utf8');
  await fs.writeFile(path.join(repo, 'WORKBOARD.md'), workboard.replace('- D0039@r5 source unverified.', status));
  await fs.mkdir(path.join(repo, 'docs/evidence'), { recursive: true });
  const evidence = { classification: 'q1_source_verified', schemaVersion: 1 };
  await fs.writeFile(path.join(repo, 'docs/evidence/group-f-d0039-r5-source-verification-test.json'), `${canonicalJson(evidence)}\n`);
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'evidence');
  return git(repo, 'rev-parse', 'HEAD');
}

test('D0039 r5 source-equivalence accepts bounded status plus additive canonical R5 evidence', async (t) => {
  const { repo, sourceSha } = await fixture(t);
  const evidenceSha = await addEvidence(repo);
  const result = checkD0039R5SourceEquivalentEvidenceDescendant({ repo, sourceSha, evidenceSha });
  assert.equal(result.classification, 'source_equivalent_evidence_descendant');
  assert.deepEqual(result.evidenceFiles, ['docs/evidence/group-f-d0039-r5-source-verification-test.json']);
});

test('D0039 r5 source-equivalence rejects semantic source mutation even with valid evidence', async (t) => {
  const { repo, sourceSha } = await fixture(t);
  await fs.writeFile(path.join(repo, 'product.mjs'), 'export const value = 2;\n');
  const evidenceSha = await addEvidence(repo);
  assert.throws(
    () => checkD0039R5SourceEquivalentEvidenceDescendant({ repo, sourceSha, evidenceSha }),
    (error) => error?.code === 'd0039_source_equivalence_non_additive_evidence',
  );
});

test('D0039 r5 source-equivalence rejects R4 evidence namespace', async (t) => {
  const { repo, sourceSha } = await fixture(t);
  const workboard = await fs.readFile(path.join(repo, 'WORKBOARD.md'), 'utf8');
  await fs.writeFile(path.join(repo, 'WORKBOARD.md'), workboard.replace('- D0039@r5 source unverified.', '- D0039@r5 Q1 verified.'));
  await fs.mkdir(path.join(repo, 'docs/evidence'), { recursive: true });
  await fs.writeFile(path.join(repo, 'docs/evidence/group-f-d0039-r4-source-verification-test.json'), `${canonicalJson({ classification: 'wrong_revision' })}\n`);
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'wrong evidence namespace');
  const evidenceSha = git(repo, 'rev-parse', 'HEAD');
  assert.throws(
    () => checkD0039R5SourceEquivalentEvidenceDescendant({ repo, sourceSha, evidenceSha }),
    (error) => error?.code === 'd0039_source_equivalence_path_forbidden',
  );
});

test('D0039 r5 source-equivalence rejects WORKBOARD changes outside the bounded region', async (t) => {
  const { repo, sourceSha } = await fixture(t);
  await addEvidence(repo);
  const workboard = await fs.readFile(path.join(repo, 'WORKBOARD.md'), 'utf8');
  await fs.writeFile(path.join(repo, 'WORKBOARD.md'), workboard.replace('Stable outside status.', 'Changed outside status.'));
  git(repo, 'add', 'WORKBOARD.md');
  git(repo, 'commit', '-qm', 'escape status region');
  const escapedSha = git(repo, 'rev-parse', 'HEAD');
  assert.throws(
    () => checkD0039R5SourceEquivalentEvidenceDescendant({ repo, sourceSha, evidenceSha: escapedSha }),
    (error) => error?.code === 'd0039_source_equivalence_workboard_escape',
  );
});
