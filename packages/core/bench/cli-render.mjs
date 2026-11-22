// `pokemap render <map>` as a child process, wall-clock including process start. Target: warm p50 under 300 ms.
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs, rootOf, stats, printResult, machineLine, WORKTREE } from "./lib.mjs";

const TARGET_MS = 300;
const MAPS = { gba: "LittlerootTown", gbc: "NewBarkTown" };
const WIN = process.platform === "win32";
const TSX = path.join("node_modules", ".bin", WIN ? "tsx.cmd" : "tsx");
const CLI = path.join("packages", "cli", "src", "index.ts");

// Windows goes through cmd (shell:true, required for .cmd), so quote each argument.
const quote = (a) => (WIN ? `"${a}"` : a);

function runOnce(family, root, i) {
  const out = path.join(os.tmpdir(), `pokemap-bench-${process.pid}-${family}-${i}.png`);
  const args = [CLI, "--project", root, "render", MAPS[family], "-o", out];
  const t = performance.now();
  const r = WIN
    ? spawnSync(TSX, args.map(quote), { cwd: WORKTREE, shell: true, encoding: "utf8" })
    : spawnSync(TSX, args, { cwd: WORKTREE, encoding: "utf8" });
  const ms = performance.now() - t;
  try {
    unlinkSync(out);
  } catch {
    // output may not exist when the run failed
  }
  if (r.error || r.status !== 0) {
    console.error(`bench: cli render ${family} run ${i} failed (status ${r.status})`);
    if (r.stdout) console.error(r.stdout);
    console.error(r.stderr || r.error);
    process.exit(1);
  }
  return ms;
}

function bench(family, root, runs) {
  const times = [];
  for (let i = 0; i < runs; i++) times.push(runOnce(family, root, i));
  const warm = stats(times.slice(1));
  return {
    map: MAPS[family],
    runs,
    first_run_ms: times[0],
    warm_p50_ms: warm.p50,
    warm_p95_ms: warm.p95,
    warm_max_ms: warm.max,
    target_ms: TARGET_MS,
    warm_p50_within_target: warm.p50 < TARGET_MS,
  };
}

const { families, root, runs } = parseArgs(process.argv.slice(2));
if (runs < 2) {
  console.error("bench: --runs must be at least 2 (the first run is reported separately)");
  process.exit(1);
}
console.log(machineLine());
for (const family of families) {
  printResult("cli-render", family, bench(family, rootOf(family, root), runs));
}
