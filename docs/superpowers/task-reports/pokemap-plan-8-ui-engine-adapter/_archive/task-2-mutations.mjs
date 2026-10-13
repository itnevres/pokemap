// Plan 8 Task 2 coordinator mutations (Step 6). Run with cwd = mutation worktree root.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const H = "packages/ui/src/shared/useWorldContext.ts";
const GA = "packages/ui/src/components/WorldCanvas.tsx";
const GC = "packages/ui/src/gbc/GbcWorldCanvas.tsx";
const files = {
  shared: "packages/ui/test/shared/useWorldContext.test.tsx",
  gbaWC: "packages/ui/test/WorldCanvasContext.test.tsx",
  gbaApp: "packages/ui/test/AppContextEdit.test.tsx",
  gbcWC: "packages/ui/test/gbc/GbcWorldCanvasContext.test.tsx",
  gbcApp: "packages/ui/test/gbc/GbcAppContext.test.tsx",
  gbcZoom: "packages/ui/test/gbc/GbcWorldCanvasContextZoom.test.tsx",
};
const mutants = [
  [H, "M0 baseline (no change)", "window.addEventListener(\"keydown\", onKeyDown, true);", "window.addEventListener(\"keydown\", onKeyDown, true);"],
  [H, "M1a native forced 16 (default reintroduced)", "const { native, context,", "const native = 16; const { native: _native, context,"],
  [H, "M1b native forced 32", "const { native, context,", "const native = 32; const { native: _native, context,"],
  [H, "M2 Escape listener in bubble phase", "window.addEventListener(\"keydown\", onKeyDown, true);", "window.addEventListener(\"keydown\", onKeyDown, false);"],
  [GA, "M3a GBA canvas key toggled by context", "          <canvas\n            ref={canvasRef}\n            className={stageClassName}", "          <canvas\n            key={context ? \"ctx\" : \"world\"}\n            ref={canvasRef}\n            className={stageClassName}"],
  [GC, "M3b GBC canvas key toggled by context", "          <canvas\n            ref={canvasRef}\n            className=\"world-canvas__stage\"", "          <canvas\n            key={context ? \"ctx\" : \"world\"}\n            ref={canvasRef}\n            className=\"world-canvas__stage\""],
  [H, "M4 outside double-click ignored", "if (!inside) context?.onExitRequest();", "if (false && !inside) context?.onExitRequest();"],
  [H, "M5 indexOf -1 unclamped (pre-fix step)", "    setContextZoom(target);\n  };", "    void target; setContextZoom(ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, ZOOM_LEVELS.indexOf(z) + direction))]!);\n  };"],
  [H, "M6 no focus on exit", "if (snappedForRef.current !== null) canvasRef.current?.focus();", "/* no focus */"],
  [H, "M7 family isBlocked ignored", "e.defaultPrevented || isBlockedRef.current() ||", "e.defaultPrevented ||"],
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
        if (j.numTotalTestSuites === 0 || (failed === 0 && passed === 0)) { row.push(`${k}=COLLECT_FAIL`); continue; }
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
  console.log("restored byte-identical:", [H, GA, GC].map((f) => spawnSync("git", ["diff", "--quiet", "--", f]).status === 0));
}
console.log("\n" + out.join("\n"));
