// Plan 8 Task 1 coordinator mutations. Run with cwd = mutation worktree root.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const F = "packages/ui/src/shared/useStrokeChain.ts";
const files = {
  shared: "packages/ui/test/shared/useStrokeChain.test.tsx",
  gba: "packages/ui/test/MapCanvasStroke.test.tsx",
  gbaOld: "packages/ui/test/MapCanvas.test.tsx",
  gbcEdit: "packages/ui/test/gbc/GbcMapCanvasEdit.test.tsx",
  gbcNew: "packages/ui/test/gbc/GbcMapCanvasStroke.test.tsx",
};
const mutants = [
  ["M0 baseline (no change)", "        finish(null); // lost mouseup", "        finish(null); // lost mouseup"],
  ["M1 begin not awaited", "          await session.beginStroke();", "          void session.beginStroke();"],
  ["M2 move apply not chained", "if (owns(stroke) && stroke.begun) return stroke.session.applyPaint(body);", "if (owns(stroke) && stroke.begun) { void stroke.session.applyPaint(body); }"],
  ["M3 end not awaited", "        await stroke.session.endStroke();\n      });", "        void stroke.session.endStroke();\n      });"],
  ["M4 retired visit still paints", "if (owns(stroke) && stroke.begun) return stroke.session.applyPaint(body);", "if (stroke.begun) return stroke.session.applyPaint(body);"],
  ["M5 no lost-mouseup end", "        finish(null); // lost mouseup", "        // finish(null); // lost mouseup"],
  ["M6 no terminal catch", "        .catch((e) => report(stroke, e))\n        .catch(() => {})", "        .catch((e) => report(stroke, e))"],
];
const KILL = /AssertionError|expected|TestingLibraryElementError/;
const orig = readFileSync(F);
const src = orig.toString("utf8").replace(/\r\n/g, "\n");
const crlf = orig.toString("utf8").includes("\r\n");
const out = [];
try {
  for (const [name, anchor, repl] of mutants) {
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
  writeFileSync(F, orig);
  console.log("restored byte-identical:", Buffer.compare(readFileSync(F), orig) === 0);
}
console.log("\n" + out.join("\n"));
