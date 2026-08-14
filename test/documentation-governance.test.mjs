import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { renderDesignIndex } from '../tools/generate-design-index.mjs';
import {
  parseDesignMetadata,
  parseHistoricalQualificationPairs,
  parseProgramGates,
  parseQualificationOwner,
  parseQualificationPairs,
  parseRoadmapGroups,
  parseSourceGateCommands,
  parseWorkboardRouting,
  rebindContinuity,
  validateDocumentation,
} from '../tools/validate-documentation.mjs';

const root = new URL('..', import.meta.url).pathname;
const currentWorkboard = fs.readFileSync(new URL('../WORKBOARD.md', import.meta.url), 'utf8');
const currentDocumentation = fs.readFileSync(new URL('../docs/DOCUMENTATION.md', import.meta.url), 'utf8');
const currentQualification = fs.readFileSync(new URL('../docs/QUALIFICATION.md', import.meta.url), 'utf8');
const currentMvpHistory = fs.readFileSync(new URL('../docs/history/mvp-verification-and-evidence.md', import.meta.url), 'utf8');
const currentAgents = fs.readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
const currentReadme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const currentRoadmap = fs.readFileSync(new URL('../docs/ROADMAP.md', import.meta.url), 'utf8');
const currentProgram = fs.readFileSync(new URL('../docs/development/PROGRAM.md', import.meta.url), 'utf8');
const currentDeployment = fs.readFileSync(new URL('../docs/DEPLOYMENT.md', import.meta.url), 'utf8');
const currentDesignTexts = Object.fromEntries([
  'docs/design/0031-self-development-documentation-authority.md',
  'docs/design/0032-qualification-authority-recomposition.md',
  'docs/design/0033-program-roadmap-authority-recomposition.md',
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

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

test('current repository documentation authority validates during accepted D0033 recomposition', () => {
  const result = validateDocumentation(root);
  assert.equal(result.ok, true, result.failures?.join('\n'));
  assert.equal(result.route.branch, 'group/f-cloudflare-runtime');
  assert.equal(result.qualificationOwner, 'docs/QUALIFICATION.md');
  assert.deepEqual(result.route.frontier.map((item) => `${item.id}@r${item.revision}`), ['D0019@r2', 'D0030@r1', 'D0033@r1']);
  assert.equal(`${result.route.selected.id}@r${result.route.selected.revision}`, 'D0033@r1');
  assert.deepEqual(result.roadmapGroups.map(({ group }) => group), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  assert.ok(result.programGates.length > 0);
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
  const relativePath = 'docs/design/0031-self-development-documentation-authority.md';
  const reopened = currentDesignTexts[relativePath].replace('- Status: `verified`', '- Status: `reopened`');
  const result = validateDocumentation(root, {
    'WORKBOARD.md': workboardFixture({ frontier: [{ id: 'D0031', revision: 2, path: relativePath }], selected: { id: 'D0031', revision: 2 } }),
    [relativePath]: reopened,
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
      branch: 'mvp-1a-7', group: 'Group E — context delivery', designId: 'D0019', designRevision: 1,
      designStatus: 'verified', qualificationOwner: 'docs/MVP.md',
    },
  });
  assert.equal(rebound.current.qualificationOwner, 'docs/QUALIFICATION.md');
  assert.deepEqual(rebound.staleClaims, ['branch', 'group', 'designRevision', 'designStatus', 'qualificationOwner']);
});

test('source gate is parsed from QUALIFICATION and duplicated nowhere in bootstrap navigation', () => {
  const commands = parseSourceGateCommands(currentQualification);
  assert.ok(commands.length > 0);
  assert.equal(new Set(commands).size, commands.length);
  for (const command of commands) {
    assert.equal(currentAgents.includes(command), false);
    assert.equal(currentReadme.includes(command), false);
  }
});

test('generic validation follows an evolved source-gate owner instead of a hard-coded command list', () => {
  const commands = parseSourceGateCommands(currentQualification);
  const changed = `${commands[0]} --fixture-evolution`;
  const evolved = currentQualification.replace(commands[0], changed);
  assert.notEqual(evolved, currentQualification);
  const valid = validateDocumentation(root, { 'docs/QUALIFICATION.md': evolved });
  assert.equal(valid.ok, true, valid.failures?.join('\n'));

  const duplicate = validateDocumentation(root, {
    'docs/QUALIFICATION.md': evolved,
    'AGENTS.md': `${currentAgents}\n${changed}\n`,
  });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.failures.join('\n'), /documentation_authority_source_gate_duplicate: AGENTS\.md/);
});

test('duplicate source-gate commands and observed-ledger contamination fail closed', () => {
  const commands = parseSourceGateCommands(currentQualification);
  const duplicateCommand = currentQualification.replace(commands[0], `${commands[0]}\n${commands[0]}`);
  const duplicate = validateDocumentation(root, { 'docs/QUALIFICATION.md': duplicateCommand });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.failures.join('\n'), /documentation_authority_qualification_source_gate_duplicate/);

  const ledger = validateDocumentation(root, { 'docs/QUALIFICATION.md': `${currentQualification}\n| Observed evidence | historical pass |\n` });
  assert.equal(ledger.ok, false);
  assert.match(ledger.failures.join('\n'), /documentation_authority_qualification_observed_ledger/);
});

test('D0032 historical method snapshot remains preserved without becoming a perpetual current co-owner', () => {
  const historical = parseHistoricalQualificationPairs(currentMvpHistory);
  assert.equal(historical.length, 78);
  const current = parseQualificationPairs(currentQualification);
  assert.ok(current.length > 0);

  const [area, falsifier] = current[0];
  const evolved = currentQualification.replace(`| ${area} | ${falsifier} |`, `| ${area} | fixture evolved falsifier under a future accepted owner |`);
  assert.notEqual(evolved, currentQualification);
  const result = validateDocumentation(root, { 'docs/QUALIFICATION.md': evolved });
  assert.equal(result.ok, true, result.failures?.join('\n'));
});

test('duplicate current qualification method areas fail closed structurally', () => {
  const pairs = parseQualificationPairs(currentQualification);
  assert.ok(pairs.length >= 2);
  const [firstArea] = pairs[0];
  const [secondArea, secondFalsifier] = pairs[1];
  const duplicateArea = currentQualification.replace(
    `| ${secondArea} | ${secondFalsifier} |`,
    `| ${firstArea} | ${secondFalsifier} |`,
  );
  assert.notEqual(duplicateArea, currentQualification);
  const result = validateDocumentation(root, { 'docs/QUALIFICATION.md': duplicateArea });
  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /documentation_authority_qualification_method_area_duplicate/);
});

test('retired live MVP path and missing qualification owner fail closed', () => {
  const duplicate = validateDocumentation(root, { 'docs/MVP.md': '# resurrected live owner\n' });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.failures.join('\n'), /documentation_authority_retired_live_path: docs\/MVP\.md/);

  const missing = validateDocumentation(root, { 'docs/QUALIFICATION.md': null });
  assert.equal(missing.ok, false);
  assert.match(missing.failures.join('\n'), /documentation_authority_missing_qualification/);
});

test('ROADMAP is the one complete A-H capability/exit owner with no Design or commit ledger', () => {
  assert.deepEqual(parseRoadmapGroups(currentRoadmap).map(({ group }) => group), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  assert.doesNotMatch(currentRoadmap, /\bD\d{4}(?:@r\d+)?\b/);
  assert.doesNotMatch(currentRoadmap, /\b[0-9a-f]{40}\b/i);

  const invalid = validateDocumentation(root, { 'docs/ROADMAP.md': currentRoadmap.replace('| H |', '| Z |') });
  assert.equal(invalid.ok, false);
  assert.match(invalid.failures.join('\n'), /documentation_authority_roadmap_group_id|documentation_authority_roadmap_group_set/);
});

test('PROGRAM references only ROADMAP Groups and does not duplicate the A-H capability table', () => {
  const groups = new Set(parseRoadmapGroups(currentRoadmap).map(({ group }) => group));
  const gates = parseProgramGates(currentProgram);
  assert.ok(gates.length > 0);
  for (const gate of gates) for (const group of gate.groups) assert.ok(groups.has(group), `${gate.gate} -> ${group}`);
  assert.equal(currentProgram.split('\n').some((line) => /^\|\s*[A-H]\s*\|/.test(line)), false);

  const invalid = validateDocumentation(root, { 'docs/development/PROGRAM.md': currentProgram.replace('| D0020 | F |', '| D0020 | Z |') });
  assert.equal(invalid.ok, false);
  assert.match(invalid.failures.join('\n'), /documentation_authority_program_unknown_group: D0020 -> Z/);
});

test('maintained PROGRAM Design foreign keys resolve generically to Design owner identity and revision', () => {
  const maintained = parseProgramGates(currentProgram).filter(({ kind }) => kind === 'maintained');
  assert.ok(maintained.length > 0);
  for (const gate of maintained) {
    const design = parseDesignMetadata(fs.readFileSync(new URL(`../${gate.path}`, import.meta.url), 'utf8'));
    assert.equal(design.id, gate.id);
    assert.equal(design.revision, gate.revision);
  }

  const first = maintained[0];
  const invalidProgram = currentProgram.replace(`| ${first.gate} |`, `| ${first.id}@r${first.revision + 99} |`);
  const invalid = validateDocumentation(root, { 'docs/development/PROGRAM.md': invalidProgram });
  assert.equal(invalid.ok, false);
  assert.match(invalid.failures.join('\n'), /documentation_authority_program_design_revision_mismatch/);
});

test('provisional PROGRAM labels remain explicitly non-authorizing', () => {
  const provisional = parseProgramGates(currentProgram).filter(({ kind }) => kind === 'provisional');
  assert.ok(provisional.length > 0);
  assert.ok(provisional.every(({ revision, path }) => revision === null && path === null));

  const first = provisional[0];
  const invalidProgram = currentProgram.replace(
    `| ${first.gate} | ${first.groups.join('/')} | provisional label |`,
    `| ${first.gate} | ${first.groups.join('/')} | maintained Design foreign key: \`docs/design/fake.md\` |`,
  );
  const invalid = validateDocumentation(root, { 'docs/development/PROGRAM.md': invalidProgram });
  assert.equal(invalid.ok, false);
  assert.match(invalid.failures.join('\n'), /documentation_authority_program_provisional_authority/);
});

test('PROGRAM status/commit ledgers and duplicated capability rows fail closed', () => {
  const status = validateDocumentation(root, { 'docs/development/PROGRAM.md': `${currentProgram}\n| Status | stale |\n` });
  assert.equal(status.ok, false);
  assert.match(status.failures.join('\n'), /documentation_authority_program_status_ledger/);

  const commit = validateDocumentation(root, { 'docs/development/PROGRAM.md': `${currentProgram}\n${'a'.repeat(40)}\n` });
  assert.equal(commit.ok, false);
  assert.match(commit.failures.join('\n'), /documentation_authority_program_commit_ledger/);

  const groupRow = validateDocumentation(root, { 'docs/development/PROGRAM.md': `${currentProgram}\n| A | duplicate | duplicate |\n` });
  assert.equal(groupRow.ok, false);
  assert.match(groupRow.failures.join('\n'), /documentation_authority_program_capability_table_duplicate/);
});

test('README stays current-neutral and cannot reintroduce a stale route or source-gate copy', () => {
  assert.doesNotMatch(currentReadme, /mvp-1a-7|latest verified production-source layer|active development identity/i);
  const stale = validateDocumentation(root, { 'README.md': `${currentReadme}\ngroup/f-cloudflare-runtime\n` });
  assert.equal(stale.ok, false);
  assert.match(stale.failures.join('\n'), /documentation_authority_stable_route_literal: README\.md/);

  const command = parseSourceGateCommands(currentQualification)[0];
  const duplicated = validateDocumentation(root, { 'README.md': `${currentReadme}\n${command}\n` });
  assert.equal(duplicated.ok, false);
  assert.match(duplicated.failures.join('\n'), /documentation_authority_source_gate_duplicate: README\.md/);
});

test('mutable current gaps cannot be reassigned to stable ROADMAP by QUALIFICATION prose', () => {
  const stale = currentQualification.replace(
    'Mutable current gaps belong in `WORKBOARD.md` or the responsible Design/product owner',
    'Mutable current gaps belong in `WORKBOARD.md`, `docs/ROADMAP.md` or the responsible Design/product owner',
  );
  assert.notEqual(stale, currentQualification);
  const result = validateDocumentation(root, { 'docs/QUALIFICATION.md': stale });
  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /documentation_authority_qualification_mutable_roadmap_gap/);
});

test('DEPLOYMENT does not become a second current route, source-gate or Design-status ledger', () => {
  assert.doesNotMatch(currentDeployment, /mvp-1a-7|D\d{4}\s+is accepted only at the Design\/qualification layer here/i);
  for (const command of parseSourceGateCommands(currentQualification)) assert.equal(currentDeployment.includes(command), false);
  assert.match(currentDeployment, /These evidence levels classify claims; they are not a second current-status ledger\./);

  const command = parseSourceGateCommands(currentQualification)[0];
  const duplicated = validateDocumentation(root, { 'docs/DEPLOYMENT.md': `${currentDeployment}\n${command}\n` });
  assert.equal(duplicated.ok, false);
  assert.match(duplicated.failures.join('\n'), /documentation_authority_deployment_source_gate_duplicate/);

  const staleRoute = validateDocumentation(root, { 'docs/DEPLOYMENT.md': `${currentDeployment}\nmvp-1a-7\n` });
  assert.equal(staleRoute.ok, false);
  assert.match(staleRoute.failures.join('\n'), /documentation_authority_deployment_legacy_route_contract/);
});

test('stable product owners do not retain retired qualification paths or mutable implementation-status ledgers', () => {
  const productPaths = [
    'docs/SPEC.md', 'docs/ARCHITECTURE.md', 'docs/PROTOCOL.md', 'docs/OPERATIONS.md',
    'docs/SECURITY.md', 'docs/DEPLOYMENT.md', 'docs/MCP.md',
  ];
  const stalePattern = /(?:currently verified source slice|not implemented or verified at this Design-acceptance checkpoint|C1-C4 production repair remains open|current production source does not yet implement|current production source still uses|current src\/store\.mjs|repairs are accepted but not yet production-implemented|production-implemented and independently verified on the declared supported-Termux|adapter has not yet been implemented, deployed or load-tested|no MCP server or current-client qualification is implemented in the current source slice|It is verified with real bare|The accepted C1-C4 repair adds|at the D\d{4} acceptance checkpoint[^.]*src\/store\.mjs)/i;
  for (const relativePath of productPaths) {
    const text = fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /(?:docs\/)?MVP\.md/, relativePath);
    assert.doesNotMatch(text, stalePattern, relativePath);
    for (const command of parseSourceGateCommands(currentQualification)) assert.equal(text.includes(command), false, `${relativePath} duplicates ${command}`);
  }

  const staleMvp = fs.readFileSync(new URL('../docs/SPEC.md', import.meta.url), 'utf8') + '\nMVP.md\n';
  const mvpResult = validateDocumentation(root, { 'docs/SPEC.md': staleMvp });
  assert.equal(mvpResult.ok, false);
  assert.match(mvpResult.failures.join('\n'), /documentation_authority_product_retired_mvp_pointer: docs\/SPEC\.md/);

  const staleStatus = fs.readFileSync(new URL('../docs/OPERATIONS.md', import.meta.url), 'utf8') + '\nThese D0018 repairs are accepted but not yet production-implemented.\n';
  const statusResult = validateDocumentation(root, { 'docs/OPERATIONS.md': staleStatus });
  assert.equal(statusResult.ok, false);
  assert.match(statusResult.failures.join('\n'), /documentation_authority_product_mutable_status_ledger: docs\/OPERATIONS\.md/);
});

test('pre-D0033 live planning/navigation and deployment-ledger snapshots remain byte-identical historical evidence', () => {
  const expected = new Map([
    ['../docs/history/readme-before-d0033.md', '105e8c2e88e23eb7641cd1f4c48353ecb3338e465d9eadf145f7038e41094bc6'],
    ['../docs/history/roadmap-before-d0033.md', '60f7d265423d1262293d760853dc7ac92d61e71f3298bc8b2801017289f7d734'],
    ['../docs/history/program-before-d0033.md', '1c45524ea71f73b2a89bd461a5e2503846f8f06fb42a955a2f7b87ee725abce6'],
    ['../docs/history/deployment-before-d0033-owner-cleanup.md', '9092b55d239baf8e245501eaea9c5c43a2134adc80540271b0562b931ea46456'],
  ]);
  for (const [relativePath, digest] of expected) {
    assert.equal(sha256(fs.readFileSync(new URL(relativePath, import.meta.url))), digest, relativePath);
  }
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
