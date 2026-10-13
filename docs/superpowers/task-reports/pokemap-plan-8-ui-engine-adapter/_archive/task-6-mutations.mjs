// Plan 8 Task 6 coordinator mutations (spec Teeth-proof V1-V3). Run with cwd = mutation worktree root.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const V = "packages/ui/src/shared/useVisit.ts";
const W = "packages/ui/src/shared/EditingWorkspace.tsx";
const files = {
  visit: "packages/ui/test/shared/useVisit.test.tsx",
  shell: "packages/ui/test/shared/EditingWorkspace.test.tsx",
  gbaGuard: "packages/ui/test/AppVisitGuard.test.tsx",
  gbaActive: "packages/ui/test/MapEditingWorkspaceActive.test.tsx",
  gbaCtx: "packages/ui/test/AppContextEdit.test.tsx",
  gbaCtxVisit: "packages/ui/test/AppContextVisit.test.tsx",
  gbcEditing: "packages/ui/test/gbc/GbcMapEditing.test.tsx",
  gbcCtx: "packages/ui/test/gbc/GbcAppContext.test.tsx",
};
const changedSrc = "const changed = visit.key !== key;\n  if (changed) setVisit({ key });";
const guardSrc = "return { changed, isCurrent: () => currentVisit.current === visit };";
const bodySrc = '<div className="app__map-editing-body">';
const mutants = [
  [V, "V0 baseline (no change)", guardSrc, guardSrc],
  [V, "V1 changed never reported", changedSrc, "const changed = false;\n  if (visit.key !== key) setVisit({ key });"],
  [V, "V2 isCurrent always true", guardSrc, "return { changed, isCurrent: () => true };"],
  [W, "V3 body remounts on active toggle", bodySrc, '<div key={String(active)} className="app__map-editing-body">'],
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
  console.log("restored byte-identical:", [V, W].map((f) => spawnSync("git", ["diff", "--quiet", "--", f]).status === 0));
}
console.log("\n" + out.join("\n"));
