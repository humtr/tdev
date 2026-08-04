import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const statuses = new Set(["draft", "accepted", "implementing", "verified", "blocked", "superseded"]);
const requiredFiles = [
  "AGENTS.md",
  "RULE.md",
  "SDD.md",
  "WORKBOARD.md",
  "docs/SPEC.md",
  "docs/ARCHITECTURE.md",
  "docs/MCP.md",
  "docs/PROTOCOL.md",
  "docs/OPERATIONS.md",
  "docs/SECURITY.md",
  "docs/DEPLOYMENT.md",
  "docs/MVP.md",
  "docs/REPOSITORY_BOOTSTRAP.md",
  "docs/WORKBOARD_GUIDE.md",
  "docs/WORKBOARD_TEMPLATE.md",
  "docs/design/README.md",
  "docs/design/TEMPLATE.md",
];
const errors = [];

async function exists(relative) {
  try {
    await stat(path.join(root, relative));
    return true;
  } catch {
    return false;
  }
}

for (const relative of requiredFiles) {
  if (!(await exists(relative))) errors.push(`missing required governance or owner file: ${relative}`);
}

const designNames = (await readdir(path.join(root, "docs/design")))
  .filter((name) => /^\d{4}-[a-z0-9-]+\.md$/.test(name))
  .sort();
const checkedFiles = [
  "README.md",
  "AGENTS.md",
  "RULE.md",
  "SDD.md",
  "WORKBOARD.md",
  "docs/SPEC.md",
  "docs/MCP.md",
  "docs/REPOSITORY_BOOTSTRAP.md",
  "docs/WORKBOARD_GUIDE.md",
  "docs/WORKBOARD_TEMPLATE.md",
  "docs/design/README.md",
  "docs/design/TEMPLATE.md",
  ...designNames.map((name) => `docs/design/${name}`),
];

for (const relative of checkedFiles) {
  const content = await readFile(path.join(root, relative), "utf8");
  const renderedMarkdown = content.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, "");
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of renderedMarkdown.matchAll(linkPattern)) {
    const target = match[1].trim().replace(/^<|>$/g, "");
    if (target === "" || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const filePart = target.split("#", 1)[0].split("?", 1)[0];
    if (filePart === "") continue;
    const resolved = path.normalize(path.join(path.dirname(relative), filePart));
    if (resolved.startsWith("..") || path.isAbsolute(resolved)) {
      errors.push(`${relative}: link escapes repository: ${target}`);
      continue;
    }
    if (!(await exists(resolved))) errors.push(`${relative}: broken relative link: ${target}`);
  }
}

const workboard = await readFile(path.join(root, "WORKBOARD.md"), "utf8");
const workboardLines = workboard.split(/\r?\n/).length;
if (workboardLines > 80) errors.push(`WORKBOARD.md has ${workboardLines} lines; pointer board limit is 80`);
if (/\bjob_[A-Za-z0-9_]+\b/.test(workboard)) errors.push("WORKBOARD.md contains execution job IDs; evidence belongs in a design record");

const registry = await readFile(path.join(root, "docs/design/README.md"), "utf8");
const registryRows = new Map();
const rowPattern = /^\|\s*\[(\d{4})\]\(([^)]+)\)\s*\|\s*([^|]+?)\s*\|\s*(draft|accepted|implementing|verified|blocked|superseded)\s*\|/gm;
for (const match of registry.matchAll(rowPattern)) {
  const [, id, target, title, statusValue] = match;
  if (registryRows.has(id)) errors.push(`design registry duplicates ID ${id}`);
  registryRows.set(id, { target, title: title.trim(), status: statusValue });
}

for (const name of designNames) {
  const id = name.slice(0, 4);
  const record = registryRows.get(id);
  if (!record) {
    errors.push(`design ${id} exists but is not registered`);
    continue;
  }
  const expectedTarget = name;
  if (record.target !== expectedTarget) errors.push(`design ${id} registry target ${record.target} != ${expectedTarget}`);
  const content = await readFile(path.join(root, "docs/design", name), "utf8");
  const statusMatch = content.match(/^- Status: `([^`]+)`$/m);
  if (!statusMatch || !statuses.has(statusMatch[1])) {
    errors.push(`design ${id} has no valid metadata status`);
  } else if (statusMatch[1] !== record.status) {
    errors.push(`design ${id} status ${statusMatch[1]} != registry ${record.status}`);
  }
}
for (const id of registryRows.keys()) {
  if (!designNames.some((name) => name.startsWith(`${id}-`))) errors.push(`registry points to absent design ID ${id}`);
}

const activePattern = /\[Design (\d{4})[^\]]*\]\((docs\/design\/[^)]+)\): `(draft|accepted|implementing|verified|blocked|superseded)`/g;
const activeDesignIds = new Set();
for (const match of workboard.matchAll(activePattern)) {
  const [, id, target, statusValue] = match;
  activeDesignIds.add(id);
  const record = registryRows.get(id);
  if (!record) {
    errors.push(`WORKBOARD.md references unregistered design ${id}`);
    continue;
  }
  if (`docs/design/${record.target}` !== target) errors.push(`WORKBOARD.md target for design ${id} disagrees with registry`);
  if (record.status !== statusValue) errors.push(`WORKBOARD.md status for design ${id} disagrees with registry`);
  if (!new Set(["accepted", "implementing", "blocked"]).has(statusValue)) {
    errors.push(`WORKBOARD.md active design ${id} has non-active status ${statusValue}`);
  }
}

const design0004 = registryRows.get("0004");
if (design0004 && new Set(["accepted", "implementing", "blocked"]).has(design0004.status)) {
  if (!activeDesignIds.has("0004")) errors.push("accepted or active Design 0004 must be routed from WORKBOARD.md");
  const designContent = await readFile(path.join(root, "docs/design", design0004.target), "utf8");
  const protocol = await readFile(path.join(root, "docs/PROTOCOL.md"), "utf8");
  const architecture = await readFile(path.join(root, "docs/ARCHITECTURE.md"), "utf8");
  const mvp = await readFile(path.join(root, "docs/MVP.md"), "utf8");
  const protocolGuide = await readFile(path.join(root, "protocol/README.md"), "utf8");
  const markerChecks = [
    [designContent, "ValidationProofV1", "Design 0004 validation proof"],
    [designContent, "MutationReceiptV1", "Design 0004 mutation receipt"],
    [designContent, "tdev.new-case-route.v1", "Design 0004 deterministic Case route"],
    [designContent, "INPUT_SCHEMA_INVALID", "Design 0004 ingress error split"],
    [protocol, "ValidationProofV1", "docs/PROTOCOL.md validation proof"],
    [protocol, "MutationReceiptV1", "docs/PROTOCOL.md mutation receipt"],
    [protocol, "tdev.new-case-route.v1", "docs/PROTOCOL.md deterministic Case route"],
    [protocol, "INPUT_SCHEMA_INVALID", "docs/PROTOCOL.md ingress error split"],
    [architecture, "mutation receipts", "docs/ARCHITECTURE.md replay owner"],
    [architecture, "schema_meta", "docs/ARCHITECTURE.md CaseDO schema identity"],
    [mvp, "Design 0004", "docs/MVP.md M1 design gate"],
    [protocolGuide, "Design 0004", "protocol/README.md M1 routing"],
  ];
  for (const [content, marker, label] of markerChecks) {
    if (!content.includes(marker)) errors.push(`${label} marker is missing`);
  }
}

const mcp = await readFile(path.join(root, "docs/MCP.md"), "utf8");
const capabilityStart = "<!-- mcp-capabilities:start -->";
const capabilityEnd = "<!-- mcp-capabilities:end -->";
const capabilityStartCount = mcp.split(capabilityStart).length - 1;
const capabilityEndCount = mcp.split(capabilityEnd).length - 1;
if (capabilityStartCount !== 1 || capabilityEndCount !== 1) {
  errors.push("docs/MCP.md must contain exactly one canonical capability table marker pair");
} else {
  const capabilityBlock = mcp.slice(
    mcp.indexOf(capabilityStart) + capabilityStart.length,
    mcp.indexOf(capabilityEnd),
  );
  const expectedCapabilities = [
    "list_operations",
    "list_resources",
    "submit_operation",
    "get_case",
    "get_task",
    "control_case",
    "finish_case",
    "cancel_case",
    "control_task",
    "cancel_task",
    "render_task",
    "read_artifact",
  ];
  const capabilityRows = [...capabilityBlock.matchAll(/^\|\s*`([a-z_]+)`\s*\|\s*(yes|no)\s*\|[^\n]*\|\s*Tool\s*\|$/gm)]
    .map((match) => match[1]);
  const duplicateCapabilities = capabilityRows.filter((value, index) => capabilityRows.indexOf(value) !== index);
  if (duplicateCapabilities.length > 0) {
    errors.push(`docs/MCP.md duplicates canonical capability ${duplicateCapabilities[0]}`);
  }
  if (capabilityRows.length !== expectedCapabilities.length) {
    errors.push(`docs/MCP.md has ${capabilityRows.length} tools-v1 capability rows; expected ${expectedCapabilities.length}`);
  } else if (capabilityRows.some((value, index) => value !== expectedCapabilities[index])) {
    errors.push("docs/MCP.md canonical capability order or name differs from tools-v1 contract");
  }
}

const spec = await readFile(path.join(root, "docs/SPEC.md"), "utf8");
const requirementCategories = new Set(["FUN", "SEC", "NFR", "LCM", "ACC"]);
const requirementOwners = new Set([
  "ARCHITECTURE.md",
  "MCP.md",
  "PROTOCOL.md",
  "OPERATIONS.md",
  "SECURITY.md",
  "DEPLOYMENT.md",
  "MVP.md",
]);
const requirementGates = new Set([
  "M0",
  "M1",
  "M2",
  "M3",
  "M4",
  "M5",
  "M6",
  "M7",
  "M8",
  "M9",
  "M10",
  "Release",
]);
const requirementRows = new Map();
const categoryCounts = new Map([...requirementCategories].map((category) => [category, 0]));
const ownerCounts = new Map([...requirementOwners].map((owner) => [owner, 0]));
const requirementCandidatePattern = /^\|\s*(TDEV-[^|\s]+)\s*\|/gm;
const requirementRowPattern = /^\|\s*(TDEV-([A-Z]+)-(\d{3}))\s*\|\s*([^|]+?)\s*\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/gm;

for (const match of spec.matchAll(requirementRowPattern)) {
  const [, id, category, number, statement, ownerLabel, ownerTarget, gateValue, evidence] = match;
  if (requirementRows.has(id)) errors.push(`docs/SPEC.md duplicates requirement ID ${id}`);
  requirementRows.set(id, true);
  if (!requirementCategories.has(category)) {
    errors.push(`docs/SPEC.md requirement ${id} has unknown category ${category}`);
  } else {
    categoryCounts.set(category, categoryCounts.get(category) + 1);
  }
  if (number === "000") errors.push(`docs/SPEC.md requirement ${id} uses reserved number 000`);
  if (!/\b(MUST|SHOULD|MAY)\b/.test(statement)) {
    errors.push(`docs/SPEC.md requirement ${id} has no normative keyword`);
  }
  if (ownerLabel !== ownerTarget || !requirementOwners.has(ownerTarget)) {
    errors.push(`docs/SPEC.md requirement ${id} has invalid detailed owner ${ownerLabel} -> ${ownerTarget}`);
  } else {
    ownerCounts.set(ownerTarget, ownerCounts.get(ownerTarget) + 1);
  }
  const gate = gateValue.trim();
  if (!requirementGates.has(gate)) errors.push(`docs/SPEC.md requirement ${id} has unsupported gate ${gate}`);
  if (evidence.trim() === "") errors.push(`docs/SPEC.md requirement ${id} has empty evidence class`);
}

for (const match of spec.matchAll(requirementCandidatePattern)) {
  const id = match[1];
  if (!requirementRows.has(id)) errors.push(`docs/SPEC.md has malformed or untraced requirement row ${id}`);
}
for (const [category, count] of categoryCounts) {
  if (count === 0) errors.push(`docs/SPEC.md has no ${category} requirements`);
}
for (const [owner, count] of ownerCounts) {
  if (count === 0) errors.push(`docs/SPEC.md traceability does not reference detailed owner ${owner}`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log(`governance check passed: ${requiredFiles.length} required files, ${designNames.length} design record(s), ${checkedFiles.length} link sources`);
}
