// Shared helpers for the Plan 4 row 6a benchmark scripts. Run via node_modules/.bin/tsx.
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const WORKTREE = fileURLToPath(new URL("../../../", import.meta.url));

export const SUBJECTS = {
  gba: "C:/Programming Projects/Pokemon Game/game",
  gbc: "C:/Programming Projects/pokecrystal-PerfPlus",
};

const FAMILIES = ["gba", "gbc"];

function fail(msg) {
  console.error(`bench: ${msg}`);
  process.exit(1);
}

export function parseArgs(argv) {
  const families = [];
  let root;
  let runs;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) fail(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--family") {
      const f = next();
      if (!FAMILIES.includes(f)) fail(`--family must be gba or gbc, got ${f}`);
      families.push(f);
    } else if (a === "--root") root = path.resolve(next());
    else if (a === "--runs") {
      runs = Number(next());
      if (!Number.isInteger(runs) || runs < 1) fail("--runs must be a positive integer");
    } else fail(`unknown argument ${a}`);
  }
  const fams = families.length ? [...new Set(families)] : FAMILIES;
  if (root && fams.length !== 1) fail("--root needs exactly one --family");
  return { families: fams, root, runs: runs ?? 7 };
}

export function rootOf(family, root) {
  return root ?? SUBJECTS[family];
}

export function stats(msArray) {
  const s = [...msArray].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return { n: 0, min: NaN, p50: NaN, p95: NaN, max: NaN };
  const pct = (p) => s[Math.min(n - 1, Math.ceil((p / 100) * n) - 1)];
  const r = (x) => Math.round(x * 10) / 10;
  return { n, min: r(s[0]), p50: r(pct(50)), p95: r(pct(95)), max: r(s[n - 1]) };
}

export function fmt(ms) {
  return ms.toFixed(1);
}

// Flatten a stats() result into BENCH keys: <prefix>_p50_ms, <prefix>_p95_ms, <prefix>_max_ms.
export function statFields(prefix, s) {
  return { [`${prefix}_p50_ms`]: s.p50, [`${prefix}_p95_ms`]: s.p95, [`${prefix}_max_ms`]: s.max };
}

// Keys ending in _ms print with one decimal; everything else prints as-is.
export function printResult(name, family, fields) {
  const parts = Object.entries(fields).map(([k, v]) => {
    if (typeof v === "number" && k.endsWith("_ms")) return `${k}=${fmt(v)}`;
    return `${k}=${v}`;
  });
  console.log(`BENCH ${name} ${family} ${parts.join(" ")}`);
}

export function machineLine() {
  const cpu = os.cpus()[0]?.model ?? "unknown";
  const cores = os.cpus().length;
  const ramGb = (os.totalmem() / 1024 ** 3).toFixed(1);
  let commit = "unknown";
  try {
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: WORKTREE, encoding: "utf8" }).trim();
  } catch {
    // leave as unknown
  }
  return `MACHINE cpu="${cpu}" cores=${cores} ram_gb=${ramGb} node=${process.version} commit=${commit}`;
}
