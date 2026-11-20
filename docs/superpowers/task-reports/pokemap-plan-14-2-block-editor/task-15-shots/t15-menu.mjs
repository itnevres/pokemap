// Plan 14.2 Task 15 row 3e: the map context menu (zooms, scroll, event overlay, no side effects, disabled cases, close).
// usage: node t15-menu.mjs <tag> <gba|gbc> <uiPort> <map> <eventCell x,y (GBC: step coords)> <otherMap>
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const require = createRequire("C:/Users/Serve/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/");
const { chromium } = require("playwright-core");
const OUT = fileURLToPath(new URL("./out/", import.meta.url)); mkdirSync(OUT, { recursive: true });
const [tag, family, uiPort, map, eventCell, otherMap] = process.argv.slice(2);
const out = { tag, family, map, checks: [], console: [] };
const check = (name, ok, detail) => out.checks.push({ name, result: ok ? "pass" : "fail", detail });
const browser = await chromium.launch({ executablePath: "C:/Users/Serve/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
page.on("pageerror", (e) => out.console.push(String(e).slice(0, 200)));
page.on("dialog", (d) => d.accept());
const wait = (ms) => page.waitForTimeout(ms);
const canvasSel = family === "gbc" ? "canvas.gbc-map-canvas__stage, canvas.map-canvas__stage" : "canvas.map-canvas__stage";
const menu = () => page.locator(".world-context-menu");
const item = () => page.getByRole("menuitem", { name: /Edit block/ });
const plan = () => page.evaluate(async (m) => ((await (await fetch(`/api/edit/${m}/plan`)).json()).changes ?? []).length, map);
const scrollState = () => page.evaluate((sel) => { const out = []; for (let e = document.querySelector(sel); e; e = e.parentElement) if (e.scrollHeight > e.clientHeight || e.scrollWidth > e.clientWidth) out.push([e.className.slice(0, 30), e.scrollLeft, e.scrollTop]); return JSON.stringify(out); }, canvasSel);
async function hoverCell(x, y) {
  await page.mouse.move(x, y); await wait(120);
  const m = await page.evaluate(() => /\((\d+), (\d+)\)(?: step \((\d+), (\d+)\))? id (0x[0-9a-f]+)/i.exec(document.body.innerText));
  return m ? { x: +m[1], y: +m[2], sx: m[3] && +m[3], sy: m[4] && +m[4], id: m[5] } : null;
}
// Walk to a cell by the status-bar readout (GBC: step coords if present, else block coords).
async function pointFor(cx, cy) {
  const b = await page.locator(canvasSel).first().boundingBox();
  let x = Math.round(b.x + b.width / 2), y = Math.round(b.y + b.height / 2);
  for (let i = 0; i < 60; i++) {
    const h = await hoverCell(x, y); if (!h) throw new Error("no readout");
    const hx = family === "gbc" ? h.sx : h.x, hy = family === "gbc" ? h.sy : h.y;
    if (hx === cx && hy === cy) return { x, y, h };
    x += Math.sign(cx - hx) * Math.max(2, Math.min(48, Math.abs(cx - hx) * 6));
    y += Math.sign(cy - hy) * Math.max(2, Math.min(48, Math.abs(cy - hy) * 6));
  }
  throw new Error(`cell ${cx},${cy} not reached`);
}
// Right-click, then Edit block: the dialog must name the block under the pointer; nothing staged, nothing scrolled.
async function menuAt(label, x, y, open = true) {
  const h = await hoverCell(x, y); const s0 = JSON.stringify(h), p0 = await plan();
  await page.mouse.click(x, y, { button: "right" }); await wait(500);
  const shown = await menu().count(), enabled = shown ? !(await item().isDisabled()) : null;
  await page.keyboard.press("Escape"); await wait(150); const s1 = JSON.stringify(await hoverCell(x, y)), p1 = await plan(); // same cell under the pointer = no pan
  if (open && enabled) { await page.mouse.click(x, y, { button: "right" }); await wait(400); }
  let dialog = null;
  if (open && enabled) {
    await item().click(); await page.locator(".block-editor__preview").waitFor({ timeout: 15000 }).catch(() => {}); await wait(500);
    dialog = await page.locator(".block-editor").first().getAttribute("aria-label").catch(() => null);
    await page.locator(".block-editor").getByRole("button", { name: "Cancel", exact: true }).click().catch(() => {}); await wait(500);
  }
  const blockOf = (id) => (family === "gbc" ? "$" : "$") + parseInt(id, 16).toString(16).toUpperCase().padStart(family === "gbc" ? 2 : 3, "0");
  const r = { label, hover: h, shown, enabled, dialog, scrolled: s0 !== s1, staged: p1 - p0 };
  out[label] = r;
  return { ...r, blockOk: !!dialog && !!h && dialog.endsWith(blockOf(h.id)) };
}
try {
  await page.goto(`http://localhost:${uiPort}/`); await wait(3000);
  await page.getByRole("button", { name: map, exact: true }).first().click(); await wait(4000);
  const zoom = (z) => page.locator("button", { hasText: new RegExp(`^${z}×$`) }).first().click().then(() => wait(3000));
  for (const z of [1, 2, 4]) {
    await zoom(z);
    const b = await page.locator(canvasSel).first().boundingBox();
    const vx = Math.min(b.x + b.width / 2, 700), vy = Math.min(b.y + b.height / 2, 480);
    const r = await menuAt(`zoom${z}`, Math.round(vx), Math.round(vy));
    check(`zoom ${z}x: menu opens on an interior cell, dialog names the hovered block, no paint / place / pan`, r.shown && r.enabled && r.blockOk && !r.scrolled && r.staged === 0, r);
  }
  // After a pan (scroll the stage at 4x), the menu still targets the cell under the pointer.
  const h0 = await hoverCell(700, 480); // pan = left drag with no tool active
  await page.mouse.down(); await page.mouse.move(560, 380, { steps: 8 }); await page.mouse.up(); await wait(800);
  out.afterPanScroll = { before: h0, after: await hoverCell(700, 480) };
  const rp = await menuAt("pan", 700, 480);
  check("after a pan (drag at 4x): menu targets the hovered cell", JSON.stringify(out.afterPanScroll.before) !== JSON.stringify(out.afterPanScroll.after) && rp.shown && rp.enabled && rp.blockOk && rp.staged === 0, { ...rp, scroll: out.afterPanScroll });
  await zoom(1);
  // Event overlay on: right-click an event's cell; GBC quadrant -> its block.
  await page.locator("button", { hasText: /^Events$/ }).first().click().catch(() => {}); await wait(800);
  out.eventsPressed = await page.locator("button", { hasText: /^Events$/ }).first().getAttribute("aria-pressed").catch(() => null);
  const [ex, ey] = eventCell.split(",").map(Number); const ep = await pointFor(ex, ey);
  const re = await menuAt("event", ep.x, ep.y);
  check(`over an event overlay at ${eventCell}${family === "gbc" ? " (step; quadrant)" : ""}: Edit block opens the cell's block, nothing placed`, re.shown && re.enabled && re.blockOk && re.staged === 0, { ...re, eventsPressed: out.eventsPressed });
  // Outside the interior (border area): item disabled.
  const b = await page.locator(canvasSel).first().boundingBox();
  const ro = await menuAt("outside", Math.round(b.x + 6), Math.round(b.y + 6), false);
  check("outside the interior: Edit block disabled (or no menu)", ro.shown === 0 || ro.enabled === false, ro);
  // Escape closes.
  await page.keyboard.press("Escape"); await wait(300);
  const ip = await pointFor(ex, ey);
  await page.mouse.click(ip.x, ip.y, { button: "right" }); await wait(400);
  const before = await menu().count(); await page.keyboard.press("Escape"); await wait(300);
  check("Escape closes the menu", before === 1 && (await menu().count()) === 0, { before, after: await menu().count() });
  // During a barrier (undo pending): paint one cell, hold the undo request, right-click while it waits.
  await page.locator(".toolbar button", { hasText: "Pencil" }).first().click(); await wait(200);
  const pal = page.locator('[aria-label^="metatile "]').nth(2); await pal.click(); await wait(200);
  await page.mouse.click(ip.x, ip.y); await wait(1500);
  out.stagedForBarrier = await plan();
  let release; const gate = new Promise((r) => { release = r; });
  out.routeHits = []; out.reqs = []; page.on("request", (q) => { if (/\/api\/edit\//.test(q.url()) && q.method() === "POST") out.reqs.push(q.url().replace(/^.*\/api/, "")); });
  await page.route(/\/api\/edit\/[^/]+\/undo/, async (route) => { out.routeHits.push(route.request().url()); await gate; await route.continue(); });
  await page.locator('.toolbar button[aria-label="Undo"]').first().click(); await wait(300);
  await page.mouse.click(ip.x, ip.y, { button: "right" }); await wait(400);
  const rb = { shown: await menu().count(), enabled: (await menu().count()) ? !(await item().isDisabled()) : null };
  await page.keyboard.press("Escape"); release(); await wait(2500); await page.unroute(/\/api\/edit\/[^/]+\/undo/);
  out.planAfterUndo = await plan();
  check("during a barrier (undo pending): Edit block disabled", out.stagedForBarrier > 0 && rb.shown === 1 && rb.enabled === false, { ...rb, staged: out.stagedForBarrier, planAfterUndo: out.planAfterUndo });
  // Map switch closes: open the menu, switch maps by the sidebar.
  await page.mouse.click(ip.x, ip.y, { button: "right" }); await wait(400);
  const open1 = await menu().count();
  await page.getByRole("button", { name: otherMap, exact: true }).first().click(); await wait(3000);
  check("map switch closes the menu", open1 === 1 && (await menu().count()) === 0, { open1, after: await menu().count() });
} catch (e) { out.error = String(e?.stack ?? e).slice(0, 800); await page.screenshot({ path: `${OUT}${tag}-error.png` }).catch(() => {}); }
await page.evaluate(async (m) => fetch(`/api/edit/${m}/discard`, { method: "POST", body: "{}" }), map).catch(() => {});
await browser.close();
writeFileSync(`${OUT}${tag}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ tag, checks: out.checks.map((c) => `${c.result} ${c.name}`), fails: out.checks.filter((c) => c.result === "fail").map((c) => JSON.stringify(c.detail).slice(0, 400)), error: out.error?.slice(0, 400), console: out.console }, null, 1));
