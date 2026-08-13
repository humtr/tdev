import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  parseDesignMetadata,
  parseWorkboardRouting,
  rebindContinuity,
  validateDocumentation,
} from '../tools/validate-documentation.mjs';

const currentWorkboard = fs.readFileSync(new URL('../WORKBOARD.md', import.meta.url), 'utf8');
const currentDesign = fs.readFileSync(
  new URL('../docs/design/0031-self-development-documentation-authority.md', import.meta.url),
  'utf8',
);

function workboardFixture({
  group = 'Group F — Cloudflare runtime and local Agent topology',
  branch = 'group/f-cloudflare-runtime',
  designId = 'D0031',
  revision = 2,
  status = 'accepted',
} = {}) {
  return [
    '# WORKBOARD',
    '',
    '## Current routing',
    '',
    `- Active cumulative Group: ${group}`,
    `- Active cumulative branch: \`${branch}\``,
    `- Current self-development Design: ${designId} revision ${revision} — \`docs/design/0031-self-development-documentation-authority.md\`, \`${status}\`; fixture`,
    '',
  ].join('\n');
}

function designFixture({ id = '0031', revision = 2, status = 'accepted' } = {}) {
  return [
    `# Design ${id} — Fixture`,
    '',
    `- Status: \`${status}\``,
    `- Revision: ${revision}`,
    '- Class: 2',
    '',
  ].join('\n');
}

test('current repository documentation authority validates', () => {
  const result = validateDocumentation(new URL('..', import.meta.url).pathname);
  assert.equal(result.ok, true, result.failures?.join('\n'));
  assert.equal(result.route.branch, 'group/f-cloudflare-runtime');
  assert.equal(result.route.design.id, 'D0031');
  assert.equal(result.route.design.revision, 2);
});

test('stale handoff claims cannot override repository routing', () => {
  const rebound = rebindContinuity({
    workboardText: currentWorkboard,
    designText: currentDesign,
    continuity: {
      branch: 'mvp-1a-7',
      group: 'Group E — context delivery',
      designId: 'D0019',
      designRevision: 0,
      designStatus: 'draft',
    },
  });
  assert.equal(rebound.current.branch, 'group/f-cloudflare-runtime');
  assert.equal(rebound.current.design.id, 'D0031');
  assert.equal(rebound.current.design.revision, 2);
  assert.deepEqual(rebound.staleClaims, ['branch', 'group', 'designId', 'designRevision', 'designStatus']);
});

test('F to G route transition is rebound from WORKBOARD alone', () => {
  const stableInputs = {
    agents: fs.readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8'),
    rule: fs.readFileSync(new URL('../RULE.md', import.meta.url), 'utf8'),
    workflow: fs.readFileSync(new URL('../docs/development/WORKFLOW.md', import.meta.url), 'utf8'),
    lineage: fs.readFileSync(new URL('../LINEAGE.md', import.meta.url), 'utf8'),
  };
  const f = parseWorkboardRouting(workboardFixture());
  const g = parseWorkboardRouting(workboardFixture({
    group: 'Group G — MCP, authentication and security',
    branch: 'group/g-mcp-security',
  }));
  assert.equal(f.groupId, 'F');
  assert.equal(f.branch, 'group/f-cloudflare-runtime');
  assert.equal(g.groupId, 'G');
  assert.equal(g.branch, 'group/g-mcp-security');
  assert.deepEqual(stableInputs, stableInputs);
  for (const text of [stableInputs.agents, stableInputs.rule, stableInputs.workflow]) {
    assert.equal(text.includes('group/f-cloudflare-runtime'), false);
    assert.equal(text.includes('group/g-mcp-security'), false);
  }
});

test('new Design revision invalidates a stale carried revision without changing the Design ID', () => {
  const workboard = workboardFixture({ revision: 3 });
  const design = designFixture({ revision: 3 });
  const rebound = rebindContinuity({
    workboardText: workboard,
    designText: design,
    continuity: { designId: 'D0031', designRevision: 2, designStatus: 'accepted' },
  });
  assert.equal(rebound.current.design.id, 'D0031');
  assert.equal(rebound.current.design.revision, 3);
  assert.deepEqual(rebound.staleClaims, ['designRevision']);
});

test('WORKBOARD and Design owner mismatch fails closed', () => {
  assert.throws(
    () => rebindContinuity({
      workboardText: workboardFixture({ revision: 2 }),
      designText: designFixture({ revision: 1 }),
    }),
    /documentation_authority_design_revision_mismatch/,
  );
  assert.throws(
    () => rebindContinuity({
      workboardText: workboardFixture({ status: 'reopened' }),
      designText: designFixture({ status: 'accepted' }),
    }),
    /documentation_authority_design_status_mismatch/,
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
  const legacy = '# Design 0018 — Legacy\n\n- Status: `verified`\n- Class: 2\n';
  assert.deepEqual(parseDesignMetadata(legacy), {
    id: 'D0018',
    status: 'verified',
    revision: 1,
    explicitRevision: false,
  });
});
