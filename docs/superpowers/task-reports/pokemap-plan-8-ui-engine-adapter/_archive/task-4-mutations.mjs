// Plan 8 Task 4 coordinator mutations (Step 6). Run with cwd = mutation worktree root.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const H = "packages/ui/src/hooks/useGuardedFetch.ts";
const files = {
  sharedOld: "packages/ui/test/useGuardedFetch.test.ts",
  shared: "packages/ui/test/useGuardedFetch.stale.test.ts",
  gba: "packages/ui/test/useFetchedFamilyGba.test.tsx",
  gbc: "packages/ui/test/gbc/useFetchedFamilyGbc.test.tsx",
};
const mutants = [
  [H, "T0 baseline (no change)", "if (!cancelled) setData(d);", "if (!cancelled) setData(d);"],
  [H, "T1 stale-response guard removed (Step 4)", "if (!cancelled) setData(d);", "setData(d);"],
  [H, "T2 unguarded rejects everything", "return true;", "return false;"],
];
const KILL = /AssertionError|expected|TestingLibraryElementError/;
const out = [];
let F, orig;
try {
  for (const [file, name, anchor, repl] of mutants) {
    F = file; orig = readFileSync(F);
    const raw = orig.toString("utf8");
    const crlf = raw.includes("\r\n");
    const src = raw.replace(/\r\n/g, "\n");
    const n = src.split(anchor).length - 1;
    if (n !== 1) { out.push(`${name}: ANCHOR COUNT ${n} (skipped)`); console.log(out.at(-1)); continue; }
    let m = src.replace(anchor, repl);
    if (crlf) m = m.replace(/\n/g, "\r\n");
    writeFileSync(F, m);
    const row = [name];
    for (const [k, f] of Object.entries(files)) {
      const r = spawnSync("npx", ["vitest", "run", f, "--reporter=json"], { shell: true, encoding: "utf8", maxBuffer: 1 << 28 });
      let failed = -1, passed = -1, killMsg = false;
      try {
        const j = JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
        failed = j.numFailedTests; passed = j.numPassedTests;
        if (failed === 0 && passed === 0) { row.push(`${k}=COLLECT_FAIL`); continue; }
        killMsg = j.testResults.some((t) => t.assertionResults.some((a) => a.status === "failed" && a.failureMessages.some((x) => KILL.test(x))));
      } catch { row.push(`${k}=PARSE_ERR`); continue; }
      row.push(`${k}=${failed}F/${passed}P${failed > 0 ? (killMsg ? " KILL" : " FAIL(no-assert-msg)") : ""}`);
    }
    out.push(row.join("  "));
    writeFileSync(F, orig);
    console.log(out.at(-1));
  }
} finally {
  if (F) writeFileSync(F, orig);
  console.log("restored byte-identical:", [H].map((f) => spawnSync("git", ["diff", "--quiet", "--", f]).status === 0));
}
console.log("\n" + out.join("\n"));
