// Plan 14.2 Task 15 live acceptance driver (from plan-10a3 shots/live.mjs).
// usage: node t15-live.mjs <tag> <gba|gbc> <uiPort> <clone> <map> [key=value ...]
//   keys: scenario=edit|discard|saveAsNew|probe  alias=<map opened afterwards>  at=<fx,fy canvas fraction>
//         save=1 (Save at the end; scratch clones only)  zoom=<n wheel steps>  pan=<dx,dy drag before the click>
// Writes out/<tag>.json (+ PNGs on failure). Every check is recorded as pass/fail/n-a; no early abort.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const require = createRequire("C:/Users/Serve/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/");
const { chromium } = require("playwright-core");
const OUT = fileURLToPath(new URL("./out/", import.meta.url)); mkdirSync(OUT, { recursive: true });
const [tag, family, uiPort, clone, map, ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map((kv) => kv.split("=")));
const scenario = opt.scenario ?? "edit";
const out = { tag, family, map, scenario, checks: [], net: [], console: [] };
const check = (name, ok, detail) => out.checks.push({ name, result: ok === null ? "n-a" : ok ? "pass" : "fail", detail });
const git = (...a) => execFileSync("git", ["-C", clone, ...a], { encoding: "utf8" });

const browser = await chromium.launch({ executablePath: "C:/Users/Serve/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe", headless: true });
const vw = Number(opt.vw ?? 1400), vh = Number(opt.vh ?? 900);
const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${OUT}${tag}-${n}.png` }).catch(() => {});
ctx.on("page", (pg) => pg.on("dialog", (d) => d.accept()));
page.on("dialog", (d) => { out.confirms = [...(out.confirms ?? []), d.message().slice(0, 120)]; d.accept(); });
page.on("pageerror", (e) => out.console.push({ pageerror: String(e).slice(0, 300) }));
page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) out.console.push(m.text().slice(0, 200)); });
page.on("response", async (r) => {
  const u = r.url(); if (!/\/api\//.test(u)) return;
  const e = { m: r.request().method(), u: u.replace(/^.*\/api/, ""), s: r.status() };
  if (/\/block(\/|\?|$)/.test(u) && r.request().method() === "POST") { e.req = r.request().postData()?.slice(0, 400); try { e.res = (await r.text()).slice(0, 400); } catch {} }
  if (/\/block\?/.test(u) && r.request().method() === "GET") { try { e.res = (await r.text()).slice(0, 300); } catch {} }
  out.net.push(e);
});
const canvasSel = family === "gbc" ? "canvas.gbc-map-canvas__stage, canvas.map-canvas__stage" : "canvas.map-canvas__stage";
const dlg = () => page.locator(".block-editor").first();
const dirty = () => page.evaluate(() => !!document.querySelector('[data-testid="dirty-indicator"]') || /unsaved changes/i.test(document.querySelector(".toolbar")?.textContent ?? ""));
const tvs = () => [...new Set(out.net.map((n) => /tv=(\d+)/.exec(n.u)?.[1]).filter(Boolean))];

// Count exact occurrences of a 16x16 data-URL image on the stage canvas at zoom 1, 2 or 4 (nearest neighbour).
const findOnCanvas = (src, near, pg = page) => pg.evaluate(async ({ src, sel, near }) => {
  const img = new Image(); img.src = src; await img.decode();
  const t = document.createElement("canvas"); t.width = img.width; t.height = img.height;
  const tc = t.getContext("2d"); tc.drawImage(img, 0, 0); const p = tc.getImageData(0, 0, t.width, t.height).data;
  const c = document.querySelector(sel); const W = c.width, H = c.height;
  const d = c.getContext("2d").getImageData(0, 0, W, H).data;
  const res = { size: `${img.width}x${img.height}`, zoom: null, hits: 0, nearHit: false, at: [] };
  for (const z of [1, 2, 4]) {
    const bw = img.width * z, bh = img.height * z;
    for (let y = 0; y + bh <= H; y++) for (let x = 0; x + bw <= W; x++) {
      let ok = true;
      for (let j = 0; ok && j < img.height; j++) for (let i = 0; i < img.width; i++) {
        const a = ((y + j * z) * W + (x + i * z)) * 4, b = (j * img.width + i) * 4;
        if (d[a] !== p[b] || d[a + 1] !== p[b + 1] || d[a + 2] !== p[b + 2]) { ok = false; break; }
      }
      if (!ok) continue;
      res.hits++; if (res.at.length < 4) res.at.push([x, y]); res.zoom = z;
      if (near && near[0] >= x && near[0] < x + bw && near[1] >= y && near[1] < y + bh) { res.nearHit = true; res.nearAt = [x, y]; }
    }
    if (res.hits) break;
  }
  return res;
}, { src, sel: canvasSel, near });

async function openMap(name, pg = page) {
  await pg.getByRole("button", { name, exact: true }).first().click(); await pg.waitForTimeout(4000);
}
// The status bar's hover readout "(x, y) id 0x.." names the cell under the pointer.
async function hoverCell(pg, x, y) {
  await pg.mouse.move(x, y); await pg.waitForTimeout(150);
  const m = await pg.evaluate(() => /\((\d+), (\d+)\) id (0x[0-9a-f]+)/i.exec(document.body.innerText));
  return m ? { x: +m[1], y: +m[2], id: m[3] } : null;
}
async function pointForCell(pg, b, cx, cy) {
  let x = Math.round(b.x + b.width / 2), y = Math.round(b.y + b.height / 2);
  for (let i = 0; i < 40; i++) {
    let h = null; for (let k = 0; k < 30 && !h; k++) { h = await hoverCell(pg, x + (k % 2), y); if (!h) await pg.waitForTimeout(500); }
    if (!h) throw new Error("no hover readout");
    if (h.x === cx && h.y === cy) {
      // Centre the point in the cell: walk to both edges.
      let l = x, r = x, t = y, d = y;
      while ((await hoverCell(pg, l - 1, y))?.x === cx && l > b.x) l--;
      while ((await hoverCell(pg, r + 1, y))?.x === cx && r < b.x + b.width) r++;
      while ((await hoverCell(pg, x, t - 1))?.y === cy && t > b.y) t--;
      while ((await hoverCell(pg, x, d + 1))?.y === cy && d < b.y + b.height) d++;
      return { b, x: Math.round((l + r) / 2), y: Math.round((t + d) / 2), cellPx: [r - l + 1, d - t + 1] };
    }
    x += Math.sign(cx - h.x) * Math.max(4, Math.min(64, Math.abs(cx - h.x) * 12));
    y += Math.sign(cy - h.y) * Math.max(4, Math.min(64, Math.abs(cy - h.y) * 12));
  }
  throw new Error(`cell ${cx},${cy} not reached`);
}
async function canvasPoint() {
  const b = await page.locator(canvasSel).first().boundingBox();
  const [fx, fy] = (opt.at ?? "0.5,0.5").split(",").map(Number);
  return { b, x: Math.round(b.x + b.width * fx), y: Math.round(b.y + b.height * fy) };
}
const selState = () => page.evaluate(() => [...document.querySelectorAll('.metatile-palette__cell--selected,[aria-pressed="true"][aria-label^="metatile"]')].map((e) => e.getAttribute("aria-label")).join(","));
async function openEditorAt(p) {
  if (opt.via === "tool") { // Plan 14.2 14b: Edit block tool (K), left click on the cell
    await page.mouse.move(p.x, p.y); await page.keyboard.press("k"); await wait(300);
    const pressed = await page.locator('.toolbar button[aria-pressed="true"]').allInnerTexts().catch(() => []);
    const lab = await page.evaluate(() => [...document.querySelectorAll('.toolbar [aria-pressed="true"]')].map((e) => e.getAttribute("aria-label")).join(","));
    await page.mouse.click(p.x, p.y); await wait(800);
    await page.locator(".block-editor__preview").waitFor({ timeout: 15000 }).catch(() => {});
    return { menu: `tool pressed: ${lab} ${pressed.join(",")}`, label: await dlg().getAttribute("aria-label").catch(() => null) };
  }
  if (opt.via === "palette") { // 14b: right-click a palette entry; GBA selection must not change
    const cell = page.getByRole("button", { name: `metatile ${opt.pid}`, exact: true }).first();
    if (opt.presel) { await page.getByRole("button", { name: `metatile ${opt.presel}`, exact: true }).first().click(); await wait(300); }
    await cell.scrollIntoViewIfNeeded(); out.selBefore = await selState();
    await cell.click({ button: "right" }); await wait(800);
    await page.locator(".block-editor__preview").waitFor({ timeout: 15000 }).catch(() => {});
    out.selAfter = await selState();
    check("palette right-click leaves the selection unchanged", out.selBefore === out.selAfter, { before: out.selBefore, after: out.selAfter });
    return { menu: "palette (no menu)", label: await dlg().getAttribute("aria-label").catch(() => null) };
  }
  await page.mouse.click(p.x, p.y, { button: "right" }); await wait(500);
  const menu = await page.locator(".world-context-menu").innerText().catch(() => "");
  await page.getByRole("menuitem", { name: /Edit block/ }).click().catch(() => {});
  await page.locator(".block-editor__preview").waitFor({ timeout: 15000 }).catch(() => {});
  await wait(800);
  return { menu, label: await dlg().getAttribute("aria-label").catch(() => null), text: (await dlg().innerText().catch(() => "")).split("\n").filter((l) => !/^MB_|^\d+$/.test(l)).slice(0, 25).join(" | ") };
}
const previewSrc = () => page.locator(".block-editor__preview").getAttribute("src");
async function waitPreviewChange(prev) {
  for (let i = 0; i < 30; i++) { const s = await previewSrc().catch(() => null); if (s && s !== prev) return s; await wait(200); }
  return previewSrc().catch(() => null);
}
async function editDraft() {
  if (opt.edit?.startsWith("tile:")) { // pick a sheet tile, then paint it into square 0 (GBA: top layer)
    const k = Number(opt.edit.slice(5));
    if (family === "gba") { await dlg().getByRole("tab", { name: "Top" }).click(); await wait(200); }
    await dlg().getByRole("img", { name: "Tile sheet" }).click({ position: { x: (k % 16) * 16 + 8, y: Math.floor(k / 16) * 16 + 8 } }); await wait(200);
    await dlg().getByRole("button", { name: "Square 0", exact: true }).click(); await wait(300);
    return `sheet index ${k} into square 0${family === "gba" ? " (top)" : ""}`;
  }
  if (opt.edit === "allLocal") { // GBC 2 / 3a: an All change on square 0 and a Local change on square 1 in one draft
    const sel = dlg().getByRole("combobox", { name: "Palette" }); const done = [];
    for (const [sq, scope, step] of [[0, "All", 3], [1, "Local", 5]]) {
      await dlg().getByRole("button", { name: `Square ${sq}`, exact: true }).click(); await wait(200);
      const opts = (await sel.locator("option").allInnerTexts()).filter((o) => o !== ""); const cur = await sel.inputValue();
      const next = opts[(opts.indexOf(cur) + step) % opts.length];
      await sel.selectOption(next); await wait(300);
      await page.locator('[aria-label="Palette scope"]').getByRole("button", { name: scope, exact: true }).click(); await wait(300);
      done.push(`square ${sq} ${cur} -> ${next} (${scope})`);
    }
    return done.join("; ");
  }
  if (opt.edit === "xflip") { await dlg().getByRole("checkbox", { name: "X flip" }).click(); return "X flip on square 0"; }
  // Change square 0's palette (GBA: bottom layer; GBC: answer the scope prompt with opt.scope, default Local).
  const sel = dlg().getByRole("combobox", { name: "Palette" });
  const opts = await sel.locator("option").allInnerTexts(); const cur = await sel.inputValue();
  const next = opt.pal ?? opts.filter((o) => o !== "")[(opts.indexOf(cur) + 5) % opts.filter((o) => o !== "").length];
  await sel.selectOption(next); await wait(300);
  const scope = opt.scope === "all" ? "All" : "Local";
  const prompt = page.locator('[aria-label="Palette scope"]');
  if (await prompt.count()) await prompt.getByRole("button", { name: scope, exact: true }).click();
  if (family === "gba") { // the bottom layer is often hidden: change the top layer too
    await dlg().getByRole("tab", { name: "Top" }).click(); await wait(200);
    const curTop = await sel.inputValue(); await sel.selectOption(next); return `palette ${cur} -> ${next} on square 0 bottom, ${curTop} -> ${next} top`;
  }
  return `palette ${cur} -> ${next} on square 0 (${scope})`;
}
async function okAndConfirm(button = "OK") {
  await dlg().getByRole("button", { name: button, exact: true }).click(); await wait(2500);
  const conf = page.locator('section[aria-label="Confirm edit"]');
  const confirmText = (await conf.count()) ? await conf.innerText() : null;
  const status = (await dlg().locator('[role="status"],[role="alert"],[role="note"]').allInnerTexts().catch(() => [])).map((t) => t.length > 300 ? `${t.slice(0, 300)}… (${t.length} chars)` : t);
  if (confirmText && opt.confirm === "cancel") {
    await conf.getByRole("button", { name: "Cancel" }).click(); await wait(800);
    const kept = await previewSrc().catch(() => null), applies = out.net.filter((n) => /block\/apply/.test(n.u)).length;
    check("confirm Cancel keeps the draft and stages nothing", kept === opt._post && applies === 0 && !(await dirty()), { applies });
    await conf.count().then(() => {}); await dlg().getByRole("button", { name: button, exact: true }).click(); await wait(2500);
  }
  if (confirmText) { await conf.getByRole("button", { name: "Apply" }).click(); await wait(3000); }
  return { confirmText: confirmText?.slice(0, 600) ?? null, status, open: (await page.locator(".block-editor").count()) > 0 };
}
async function discardAll() {
  await toolbar("Discard Changes").click(); await wait(3000);
  return out.confirms?.at(-1);
}
const toolbar = (name) => page.locator(`.toolbar button[aria-label="${name}"]`).first();

try {
  await page.goto(`http://localhost:${uiPort}/`); await wait(3000);
  await openMap(map);
  out.cleanup = await page.evaluate(async (m) => { // a fresh page does not show a hub-staged edit as dirty (finding F1)
    const p = await (await fetch(`/api/edit/${m}/plan`)).json(); if (!p.changes?.length) return null;
    await fetch(`/api/edit/${m}/discard`, { method: "POST", body: "{}" }); return p.changes.map((c) => c.summary);
  }, map);
  if (out.cleanup) { await page.reload(); await wait(3000); await openMap(map); }
  let p = await canvasPoint();
  if (opt.cell) p = await pointForCell(page, p.b, ...opt.cell.split(",").map(Number));
  out.hover = await hoverCell(page, p.x, p.y);
  await page.mouse.move(p.b.x + 2, p.b.y + 2); // no hover outline near the cell
  const near = [p.x - p.b.x, p.y - p.b.y];
  const ed = await openEditorAt(p);
  out.editor = ed;
  if (!opt.via) check("menu opens at the cell with Edit block", /Edit block/.test(ed.menu), ed.menu);
  if (opt.via === "tool") check("K selects the Edit block tool", /Edit block/.test(ed.menu), ed.menu);
  check("dialog opens for the cell", !!ed.label && ed.label !== "Edit block", ed.label);
  const box = await dlg().boundingBox().catch(() => null);
  const scrollFit = await dlg().evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight })).catch(() => null);
  out.dialogBox = { box, scrollFit, vw, vh };
  if (opt.vw) check(`dialog fits ${vw}x${vh}`, !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= vw && box.y + box.height <= vh, out.dialogBox);
  if (opt.esc) { // 3e: Escape closes the context menu without painting
    await page.keyboard.press("Escape"); await wait(300);
  }
  const pre = await previewSrc();
  await page.mouse.move(p.b.x + 2, p.b.y + 2);
  const preHit = await findOnCanvas(pre, near);
  out.preHit = preHit;
  check("A1 preview equals canvas at the clicked cell (pixel compare)", preHit.nearHit, preHit);
  if (scenario === "probe") throw "probe";
  if (scenario === "saveAsNew") {
    const refusal = await dlg().locator('[data-testid="block-editor-refusal"]').innerText().catch(() => null);
    out.saveAsNewRefusal = refusal;
    if (opt.refuse) { // 3: refusal only (cap / shared grid): button state and text, nothing staged
      out.saveAsNewEnabled = await dlg().getByRole("button", { name: "Save as new", exact: true }).isEnabled().catch(() => null);
      if (out.saveAsNewEnabled) { // the refusal may come from the hub on press: draft, press, read, then clean up
        out.draft = await editDraft(); await waitPreviewChange(pre);
        await dlg().getByRole("button", { name: "Save as new", exact: true }).click(); await wait(3000);
        out.pressStatus = (await page.locator('[role="status"],[role="alert"],[data-testid="block-editor-refusal"]').allInnerTexts().catch(() => [])).join(" | ").slice(0, 800);
        out.pressPlan = await page.evaluate(async (m) => ((await (await fetch(`/api/edit/${m}/plan`)).json()).changes ?? []).map((c) => c.summary), map);
        out.pressNet = out.net.filter((n) => /block\/apply/.test(n.u)).map((n) => [n.s, n.res]);
        check("Save as new on a shared grid refuses naming the maps, stages nothing", out.pressPlan.length === 0 && (opt.names ?? "").split("+").every((n) => out.pressStatus.includes(n)), { status: out.pressStatus, plan: out.pressPlan, net: out.pressNet });
        await page.evaluate(async (m) => fetch(`/api/edit/${m}/discard`, { method: "POST", body: "{}" }), map);
      } else check("Save as new refused with a reason", !!refusal, { refusal, enabled: out.saveAsNewEnabled });
      throw "probe";
    }
  }
  out.draft = await editDraft();
  const post = await waitPreviewChange(pre); opt._post = post;
  check("draft preview changes", post !== pre, null);
  const before = { tv: tvs(), dirty: await dirty() };
  const ok = await okAndConfirm(scenario === "saveAsNew" ? "Save as new" : "OK");
  out.ok = ok; out.tvBefore = before.tv;
  check("OK closes the dialog and stages", !ok.open && (await dirty()), ok);
  await wait(1500); await page.mouse.move(p.b.x + 2, p.b.y + 2);
  const postHit = await findOnCanvas(post, near);
  out.postHit = postHit;
  check("canvas redraws the cell to the draft", postHit.nearHit, postHit);
  out.tvAfter = tvs();
  check("tv= refetch after OK", out.tvAfter.some((t) => !before.tv.includes(t)), { before: before.tv, after: out.tvAfter, urls: out.net.filter((n) => /tv=/.test(n.u)).slice(-6).map((n) => n.u) });
  await toolbar("Undo").click(); await wait(2500); await page.mouse.move(p.b.x + 2, p.b.y + 2);
  const undoHit = await findOnCanvas(pre, near);
  const planFiles = () => page.evaluate(async (m) => ((await (await fetch(`/api/edit/${m}/plan`)).json()).changes ?? []).map((c) => c.summary), map);
  out.planAfterUndo = await planFiles();
  check("undo restores the cell", undoHit.nearHit, undoHit);
  check("one undo reverts every staged file (plan empty)", out.planAfterUndo.length === 0, out.planAfterUndo);
  await toolbar("Redo").click(); await page.mouse.move(p.b.x + 2, p.b.y + 2);
  let redoHit; const t0 = Date.now();
  for (let i = 0; i < 20; i++) { await wait(500); redoHit = await findOnCanvas(post, near); if (redoHit.nearHit) break; }
  redoHit.ms = Date.now() - t0; out.planAfterRedo = await planFiles();
  check("redo reapplies", redoHit.nearHit, redoHit);
  if (opt.owner) { // 3d / 5: a second map editing a file this map owns unsaved
    const tab = await ctx.newPage(); await tab.goto(`http://localhost:${uiPort}/`); await tab.waitForTimeout(3000);
    out.ownNet = []; tab.on("response", async (r) => { if (!/\/block\/|\/plan/.test(r.url()) ) return; let res = ""; try { res = (await r.text()).slice(0, 300); } catch {} out.ownNet.push([r.request().method(), r.url().replace(/^.*\/api/, ""), r.status(), res]); });
    tab.on("dialog", (d) => { out.ownDialogs = [...(out.ownDialogs ?? []), d.message().slice(0, 300)]; d.dismiss(); });
    await openMap(opt.owner, tab);
    const tb = await tab.locator(canvasSel).first().boundingBox();
    const tp = opt.ownerCell ? await pointForCell(tab, tb, ...opt.ownerCell.split(",").map(Number)) : { x: Math.round(tb.x + tb.width / 2), y: Math.round(tb.y + tb.height / 2) };
    const d2 = () => tab.locator(".block-editor").first();
    let menu = null, menuHtml = null;
    const tryOk = async () => {
      if (!(await d2().count())) {
        await tab.mouse.click(tp.x, tp.y, { button: "right" }); await tab.waitForTimeout(500);
        menu = await tab.locator(".world-context-menu").innerText().catch(() => "");
        menuHtml = await tab.locator(".world-context-menu").innerHTML().catch(() => "");
        await tab.getByRole("menuitem", { name: /Edit block/ }).click({ timeout: 3000 }).catch(() => {});
        await tab.locator(".block-editor__preview").waitFor({ timeout: 8000 }).catch(() => {}); await tab.waitForTimeout(800);
        if (!(await d2().count())) { await tab.screenshot({ path: `${OUT}${tag}-own.png` }); return { menu, menuHtml: menuHtml.slice(0, 400), plan: [], open: false }; }
        if (family === "gba") { await d2().getByRole("tab", { name: "Top" }).click(); await tab.waitForTimeout(200); }
        const k = Number(opt.ownerTile ?? 45);
        await d2().getByRole("img", { name: "Tile sheet" }).click({ position: { x: (k % 16) * 16 + 8, y: Math.floor(k / 16) * 16 + 8 } }); await tab.waitForTimeout(200);
        await d2().getByRole("button", { name: "Square 0", exact: true }).click(); await tab.waitForTimeout(300);
      }
      await d2().getByRole("button", { name: "OK", exact: true }).click(); await tab.waitForTimeout(2500);
      const conf = tab.locator('section[aria-label="Confirm edit"]');
      if (await conf.count()) { await conf.getByRole("button", { name: "Apply" }).click(); await tab.waitForTimeout(3000); }
      const txt = (await tab.locator('[role="status"],[role="alert"]').allInnerTexts().catch(() => [])).join(" | ").slice(0, 700);
      const plan = await tab.evaluate(async (m) => ((await (await fetch(`/api/edit/${m}/plan`)).json()).changes ?? []).map((c) => c.summary), opt.owner);
      return { txt, plan, open: (await d2().count()) > 0 };
    };
    if (opt.twice) { // 3d: a second edit on the owner map, then one undo: the first edit still owns the file
      const e2 = await openEditorAt(p); const pre2 = await previewSrc().catch(() => null);
      const keep = opt.edit; opt.edit = `tile:${opt.twice}`; out.draft2 = await editDraft(); opt.edit = keep;
      const post2 = await waitPreviewChange(pre2);
      out.ok2 = await okAndConfirm("OK"); out.planTwo = await planFiles();
      check("second edit stages (two changes in history)", post2 !== pre2 && !out.ok2.open, { label: e2.label, plan: out.planTwo });
      await toolbar("Undo").click(); await wait(2500); out.planPartial = await planFiles();
      check("partial undo leaves the first edit staged", out.planPartial.length > 0, out.planPartial);
    }
    out.own1 = await tryOk();
    check("ownership refusal names both maps and the file", !out.own1.plan.length && out.own1.txt.includes(map) && out.own1.txt.includes(opt.owner), out.own1);
    await toolbar("Undo").click(); await wait(2500); // last undo releases the file
    if (await d2().count()) { await d2().getByRole("button", { name: "Cancel", exact: true }).click().catch(() => tab.keyboard.press("Escape")); await tab.waitForTimeout(800); }
    out.own2 = await tryOk();
    check("after the owner's last undo, the second map can edit", out.own2.plan.length > 0, out.own2);
    const hist0 = await planFiles();
    await toolbar("Redo").click(); await wait(3000);
    out.own3 = { alerts: (await page.locator('[role="alert"],[role="status"]').allInnerTexts().catch(() => [])).join(" | ").slice(0, 600), plan: await planFiles(), redoEnabled: await toolbar("Redo").isEnabled() };
    check("redo after another map took the file refuses, history/bytes unchanged", out.own3.plan.length === hist0.length && out.own3.redoEnabled && git("status", "--porcelain").trim() === "", out.own3);
    await tab.evaluate(async (m) => fetch(`/api/edit/${m}/discard`, { method: "POST", body: "{}" }), opt.owner);
    await tab.close();
  }
  if (opt.paintOwner) { // 3d: another map paints the owner's unsaved appended id (palette `newId`) -> refused naming the owner
    const tab = await ctx.newPage(); await tab.goto(`http://localhost:${uiPort}/`); await tab.waitForTimeout(3000);
    out.paintNet = []; tab.on("response", async (r) => { if (!/\/api\/edit\//.test(r.url()) || r.request().method() !== "POST") return; let res = ""; try { res = (await r.text()).slice(0, 300); } catch {} out.paintNet.push([r.url().replace(/^.*\/api/, ""), r.status(), r.request().postData()?.slice(0, 200), res]); });
    await openMap(opt.paintOwner, tab);
    const btn = tab.getByRole("button", { name: `metatile ${opt.newId}`, exact: true }).first();
    out.paintPalette = await btn.count();
    await tab.locator(".toolbar button", { hasText: "Pencil" }).first().click(); await tab.waitForTimeout(300);
    if (out.paintPalette) { await btn.scrollIntoViewIfNeeded(); await btn.click(); await tab.waitForTimeout(300); }
    const tb = await tab.locator(canvasSel).first().boundingBox();
    await tab.mouse.click(Math.round(tb.x + tb.width / 2), Math.round(tb.y + tb.height / 2)); await tab.waitForTimeout(2500);
    out.paintText = (await tab.locator('[role="alert"],[role="status"]').allInnerTexts().catch(() => [])).join(" | ").slice(0, 600);
    out.paintPlan = await tab.evaluate(async (m) => ((await (await fetch(`/api/edit/${m}/plan`)).json()).changes ?? []).map((c) => c.summary), opt.paintOwner);
    await tab.screenshot({ path: `${OUT}${tag}-paint.png` });
    check("painting the owner's unsaved appended id refuses naming the owner", out.paintPalette > 0 && out.paintPlan.length === 0 && out.paintText.includes(map), { palette: out.paintPalette, text: out.paintText, plan: out.paintPlan, net: out.paintNet });
    out.ownerDiscard = (await discardAll()) ?? "";
    out.paintPlanAfterDiscard = await tab.evaluate(async (m) => ((await (await fetch(`/api/edit/${m}/plan`)).json()).changes ?? []).map((c) => c.summary), opt.paintOwner);
    check("after the owner's Discard: no staged grid references the id, clone clean", out.paintPlanAfterDiscard.length === 0 && git("status", "--porcelain").trim() === "", out.paintPlanAfterDiscard);
    await tab.close();
  }
  if (opt.alias) {
    // A second tab on the same hub: a view opened after the OK (leaving the dirty map would prompt).
    const tab = await ctx.newPage(); await tab.goto(`http://localhost:${uiPort}/`); await tab.waitForTimeout(3000);
    await openMap(opt.alias, tab);
    const tb = await tab.locator(canvasSel).first().boundingBox(); await tab.mouse.move(tb.x + 2, tb.y + 2);
    const aliasHit = await findOnCanvas(post, null, tab);
    await tab.screenshot({ path: `${OUT}${tag}-alias.png` });
    if (opt.aliasCell) {
      const q = await pointForCell(tab, tb, ...opt.aliasCell.split(",").map(Number)); await tab.mouse.move(tb.x + 2, tb.y + 2);
      out.aliasCellHit = await findOnCanvas(post, [q.x - tb.x, q.y - tb.y], tab);
      check(`alias cell ${opt.aliasCell} draws the draft (pixel compare)`, out.aliasCellHit.nearHit, out.aliasCellHit);
    }
    await tab.close();
    check(`alias / map opened afterwards (${opt.alias}) draws the edited block (pixel find)`, aliasHit.hits > 0, aliasHit);
    if (opt.aliasCell) {
      const [ax, ay] = opt.aliasCell.split(",");
      out.aliasRead = await page.evaluate(async (u) => (await fetch(u)).json(), `/api/edit/${opt.alias}/block?x=${ax}&y=${ay}`);
      out.editRead = await page.evaluate(async (u) => (await fetch(u)).json(), `/api/edit/${map}/block?${opt.cell ? `x=${opt.cell.split(",")[0]}&y=${opt.cell.split(",")[1]}` : "x=0&y=0"}`);
      const strip = (r) => JSON.stringify({ id: r.blockId, block: r.block });
      check("alias GET returns the edited block data", strip(out.aliasRead) === strip(out.editRead), { alias: strip(out.aliasRead).slice(0, 200) });
    }
  }
  if (scenario === "discard") {
    out.discardDialog = (await discardAll()) ?? "";
    await page.mouse.move(p.b.x + 2, p.b.y + 2);
    check("Discard restores the cell and clears dirty", (await findOnCanvas(pre, near)).nearHit && !(await dirty()), out.discardDialog.slice(0, 200));
    check("Discard leaves the clone untouched", git("status", "--porcelain").trim() === "", git("status", "--porcelain"));
  }
  if (opt.stale) { // 5 / 2: a clone file changed behind the hub -> Save refuses naming it, state kept
    const f = `${clone}/${opt.stale}`, orig = readFileSync(f); const mod = Buffer.from(orig); mod[mod.length - 1] ^= 1; writeFileSync(f, mod);
    try {
      await toolbar("Save Changes").click(); await wait(2500);
      const sd = page.locator('[role="dialog"][aria-label="Save changes"]');
      const sb = sd.getByRole("button", { name: "Save Changes", exact: true }); out.staleSaveEnabled = (await sd.count()) ? await sb.isEnabled() : null;
      if (out.staleSaveEnabled) { await sb.click(); await wait(4000); }
      out.staleText = (await page.locator('[role="alert"],[role="dialog"]').allInnerTexts().catch(() => [])).join(" | ").slice(0, 800);
      await shot("stale");
      check("stale fingerprint: Save refuses naming the file", out.staleText.includes(opt.stale.split("/").pop()), out.staleText);
      out.planAfterStale = await planFiles();
      check("failed save keeps state (dirty, plan, file bytes untouched by Save)", (await dirty()) && out.planAfterStale.length > 0 && Buffer.compare(readFileSync(f), mod) === 0, out.planAfterStale);
    } finally { writeFileSync(f, orig); }
    out.porcelainAfterStale = git("status", "--porcelain");
    await page.evaluate(async (m) => fetch(`/api/edit/${m}/discard`, { method: "POST", body: "{}" }), map);
  }
  if (opt.save === "1") {
    await toolbar("Save Changes").click(); await wait(2500);
    const sd = page.locator('[role="dialog"][aria-label="Save changes"]');
    out.saveDialog = (await sd.innerText().catch(() => "")).slice(0, 1200);
    check("Save dialog shows an affects row from real data (B12/M7)", /affects:/.test(out.saveDialog), out.saveDialog.slice(0, 400));
    await shot("save-dialog");
    await sd.getByRole("button", { name: "Save Changes", exact: true }).click(); await wait(5000);
    out.dialogsLeft = await page.locator('[role="dialog"]').count();
    check("Save clears dirty", !(await dirty()), { dialogsLeft: out.dialogsLeft });
    out.porcelain = git("status", "--porcelain").split("\n").filter(Boolean);
    // Byte diff of every changed tracked file against HEAD.
    out.byteDiffs = out.porcelain.map((l) => {
      const f = l.slice(3); const now = readFileSync(`${clone}/${f}`);
      let old; try { old = execFileSync("git", ["-C", clone, "show", `HEAD:${f}`], { maxBuffer: 1 << 26 }); } catch { return { f, new: true, size: now.length }; }
      const diffs = []; for (let i = 0; i < Math.max(old.length, now.length); i++) if (old[i] !== now[i]) { if (diffs.length < 12) diffs.push([i, old[i], now[i]]); else { diffs.push("…"); break; } }
      return { f, size: [old.length, now.length], diffs };
    });
    if (opt.commit !== "0") git("commit", "-qam", `t15 ${tag}`); // scratch clone only: the saved state becomes the next baseline
  }
} catch (e) { if (e !== "probe") { out.error = String(e?.stack ?? e).slice(0, 800); await shot("error"); } }
await browser.close();
writeFileSync(`${OUT}${tag}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ tag, checks: out.checks.map((c) => `${c.result} ${c.name}`), editor: out.editor?.label, hover: out.hover, draft: out.draft, confirm: out.ok?.confirmText?.slice(0, 160), status: out.ok?.status?.map((t) => t.slice(0, 160)), error: out.error?.slice(0, 300), byteDiffs: out.byteDiffs, console: [...new Set(out.console.map((c) => String(c.pageerror ?? c).slice(0, 80)))] }, null, 1));
