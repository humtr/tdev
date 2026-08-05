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
  "protocol/profiles/README.md",
  "protocol/profiles/tdev.m1.release-profile.json",
  "protocol/runtime/typescript/profile.ts",
  "protocol/runtime/typescript/profile.generated.ts",
  "protocol/runtime/go/profile.go",
  "protocol/runtime/go/profile_generated.go",
  "edge/case-do/README.md",
  "edge/case-do/sql.ts",
  "edge/case-do/cloudflare-sqlite.ts",
  "edge/case-do/schema.ts",
  "edge/case-do/records.ts",
  "edge/case-do/admission.ts",
  "edge/case-do/repository.ts",
  "edge/case-do/internal-records.ts",
  "edge/case-do/control.ts",
  "edge/case-do/cursor.ts",
  "edge/case-do/query.ts",
  "edge/case-do/node-sqlite.test-support.ts",
  "edge/case-do/sql-store.test.ts",
  "edge/case-do/test-fixtures.ts",
  "edge/case-do/schema.test.ts",
  "edge/case-do/repository.test.ts",
  "edge/case-do/admission.test.ts",
  "edge/case-do/control.test.ts",
  "edge/case-do/control-matrix.test.ts",
  "edge/case-do/cursor.test.ts",
  "edge/case-do/query.test.ts",
  "edge/case-do/reopen.test.ts",
  "protocol/schemas/tdev.v1.targets.json",
  "tools/generate/main_test.go",
  "tools/generate/targets.go",
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
  "protocol/README.md",
  "protocol/profiles/README.md",
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
    [designContent, "tdev.m1.default", "Design 0004 release-profile identity"],
    [protocol, "tdev.m1.default", "docs/PROTOCOL.md release-profile identity"],
    [protocol, "migration_checksum", "docs/PROTOCOL.md migration checksum"],
    [protocol, "tdevc1.", "docs/PROTOCOL.md cursor wire format"],
    [protocol, "QUOTA_EXCEEDED", "docs/PROTOCOL.md quota error"],
    [architecture, "release-profile", "docs/ARCHITECTURE.md release-profile boundary"],
    [designContent, "CaseDO storage substrate", "Design 0004 storage substrate"],
    [protocol, "601b9c0a2dfbc7d7cb47abb0423cb5014e2ba86a08dd169514c0ab82980f2e86", "docs/PROTOCOL.md schema digest"],
    [protocol, "record_digest", "docs/PROTOCOL.md EvidenceSet record digest"],
    [protocol, "cursor?: string", "docs/PROTOCOL.md render continuation input"],
    [protocol, "subject_kind", "docs/PROTOCOL.md receipt subject selector"],
    [architecture, "edge/case-do/", "docs/ARCHITECTURE.md storage source boundary"],
    [mvp, "CaseDO storage substrate", "docs/MVP.md storage substrate slice"],
  ];
  for (const [content, marker, label] of markerChecks) {
    if (!content.includes(marker)) errors.push(`${label} marker is missing`);
  }
}


const releaseProfilePath = "protocol/profiles/tdev.m1.release-profile.json";
let releaseProfile;
try {
  releaseProfile = JSON.parse(await readFile(path.join(root, releaseProfilePath), "utf8"));
} catch (error) {
  errors.push(`${releaseProfilePath}: invalid JSON: ${error.message}`);
}

if (releaseProfile) {
  const exactKeys = (value, expected, label) => {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
      errors.push(`${releaseProfilePath}: ${label} keys ${actual.join(",")} != ${wanted.join(",")}`);
    }
  };
  exactKeys(releaseProfile, ["profileVersion", "profileId", "ingress", "output", "pagination", "quota", "retention"], "root");
  if (releaseProfile.profileVersion !== 1 || releaseProfile.profileId !== "tdev.m1.default") {
    errors.push(`${releaseProfilePath}: unsupported M1 profile identity`);
  }
  exactKeys(releaseProfile.ingress ?? {}, ["maxBodyBytes", "maxJsonDepth", "maxJsonTokens", "maxObjectMembers", "maxArrayItems", "maxStringCodePoints", "maxNumberDigits", "maxExponentMagnitude"], "ingress");
  exactKeys(releaseProfile.output ?? {}, ["maxMutationResponseBytes", "maxRenderedTextBytes", "maxArtifactChunkBytes"], "output");
  exactKeys(releaseProfile.pagination ?? {}, ["defaultPageSize", "maxPageSize", "cursorTtlSeconds"], "pagination");
  exactKeys(releaseProfile.quota ?? {}, ["maxTasksPerCase", "maxAttemptsPerTask", "maxEventsPerCase"], "quota");
  exactKeys(releaseProfile.retention ?? {}, ["r2OrphanGraceDays", "eventCompaction", "mutationReceiptRetention", "referencedEvidenceCleanup"], "retention");

  const visit = (value, trail = []) => {
    if (value === null || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      const lower = key.toLowerCase();
      if (/^(?:secret|token|password|credential|privatekey|keymaterial|bindingid)$/.test(lower)) {
        errors.push(`${releaseProfilePath}: deployment secret or identity field is forbidden at ${[...trail, key].join(".")}`);
      }
      visit(child, [...trail, key]);
    }
  };
  visit(releaseProfile);

  const numericGroups = [releaseProfile.ingress, releaseProfile.output, releaseProfile.pagination, releaseProfile.quota];
  for (const group of numericGroups) {
    for (const [key, value] of Object.entries(group ?? {})) {
      if (!Number.isSafeInteger(value) || value < 1) {
        errors.push(`${releaseProfilePath}: ${key} must be a positive safe integer`);
      }
    }
  }
  if (!Number.isSafeInteger(releaseProfile.retention?.r2OrphanGraceDays) || releaseProfile.retention.r2OrphanGraceDays < 1) {
    errors.push(`${releaseProfilePath}: r2OrphanGraceDays must be a positive safe integer`);
  }
}

const tsIngress = await readFile(path.join(root, "protocol/runtime/typescript/ingress.ts"), "utf8");
const goIngress = await readFile(path.join(root, "protocol/runtime/go/ingress.go"), "utf8");
const tsProfile = await readFile(path.join(root, "protocol/runtime/typescript/profile.ts"), "utf8");
const tsGeneratedProfile = await readFile(path.join(root, "protocol/runtime/typescript/profile.generated.ts"), "utf8");
const goProfile = await readFile(path.join(root, "protocol/runtime/go/profile.go"), "utf8");
const goGeneratedProfile = await readFile(path.join(root, "protocol/runtime/go/profile_generated.go"), "utf8");

if (!tsIngress.includes("M1_RELEASE_PROFILE")) errors.push("TypeScript ingress does not consume the canonical M1 release profile");
if (!goIngress.includes("DefaultM1ReleaseProfile()")) errors.push("Go ingress does not consume the canonical M1 release profile");
if (!tsProfile.includes("validateReleaseProfile(GENERATED_M1_RELEASE_PROFILE)")) errors.push("TypeScript profile is not startup validated");
if (!goProfile.includes("ValidateReleaseProfile(generatedM1ReleaseProfile)")) errors.push("Go profile is not startup validated");

const tsDigest = tsGeneratedProfile.match(/GENERATED_M1_RELEASE_PROFILE_DIGEST = "([0-9a-f]{64})"/);
const goDigest = goGeneratedProfile.match(/M1ReleaseProfileDigest = "([0-9a-f]{64})"/);
if (!tsDigest || !goDigest || tsDigest[1] !== goDigest[1]) {
  errors.push("generated TypeScript and Go release-profile digests differ or are invalid");
}

const forbiddenIngressConstants = /\b(?:MAX_BODY_BYTES|MAX_JSON_DEPTH|MAX_JSON_TOKENS|MAX_OBJECT_MEMBERS|MAX_ARRAY_ITEMS|MAX_STRING_CODE_POINTS|MAX_NUMBER_DIGITS|MAX_EXPONENT_MAGNITUDE)\b/;
if (forbiddenIngressConstants.test(tsIngress) || forbiddenIngressConstants.test(goIngress)) {
  errors.push("mutable ingress limits were reintroduced as local business-logic constants");
}
if (/process\.env|Deno\.env|Bun\.env/.test(tsProfile) || /os\.Getenv|LookupEnv/.test(goProfile)) {
  errors.push("production release-profile selection must not use environment overrides");
}

const tsSchemaRuntime = await readFile(path.join(root, "protocol/runtime/typescript/schema.ts"), "utf8");
const goSchemaRuntime = await readFile(path.join(root, "protocol/runtime/go/schema.go"), "utf8");
const generatedTypeScript = await readFile(path.join(root, "protocol/generated/typescript/types.ts"), "utf8");
const generatedGo = await readFile(path.join(root, "protocol/generated/go/types.go"), "utf8");
if (!tsSchemaRuntime.includes("errorDetails: readonly ProtocolErrorDetail[]")) {
  errors.push("TypeScript schema validation does not expose typed error details");
}
if (!goSchemaRuntime.includes("ValidateDefinitionWithProofDetails")) {
  errors.push("Go schema validation does not expose typed error details");
}
if (!generatedTypeScript.includes('new IngressError("UNION_DISCRIMINATOR_MISMATCH"')) {
  errors.push("generated TypeScript converters do not use typed discriminator errors");
}
if (!generatedGo.includes('&protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH"')) {
  errors.push("generated Go converters do not use typed discriminator errors");
}

const storageProductionPaths = [
  "edge/case-do/sql.ts",
  "edge/case-do/schema.ts",
  "edge/case-do/records.ts",
  "edge/case-do/admission.ts",
  "edge/case-do/repository.ts",
  "edge/case-do/internal-records.ts",
  "edge/case-do/control.ts",
  "edge/case-do/cursor.ts",
  "edge/case-do/query.ts",
];
const storageProduction = new Map();
for (const relative of storageProductionPaths) {
  const content = await readFile(path.join(root, relative), "utf8");
  storageProduction.set(relative, content);
  if (content.includes("node:sqlite")) errors.push(`${relative}: production storage code must not import node:sqlite`);
}
const storageTestSupport = await readFile(path.join(root, "edge/case-do/node-sqlite.test-support.ts"), "utf8");
if (!storageTestSupport.includes('from "node:sqlite"')) {
  errors.push("CaseDO Node SQLite adapter must remain explicit test support");
}
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (!packageJson.scripts?.["test:ts"]?.includes("edge/case-do/*.test.ts")) {
  errors.push("test:ts does not include the CaseDO storage test boundary");
}
const storageSchema = storageProduction.get("edge/case-do/schema.ts") ?? "";
const storageAdmission = storageProduction.get("edge/case-do/admission.ts") ?? "";
if (!storageAdmission.includes('NEW_CASE_ROUTE_DOMAIN = "tdev.new-case-route.v1"')) {
  errors.push("CaseDO deterministic new-Case route domain is missing");
}
if (!storageAdmission.includes("parseStoredSubmitOperationResult")) {
  errors.push("CaseDO admission replay does not validate the stored submit result shape");
}
if (!storageSchema.includes('CASE_DO_SCHEMA_DIGEST = "601b9c0a2dfbc7d7cb47abb0423cb5014e2ba86a08dd169514c0ab82980f2e86"')) {
  errors.push("CaseDO schema digest identity differs from the accepted M1 contract");
}
if (!storageSchema.includes('CASE_DO_MIGRATION_ID = "case_do.empty_to_v1.logical.v1"') ||
    !storageSchema.includes('CASE_DO_MIGRATION_CHECKSUM = "e6974b3c3922c99da7386617315261d0ac42842ae1f6715d1b946dffe2995e77"') ||
    !storageSchema.includes("CASE_DO_LOGICAL_MIGRATION_BYTES")) {
  errors.push("CaseDO logical migration identity differs from accepted Design 0005");
}
const storageRepository = storageProduction.get("edge/case-do/repository.ts") ?? "";
const storageControl = storageProduction.get("edge/case-do/control.ts") ?? "";
const storageCursor = storageProduction.get("edge/case-do/cursor.ts") ?? "";
const storageQuery = storageProduction.get("edge/case-do/query.ts") ?? "";
if (!storageRepository.includes("verifyCaseDoSchema(db)")) {
  errors.push("CaseDO repository does not fail closed on exact schema identity before use");
}
if (!storageControl.includes("MutationReceiptV1") || !storageControl.includes("transactionSync")) {
  errors.push("CaseDO control core lacks receipt-bound callback transaction markers");
}
if (!storageCursor.includes("tdev.cursor.v1") || !storageCursor.includes("timingSafeEqual")) {
  errors.push("CaseDO cursor core lacks canonical domain or constant-time verification markers");
}
if (!storageQuery.includes("renderTask") || !storageQuery.includes("listResources")) {
  errors.push("CaseDO query core lacks bounded resource/render entrypoints");
}
if (!storageSchema.includes("subject_kind TEXT") || !storageSchema.includes("subject_id TEXT")) {
  errors.push("CaseDO mutation receipt storage cannot reconstruct the canonical subject selector");
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
