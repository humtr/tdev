import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const forbidden = [
  /cloudflare/i,
  /node:fs/,
  /node:child_process/,
  /node:net/,
  /node:http/,
  /os\/exec/,
  /net\/http/,
  /termux/i,
  /git(?:hub)?\.com/i,
];

async function files(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (entry.isFile() && /\.(?:go|ts)$/.test(entry.name) && !/\.test\.|_test\.go$/.test(entry.name)) result.push(path);
  }
  return result;
}

const violations = [];
for (const path of await files("domain")) {
  const content = await readFile(path, "utf8");
  const importLines = content.split("\n").filter((line) => /^\s*(?:import|require\b|\"[^\"]+\"\s*$)/.test(line));
  for (const line of importLines) {
    for (const pattern of forbidden) {
      if (pattern.test(line)) violations.push(`${path}: ${line.trim()}`);
    }
  }
}
if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("domain import boundary: clean");
}
