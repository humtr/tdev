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
for (const match of workboard.matchAll(activePattern)) {
  const [, id, target, statusValue] = match;
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

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log(`governance check passed: ${requiredFiles.length} required files, ${designNames.length} design record(s), ${checkedFiles.length} link sources`);
}
