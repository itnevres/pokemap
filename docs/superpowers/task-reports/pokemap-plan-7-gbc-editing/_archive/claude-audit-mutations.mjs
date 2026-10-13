// Coordinator mutation audit for Plan 7 Task 5b at ef248a3, run in detached worktree `m`.
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const SP = "C:/Users/Serve/AppData/Local/Temp/claude/C--Programming-Projects-PokeMap/de65dc83-a8ac-4e90-90c5-9892d741d3b7/scratchpad";
const WT = join(SP, "m");
const LOG = join(SP, "mut.log");
const OUT = join(SP, process.argv.length > 2 ? "mut-rerun-results.json" : "mut-results.json");
const TESTS = ["packages/ui/test/gbc", "packages/ui/test/world"];
const S = "packages/ui/src/";

const M = [
  ["X1-native-default", S + "world/contextView.ts", "const NATIVE = 16;", "const NATIVE = 32;"],
  ["X2-gbc-native-16", S + "gbc/GbcWorldCanvas.tsx", "native: BLOCK_PX,", "native: 16,"],
  ["X3-remount", S + "gbc/GbcWorldCanvas.tsx", 'className="world-canvas__stage"', 'key={context ? "ctx" : "world"} className="world-canvas__stage"'],
  ["X4-bubble-escape", S + "gbc/GbcWorldCanvas.tsx", 'window.addEventListener("keydown", onKeyDown, true);', 'window.addEventListener("keydown", onKeyDown, false);'],
  ["X5-dirty-exit-no-dialog", S + "gbc/GbcApp.tsx", "if (session.isDirty) setSaveOpen(true);", "if (false) setSaveOpen(true);"],
  ["X6-bump-every-tile", S + "gbc/GbcWorldCanvas.tsx", "imageCacheRef.current.delete(map);", "imageCacheRef.current.clear();"],
  ["X7-origin-literal-0", S + "gbc/GbcMapCanvas.tsx", "export const GBC_COMPOSITE_ORIGIN = BORDER_RINGS * BLOCK_PX;", "export const GBC_COMPOSITE_ORIGIN = 0;"],
  ["X8-edit-here-disabled", S + "gbc/GbcWorldCanvas.tsx", '({ label: "Edit here", onSelect:', '({ label: "Edit here", disabled: true, onSelect:'],
  ["B1-begin-not-awaited", S + "gbc/GbcMapCanvas.tsx", "await editSession.beginStroke();", "void editSession.beginStroke();"],
  ["B1-drag-apply-not-chained", S + "gbc/GbcMapCanvas.tsx", "if (ownsStroke(stroke) && stroke.begun) return paintAt(cell.x, cell.y);", "if (ownsStroke(stroke) && stroke.begun) { void paintAt(cell.x, cell.y); }"],
  ["B1-end-not-awaited", S + "gbc/GbcMapCanvas.tsx", "await editSession.endStroke();", "void editSession.endStroke();"],
  ["B1-retired-visit-paints", S + "gbc/GbcMapCanvas.tsx", "stroke.begun = true;", "stroke.begun = true; if (true) return paintAt(cell.x, cell.y);"],
  ["IMG-cached-ignored", S + "gbc/GbcMapCanvas.tsx", "setLoadedImageUrl(img?.complete === true && img.naturalWidth > 0 ? imageUrl : null);", "setLoadedImageUrl(null);"],
];

function run(tag) {
  const r = spawnSync("npx", ["vitest", "run", ...TESTS], { cwd: WT, shell: true, encoding: "utf8", maxBuffer: 1 << 28 });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  appendFileSync(LOG, `\n===== ${tag} exit=${r.status}\n${out}`);
  const clean = out.replace(/\x1b\[[0-9;]*m/g, "");
  const line = clean.split("\n").find((l) => /^\s*Tests\s/.test(l)) ?? "";
  const n = (re) => Number((line.match(re) ?? [0, 0])[1]);
  const failedNames = [...clean.matchAll(/^\s*(?:FAIL|×)\s+(.+)$/gm)].map((m) => m[1].trim()).slice(0, 12);
  return { exit: r.status, passed: n(/(\d+) passed/), failed: n(/(\d+) failed/), assertion: /AssertionError|expected|TestingLibraryElementError/i.test(clean), failedNames };
}

const results = { base: run("baseline"), mutations: [] };
const ONLY = process.argv.slice(2);
for (const [id, rel, anchor, repl] of M.filter(([id]) => ONLY.length === 0 || ONLY.includes(id))) {
  const path = join(WT, rel);
  const original = readFileSync(path);
  const text = original.toString("utf8");
  const count = text.split(anchor).length - 1;
  if (count !== 1) { results.mutations.push({ id, error: `anchor count ${count}` }); continue; }
  let mutant, restored, same;
  try {
    writeFileSync(path, text.replace(anchor, repl));
    mutant = run(id + " MUTANT");
  } finally {
    writeFileSync(path, original);
    same = Buffer.compare(readFileSync(path), original) === 0;
  }
  restored = run(id + " RESTORED");
  const killed = mutant.exit !== 0 && mutant.failed > 0 && mutant.assertion;
  results.mutations.push({ id, killed, mutant, restoredGreen: restored.exit === 0 && restored.failed === 0 && restored.passed > 0, restoredPassed: restored.passed, bytesRestored: same });
  writeFileSync(OUT, JSON.stringify(results, null, 2));
}
writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(results.mutations.map((m) => `${m.id}: ${m.error ?? (m.killed ? "KILLED" : "SURVIVED")} (${m.mutant?.failed ?? "-"} fail) restored=${m.restoredGreen}/${m.bytesRestored}`).join("\n"));
console.log(`baseline: ${results.base.passed} pass / ${results.base.failed} fail`);
