import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { spawnSync } from "node:child_process";

const baseline = JSON.parse(readFileSync(new URL("../ci/eslint-baseline.json", import.meta.url), "utf8"));
const eslintBin = process.platform === "win32" ? "node_modules/.bin/eslint.cmd" : "node_modules/.bin/eslint";
const run = spawnSync(eslintBin, ["-f", "json", "."], { encoding: "utf8" });

if (run.error) throw run.error;
if (!run.stdout.trim()) {
  process.stderr.write(run.stderr || "ESLint produced no JSON output\n");
  process.exit(run.status || 1);
}

const reports = JSON.parse(run.stdout);
const errorKeys = [];
let warningCount = 0;
for (const report of reports) {
  const file = relative(process.cwd(), report.filePath).replaceAll("\\", "/");
  for (const message of report.messages) {
    if (message.severity === 1) warningCount += 1;
    if (message.severity !== 2) continue;
    errorKeys.push(`${file}|${message.line}|${message.ruleId ?? "unknown-rule"}`);
  }
}

const expected = new Set(baseline.entries);
const actual = new Set(errorKeys);
const unexpected = [...actual].filter((key) => !expected.has(key)).sort();
const stale = [...expected].filter((key) => !actual.has(key)).sort();

console.log(`ESLint: ${actual.size} baseline error(s), ${warningCount} warning(s). Baseline owner: ${baseline.ownerTask}.`);

if (unexpected.length) {
  console.error("New ESLint errors not present in the owned baseline:");
  for (const key of unexpected) console.error(`  ${key}`);
}
if (stale.length) {
  console.error("Baseline entries no longer reproduce; remove them in the same change that fixed the error:");
  for (const key of stale) console.error(`  ${key}`);
}

if (unexpected.length || stale.length) process.exit(1);
