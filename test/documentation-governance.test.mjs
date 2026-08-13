import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
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
  frontier = [{ id: 'D0031', revision: 2, path: 'docs/design/0031-self-development-documentation-authority.md' }],
  selected = { id: 'D0031', revision: 2 },
} = {}) {
  return [
    '# WORKBOARD',
    '',
    '## Current routing',
    '',
    `- Active cumulative Group: ${group}`,
    `- Active cumulative branch: \`${branch}\``,
    '',
    '## Runnable frontier',
    '',
    ...frontier.map((item) => `- ${item.id}@r${item.revision} — \`${item.path}\` — fixture gate`),
    '',
    '## Selected next action',
    '',
    selected === null ? '- none' : `- ${selected.id}@r${selected.revision} — fixture selection`,
    '',
  ].join('\n');
}

function designFixture({ id = '0031', revision = 2, status = 'accepted', explicitRevision = true } = {}) {
  return [
    `# Design ${id} — Fixture`,
    '',
    `- Status: \`${status}\``,
    ...(explicitRevision ? [`- Revision: ${revision}`] : []),
    '- Class: 2',
    '',
  ].join('\n');
}

test('current repository documentation authority validates with a multi-Design frontier', () => {
  const result = validateDocumentation(root);
  assert.equal(result.ok, true, result.failures?.join('\n'));
  assert.equal(result.route.branch, 'group/f-cloudflare-runtime');
  assert.deepEqual(result.route.frontier.map((item) => `${item.id}@r${item.revision}`), ['D0031@r2', 'D0019@r2', 'D0030@r1']);
  assert.equal(`${result.route.selected.id}@r${result.route.selected.revision}`, 'D0031@r2');
});

test('zero runnable Designs and selected none are valid routing state', () => {
  const route = parseWorkboardRouting(workboardFixture({ frontier: [], selected: null }));
  assert.deepEqual(route.frontier, []);
  assert.equal(route.selected, null);
});

test('stale continuity cannot override route or maintained Design revision/status', () => {
  const rebound = rebindContinuity({
    workboardText: currentWorkboard,
    designTexts: currentDesignTexts,
    continuity: {
      branch: 'mvp-1a-7',
      group: 'Group E — context delivery',
      designId: 'D0031',
      designRevision: 1,
      designStatus: 'verified',
    },
  });
  assert.equal(rebound.current.branch, 'group/f-cloudflare-runtime');
  assert.deepEqual(rebound.staleClaims, ['branch', 'group', 'designRevision', 'designStatus']);
});

test('a continuity Design absent from the current frontier is stale', () => {
  const rebound = rebindContinuity({
    workboardText: workboardFixture(),
    continuity: { designId: 'D0099', designRevision: 1 },
  });
  assert.deepEqual(rebound.staleClaims, ['designId']);
});

test('F to G route parsing changes from WORKBOARD without stable-law inputs', () => {
  const f = parseWorkboardRouting(workboardFixture());
  const g = parseWorkboardRouting(workboardFixture({
    group: 'Group G — MCP, authentication and security',
    branch: 'group/g-mcp-security',
  }));
  assert.equal(f.groupId, 'F');
  assert.equal(g.groupId, 'G');
  assert.equal(g.branch, 'group/g-mcp-security');
});

test('selected action must identify a runnable frontier entry', () => {
  assert.throws(
    () => parseWorkboardRouting(workboardFixture({ selected: { id: 'D0030', revision: 1 } })),
    /documentation_authority_selected_not_frontier/,
  );
});

test('duplicate or missing current route fields fail closed', () => {
  const duplicate = `${workboardFixture()}- Active cumulative branch: \`group/other\`\n`;
  assert.throws(() => parseWorkboardRouting(duplicate), /documentation_authority_active_branch/);
  assert.throws(
    () => parseWorkboardRouting(workboardFixture().replace(/^- Active cumulative branch:.*\n/m, '')),
    /documentation_authority_active_branch/,
  );
});

test('pre-D0031 Designs without Revision remain legacy revision 1', () => {
  assert.deepEqual(parseDesignMetadata(designFixture({ id: '0018', status: 'verified', explicitRevision: false })), {
    id: 'D0018',
    status: 'verified',
    revision: 1,
    explicitRevision: false,
  });
});
