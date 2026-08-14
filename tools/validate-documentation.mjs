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

export function rebindContinuity({ workboardText, designTexts = {}, continuity = {} }) {
  const route = parseWorkboardRouting(workboardText);
  const resolved = route.frontier.map((item) => {
    const text = designTexts[item.path];
    if (text === undefined) return { ...item, status: null };
    const design = parseDesignMetadata(text);
    if (design.id !== item.id || design.revision !== item.revision) throw new Error(`documentation_authority_design_identity_mismatch: ${item.id}@r${item.revision}`);
    return { ...item, status: design.status };
  });
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
  return { current: { ...route, frontier: resolved }, staleClaims };
}

function assert(condition, code, detail = '') {
  if (!condition) throw new Error(`${code}${detail ? `: ${detail}` : ''}`);
}

export function validateDocumentation(root = process.cwd(), overrides = {}) {
  const failures = [];
  const check = (fn) => { try { fn(); } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); } };
  const readText = (relativePath) => Object.hasOwn(overrides, relativePath) ? overrides[relativePath] : fs.readFileSync(path.join(root, relativePath), 'utf8');

  for (const file of ['AGENTS.md', 'RULE.md', 'SDD.md', 'WORKBOARD.md']) {
    check(() => assert(Object.hasOwn(overrides, file) || fs.existsSync(path.join(root, file)), 'documentation_authority_missing_kernel', file));
  }
  if (failures.length) return { ok: false, failures };

  const workboard = readText('WORKBOARD.md');
  let route;
  check(() => { route = parseWorkboardRouting(workboard); });
  if (!route) return { ok: false, failures };

  check(() => assert(workboard.split('\n').length <= 120, 'documentation_authority_workboard_too_large'));
  check(() => assert(!/^### D00(?:0[2-9]|1[0-5])\b/m.test(workboard), 'documentation_authority_workboard_history'));

  for (const file of ['AGENTS.md', 'RULE.md', 'docs/development/WORKFLOW.md']) {
    check(() => assert(!readText(file).includes(route.branch), 'documentation_authority_stable_route_literal', file));
  }

  check(() => assert(fs.existsSync(path.join(root, 'LINEAGE.md')), 'documentation_authority_missing_lineage'));
  const retiredLivePaths = [
    'docs/development/BRANCH_LINEAGE.md', 'docs/development/ACCESS.md', 'docs/development/GROUP_E_CONTEXT_DELIVERY.md',
    'docs/IMPLEMENTATION_REPORT.md', 'docs/D0014_PRODUCT_EFFICIENCY_AUDIT.md', 'docs/D0014_POST_VERIFICATION_REVIEW.md',
  ];
  for (const file of retiredLivePaths) check(() => assert(!fs.existsSync(path.join(root, file)), 'documentation_authority_retired_live_path', file));

  const historyDir = path.join(root, 'docs/history');
  check(() => assert(fs.existsSync(historyDir), 'documentation_authority_missing_history_dir'));
  if (fs.existsSync(historyDir)) {
    for (const file of fs.readdirSync(historyDir)) {
      if (!file.endsWith('.md')) continue;
      check(() => assert(/^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file), 'documentation_authority_history_name', file));
    }
  }

  for (const file of ['AUTHORITY.md', 'SESSION.md', 'ROUTER.md', 'HANDOFF.md', 'docs/development/AUTHORITY.md', 'docs/development/SESSION.md', 'docs/development/ROUTER.md', 'docs/development/HANDOFF.md']) {
    check(() => assert(!fs.existsSync(path.join(root, file)), 'documentation_authority_meta_owner_sprawl', file));
  }

  check(() => assert(!fs.existsSync(path.join(root, 'docs/MVP.md')), 'documentation_authority_retired_live_path', 'docs/MVP.md'));
  check(() => assert(Object.hasOwn(overrides, 'docs/QUALIFICATION.md') || fs.existsSync(path.join(root, 'docs/QUALIFICATION.md')), 'documentation_authority_missing_qualification'));
  if (Object.hasOwn(overrides, 'docs/QUALIFICATION.md') || fs.existsSync(path.join(root, 'docs/QUALIFICATION.md'))) {
    const qualification = readText('docs/QUALIFICATION.md');
    const sourceCommands = [
      'npm ci --ignore-scripts --no-audit --no-fund',
      'npm run check',
      'node --experimental-test-coverage --test test/*.test.mjs',
      'git diff --check',
    ];
    for (const command of sourceCommands) check(() => assert(qualification.includes(command), 'documentation_authority_qualification_source_gate', command));
    check(() => assert(!/\|\s*Observed evidence\s*\|/i.test(qualification), 'documentation_authority_qualification_observed_ledger'));
  }
  const agents = readText('AGENTS.md');
  check(() => assert(agents.includes('`docs/QUALIFICATION.md`'), 'documentation_authority_agents_qualification_pointer'));
  check(() => assert(!agents.includes('npm ci --ignore-scripts --no-audit --no-fund') && !agents.includes('node --experimental-test-coverage --test test/*.test.mjs'), 'documentation_authority_agents_source_gate_duplicate'));
  check(() => assert(workboard.includes('`docs/QUALIFICATION.md`'), 'documentation_authority_workboard_qualification_pointer'));
  check(() => assert(readText('docs/DOCUMENTATION.md').includes('| verification methods, executable source gate and proof-layer boundaries | `docs/QUALIFICATION.md` |'), 'documentation_authority_documentation_qualification_owner'));
  check(() => assert(fs.existsSync(path.join(root, 'docs/history/mvp-verification-and-evidence.md')), 'documentation_authority_missing_mvp_history'));

  let resolvedFrontier = [];
  check(() => { resolvedFrontier = resolveFrontierDesigns({ root, route, readText }); });

  const program = readText('docs/development/PROGRAM.md');
  check(() => assert(program.includes('mutable current routing instance and runnable frontier are owned only by `WORKBOARD.md`'), 'documentation_authority_program_router_boundary'));
  check(() => assert(program.includes('This register carries no current lane, `ACTIVE` Group or branch instance'), 'documentation_authority_program_current_mirror_rule'));
  check(() => assert(!/^- \*\*Lane:\*\*/m.test(program), 'documentation_authority_program_lane_mirror'));
  check(() => assert(!/Program status \(derived\)|Cumulative checkpoint lane/i.test(program), 'documentation_authority_program_status_mirror'));
  check(() => assert(!program.split('\n').filter((line) => /^\|\s*[A-H]\s*\|/.test(line)).some((line) => /\bACTIVE\b/i.test(line)), 'documentation_authority_program_active_mirror'));

  const roadmap = readText('docs/ROADMAP.md');
  check(() => assert(roadmap.includes('`WORKBOARD.md` alone owns the mutable current development route and runnable frontier'), 'documentation_authority_roadmap_router_boundary'));
  check(() => assert(!/Program status \(derived\)/i.test(roadmap), 'documentation_authority_roadmap_status_mirror'));
  check(() => assert(!roadmap.split('\n').filter((line) => /^\|\s*[A-H]\s*\|/.test(line)).some((line) => /\bACTIVE\b/i.test(line)), 'documentation_authority_roadmap_active_mirror'));

  check(() => {
    const expected = renderDesignIndex(root, { readText });
    assert(readText('docs/design/README.md') === expected, 'documentation_authority_design_index_drift');
  });

  const liveReferenceFiles = [
    'AGENTS.md', 'RULE.md', 'SDD.md', 'WORKBOARD.md', 'LINEAGE.md', 'README.md', 'docs/DOCUMENTATION.md', 'docs/QUALIFICATION.md',
    'docs/ROADMAP.md', 'docs/development/PROGRAM.md', 'docs/development/WORKFLOW.md', 'docs/design/README.md',
  ];
  for (const file of liveReferenceFiles) {
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

  return { ok: failures.length === 0, failures, route, frontier: resolvedFrontier };
}

function runCli() {
  const result = validateDocumentation(process.cwd());
  if (!result.ok) {
    for (const failure of result.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
    return;
  }
  const selected = result.route.selected ? `${result.route.selected.id}@r${result.route.selected.revision}` : 'none';
  process.stdout.write(`documentation-authority ok: ${result.route.groupId} ${result.route.branch} frontier=${result.route.frontier.length} selected=${selected}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && invokedPath === path.resolve(fileURLToPath(import.meta.url))) runCli();
