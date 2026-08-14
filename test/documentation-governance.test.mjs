import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { renderDesignIndex } from '../tools/generate-design-index.mjs';
import {
  parseDesignMetadata,
  parseHistoricalQualificationPairs,
  parseQualificationOwner,
  parseQualificationPairs,
  parseSourceGateCommands,
  parseWorkboardRouting,
  rebindContinuity,
  SOURCE_GATE_COMMANDS,
  validateDocumentation,
} from '../tools/validate-documentation.mjs';

const root = new URL('..', import.meta.url).pathname;
const currentWorkboard = fs.readFileSync(new URL('../WORKBOARD.md', import.meta.url), 'utf8');
const currentDocumentation = fs.readFileSync(new URL('../docs/DOCUMENTATION.md', import.meta.url), 'utf8');
const currentQualification = fs.readFileSync(new URL('../docs/QUALIFICATION.md', import.meta.url), 'utf8');
const currentMvpHistory = fs.readFileSync(new URL('../docs/history/mvp-verification-and-evidence.md', import.meta.url), 'utf8');
const currentAgents = fs.readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
const currentDesignTexts = Object.fromEntries([
  'docs/design/0031-self-development-documentation-authority.md',
  'docs/design/0032-qualification-authority-recomposition.md',
  'docs/design/0019-casedo-authority-adapter.md',
  'docs/design/0030-immutable-journal-publication-portability.md',
].map((relativePath) => [relativePath, fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8')]));

function workboardFixture({
  group = 'Group F — Cloudflare runtime and local Agent topology',
  branch = 'group/f-cloudflare-runtime',
  frontier = [{ id: 'D0019', revision: 2, path: 'docs/design/0019-casedo-authority-adapter.md' }],
  selected = { id: 'D0019', revision: 2 },
} = {}) {
  return [
    '# WORKBOARD', '', '## Current routing', '',
    `- Active cumulative Group: ${group}`,
    `- Active cumulative branch: \`${branch}\``, '',
    '## Runnable frontier', '',
    ...frontier.map((item) => `- ${item.id}@r${item.revision} — \`${item.path}\` — fixture gate`), '',
    '## Selected next action', '',
    selected === null ? '- none' : `- ${selected.id}@r${selected.revision} — fixture selection`, '',
    '## Current owner pointers', '',
    '- Qualification methods and executable source gate: `docs/QUALIFICATION.md`', '',
  ].join('\n');
}

function designFixture({ id = '0031', revision = 2, status = 'accepted', explicitRevision = true } = {}) {
  return [
    `# Design ${id} — Fixture`, '', `- Status: \`${status}\``,
    ...(explicitRevision ? [`- Revision: ${revision}`] : []), '- Class: 2', '',
  ].join('\n');
}

test('current repository documentation authority validates after verified qualification recomposition leaves the frontier', () => {
  const result = validateDocumentation(root);
  assert.equal(result.ok, true, result.failures?.join('\n'));
  assert.equal(result.route.branch, 'group/f-cloudflare-runtime');
  assert.equal(result.qualificationOwner, 'docs/QUALIFICATION.md');
  assert.deepEqual(result.route.frontier.map((item) => `${item.id}@r${item.revision}`), ['D0019@r2', 'D0030@r1']);
  assert.equal(`${result.route.selected.id}@r${result.route.selected.revision}`, 'D0019@r2');
});

test('zero runnable Designs and selected none pass full documentation validation', () => {
  const result = validateDocumentation(root, { 'WORKBOARD.md': workboardFixture({ frontier: [], selected: null }) });
  assert.equal(result.ok, true, result.failures?.join('\n'));
  assert.deepEqual(result.route.frontier, []);
  assert.equal(result.route.selected, null);
});

test('WORKBOARD-only F to G rebinding passes full validation without editing stable documents', () => {
  const result = validateDocumentation(root, {
    'WORKBOARD.md': workboardFixture({ group: 'Group G — MCP, authentication and security', branch: 'group/g-mcp-security' }),
  });
  assert.equal(result.ok, true, result.failures?.join('\n'));
  assert.equal(result.route.groupId, 'G');
  assert.equal(result.route.branch, 'group/g-mcp-security');
});

test('a reopened frontier Design fails closed', () => {
  const path = 'docs/design/0031-self-development-documentation-authority.md';
  const reopened = currentDesignTexts[path].replace('- Status: `verified`', '- Status: `reopened`');
  const result = validateDocumentation(root, {
    'WORKBOARD.md': workboardFixture({ frontier: [{ id: 'D0031', revision: 2, path }], selected: { id: 'D0031', revision: 2 } }),
    [path]: reopened,
  });
  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /documentation_authority_frontier_design_not_runnable: D0031@r2 reopened/);
});

test('stale continuity cannot override route or maintained Design revision/status', () => {
  const rebound = rebindContinuity({
    workboardText: currentWorkboard,
    designTexts: currentDesignTexts,
    continuity: { branch: 'mvp-1a-7', group: 'Group E — context delivery', designId: 'D0019', designRevision: 1, designStatus: 'verified' },
  });
  assert.equal(rebound.current.branch, 'group/f-cloudflare-runtime');
  assert.deepEqual(rebound.staleClaims, ['branch', 'group', 'designRevision', 'designStatus']);
});

test('a continuity Design absent from the current frontier is stale', () => {
  const rebound = rebindContinuity({ workboardText: workboardFixture(), continuity: { designId: 'D0099', designRevision: 1 } });
  assert.deepEqual(rebound.staleClaims, ['designId']);
});

test('selected action must identify a runnable frontier entry', () => {
  assert.throws(() => parseWorkboardRouting(workboardFixture({ selected: { id: 'D0030', revision: 1 } })), /documentation_authority_selected_not_frontier/);
});

test('duplicate or missing current route fields fail closed', () => {
  assert.throws(() => parseWorkboardRouting(`${workboardFixture()}- Active cumulative branch: \`group/other\`\n`), /documentation_authority_active_branch/);
  assert.throws(() => parseWorkboardRouting(workboardFixture().replace(/^- Active cumulative branch:.*\n/m, '')), /documentation_authority_active_branch/);
});

test('pre-D0031 Designs without Revision remain legacy revision 1', () => {
  assert.deepEqual(parseDesignMetadata(designFixture({ id: '0018', status: 'verified', explicitRevision: false })), {
    id: 'D0018', status: 'verified', revision: 1, explicitRevision: false,
  });
});

test('qualification owner is uniquely rebound from documentation authority', () => {
  assert.equal(parseQualificationOwner(currentDocumentation), 'docs/QUALIFICATION.md');
  const rebound = rebindContinuity({
    workboardText: currentWorkboard,
    designTexts: currentDesignTexts,
    documentationText: currentDocumentation,
    continuity: {
      branch: 'mvp-1a-7',
      group: 'Group E — context delivery',
      designId: 'D0019',
      designRevision: 1,
      designStatus: 'verified',
      qualificationOwner: 'docs/MVP.md',
    },
  });
  assert.equal(rebound.current.branch, 'group/f-cloudflare-runtime');
  assert.equal(rebound.current.qualificationOwner, 'docs/QUALIFICATION.md');
  assert.deepEqual(rebound.staleClaims, ['branch', 'group', 'designRevision', 'designStatus', 'qualificationOwner']);
});

test('qualification source gate is one exact four-command block owned outside AGENTS', () => {
  assert.deepEqual(parseSourceGateCommands(currentQualification), [...SOURCE_GATE_COMMANDS]);
  for (const command of SOURCE_GATE_COMMANDS) assert.equal(currentAgents.includes(command), false);
});

test('all 78 historical qualification method pairs survive exactly without observed evidence', () => {
  const historical = parseHistoricalQualificationPairs(currentMvpHistory);
  const current = parseQualificationPairs(currentQualification);
  assert.equal(historical.length, 78);
  assert.deepEqual(current, historical);
  assert.doesNotMatch(currentQualification, /\|\s*Observed evidence\s*\|/i);
});

test('retired live MVP path and missing qualification owner fail closed', () => {
  const duplicate = validateDocumentation(root, { 'docs/MVP.md': '# resurrected live owner\n' });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.failures.join('\n'), /documentation_authority_retired_live_path: docs\/MVP\.md/);

  const missing = validateDocumentation(root, { 'docs/QUALIFICATION.md': null });
  assert.equal(missing.ok, false);
  assert.match(missing.failures.join('\n'), /documentation_authority_missing_qualification/);
});

test('qualification source-gate drift, method drift and observed-ledger contamination fail closed', () => {
  const sourceDrift = validateDocumentation(root, {
    'docs/QUALIFICATION.md': currentQualification.replace('npm run check\n', 'npm run changed-check\n'),
  });
  assert.equal(sourceDrift.ok, false);
  assert.match(sourceDrift.failures.join('\n'), /documentation_authority_qualification_source_gate_exact/);

  const methodDrift = validateDocumentation(root, {
    'docs/QUALIFICATION.md': currentQualification.replace('| immutable graph | mutate Plan / duplicate Task / unknown dependency / cycle |', '| immutable graph | changed falsifier |'),
  });
  assert.equal(methodDrift.ok, false);
  assert.match(methodDrift.failures.join('\n'), /documentation_authority_qualification_method_drift/);

  const ledger = validateDocumentation(root, {
    'docs/QUALIFICATION.md': currentQualification + '\n| Observed evidence | historical pass |\n',
  });
  assert.equal(ledger.ok, false);
  assert.match(ledger.failures.join('\n'), /documentation_authority_qualification_observed_ledger/);
});

test('duplicating the source gate back into AGENTS fails closed', () => {
  const result = validateDocumentation(root, {
    'AGENTS.md': currentAgents + '\n' + SOURCE_GATE_COMMANDS[0] + '\n',
  });
  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /documentation_authority_agents_source_gate_duplicate/);
});

test('Design README is the exact deterministic projection of every maintained Design', () => {
  assert.equal(fs.readFileSync(new URL('../docs/design/README.md', import.meta.url), 'utf8'), renderDesignIndex(root));
  const drift = validateDocumentation(root, { 'docs/design/README.md': '# stale registry\n' });
  assert.equal(drift.ok, false);
  assert.match(drift.failures.join('\n'), /documentation_authority_design_index_drift/);
});

test('governance implementation has no current runnable Design ID special cases', () => {
  const currentIds = parseWorkboardRouting(currentWorkboard).frontier.map((item) => item.id);
  assert.ok(currentIds.length > 0);
  for (const relativePath of ['tools/validate-documentation.mjs', 'tools/generate-design-index.mjs']) {
    const text = fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
    for (const id of currentIds) assert.equal(text.includes(id), false, `${relativePath} hard-codes current ${id}`);
  }
});
