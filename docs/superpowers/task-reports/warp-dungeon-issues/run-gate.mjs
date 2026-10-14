import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, basename, dirname } from "node:path";

const reportDir = "docs/superpowers/task-reports/warp-dungeon-issues";
const configPath = "pokemap.config.json";
const before = readFileSync(configPath);
const config = JSON.parse(before.toString("utf8"));
const { root } = JSON.parse(readFileSync(`${reportDir}/scratch-gba.json`, "utf8"));
// Each resumed shell gets a new sandbox temp root; use the recorded task copy.
if (!basename(resolve(root)).startsWith("pokemap-issues-gate-") || basename(dirname(resolve(root))).toLowerCase() !== "temp") throw new Error("Gate root escaped task temp directory");
const results = [];
try {
  config.projectPath = root;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  for (const [name, command] of [["full-suite", "npm test"], ["typecheck", "npm run typecheck"], ["build", "npm run build --workspace @pokemap/ui"]]) {
    const result = spawnSync("cmd.exe", ["/d", "/s", "/c", command], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
    const output = (result.stdout ?? "") + (result.stderr ?? "");
    writeFileSync(`${reportDir}/${name}.log`, output);
    results.push({ name, command, status: result.status, error: result.error?.message, nonempty: output.trim().length > 0 });
    console.log(`${name}: ${result.status}; ${output.length} chars captured`);
  }
} finally {
  writeFileSync(configPath, before);
  const restored = readFileSync(configPath).equals(before);
  writeFileSync(`${reportDir}/gate-results.json`, JSON.stringify({ scratchRoot: root, configRestoredByteIdentically: restored, results }, null, 2) + "\n");
  if (!restored) throw new Error("Config restoration failed");
}
if (results.some((result) => result.status !== 0 || !result.nonempty)) process.exitCode = 1;
