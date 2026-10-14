// Plan 8 Task 5 coordinator mutations (Step 6). Run with cwd = mutation worktree root.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const H = "packages/ui/src/shared/useEditSessionCore.ts";
const files = {
  core: "packages/ui/test/shared/useEditSessionCore.test.tsx",
  gba: "packages/ui/test/useEditSession.test.tsx",
  gbaGuard: "packages/ui/test/useEditSessionGuard.test.tsx",
  gbaShared: "packages/ui/test/useEditSessionShared.test.tsx",
  gbc: "packages/ui/test/gbc/useGbcEditSession.test.tsx",
  gbcShared: "packages/ui/test/gbc/useGbcEditSessionShared.test.tsx",
};
const guard = "if (current.mapName !== ticket.map || current.seed !== ticket.seed || ticket.seq <= seq.current.applied) return false;";
const mutants = [
  [H, "E0 baseline (no change)", guard, guard],
  [H, "E1 response guard removed", guard, "/* guard removed */"],
  [H, "E2 discard stores an empty grid", "setStored(null); // show disk seed", "setStored({ forMap: latest.current.mapName, seed: latest.current.seed, state: { ...latest.current.seed, blocks: [] } as State, isDirty: false, canUndo: false, canRedo: false }); // show disk seed"],
  [H, "E3 discard swallows !ok", "if (!r.ok) throw new Error(`POST ${base}/${mapName}/discard -> ${r.status}`);", "/* !ok swallowed */"],
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
