// Plan 8 Task 7 coordinator mutations (spec M1-M5). Run with cwd = mutation worktree root.
// Anchors are filled in after the implementation lands (ANCHOR COUNT != 1 = skipped, fix the anchor).
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const G = "packages/ui/src/shared/useBeforeUnloadGuard.ts";
const R = "packages/ui/src/shared/useStrokeChain.ts";
const C = "packages/ui/src/shared/useEditSessionCore.ts";
const E = "packages/ui/src/hooks/useMapEditing.ts";
const files = {
  guard: "packages/ui/test/shared/useBeforeUnloadGuard.test.tsx",
  registry: "packages/ui/test/shared/useStrokeChainRegistry.test.tsx",
  core: "packages/ui/test/shared/useEditSessionCore.test.tsx",
  gbaApp: "packages/ui/test/App.test.tsx",
  gbcEditing: "packages/ui/test/gbc/GbcAppEditing.test.tsx",
  gbaStroke: "packages/ui/test/AppContextStroke.test.tsx",
  gbcStroke: "packages/ui/test/gbc/GbcAppContextStroke.test.tsx",
  mapEditing: "packages/ui/test/useMapEditing.test.tsx",
  gbaCtxVisit: "packages/ui/test/AppContextVisit.test.tsx",
};
const mutants = [
  [G, "M0 baseline (no change)", "if (!isDirty) return;", "if (!isDirty) return;"],
  [G, "M1 guard always attached", "if (!isDirty) return;", ""],
  [R, "M2 strokeSettled resolves at once", "const strokeSettled = useCallback(() => Promise.all", "const strokeSettled = useCallback(() => Promise.resolve() ?? Promise.all"],
  [R, "M3 registry ignores unmount", "else chains.current.delete(chain);", ";"],
  [C, "M4 discard wipes unconditionally", "setStored((prev) => (prev?.forMap === mapName ? null : prev));", "setStored(null);"],
  [E, "M5 visit reset removed", "if (visit.changed) {", "if (false) {"],
];
// Kills: assertion messages, plus "promise resolved … instead of rejecting" (an expect().rejects that resolved).
const KILL = /AssertionError|expected|TestingLibraryElementError|instead of rejecting/;
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
  console.log("restored byte-identical:", [G, R, C, E].map((f) => spawnSync("git", ["diff", "--quiet", "--", f]).status === 0));
}
console.log("\n" + out.join("\n"));
