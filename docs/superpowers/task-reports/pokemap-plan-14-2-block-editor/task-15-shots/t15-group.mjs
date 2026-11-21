// Plan 14.2 Task 15 rows 1 / 3c: Ctrl / Ctrl+Shift placement groups in the block editor (no Save; Cancel at the end).
// usage: node t15-group.mjs <tag> <gba|gbc> <uiPort> <map> <pid> case... ; case = <sheetIndex>@<square>:<1x1|2x2|4x4>
// Oracle: the picker's own hover readout ("Tile: $XX") per sheet index, and the spec rule (sheet coordinates,
// src = k + dy*16 + dx; skip past the sheet end, past the row edge, past the block edge; nothing wraps).
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const require = createRequire("C:/Users/Serve/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/");
const { chromium } = require("playwright-core");
const OUT = fileURLToPath(new URL("./out/", import.meta.url)); mkdirSync(OUT, { recursive: true });
const [tag, family, uiPort, map, pid, ...cases] = process.argv.slice(2);
const out = { tag, family, map, pid, checks: [], cases: [], console: [] };
const check = (name, ok, detail) => out.checks.push({ name, result: ok ? "pass" : "fail", detail });
const browser = await chromium.launch({ executablePath: "C:/Users/Serve/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
page.on("pageerror", (e) => out.console.push(String(e).slice(0, 200)));
const wait = (ms) => page.waitForTimeout(ms);
const dlg = () => page.locator(".block-editor").first();
const W = family === "gbc" ? 4 : 2; // squares per row (GBA: one layer of 2x2)
try {
  await page.goto(`http://localhost:${uiPort}/`); await wait(3000);
  await page.getByRole("button", { name: map, exact: true }).first().click(); await wait(4000);
  const cell = page.getByRole("button", { name: `metatile ${pid}`, exact: true }).first();
  await cell.scrollIntoViewIfNeeded(); await cell.click({ button: "right" });
  await page.locator(".block-editor__preview").waitFor({ timeout: 15000 }); await wait(800);
  out.label = await dlg().getAttribute("aria-label");
  const sheet = dlg().getByRole("img", { name: "Tile sheet" });
  const sb = await sheet.boundingBox(); out.sheetBox = sb;
  const nIdx = Math.round(sb.width / 16) * Math.round(sb.height / 16);
  const tileAt = async (k) => { // hover readout for a sheet index; null when empty / past the end
    if (k < 0 || k >= nIdx) return null;
    await sheet.hover({ position: { x: (k % 16) * 16 + 8, y: Math.floor(k / 16) * 16 + 8 }, timeout: 5000 }); await wait(60); // element-relative: the dialog scrolls
    const t = await page.getByTestId("block-editor-hover").innerText();
    return /Tile: \$([0-9A-F]+)/.exec(t)?.[1] ?? (t ? t : null);
  };
  // Sheet end: last index with a tile readout.
  let last = nIdx - 1; while (last > 0 && (await tileAt(last)) === null) last--;
  out.sheet = { indices: nIdx, lastIndex: last, lastTile: await tileAt(last) };
  if (family === "gbc") out.gap = { i95: await tileAt(95), i96: await tileAt(96), i97: await tileAt(97) };
  if (family === "gba") { await dlg().getByRole("tab", { name: "Top" }).click(); await wait(200); }
  const squares = async () => (await dlg().locator(".block-editor__grid button").allInnerTexts()).map((s) => s.replace("$", ""));
  // Mode heading while the modifiers are held.
  await page.keyboard.down("Control"); await wait(150);
  out.mode2 = await page.getByTestId("block-editor-mode").innerText().catch(() => null);
  await page.keyboard.down("Shift"); await wait(150);
  out.mode4 = await page.getByTestId("block-editor-mode").innerText().catch(() => null);
  await page.keyboard.up("Shift"); await page.keyboard.up("Control"); await wait(150);
  out.modeNone = await page.getByTestId("block-editor-mode").count();
  check("mode heading: Ctrl shows Place 2x2", out.mode2 === "Place 2x2", out.mode2);
  check(`mode heading: Ctrl+Shift shows ${family === "gbc" ? "Place 4x4" : "Place 2x2 (4x4 not offered on GBA)"}`, out.mode4 === (family === "gbc" ? "Place 4x4" : "Place 2x2"), out.mode4);
  check("mode heading gone with no modifier", out.modeNone === 0, out.modeNone);
  for (const c of cases) {
    const [, k0, sq0, mode] = /^(\d+|last)@(\d+):(1x1|2x2|4x4)$/.exec(c);
    const k = k0 === "last" ? last : Number(k0), sq = Number(sq0);
    const before = await squares();
    const eff = family === "gba" && mode === "4x4" ? "2x2" : mode; const n = { "1x1": 1, "2x2": 2, "4x4": 4 }[eff];
    const expect = [...before]; const skipped = [];
    for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) {
      const sx = sq % W + dx, sy = Math.floor(sq / W) + dy;
      if (sx >= W || sy * W >= before.length) { skipped.push(`block edge ${dx},${dy}`); continue; }
      if (k % 16 + dx >= 16) { skipped.push(`row edge ${dx},${dy}`); continue; }
      let t = await tileAt(k + dy * 16 + dx);
      // GBC reserved tiles read "Reserved at run time": the spec rule places them anyway (no skip for reserved);
      // their id comes from the GBC sheet rule (index < $60 -> tile index, else index + $20).
      if (family === "gbc" && t === "Reserved at run time") { const i = k + dy * 16 + dx; t = (i < 0x60 ? i : i + 0x20).toString(16).toUpperCase().padStart(2, "0"); skipped.push(`(reserved ${i} placed as $${t})`); }
      if (t === null || !/^[0-9A-F]+$/.test(t)) { skipped.push(`sheet ${k + dy * 16 + dx}: ${t}`); continue; }
      expect[sy * W + sx] = t;
    }
    // Clicking the selected index again deselects it: click only on a change.
    if (out.sel !== k) { await sheet.click({ position: { x: (k % 16) * 16 + 8, y: Math.floor(k / 16) * 16 + 8 } }); await wait(150); out.sel = k; }
    const mods = mode === "4x4" ? ["Control", "Shift"] : mode === "2x2" ? ["Control"] : [];
    // Hold the keys first: the mode heading appears on keydown and moves the grid.
    for (const m of mods) await page.keyboard.down(m); await wait(200);
    await dlg().getByRole("button", { name: `Square ${sq}`, exact: true }).click({ modifiers: mods, timeout: 5000 });
    for (const m of mods.reverse()) await page.keyboard.up(m); await wait(300);
    const after = await squares();
    out.cases.push({ c, k, sq, mode, eff, before, expect, after, skipped });
    check(`${c} (${eff}) places the sheet group, skips ${skipped.length}`, JSON.stringify(after) === JSON.stringify(expect), { before, expect, after, skipped });
  }
  await dlg().getByRole("button", { name: "Cancel", exact: true }).click(); await wait(800);
  const plan = await page.evaluate(async (m) => ((await (await fetch(`/api/edit/${m}/plan`)).json()).changes ?? []).length, map);
  check("Cancel stages nothing", plan === 0 && (await page.locator(".block-editor").count()) === 0, plan);
} catch (e) { out.error = String(e?.stack ?? e).slice(0, 800); await page.screenshot({ path: `${OUT}${tag}-error.png` }).catch(() => {}); }
await browser.close();
writeFileSync(`${OUT}${tag}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ tag, label: out.label, sheet: out.sheet, gap: out.gap, checks: out.checks.map((c) => `${c.result} ${c.name}`), fails: out.checks.filter((c) => c.result === "fail").map((c) => c.detail), error: out.error?.slice(0, 300), console: out.console }, null, 1));
