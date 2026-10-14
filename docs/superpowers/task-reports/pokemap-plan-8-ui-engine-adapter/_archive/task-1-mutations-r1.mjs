// Plan 8 Task 1 coordinator mutations. Run with cwd = mutation worktree root.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const H = "packages/ui/src/shared/useStrokeChain.ts";
const E = "packages/ui/src/hooks/useEditSession.ts";
const files = {
  shared: "packages/ui/test/shared/useStrokeChain.test.tsx",
  gba: "packages/ui/test/MapCanvasStroke.test.tsx",
  gbaOld: "packages/ui/test/MapCanvas.test.tsx",
  gbcEdit: "packages/ui/test/gbc/GbcMapCanvasEdit.test.tsx",
  gbcNew: "packages/ui/test/gbc/GbcMapCanvasStroke.test.tsx",
  guard: "packages/ui/test/useEditSessionGuard.test.tsx",
};
const mutants = [
  [H, "M0 baseline (no change)", "        finish(null); // lost mouseup", "        finish(null); // lost mouseup"],
  [H, "M1 begin not awaited", "          await session.beginStroke();", "          void session.beginStroke();"],
  [H, "M2 move apply not chained", "if (owns(stroke) && stroke.begun) return stroke.session.applyPaint(body);", "if (owns(stroke) && stroke.begun) { void stroke.session.applyPaint(body); }"],
  [H, "M3 end not awaited", "        await stroke.session.endStroke();\n      });", "        void stroke.session.endStroke();\n      });"],
  [H, "M4 retired visit still paints", "if (owns(stroke) && stroke.begun) return stroke.session.applyPaint(body);", "if (stroke.begun) return stroke.session.applyPaint(body);"],
  [H, "M5 no lost-mouseup end", "        finish(null); // lost mouseup", "        // finish(null); // lost mouseup"],
  [H, "M6 no terminal catch", "        .catch((e) => report(stroke, e))\n        .catch(() => {})", "        .catch((e) => report(stroke, e))"],
  [H, "M7 retire-before-begin still begins", "          if (!owns(stroke)) return;\n          await session.beginStroke();","          await session.beginStroke();"],
  [H, "M8 report not guarded", "try { onErrorRef.current(e instanceof Error ? e.message : \"Paint failed.\"); } catch { /* a throwing handler must not skip the end (M3) */ }", "onErrorRef.current(e instanceof Error ? e.message : \"Paint failed.\");"],
  [E, "M9 GBA map guard removed", "if (currentMapRef.current === mapName) applyResponse(d);", "applyResponse(d);"],
];
const KILL = /AssertionError|expected|TestingLibraryElementError/;
const out = [];
let F, orig;
try {
  for (const [file, name, anchor, repl] of mutants) {
    F = file; orig = readFileSync(F);
    const src = orig.toString("utf8").replace(/\r\n/g, "\n");
    const crlf = orig.toString("utf8").includes("\r\n");
    const n = src.split(anchor).length - 1;
    if (n !== 1) { out.push(`${name}: ANCHOR COUNT ${n} (skipped)`); continue; }
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
  console.log("restored byte-identical:", [H, E].map((f) => spawnSync("git", ["diff", "--quiet", "--", f]).status === 0));
}
console.log("\n" + out.join("\n"));
