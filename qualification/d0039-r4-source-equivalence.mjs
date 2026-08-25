#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, strictJsonParse } from '../src/canonical.mjs';

export const D0039_R4_STATUS_BEGIN = '<!-- D0039-R4-CURRENT-STATUS:BEGIN -->';
export const D0039_R4_STATUS_END = '<!-- D0039-R4-CURRENT-STATUS:END -->';
const EVIDENCE_PREFIX = 'docs/evidence/group-f-d0039-r4-';

function fail(code, message, details = undefined) {
  const error = new Error(message);
  error.code = code;
  error.details = details ?? {};
  throw error;
}

function assertSha(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) fail('d0039_source_equivalence_invalid_sha', `${label} must be an exact lowercase 40-hex commit SHA`, { label });
  return value;
}

function git(repo, args, options = {}) {
  try {
    return execFileSync('git', ['-C', repo, ...args], {
      encoding: options.encoding ?? 'utf8',
      maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    fail('d0039_source_equivalence_git_failed', 'Git evidence query failed', {
      args,
      status: error?.status ?? null,
      stderr: typeof error?.stderr === 'string' ? error.stderr.slice(0, 4096) : '',
    });
  }
}

function assertCommit(repo, sha, label) {
  assertSha(sha, label);
  const resolved = git(repo, ['rev-parse', '--verify', `${sha}^{commit}`]).trim();
  if (resolved !== sha) fail('d0039_source_equivalence_commit_mismatch', `${label} did not resolve exactly`, { expected: sha, actual: resolved });
}

function assertAncestor(repo, sourceSha, evidenceSha) {
  const result = spawnSync('git', ['-C', repo, 'merge-base', '--is-ancestor', sourceSha, evidenceSha], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) fail('d0039_source_equivalence_not_descendant', 'Evidence commit is not a descendant of exact source commit', { sourceSha, evidenceSha, status: result.status });
}

function parseNameStatusZ(buffer) {
  const fields = buffer.toString('utf8').split('\0');
  if (fields.at(-1) === '') fields.pop();
  const changes = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    const filePath = fields[index++];
    if (!status || !filePath || status.startsWith('R') || status.startsWith('C')) fail('d0039_source_equivalence_diff_parse_failed', 'Unexpected Git name-status record', { status, filePath });
    changes.push({ status, path: filePath });
  }
  return changes;
}

function boundedWorkboard(text, label) {
  const begin = text.indexOf(D0039_R4_STATUS_BEGIN);
  const end = text.indexOf(D0039_R4_STATUS_END);
  if (begin < 0 || end < 0 || end <= begin || text.indexOf(D0039_R4_STATUS_BEGIN, begin + 1) >= 0 || text.indexOf(D0039_R4_STATUS_END, end + 1) >= 0) {
    fail('d0039_source_equivalence_status_region_invalid', `${label} must contain exactly one ordered D0039 Revision-4 status region`);
  }
  const contentStart = begin + D0039_R4_STATUS_BEGIN.length;
  return { outside: `${text.slice(0, contentStart)}\n<D0039-R4-STATUS-EVIDENCE-ONLY>\n${text.slice(end)}`, inside: text.slice(contentStart, end) };
}

function assertEvidenceBlob(repo, evidenceSha, filePath) {
  if (!filePath.startsWith(EVIDENCE_PREFIX) || !filePath.endsWith('.json') || filePath.includes('..')) fail('d0039_source_equivalence_path_forbidden', 'Evidence descendant added a file outside the bounded D0039 Revision-4 evidence namespace', { path: filePath });
  const tree = git(repo, ['ls-tree', evidenceSha, '--', filePath]).trim();
  const match = /^100644 blob ([0-9a-f]{40})\t(.+)$/.exec(tree);
  if (!match || match[2] !== filePath) fail('d0039_source_equivalence_evidence_mode_invalid', 'Evidence addition must be one regular non-executable blob', { path: filePath, tree });
  const bytes = git(repo, ['show', `${evidenceSha}:${filePath}`], { encoding: 'buffer' });
  let parsed;
  try { parsed = strictJsonParse(bytes, { maxBytes: 4 * 1024 * 1024 }); }
  catch (cause) { fail('d0039_source_equivalence_evidence_json_invalid', 'Evidence addition must be strict JSON', { path: filePath, cause: cause?.message }); }
  if (`${canonicalJson(parsed)}\n` !== bytes.toString('utf8')) fail('d0039_source_equivalence_evidence_noncanonical', 'Evidence addition must use canonical JSON bytes', { path: filePath });
}

export function checkD0039R4SourceEquivalentEvidenceDescendant({ repo = process.cwd(), sourceSha, evidenceSha }) {
  repo = path.resolve(repo);
  assertCommit(repo, sourceSha, 'sourceSha');
  assertCommit(repo, evidenceSha, 'evidenceSha');
  if (sourceSha === evidenceSha) fail('d0039_source_equivalence_same_commit', 'Evidence commit must be a descendant distinct from exact source commit');
  assertAncestor(repo, sourceSha, evidenceSha);
  const changes = parseNameStatusZ(git(repo, ['diff', '--name-status', '--no-renames', '-z', sourceSha, evidenceSha], { encoding: 'buffer' }));
  if (changes.length === 0) fail('d0039_source_equivalence_no_evidence_change', 'Evidence descendant must contain bounded evidence/status changes');
  let workboardSeen = false;
  const evidenceFiles = [];
  for (const change of changes) {
    if (change.path === 'WORKBOARD.md') {
      if (change.status !== 'M' || workboardSeen) fail('d0039_source_equivalence_workboard_change_invalid', 'WORKBOARD.md may be modified exactly once', { change });
      workboardSeen = true;
      continue;
    }
    if (change.status !== 'A') fail('d0039_source_equivalence_non_additive_evidence', 'Evidence descendant may only add immutable evidence files', { change });
    assertEvidenceBlob(repo, evidenceSha, change.path);
    evidenceFiles.push(change.path);
  }
  if (!workboardSeen || evidenceFiles.length === 0) fail('d0039_source_equivalence_required_evidence_missing', 'Evidence descendant requires both bounded WORKBOARD status and at least one immutable evidence file');
  const sourceWorkboard = boundedWorkboard(git(repo, ['show', `${sourceSha}:WORKBOARD.md`]), 'source WORKBOARD');
  const evidenceWorkboard = boundedWorkboard(git(repo, ['show', `${evidenceSha}:WORKBOARD.md`]), 'evidence WORKBOARD');
  if (sourceWorkboard.outside !== evidenceWorkboard.outside) fail('d0039_source_equivalence_workboard_escape', 'WORKBOARD changes escaped the bounded Revision-4 current-status region');
  if (sourceWorkboard.inside === evidenceWorkboard.inside) fail('d0039_source_equivalence_status_unchanged', 'Evidence descendant did not update the bounded Revision-4 current-status region');
  return Object.freeze({ classification: 'source_equivalent_evidence_descendant', sourceSha, evidenceSha, changedPaths: changes.map((change) => change.path), evidenceFiles });
}

function parseArgs(argv) {
  if (argv.length !== 4 || argv[0] !== '--source' || argv[2] !== '--evidence') fail('d0039_source_equivalence_usage', 'usage: d0039-r4-source-equivalence --source <40hex-S> --evidence <40hex-E>');
  return { sourceSha: argv[1], evidenceSha: argv[3] };
}

const direct = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  try { process.stdout.write(`${canonicalJson(checkD0039R4SourceEquivalentEvidenceDescendant(parseArgs(process.argv.slice(2))))}\n`); }
  catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error?.code ?? 'd0039_source_equivalence_failed', message: error?.message ?? 'source equivalence failed', details: error?.details ?? {} })}\n`);
    process.exitCode = 1;
  }
}
