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
  resolvePublishedAuthority,
  validateDocumentation,
  validateMaintainedDesignSingleValue,
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
const currentD0018 = fs.readFileSync(new URL('../docs/design/0018-adversarial-converged-model-runtime-boundary.md', import.meta.url), 'utf8');
const currentDesignTexts = Object.fromEntries([
  'docs/design/0031-self-development-documentation-authority.md',
  'docs/design/0032-qualification-authority-recomposition.md',
  'docs/design/0033-program-roadmap-authority-recomposition.md',
  'docs/design/0034-product-contract-evidence-history-recomposition.md',
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

function authorityWorkboardFixture({ repository = 'humtr/tdev', branch, predecessor = null } = {}) {
  return [
    '# WORKBOARD', '', '## Current routing', '',
    `- Repository: \`${repository}\``,
    `- Active cumulative branch: \`${branch}\``,
    ...(predecessor ? [`- Immediate completed predecessor: \`${predecessor.ref}@${predecessor.sha}\`, checkpoint \`fixture\``] : []),
    '',
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

test('current repository documentation authority validates with D0030 D0032 r2 implementing and D0033 r2 accepted', () => {
  const result = validateDocumentation(root);
  assert.equal(result.ok, true, result.failures?.join('\n'));
  assert.equal(result.route.branch, 'group/f-cloudflare-runtime');
  assert.equal(result.qualificationOwner, 'docs/QUALIFICATION.md');
  const frontier = result.route.frontier.map((item) => `${item.id}@r${item.revision}`);
  assert.ok(!frontier.includes('D0019@r2'));
  assert.ok(frontier.includes('D0030@r2'));
  assert.ok(frontier.includes('D0032@r2'));
  assert.ok(frontier.includes('D0033@r2'));
  assert.match(currentDesignTexts['docs/design/0019-casedo-authority-adapter.md'], /^- Status: `verified`$/m);
  assert.match(currentDesignTexts['docs/design/0030-immutable-journal-publication-portability.md'], /^- Status: `implementing`$/m);
  assert.match(currentDesignTexts['docs/design/0031-self-development-documentation-authority.md'], /^- Status: `verified`$/m);
  assert.match(currentDesignTexts['docs/design/0032-qualification-authority-recomposition.md'], /^- Status: `implementing`$/m);
  assert.match(currentDesignTexts['docs/design/0033-program-roadmap-authority-recomposition.md'], /^- Status: `accepted`$/m);
  if (result.route.selected !== null) {
    assert.ok(frontier.includes(`${result.route.selected.id}@r${result.route.selected.revision}`));
  }
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
    'WORKBOARD.md': workboardFixture({ group: 'Group G — MCP, authentication and security', branch: 'group/g-mcp-security', frontier: [], selected: null }),
  });
  assert.equal(result.ok, true, result.failures?.join('\n'));
  assert.equal(result.route.groupId, 'G');
  assert.equal(result.route.branch, 'group/g-mcp-security');
});

test('a reopened frontier Design fails closed', () => {
  const relativePath = 'docs/design/0031-self-development-documentation-authority.md';
  const currentRevision = parseDesignMetadata(currentDesignTexts[relativePath]).revision;
  const reopened = currentDesignTexts[relativePath].replace(/^- Status: `[^`]+`$/m, '- Status: `reopened`');
  const result = validateDocumentation(root, {
    'WORKBOARD.md': workboardFixture({ frontier: [{ id: 'D0031', revision: currentRevision, path: relativePath }], selected: { id: 'D0031', revision: currentRevision } }),
    [relativePath]: reopened,
  });
  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), new RegExp(`documentation_authority_frontier_design_not_runnable: D0031@r${currentRevision} reopened`));
});

test('stale continuity cannot override a zero-frontier current route', () => {
  const rebound = rebindContinuity({
    workboardText: currentWorkboard,
    designTexts: currentDesignTexts,
    continuity: { branch: 'mvp-1a-7', group: 'Group E — context delivery', designId: 'D0019', designRevision: 1, designStatus: 'verified' },
  });
  assert.equal(rebound.current.branch, 'group/f-cloudflare-runtime');
  assert.deepEqual(rebound.staleClaims, ['branch', 'group', 'designId']);
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

test('authority location chooses the unique published successor over a coherent predecessor/default', () => {
  const predecessorSha = '1'.repeat(40);
  const currentSha = '2'.repeat(40);
  const predecessorRef = 'group/predecessor';
  const currentRef = 'group/current';
  const result = resolvePublishedAuthority({
    repository: 'humtr/tdev',
    candidates: [
      { ref: predecessorRef, sha: predecessorSha, workboardText: authorityWorkboardFixture({ branch: predecessorRef }) },
      { ref: currentRef, sha: currentSha, workboardText: authorityWorkboardFixture({ branch: currentRef, predecessor: { ref: predecessorRef, sha: predecessorSha } }) },
    ],
    isAncestor: (ancestor, descendant) => ancestor === predecessorSha && descendant === currentSha,
  });
  assert.deepEqual(result, { repository: 'humtr/tdev', ref: currentRef, sha: currentSha });
});

test('concept refs are conception provenance and never authority-location candidates', () => {
  const currentRef = 'group/f-cloudflare-runtime';
  const currentSha = '1'.repeat(40);
  const selfDeclaringConcept = {
    ref: 'concept-1a-7',
    sha: '2'.repeat(40),
    workboardText: authorityWorkboardFixture({ branch: 'concept-1a-7' }),
  };
  const legacySchemaConcept = {
    ref: 'concept-1a-6',
    sha: '3'.repeat(40),
    workboardText: '# WORKBOARD\n\n- Development identity / publication ref: `concept-1a-6`\n',
  };
  const current = {
    ref: currentRef,
    sha: currentSha,
    workboardText: authorityWorkboardFixture({ branch: currentRef }),
  };
  assert.deepEqual(resolvePublishedAuthority({
    repository: 'humtr/tdev',
    candidates: [selfDeclaringConcept, legacySchemaConcept, current],
    isAncestor: () => false,
  }), { repository: 'humtr/tdev', ref: currentRef, sha: currentSha });
  assert.throws(() => resolvePublishedAuthority({
    repository: 'humtr/tdev',
    candidates: [selfDeclaringConcept, legacySchemaConcept],
    isAncestor: () => false,
  }), /documentation_authority_locator_no_eligible_candidate/);
});

test('legacy non-current WORKBOARD schemas are ignored before current-only predecessor parsing', () => {
  const predecessorSha = '1'.repeat(40);
  const currentSha = '2'.repeat(40);
  const predecessorRef = 'group/e-context-delivery';
  const currentRef = 'group/f-cloudflare-runtime';
  const legacy = {
    ref: 'legacy/research',
    sha: '3'.repeat(40),
    workboardText: '# WORKBOARD\n\n- Development identity / publication ref: `legacy/research`\n',
  };
  const predecessor = { ref: predecessorRef, sha: predecessorSha, workboardText: authorityWorkboardFixture({ branch: predecessorRef }) };
  const current = {
    ref: currentRef,
    sha: currentSha,
    workboardText: authorityWorkboardFixture({ branch: currentRef, predecessor: { ref: predecessorRef, sha: predecessorSha } }),
  };
  assert.deepEqual(resolvePublishedAuthority({
    repository: 'humtr/tdev',
    candidates: [legacy, predecessor, current],
    isAncestor: (ancestor, descendant) => ancestor === predecessorSha && descendant === currentSha,
  }), { repository: 'humtr/tdev', ref: currentRef, sha: currentSha });
});

test('a malformed declared immediate predecessor fails authority location closed', () => {
  const currentRef = 'group/f-cloudflare-runtime';
  const malformed = [
    '# WORKBOARD', '', '## Current routing', '',
    '- Repository: `humtr/tdev`',
    `- Active cumulative branch: \`${currentRef}\``,
    '- Immediate completed predecessor: `group/e-context-delivery@NOT-A-SHA`, checkpoint `broken`',
    '',
  ].join('\n');
  assert.throws(() => resolvePublishedAuthority({
    repository: 'humtr/tdev',
    candidates: [{ ref: currentRef, sha: '2'.repeat(40), workboardText: malformed }],
    isAncestor: () => false,
  }), /documentation_authority_locator_predecessor_malformed/);
});

test('duplicate immediate predecessor declarations fail authority location closed', () => {
  const currentRef = 'group/f-cloudflare-runtime';
  const predecessor = { ref: 'group/e-context-delivery', sha: '1'.repeat(40) };
  const duplicated = authorityWorkboardFixture({ branch: currentRef, predecessor }) +
    `- Immediate completed predecessor: \`${predecessor.ref}@${predecessor.sha}\`, checkpoint \`duplicate\`\n`;
  assert.throws(() => resolvePublishedAuthority({
    repository: 'humtr/tdev',
    candidates: [{ ref: currentRef, sha: '2'.repeat(40), workboardText: duplicated }],
    isAncestor: () => true,
  }), /documentation_authority_locator_predecessor/);
});

test('successor ref existence without its own election cannot advance authority', () => {
  const currentSha = '2'.repeat(40);
  const unelectedSha = '3'.repeat(40);
  const currentRef = 'group/current';
  const currentWorkboard = authorityWorkboardFixture({ branch: currentRef });
  const result = resolvePublishedAuthority({
    repository: 'humtr/tdev',
    candidates: [
      { ref: currentRef, sha: currentSha, workboardText: currentWorkboard },
      { ref: 'group/unelected-successor', sha: unelectedSha, workboardText: currentWorkboard },
    ],
    isAncestor: () => false,
  });
  assert.deepEqual(result, { repository: 'humtr/tdev', ref: currentRef, sha: currentSha });
});

test('local-only successor state cannot advance published authority', () => {
  const currentSha = '2'.repeat(40);
  const currentRef = 'group/current';
  const localOnly = { ref: 'group/local-only', sha: '3'.repeat(40), workboardText: authorityWorkboardFixture({ branch: 'group/local-only' }) };
  const publishedCandidates = [{ ref: currentRef, sha: currentSha, workboardText: authorityWorkboardFixture({ branch: currentRef }) }];
  assert.equal(publishedCandidates.includes(localOnly), false);
  assert.deepEqual(resolvePublishedAuthority({ repository: 'humtr/tdev', candidates: publishedCandidates, isAncestor: () => false }), {
    repository: 'humtr/tdev', ref: currentRef, sha: currentSha,
  });
});

test('authority location fails closed on competing elected successors or predecessor mismatch', () => {
  const predecessorSha = '1'.repeat(40);
  const predecessorRef = 'group/predecessor';
  const left = { ref: 'group/left', sha: '2'.repeat(40) };
  const right = { ref: 'group/right', sha: '3'.repeat(40) };
  const base = { ref: predecessorRef, sha: predecessorSha, workboardText: authorityWorkboardFixture({ branch: predecessorRef }) };
  const descendants = [left, right].map((candidate) => ({
    ...candidate,
    workboardText: authorityWorkboardFixture({ branch: candidate.ref, predecessor: { ref: predecessorRef, sha: predecessorSha } }),
  }));
  assert.throws(() => resolvePublishedAuthority({
    repository: 'humtr/tdev', candidates: [base, ...descendants], isAncestor: (ancestor) => ancestor === predecessorSha,
  }), /documentation_authority_locator_ambiguous_maxima/);

  const wrongPredecessor = authorityWorkboardFixture({ branch: left.ref, predecessor: { ref: predecessorRef, sha: '4'.repeat(40) } });
  assert.throws(() => resolvePublishedAuthority({
    repository: 'humtr/tdev', candidates: [base, { ...left, workboardText: wrongPredecessor }], isAncestor: () => true,
  }), /documentation_authority_locator_predecessor_identity_conflict/);
});

test('maintained Design current lifecycle assertions fail independent of heading spelling', () => {
  const contradictory = `${designFixture({ id: '0099', status: 'verified' })}\n## Readiness\n\nCurrent lifecycle status is draft.\n`;
  assert.throws(
    () => validateMaintainedDesignSingleValue(contradictory, 'fixture'),
    /documentation_authority_design_current_status_prose/,
  );
  const direct = `${designFixture({ id: '0099', status: 'verified' })}\n## Notes\n\nD0099 is currently accepted.\n`;
  assert.throws(
    () => validateMaintainedDesignSingleValue(direct, 'fixture'),
    /documentation_authority_design_current_status_prose/,
  );
  const historical = `${designFixture({ id: '0099', status: 'verified' })}\n## Historical readiness — as of revision 1\n\nCurrent lifecycle status is draft.\n`;
  assert.equal(validateMaintainedDesignSingleValue(historical, 'fixture'), true);
});

test('maintained Design status snapshots must be explicitly historical/as-of', () => {
  const contradictory = `${designFixture({ id: '0099', status: 'verified' })}\n## Status vocabulary\n\n- production implemented: **no**\n`;
  assert.throws(() => validateMaintainedDesignSingleValue(contradictory, 'fixture'), /documentation_authority_design_current_status_snapshot/);

  const historical = `${designFixture({ id: '0099', status: 'verified' })}\n## Historical status snapshot — as of predecessor acceptance\n\n- production implemented at that checkpoint: **no**\n`;
  assert.doesNotThrow(() => validateMaintainedDesignSingleValue(historical, 'fixture'));

  const d0018Shaped = currentD0018.replace(
    '## 21. Historical status vocabulary — as of D0018 acceptance before production repair',
    '## 21. Status vocabulary',
  );
  const result = validateDocumentation(root, { 'docs/design/0018-adversarial-converged-model-runtime-boundary.md': d0018Shaped });
  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /documentation_authority_design_current_status_snapshot: docs\/design\/0018-/);
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
  assert.deepEqual(rebound.staleClaims, ['branch', 'group', 'designId', 'qualificationOwner']);
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

test('QUALIFICATION rejects mutable current result/evidence ledgers generically', () => {
  const exact = validateDocumentation(root, {
    'docs/QUALIFICATION.md': `${currentQualification}\nThe most recent source gate passed 375 tests.\n`,
  });
  assert.equal(exact.ok, false);
  assert.match(exact.failures.join('\n'), /documentation_authority_qualification_current_result_ledger/);

  const variant = validateDocumentation(root, {
    'docs/QUALIFICATION.md': `${currentQualification}\nCurrent evidence: 376\/376 tests passed.\n`,
  });
  assert.equal(variant.ok, false);
  assert.match(variant.failures.join('\n'), /documentation_authority_qualification_current_result_ledger/);

  const historical = validateDocumentation(root, {
    'docs/QUALIFICATION.md': `${currentQualification}\nPrevious source gate passed 375 tests; this is historical evidence only.\n`,
  });
  assert.equal(historical.ok, true, historical.failures?.join('\n'));

  const normative = validateDocumentation(root, {
    'docs/QUALIFICATION.md': `${currentQualification}\nCurrent evidence must be stored in bounded evidence records rather than this method owner.\n`,
  });
  assert.equal(normative.ok, true, normative.failures?.join('\n'));
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
  assert.match(currentDeployment, /`QUALIFICATION\.md` owns proof-layer classification/);

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
    assert.doesNotMatch(text, /\b[0-9a-f]{40}\b/i, relativePath);
    assert.doesNotMatch(text, /^#{2,4}\s+.*(?:Verified|Measured|Benchmark|Current .*?(?:boundary|status|state|slice))/mi, relativePath);
    assert.doesNotMatch(text, /\b\d+\/\d+\b[^\n]*(?:pass|passed|fail|failed|sample|samples|race|races)/i, relativePath);
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

  const evidenceHeading = validateDocumentation(root, { 'docs/ARCHITECTURE.md': `${fs.readFileSync(new URL('../docs/ARCHITECTURE.md', import.meta.url), 'utf8')}\n## Verified fixture boundary\n` });
  assert.equal(evidenceHeading.ok, false);
  assert.match(evidenceHeading.failures.join('\n'), /documentation_authority_product_evidence_heading: docs\/ARCHITECTURE\.md/);

  const resultLedger = validateDocumentation(root, { 'docs/SECURITY.md': `${fs.readFileSync(new URL('../docs/SECURITY.md', import.meta.url), 'utf8')}\n26\/26 passed fixture\n` });
  assert.equal(resultLedger.ok, false);
  assert.match(resultLedger.failures.join('\n'), /documentation_authority_product_result_ledger: docs\/SECURITY\.md/);

  const commitLedger = validateDocumentation(root, { 'docs/SPEC.md': `${fs.readFileSync(new URL('../docs/SPEC.md', import.meta.url), 'utf8')}\n${'a'.repeat(40)}\n` });
  assert.equal(commitLedger.ok, false);
  assert.match(commitLedger.failures.join('\n'), /documentation_authority_product_commit_ledger: docs\/SPEC\.md/);
});

test('pre-D0034 product-owner snapshots remain byte-identical historical evidence', () => {
  const expected = new Map([
    ['../docs/history/spec-before-d0034.md', 'a7435307b5183bd44ff185009dd2b063398b909feac189d319c192f3c8756262'],
    ['../docs/history/architecture-before-d0034.md', '3f62bdda39268568139811b0eff818de3fdf384052bea6a9a6fc85de4438e184'],
    ['../docs/history/protocol-before-d0034.md', '2e67baa96f6322832510df5e887971396bf955e6c43c3c21dafc070fec512386'],
    ['../docs/history/operations-before-d0034.md', '170c32dc343d9f722c5ee0894275c0a8791bb77a06c9ffeb9a0b631827da4c90'],
    ['../docs/history/security-before-d0034.md', '193780943518521302d1948d37944f0ac342049c47626b0a600bb5380d2f8b09'],
    ['../docs/history/deployment-before-d0034.md', '9b8a73284ddd258ec5ab0b46520d53cee6b0e1ed2d95d2b00ec436940c63d327'],
    ['../docs/history/mcp-before-d0034.md', '566d6cebd1ba1032fde23dd1ff588560bc9757d2d7541606c662d9bb4e026168'],
  ]);
  for (const [relativePath, digest] of expected) assert.equal(sha256(fs.readFileSync(new URL(relativePath, import.meta.url))), digest, relativePath);
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

test('governance implementation has no runnable Design ID special cases, including zero frontier', () => {
  const currentIds = parseWorkboardRouting(currentWorkboard).frontier.map((item) => item.id);
  const syntheticIds = parseWorkboardRouting(workboardFixture({
    frontier: [
      { id: 'D0098', revision: 7, path: 'docs/design/0098-fixture.md' },
      { id: 'D0099', revision: 3, path: 'docs/design/0099-fixture.md' },
    ],
    selected: { id: 'D0098', revision: 7 },
  })).frontier.map((item) => item.id);
  assert.deepEqual(syntheticIds, ['D0098', 'D0099']);
  for (const relativePath of ['tools/validate-documentation.mjs', 'tools/generate-design-index.mjs']) {
    const text = fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
    for (const id of [...currentIds, ...syntheticIds]) assert.equal(text.includes(id), false, `${relativePath} hard-codes runnable ${id}`);
  }
});
