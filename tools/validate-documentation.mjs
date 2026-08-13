import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function singleMatch(text, regex, label) {
  const matches = [...text.matchAll(regex)];
  if (matches.length !== 1) {
    throw new Error(`documentation_authority_${label}: expected exactly one match, found ${matches.length}`);
  }
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
  const frontierBody = sectionBody(text, 'Runnable frontier');
  for (const line of frontierBody.split('\n')) {
    const match = /^- (D\d{4})@r(\d+)\s+—\s+`([^`]+)`\s+—\s+(.+)$/.exec(line);
    if (!match) continue;
    frontier.push({ id: match[1], revision: Number(match[2]), path: match[3], gate: match[4].trim() });
  }
  const seen = new Set();
  for (const item of frontier) {
    if (seen.has(item.id)) throw new Error(`documentation_authority_frontier_duplicate: ${item.id}`);
    seen.add(item.id);
  }

  const selectedBody = sectionBody(text, 'Selected next action');
  const selectedLines = selectedBody.split('\n').filter((line) => /^- (?:none\s*$|D\d{4}@r\d+\s+—\s+)/.test(line));
  if (selectedLines.length !== 1) {
    throw new Error(`documentation_authority_selected_action: expected exactly one selection, found ${selectedLines.length}`);
  }
  let selected = null;
  if (selectedLines[0] !== '- none') {
    const selectedMatch = /^- (D\d{4})@r(\d+)\s+—\s+(.+)$/.exec(selectedLines[0]);
    if (!selectedMatch) throw new Error('documentation_authority_selected_action: malformed selection');
    selected = { id: selectedMatch[1], revision: Number(selectedMatch[2]), gate: selectedMatch[3].trim() };
    if (!frontier.some((item) => item.id === selected.id && item.revision === selected.revision)) {
      throw new Error(`documentation_authority_selected_not_frontier: ${selected.id}@r${selected.revision}`);
    }
  }

  return { group, groupId, branch, frontier, selected };
}

export function parseDesignMetadata(text) {
  const title = singleMatch(text, /^# Design (\d{4})\b.*$/gm, 'design_id');
  const status = singleMatch(text, /^- Status:\s*`([^`]+)`\s*$/gm, 'design_status')[1];
  const revisionMatches = [...text.matchAll(/^- Revision:\s*(\d+)\s*$/gm)];
  if (revisionMatches.length > 1) {
    throw new Error(`documentation_authority_design_revision: expected at most one match, found ${revisionMatches.length}`);
  }
  return {
    id: `D${title[1]}`,
    status,
    revision: revisionMatches.length === 1 ? Number(revisionMatches[0][1]) : 1,
    explicitRevision: revisionMatches.length === 1,
  };
}

export function resolveFrontierDesigns({ root, route }) {
  const resolved = [];
  for (const item of route.frontier) {
    const designPath = path.join(root, item.path);
    if (!fs.existsSync(designPath)) throw new Error(`documentation_authority_frontier_missing_design: ${item.path}`);
    const design = parseDesignMetadata(fs.readFileSync(designPath, 'utf8'));
    if (design.id !== item.id) {
      throw new Error(`documentation_authority_frontier_design_id_mismatch: WORKBOARD=${item.id} owner=${design.id}`);
    }
    if (design.revision !== item.revision) {
      throw new Error(`documentation_authority_frontier_design_revision_mismatch: WORKBOARD=${item.revision} owner=${design.revision}`);
    }
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
    if (design.id !== item.id || design.revision !== item.revision) {
      throw new Error(`documentation_authority_design_identity_mismatch: ${item.id}@r${item.revision}`);
    }
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

function read(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, code, detail = '') {
  if (!condition) throw new Error(`${code}${detail ? `: ${detail}` : ''}`);
}

function parseRegistryStatus(text, designId) {
  const bare = designId.replace(/^D/, '');
  const row = singleMatch(text, new RegExp(`^\\|\\s*${bare}\\s*\\|[^\\n]+$`, 'gm'), `registry_${bare}`)[0];
  const columns = row.split('|').map((value) => value.trim()).filter(Boolean);
  assert(columns.length >= 3, 'documentation_authority_registry_shape', row);
  const status = /^([a-z]+)(?:\s+r(\d+))?\b/.exec(columns[2]);
  assert(status, 'documentation_authority_registry_status', columns[2]);
  return { status: status[1], revision: status[2] === undefined ? null : Number(status[2]) };
}

function markdownFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...markdownFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith('.md')) output.push(absolute);
  }
  return output;
}

export function validateDocumentation(root = process.cwd()) {
  const failures = [];
  const check = (fn) => {
    try { fn(); } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  };

  const kernel = ['AGENTS.md', 'RULE.md', 'SDD.md', 'WORKBOARD.md'];
  for (const file of kernel) check(() => assert(fs.existsSync(path.join(root, file)), 'documentation_authority_missing_kernel', file));
  if (failures.length) return { ok: false, failures };

  const workboard = read(root, 'WORKBOARD.md');
  let route;
  check(() => { route = parseWorkboardRouting(workboard); });
  if (!route) return { ok: false, failures };

  check(() => assert(workboard.split('\n').length <= 120, 'documentation_authority_workboard_too_large'));
  check(() => assert(!/^### D00(?:0[2-9]|1[0-5])\b/m.test(workboard), 'documentation_authority_workboard_history'));

  const stableWithoutCurrentLiteral = ['AGENTS.md', 'RULE.md', 'docs/development/WORKFLOW.md'];
  for (const file of stableWithoutCurrentLiteral) {
    check(() => assert(!read(root, file).includes(route.branch), 'documentation_authority_stable_route_literal', file));
  }

  check(() => assert(fs.existsSync(path.join(root, 'LINEAGE.md')), 'documentation_authority_missing_lineage'));
  const retiredLivePaths = [
    'docs/development/BRANCH_LINEAGE.md',
    'docs/development/ACCESS.md',
    'docs/development/GROUP_E_CONTEXT_DELIVERY.md',
    'docs/IMPLEMENTATION_REPORT.md',
    'docs/D0014_PRODUCT_EFFICIENCY_AUDIT.md',
    'docs/D0014_POST_VERIFICATION_REVIEW.md',
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

  const forbiddenMetaOwners = [
    'AUTHORITY.md', 'SESSION.md', 'ROUTER.md', 'HANDOFF.md',
    'docs/development/AUTHORITY.md', 'docs/development/SESSION.md', 'docs/development/ROUTER.md', 'docs/development/HANDOFF.md',
  ];
  for (const file of forbiddenMetaOwners) check(() => assert(!fs.existsSync(path.join(root, file)), 'documentation_authority_meta_owner_sprawl', file));

  let resolvedFrontier = [];
  check(() => { resolvedFrontier = resolveFrontierDesigns({ root, route }); });

  const program = read(root, 'docs/development/PROGRAM.md');
  check(() => assert(program.includes('planning/derived views'), 'documentation_authority_program_not_derived'));
  check(() => assert(!/Current active Capability Group:|Current active cumulative branch:/.test(program), 'documentation_authority_program_routes'));

  const roadmap = read(root, 'docs/ROADMAP.md');
  check(() => assert(roadmap.includes('`WORKBOARD.md` alone owns the current development route'), 'documentation_authority_roadmap_not_derived'));
  const activeGroups = [];
  for (const line of roadmap.split('\n')) {
    if (!/^\|\s*[A-H]\s*\|/.test(line)) continue;
    const cells = line.split('|').map((value) => value.trim()).filter(Boolean);
    if (cells.length >= 3 && /\bACTIVE\b/i.test(cells[2])) activeGroups.push(cells[0]);
  }
  check(() => assert(activeGroups.length === 1, 'documentation_authority_roadmap_active_count', String(activeGroups.length)));
  check(() => assert(activeGroups[0] === route.groupId, 'documentation_authority_roadmap_active_mismatch', `${activeGroups[0]} != ${route.groupId}`));

  const registry = read(root, 'docs/design/README.md');
  for (const design of resolvedFrontier) {
    check(() => {
      const registryStatus = parseRegistryStatus(registry, design.id);
      assert(registryStatus.status === design.status, 'documentation_authority_registry_frontier_status', design.id);
      if (design.explicitRevision) assert(registryStatus.revision === design.revision, 'documentation_authority_registry_frontier_revision', design.id);
    });
  }

  const liveReferenceFiles = [
    'AGENTS.md', 'RULE.md', 'SDD.md', 'WORKBOARD.md', 'LINEAGE.md', 'README.md',
    'docs/DOCUMENTATION.md', 'docs/MVP.md', 'docs/ROADMAP.md',
    'docs/development/PROGRAM.md', 'docs/development/WORKFLOW.md', 'docs/design/README.md',
  ];
  for (const file of liveReferenceFiles) {
    const text = read(root, file);
    for (const retired of retiredLivePaths) {
      if (file === 'LINEAGE.md' && retired === 'docs/development/BRANCH_LINEAGE.md') continue;
      check(() => assert(!text.includes(retired), 'documentation_authority_stale_live_reference', `${file} -> ${retired}`));
    }
  }

  const docsRoot = path.join(root, 'docs');
  for (const file of fs.readdirSync(docsRoot, { withFileTypes: true })) {
    if (!file.isFile() || !file.name.endsWith('.md')) continue;
    check(() => assert(/^[A-Z0-9_]+\.md$/.test(file.name), 'documentation_authority_docs_root_name', file.name));
  }
  check(() => markdownFiles(path.join(root, 'docs/history')));

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
