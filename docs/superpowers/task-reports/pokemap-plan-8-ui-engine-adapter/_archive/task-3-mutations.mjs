// Plan 8 Task 3 coordinator mutations (Step 6). Run with cwd = mutation worktree root.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const H = "packages/ui/src/shared/useContextEditing.ts";
const A = "packages/ui/src/App.tsx";
const GA = "packages/ui/src/gbc/GbcApp.tsx";
const MC = "packages/ui/src/components/MapCanvas.tsx";
const GC = "packages/ui/src/gbc/GbcMapCanvas.tsx";
const files = {
  shared: "packages/ui/test/shared/useContextEditing.test.tsx",
  gbaStroke: "packages/ui/test/AppContextStroke.test.tsx",
  gbaCtx: "packages/ui/test/AppContextEdit.test.tsx",
  gbcStroke: "packages/ui/test/gbc/GbcAppContextStroke.test.tsx",
  gbcCtx: "packages/ui/test/gbc/GbcAppContext.test.tsx",
};
const settled = "strokeSettled: () => Promise.all([...chains.current].map((c) => c.settled())).then(() => {}),";
const mutants = [
  [H, "N0 baseline (no change)", "leaveContext,\n  };", "leaveContext,\n  };"],
  [H, "N1 requestExit does not await (decides at once)", "      strokeSettled().then(() => {\n        if (exitRequested.current === request) setExitPending(true);\n      });", "      void strokeSettled; setExitPending(true);"],
  [H, "N2 commit bumps every tile", "setTileVersions((t) => ({ ...t, [contextMap]: (t[contextMap] ?? 0) + 1 }));", "setTileVersions((t) => Object.fromEntries([...new Set([...Object.keys(t), contextMap])].map((k) => [k, (t[k] ?? 0) + 1])));"],
  [A, "N3a GBA mode switch prompts", "  const switchMode = (next: Mode) => {\n    ctx.leaveContext();", "  const switchMode = (next: Mode) => {\n    if (editSession.isDirty) { ctx.requestExit(); return; }\n    ctx.leaveContext();"],
  [GA, "N3b GBC mode switch prompts", "  const switchMode = (next: Mode) => {\n    ctx.leaveContext();", "  const switchMode = (next: Mode) => {\n    if (session.isDirty) { ctx.requestExit(); return; }\n    ctx.leaveContext();"],
  [A, "N4a GBA strokeSettled ignores chains", settled, "strokeSettled: () => Promise.resolve(),"],
  [GA, "N4b GBC strokeSettled ignores chains", settled, "strokeSettled: () => Promise.resolve(),"],
  [MC, "N5a GBA canvas never registers", "    onStrokeChain?.(chain, true);", "    // onStrokeChain?.(chain, true);"],
  [GC, "N5b GBC canvas never registers", "    onStrokeChain?.(chain, true);", "    // onStrokeChain?.(chain, true);"],
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
  console.log("restored byte-identical:", [H, A, GA, MC, GC].map((f) => spawnSync("git", ["diff", "--quiet", "--", f]).status === 0));
}
console.log("\n" + out.join("\n"));
