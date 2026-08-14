import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { renderDesignIndex } from '../tools/generate-design-index.mjs';
import {
  parseDesignMetadata,
  parseWorkboardRouting,
  rebindContinuity,
  validateDocumentation,
} from '../tools/validate-documentation.mjs';

const root = new URL('..', import.meta.url).pathname;
const currentWorkboard = fs.readFileSync(new URL('../WORKBOARD.md', import.meta.url), 'utf8');
const currentDesignTexts = Object.fromEntries([
  'docs/design/0031-self-development-documentation-authority.md',
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

test('current repository documentation authority validates with the accepted qualification-recomposition gate in the frontier', () => {
  const result = validateDocumentation(root);
  assert.equal(result.ok, true, result.failures?.join('\n'));
  assert.equal(result.route.branch, 'group/f-cloudflare-runtime');
  assert.deepEqual(result.route.frontier.map((item) => `${item.id}@r${item.revision}`), ['D0032@r1', 'D0019@r2', 'D0030@r1']);
  assert.equal(`${result.route.selected.id}@r${result.route.selected.revision}`, 'D0032@r1');
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

test('Design README is the exact deterministic projection of every maintained Design', () => {
  assert.equal(fs.readFileSync(new URL('../docs/design/README.md', import.meta.url), 'utf8'), renderDesignIndex(root));
  const drift = validateDocumentation(root, { 'docs/design/README.md': '# stale registry\n' });
  assert.equal(drift.ok, false);
  assert.match(drift.failures.join('\n'), /documentation_authority_design_index_drift/);
});

test('governance implementation has no current Design ID special cases', () => {
  for (const relativePath of ['tools/validate-documentation.mjs', 'tools/generate-design-index.mjs']) {
    const text = fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /D0019|D0031/);
  }
});
