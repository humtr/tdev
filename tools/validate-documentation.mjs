import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDesignRecord, renderDesignIndex } from './generate-design-index.mjs';

function singleMatch(text, regex, label) {
  const matches = [...text.matchAll(regex)];
  if (matches.length !== 1) throw new Error(`documentation_authority_${label}: expected exactly one match, found ${matches.length}`);
  return matches[0];
}

function sectionBody(text, heading) {
  const marker = `## ${heading}`;
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`documentation_authority_missing_section: ${heading}`);
  const bodyStart = text.indexOf('\n', start + marker.length);
  const next = text.indexOf('\n## ', bodyStart + 1);
  return text.slice(bodyStart + 1, next < 0 ? text.length : next);
}

function tableRows(text, heading, columns, label) {
  const rows = sectionBody(text, heading).split('\n').filter((line) => line.startsWith('| '));
  if (rows.length < 3) throw new Error(`documentation_authority_${label}: table missing`);
  const data = [];
  for (const line of rows.slice(2)) {
    const cells = line.split('|').slice(1, -1).map((value) => value.trim());
    if (cells.length !== columns) throw new Error(`documentation_authority_${label}: expected ${columns} columns`);
    data.push(cells);
  }
  return data;
}

export function parseHistoricalQualificationPairs(text) {
  return tableRows(text, '3. Acceptance matrix', 3, 'historical_qualification_matrix').map(([area, falsifier]) => [area, falsifier]);
}

export function parseQualificationPairs(text) {
  return tableRows(text, '5. Qualification method catalog', 2, 'qualification_matrix');
}

export function parseSourceGateCommands(text) {
  const body = sectionBody(text, '2. Baseline source qualification gate');
  const matches = [...body.matchAll(/\`\`\`sh\n([\s\S]*?)\n\`\`\`/g)];
  if (matches.length !== 1) throw new Error(`documentation_authority_qualification_source_gate_block: expected one shell block, found ${matches.length}`);
  return matches[0][1].split('\n').map((line) => line.trim()).filter(Boolean);
}

export function parseQualificationOwner(documentationText) {
  return singleMatch(
    documentationText,
    /^\|\s*verification methods, executable source gate and proof-layer boundaries\s*\|\s*`([^`]+)`\s*\|\s*$/gm,
    'qualification_owner',
  )[1];
}

export function parseRoadmapGroups(text) {
  return tableRows(text, '3. Capability Groups', 3, 'roadmap_groups').map(([group, capability, exit]) => {
    if (!/^[A-H]$/.test(group)) throw new Error(`documentation_authority_roadmap_group_id: ${group}`);
    if (!capability || !exit) throw new Error(`documentation_authority_roadmap_group_empty: ${group}`);
    return { group, capability, exit };
  });
}

export function parseProgramGates(text) {
  return tableRows(text, '2. Forward gate register', 7, 'program_gates').map((cells) => {
    const [gate, groupText, authority, depends, conditionality, falsifier, externalAction] = cells;
    const groups = groupText.split('/').map((value) => value.trim()).filter(Boolean);
    if (groups.length === 0) throw new Error(`documentation_authority_program_gate_groups: ${gate}`);
    const maintained = /^(D\d{4})@r(\d+)$/.exec(gate);
    const provisional = /^(D\d{4})$/.exec(gate);
    if (maintained) {
      const owner = /^maintained Design foreign key:\s*`([^`]+)`$/.exec(authority);
      if (!owner) throw new Error(`documentation_authority_program_maintained_authority: ${gate}`);
      return {
        kind: 'maintained', gate, id: maintained[1], revision: Number(maintained[2]), path: owner[1], groups,
        depends, conditionality, falsifier, externalAction,
      };
    }
    if (provisional) {
      if (authority !== 'provisional label') throw new Error(`documentation_authority_program_provisional_authority: ${gate}`);
      return {
        kind: 'provisional', gate, id: provisional[1], revision: null, path: null, groups,
        depends, conditionality, falsifier, externalAction,
      };
    }
    throw new Error(`documentation_authority_program_gate_id: ${gate}`);
  });
}

export function parseWorkboardRouting(text) {
  const group = singleMatch(text, /^- Active cumulative Group:\s*(.+)$/gm, 'active_group')[1].trim();
  const branch = singleMatch(text, /^- Active cumulative branch:\s*`([^`]+)`\s*$/gm, 'active_branch')[1];
  const groupId = /\bGroup\s+([A-Z0-9]+)\b/.exec(group)?.[1];
  if (!groupId) throw new Error('documentation_authority_active_group_id: cannot derive Group ID');

  const frontier = [];
  for (const line of sectionBody(text, 'Runnable frontier').split('\n')) {
    const match = /^- (D\d{4})@r(\d+)\s+—\s+`([^`]+)`\s+—\s+(.+)$/.exec(line);
    if (!match) continue;
    frontier.push({ id: match[1], revision: Number(match[2]), path: match[3], gate: match[4].trim() });
  }
  const seen = new Set();
  for (const item of frontier) {
    if (seen.has(item.id)) throw new Error(`documentation_authority_frontier_duplicate: ${item.id}`);
    seen.add(item.id);
  }

  const selectedLines = sectionBody(text, 'Selected next action').split('\n').filter((line) => /^- (?:none\s*$|D\d{4}@r\d+\s+—\s+)/.test(line));
  if (selectedLines.length !== 1) throw new Error(`documentation_authority_selected_action: expected exactly one selection, found ${selectedLines.length}`);
  let selected = null;
  if (selectedLines[0] !== '- none') {
    const match = /^- (D\d{4})@r(\d+)\s+—\s+(.+)$/.exec(selectedLines[0]);
    if (!match) throw new Error('documentation_authority_selected_action: malformed selection');
    selected = { id: match[1], revision: Number(match[2]), gate: match[3].trim() };
    if (!frontier.some((item) => item.id === selected.id && item.revision === selected.revision)) {
      throw new Error(`documentation_authority_selected_not_frontier: ${selected.id}@r${selected.revision}`);
    }
  }
  return { group, groupId, branch, frontier, selected };
}

function parseAuthorityCandidateWorkboard(text) {
  const repository = singleMatch(text, /^- Repository:\s*`([^`]+)`\s*$/gm, 'locator_repository')[1];
  const branch = singleMatch(text, /^- Active cumulative branch:\s*`([^`]+)`\s*$/gm, 'locator_active_branch')[1];
  const predecessorMatches = [...text.matchAll(/^- Immediate completed predecessor:\s*`([^@`]+)@([0-9a-f]{40})`/gmi)];
  if (predecessorMatches.length > 1) {
    throw new Error(`documentation_authority_locator_predecessor: expected at most one match, found ${predecessorMatches.length}`);
  }
  const predecessor = predecessorMatches.length === 0 ? null : { ref: predecessorMatches[0][1], sha: predecessorMatches[0][2].toLowerCase() };
  return { repository, branch, predecessor };
}

export function resolvePublishedAuthority({ repository, candidates, isAncestor }) {
  if (!repository || !Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('documentation_authority_locator_missing_candidates');
  }
  if (typeof isAncestor !== 'function') throw new Error('documentation_authority_locator_missing_ancestry');

  const byRef = new Map();
  for (const candidate of candidates) {
    if (!candidate || typeof candidate.ref !== 'string' || !/^[0-9a-f]{40}$/i.test(candidate.sha ?? '')) {
      throw new Error('documentation_authority_locator_candidate_identity');
    }
    if (byRef.has(candidate.ref)) throw new Error(`documentation_authority_locator_duplicate_ref: ${candidate.ref}`);
    byRef.set(candidate.ref, { ...candidate, sha: candidate.sha.toLowerCase() });
  }

  const eligible = [];
  for (const candidate of byRef.values()) {
    if (candidate.ref.startsWith('concept-')) continue;
    if (typeof candidate.workboardText !== 'string') continue;
    const declaration = parseAuthorityCandidateWorkboard(candidate.workboardText);
    if (declaration.repository !== repository || declaration.branch !== candidate.ref) continue;
    eligible.push({ ...candidate, declaration });
  }
  if (eligible.length === 0) throw new Error('documentation_authority_locator_no_eligible_candidate');

  const eligibleByRef = new Map(eligible.map((candidate) => [candidate.ref, candidate]));
  const superseded = new Set();
  for (const candidate of eligible) {
    const predecessor = candidate.declaration.predecessor;
    if (!predecessor) continue;
    const observed = byRef.get(predecessor.ref);
    if (!observed || observed.sha !== predecessor.sha) {
      throw new Error(`documentation_authority_locator_predecessor_identity_conflict: ${candidate.ref} -> ${predecessor.ref}@${predecessor.sha}`);
    }
    if (!isAncestor(predecessor.sha, candidate.sha)) {
      throw new Error(`documentation_authority_locator_predecessor_ancestry_conflict: ${candidate.ref} -> ${predecessor.ref}@${predecessor.sha}`);
    }
    const eligiblePredecessor = eligibleByRef.get(predecessor.ref);
    if (eligiblePredecessor && eligiblePredecessor.sha === predecessor.sha) superseded.add(predecessor.ref);
  }

  const maxima = eligible.filter((candidate) => !superseded.has(candidate.ref));
  if (maxima.length !== 1) {
    throw new Error(`documentation_authority_locator_ambiguous_maxima: ${maxima.map(({ ref, sha }) => `${ref}@${sha}`).join(',') || 'none'}`);
  }
  const selected = maxima[0];
  return { repository, ref: selected.ref, sha: selected.sha };
}

export function validateMaintainedDesignSingleValue(text, label = 'Design') {
  const snapshotHeadings = [...text.matchAll(/^##\s+([^\n]*(?:status vocabulary|status snapshot|implementation status|lifecycle status)[^\n]*)$/gmi)];
  for (const match of snapshotHeadings) {
    const heading = match[1].trim();
    if (!/\b(?:historical|as[- ]of|predecessor|prior revision|former)\b/i.test(heading)) {
      throw new Error(`documentation_authority_design_current_status_snapshot: ${label} -> ${heading}`);
    }
  }
  return true;
}

export function parseDesignMetadata(text) {
  const record = parseDesignRecord(text);
  return { id: record.id, status: record.status, revision: record.revision, explicitRevision: record.explicitRevision };
}

export function resolveFrontierDesigns({ root, route, readText }) {
  const resolved = [];
  for (const item of route.frontier) {
    let text;
    try { text = readText ? readText(item.path) : fs.readFileSync(path.join(root, item.path), 'utf8'); }
    catch { throw new Error(`documentation_authority_frontier_missing_design: ${item.path}`); }
    const design = parseDesignMetadata(text);
    if (design.id !== item.id) throw new Error(`documentation_authority_frontier_design_id_mismatch: WORKBOARD=${item.id} owner=${design.id}`);
    if (design.revision !== item.revision) throw new Error(`documentation_authority_frontier_design_revision_mismatch: WORKBOARD=${item.revision} owner=${design.revision}`);
    if (!['accepted', 'implementing'].includes(design.status)) {
      throw new Error(`documentation_authority_frontier_design_not_runnable: ${item.id}@r${item.revision} ${design.status}`);
    }
    resolved.push({ ...item, status: design.status, explicitRevision: design.explicitRevision });
  }
  return resolved;
}

export function rebindContinuity({ workboardText, designTexts = {}, documentationText, continuity = {} }) {
  const route = parseWorkboardRouting(workboardText);
  const resolved = route.frontier.map((item) => {
    const text = designTexts[item.path];
    if (text === undefined) return { ...item, status: null };
    const design = parseDesignMetadata(text);
    if (design.id !== item.id || design.revision !== item.revision) throw new Error(`documentation_authority_design_identity_mismatch: ${item.id}@r${item.revision}`);
    return { ...item, status: design.status };
  });
  const qualificationOwner = documentationText === undefined ? null : parseQualificationOwner(documentationText);
  const staleClaims = [];
  if (continuity.branch !== undefined && continuity.branch !== route.branch) staleClaims.push('branch');
  if (continuity.group !== undefined && continuity.group !== route.group) staleClaims.push('group');
  if (continuity.designId !== undefined) {
    const sameId = resolved.filter((item) => item.id === continuity.designId);
    if (sameId.length === 0) staleClaims.push('designId');
    else {
      const sameRevision = sameId.find((item) => item.revision === Number(continuity.designRevision));
      if (continuity.designRevision !== undefined && !sameRevision) staleClaims.push('designRevision');
      if (continuity.designStatus !== undefined) {
        const comparable = sameRevision ?? sameId[0];
        if (comparable.status !== null && comparable.status !== continuity.designStatus) staleClaims.push('designStatus');
      }
    }
  }
  if (continuity.qualificationOwner !== undefined && qualificationOwner !== null && continuity.qualificationOwner !== qualificationOwner) {
    staleClaims.push('qualificationOwner');
  }
  return { current: { ...route, frontier: resolved, qualificationOwner }, staleClaims };
}

function assert(condition, code, detail = '') {
  if (!condition) throw new Error(`${code}${detail ? `: ${detail}` : ''}`);
}

export function validateDocumentation(root = process.cwd(), overrides = {}) {
  const failures = [];
  const check = (fn) => { try { fn(); } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); } };
  const hasOverride = (relativePath) => Object.hasOwn(overrides, relativePath);
  const existsPath = (relativePath) => hasOverride(relativePath) ? overrides[relativePath] !== null : fs.existsSync(path.join(root, relativePath));
  const readText = (relativePath) => {
    if (hasOverride(relativePath)) {
      if (overrides[relativePath] === null) throw new Error('documentation_authority_missing_override: ' + relativePath);
      return overrides[relativePath];
    }
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
  };

  for (const file of ['AGENTS.md', 'RULE.md', 'SDD.md', 'WORKBOARD.md']) {
    check(() => assert(existsPath(file), 'documentation_authority_missing_kernel', file));
  }
  if (failures.length) return { ok: false, failures };

  const workboard = readText('WORKBOARD.md');
  let route;
  check(() => { route = parseWorkboardRouting(workboard); });
  if (!route) return { ok: false, failures };

  check(() => assert(workboard.split('\n').length <= 120, 'documentation_authority_workboard_too_large'));
  check(() => assert(!/^### D00(?:0[2-9]|1[0-5])\b/m.test(workboard), 'documentation_authority_workboard_history'));

  for (const file of [
    'AGENTS.md', 'RULE.md', 'README.md', 'docs/DOCUMENTATION.md', 'docs/QUALIFICATION.md', 'docs/ROADMAP.md',
    'docs/development/PROGRAM.md', 'docs/development/WORKFLOW.md', 'docs/SPEC.md', 'docs/ARCHITECTURE.md',
    'docs/PROTOCOL.md', 'docs/OPERATIONS.md', 'docs/SECURITY.md', 'docs/DEPLOYMENT.md', 'docs/MCP.md',
  ]) {
    check(() => assert(!readText(file).includes(route.branch), 'documentation_authority_stable_route_literal', file));
  }

  check(() => assert(existsPath('LINEAGE.md'), 'documentation_authority_missing_lineage'));
  const retiredLivePaths = [
    'docs/development/BRANCH_LINEAGE.md', 'docs/development/ACCESS.md', 'docs/development/GROUP_E_CONTEXT_DELIVERY.md',
    'docs/IMPLEMENTATION_REPORT.md', 'docs/D0014_PRODUCT_EFFICIENCY_AUDIT.md', 'docs/D0014_POST_VERIFICATION_REVIEW.md',
  ];
  for (const file of retiredLivePaths) check(() => assert(!existsPath(file), 'documentation_authority_retired_live_path', file));

  const historyDir = path.join(root, 'docs/history');
  check(() => assert(fs.existsSync(historyDir), 'documentation_authority_missing_history_dir'));
  if (fs.existsSync(historyDir)) {
    for (const file of fs.readdirSync(historyDir)) {
      if (!file.endsWith('.md')) continue;
      check(() => assert(/^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file), 'documentation_authority_history_name', file));
    }
  }

  for (const file of ['AUTHORITY.md', 'SESSION.md', 'ROUTER.md', 'HANDOFF.md', 'docs/development/AUTHORITY.md', 'docs/development/SESSION.md', 'docs/development/ROUTER.md', 'docs/development/HANDOFF.md']) {
    check(() => assert(!existsPath(file), 'documentation_authority_meta_owner_sprawl', file));
  }

  check(() => assert(!existsPath('docs/MVP.md'), 'documentation_authority_retired_live_path', 'docs/MVP.md'));
  check(() => assert(existsPath('docs/QUALIFICATION.md'), 'documentation_authority_missing_qualification'));
  for (const file of [
    'docs/history/mvp-verification-and-evidence.md',
    'docs/history/readme-before-d0033.md',
    'docs/history/roadmap-before-d0033.md',
    'docs/history/program-before-d0033.md',
    'docs/history/deployment-before-d0033-owner-cleanup.md',
  ]) check(() => assert(existsPath(file), 'documentation_authority_missing_history_snapshot', file));

  const documentation = readText('docs/DOCUMENTATION.md');
  let qualificationOwner = null;
  check(() => { qualificationOwner = parseQualificationOwner(documentation); });
  check(() => assert(qualificationOwner === 'docs/QUALIFICATION.md', 'documentation_authority_qualification_owner_path', String(qualificationOwner)));
  check(() => assert(documentation.includes('| stable final-MVP capability decomposition and exit intent | `docs/ROADMAP.md` |'), 'documentation_authority_documentation_roadmap_owner'));
  check(() => assert(documentation.includes('| forward Design/gate dependency and coverage graph | `docs/development/PROGRAM.md` |'), 'documentation_authority_documentation_program_owner'));

  let qualificationCommands = [];
  let qualificationPairs = [];
  if (existsPath('docs/QUALIFICATION.md')) {
    const qualification = readText('docs/QUALIFICATION.md');
    check(() => {
      qualificationCommands = parseSourceGateCommands(qualification);
      assert(qualificationCommands.length > 0, 'documentation_authority_qualification_source_gate_empty');
      assert(new Set(qualificationCommands).size === qualificationCommands.length, 'documentation_authority_qualification_source_gate_duplicate');
    });
    check(() => {
      qualificationPairs = parseQualificationPairs(qualification);
      assert(qualificationPairs.length > 0, 'documentation_authority_qualification_method_empty');
      const areas = qualificationPairs.map(([area]) => area);
      assert(areas.every(Boolean), 'documentation_authority_qualification_method_area_empty');
      assert(new Set(areas).size === areas.length, 'documentation_authority_qualification_method_area_duplicate');
      assert(qualificationPairs.every(([, falsifier]) => Boolean(falsifier)), 'documentation_authority_qualification_method_falsifier_empty');
    });
    check(() => assert(!/\|\s*Observed evidence\s*\|/i.test(qualification), 'documentation_authority_qualification_observed_ledger'));
    check(() => assert(!/\b[0-9a-f]{40}\b/i.test(qualification), 'documentation_authority_qualification_commit_ledger'));
    check(() => {
      const mutableGapClause = /Mutable current gaps belong in([\s\S]*?)rather than this stable method owner/i.exec(qualification)?.[1] ?? '';
      assert(!mutableGapClause.includes('docs/ROADMAP.md'), 'documentation_authority_qualification_mutable_roadmap_gap');
    });
  }

  const agents = readText('AGENTS.md');
  const readme = readText('README.md');
  const productContractFiles = [
    'docs/SPEC.md', 'docs/ARCHITECTURE.md', 'docs/PROTOCOL.md', 'docs/OPERATIONS.md',
    'docs/SECURITY.md', 'docs/DEPLOYMENT.md', 'docs/MCP.md',
  ];
  const productContracts = Object.fromEntries(productContractFiles.map((file) => [file, readText(file)]));
  const deployment = productContracts['docs/DEPLOYMENT.md'];
  check(() => assert(agents.includes('`docs/QUALIFICATION.md`'), 'documentation_authority_agents_qualification_pointer'));
  check(() => assert(readme.includes('`docs/QUALIFICATION.md`'), 'documentation_authority_readme_qualification_pointer'));
  for (const [file, text] of [['AGENTS.md', agents], ['README.md', readme]]) {
    check(() => assert(qualificationCommands.every((command) => !text.includes(command)), 'documentation_authority_source_gate_duplicate', file));
  }
  check(() => assert(qualificationCommands.every((command) => !deployment.includes(command)), 'documentation_authority_deployment_source_gate_duplicate'));
  check(() => assert(!deployment.includes('mvp-1a-7'), 'documentation_authority_deployment_legacy_route_contract'));
  check(() => assert(deployment.includes('`QUALIFICATION.md` owns proof-layer classification'), 'documentation_authority_deployment_qualification_boundary'));
  check(() => assert(!/D\d{4}\s+is accepted only at the Design\/qualification layer here/i.test(deployment), 'documentation_authority_deployment_stale_design_status'));
  for (const [file, text] of Object.entries(productContracts)) {
    check(() => assert(qualificationCommands.every((command) => !text.includes(command)), 'documentation_authority_product_source_gate_duplicate', file));
    check(() => assert(!/(?:docs\/)?MVP\.md/.test(text), 'documentation_authority_product_retired_mvp_pointer', file));
    check(() => assert(!/(?:currently verified source slice|not implemented or verified at this Design-acceptance checkpoint|C1-C4 production repair remains open|current production source does not yet implement|current production source still uses|current src\/store\.mjs|repairs are accepted but not yet production-implemented|production-implemented and independently verified on the declared supported-Termux|adapter has not yet been implemented, deployed or load-tested|no MCP server or current-client qualification is implemented in the current source slice|It is verified with real bare|The accepted C1-C4 repair adds|at the D\d{4} acceptance checkpoint[^.]*src\/store\.mjs)/i.test(text), 'documentation_authority_product_mutable_status_ledger', file));
    check(() => assert(!/\b[0-9a-f]{40}\b/i.test(text), 'documentation_authority_product_commit_ledger', file));
    check(() => assert(!/^#{2,4}\s+.*(?:Verified|Measured|Benchmark|Current .*?(?:boundary|status|state|slice))/mi.test(text), 'documentation_authority_product_evidence_heading', file));
    check(() => assert(!/\b\d+\/\d+\b[^\n]*(?:pass|passed|fail|failed|sample|samples|race|races)/i.test(text), 'documentation_authority_product_result_ledger', file));
  }
  check(() => assert(workboard.includes('`docs/QUALIFICATION.md`'), 'documentation_authority_workboard_qualification_pointer'));
  for (const file of ['AGENTS.md', 'WORKBOARD.md', 'README.md', 'docs/DOCUMENTATION.md']) {
    check(() => assert(!readText(file).includes('docs/MVP.md'), 'documentation_authority_stale_current_mvp_pointer', file));
  }

  for (const pointer of ['AGENTS.md', 'RULE.md', 'SDD.md', 'WORKBOARD.md', 'docs/ROADMAP.md', 'docs/development/PROGRAM.md', 'docs/QUALIFICATION.md']) {
    check(() => assert(readme.includes(pointer), 'documentation_authority_readme_owner_pointer', pointer));
  }
  check(() => assert(!readme.includes('mvp-1a-7'), 'documentation_authority_readme_stale_legacy_route'));
  check(() => assert(!/latest verified production-source layer|active development identity/i.test(readme), 'documentation_authority_readme_stale_status'));

  let resolvedFrontier = [];
  check(() => { resolvedFrontier = resolveFrontierDesigns({ root, route, readText }); });

  const designDirectory = path.join(root, 'docs/design');
  if (fs.existsSync(designDirectory)) {
    for (const file of fs.readdirSync(designDirectory)) {
      if (!/^\d{4}-.+\.md$/.test(file)) continue;
      const relativePath = `docs/design/${file}`;
      check(() => validateMaintainedDesignSingleValue(readText(relativePath), relativePath));
    }
  }

  const roadmap = readText('docs/ROADMAP.md');
  let roadmapGroups = [];
  check(() => { roadmapGroups = parseRoadmapGroups(roadmap); });
  check(() => {
    const ids = roadmapGroups.map(({ group }) => group);
    assert(JSON.stringify(ids) === JSON.stringify(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']), 'documentation_authority_roadmap_group_set', ids.join(','));
  });
  check(() => assert(roadmap.includes('`WORKBOARD.md` alone owns the mutable current development route and runnable frontier'), 'documentation_authority_roadmap_router_boundary'));
  check(() => assert(!/\bD\d{4}(?:@r\d+)?\b/.test(roadmap), 'documentation_authority_roadmap_design_ledger'));
  check(() => assert(!/\b[0-9a-f]{40}\b/i.test(roadmap), 'documentation_authority_roadmap_commit_ledger'));
  check(() => assert(!/\bACTIVE\b/.test(roadmap), 'documentation_authority_roadmap_active_mirror'));

  const program = readText('docs/development/PROGRAM.md');
  let programGates = [];
  check(() => { programGates = parseProgramGates(program); });
  check(() => assert(program.includes('mutable current routing instance and runnable frontier are owned only by `WORKBOARD.md`'), 'documentation_authority_program_router_boundary'));
  check(() => assert(program.includes('This register carries no current lane, `ACTIVE` Group or branch instance'), 'documentation_authority_program_current_mirror_rule'));
  check(() => assert(!program.split('\n').some((line) => /^\|\s*[A-H]\s*\|/.test(line)), 'documentation_authority_program_capability_table_duplicate'));
  check(() => assert(!/^- \*\*Lane:\*\*/m.test(program), 'documentation_authority_program_lane_mirror'));
  check(() => assert(!/\|\s*Status\s*\||^-\s*\*\*Status:\*\*/mi.test(program), 'documentation_authority_program_status_ledger'));
  check(() => assert(!/\b[0-9a-f]{40}\b/i.test(program), 'documentation_authority_program_commit_ledger'));

  const roadmapGroupIds = new Set(roadmapGroups.map(({ group }) => group));
  const seenProgramGates = new Set();
  for (const gate of programGates) {
    check(() => assert(!seenProgramGates.has(gate.gate), 'documentation_authority_program_gate_duplicate', gate.gate));
    seenProgramGates.add(gate.gate);
    for (const group of gate.groups) check(() => assert(roadmapGroupIds.has(group), 'documentation_authority_program_unknown_group', `${gate.gate} -> ${group}`));
    if (gate.kind !== 'maintained') continue;
    check(() => {
      let text;
      try { text = readText(gate.path); } catch { throw new Error(`documentation_authority_program_missing_design: ${gate.path}`); }
      const design = parseDesignMetadata(text);
      assert(design.id === gate.id, 'documentation_authority_program_design_id_mismatch', `${gate.gate} -> ${design.id}`);
      assert(design.revision === gate.revision, 'documentation_authority_program_design_revision_mismatch', `${gate.gate} -> r${design.revision}`);
    });
  }

  check(() => {
    const expected = renderDesignIndex(root, { readText });
    assert(readText('docs/design/README.md') === expected, 'documentation_authority_design_index_drift');
  });

  const liveReferenceFiles = [
    'AGENTS.md', 'RULE.md', 'SDD.md', 'WORKBOARD.md', 'LINEAGE.md', 'README.md', 'docs/DOCUMENTATION.md', 'docs/QUALIFICATION.md',
    'docs/ROADMAP.md', 'docs/development/PROGRAM.md', 'docs/development/WORKFLOW.md', 'docs/design/README.md',
  ];
  for (const file of liveReferenceFiles) {
    if (!existsPath(file)) continue;
    const text = readText(file);
    for (const retired of retiredLivePaths) {
      if (file === 'LINEAGE.md' && retired === 'docs/development/BRANCH_LINEAGE.md') continue;
      check(() => assert(!text.includes(retired), 'documentation_authority_stale_live_reference', `${file} -> ${retired}`));
    }
  }

  for (const entry of fs.readdirSync(path.join(root, 'docs'), { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    check(() => assert(/^[A-Z0-9_]+\.md$/.test(entry.name), 'documentation_authority_docs_root_name', entry.name));
  }

  return {
    ok: failures.length === 0,
    failures,
    route,
    frontier: resolvedFrontier,
    qualificationOwner,
    qualificationCommands,
    qualificationPairs,
    roadmapGroups,
    programGates,
  };
}

function runCli() {
  const result = validateDocumentation(process.cwd());
  if (!result.ok) {
    for (const failure of result.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
    return;
  }
  const selected = result.route.selected ? `${result.route.selected.id}@r${result.route.selected.revision}` : 'none';
  process.stdout.write(`documentation-authority ok: ${result.route.groupId} ${result.route.branch} frontier=${result.route.frontier.length} selected=${selected} groups=${result.roadmapGroups.length} gates=${result.programGates.length}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && invokedPath === path.resolve(fileURLToPath(import.meta.url))) runCli();
