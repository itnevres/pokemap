// usage: node live.mjs <gba|gbc> <anchorMap> <hiddenMap>  -- Task 10 Step 3 World/Dungeon checks, one family
import { open } from "./lib.mjs";
import { guard } from "./guard.mjs";
const [fam, anchor, hidden] = process.argv.slice(2);
const { browser, page, wait, shot, errs } = await open();
const out = { fam }; await guard(page, out);
const gets = []; page.on("request", (r) => { if (r.method() === "GET" && new URL(r.url()).pathname === "/api/world") gets.push(Date.now()); });
page.on("dialog", (d) => { (out.dialogs ??= []).push(d.message().slice(0, 120)); d.accept(); });
const step = async (name, fn) => { try { out[name] = await fn(); } catch (e) { out[name] = { error: String(e?.message ?? e).slice(0, 300) }; await shot(`${fam}-err-${name}`).catch(() => {}); } };
const S = (s) => s.replace(/\s+/g, " ").trim();
const readout = () => page.locator(".world-canvas__zoom-readout").textContent({ timeout: 300 }).catch(() => null);
const status = () => page.locator(".world-canvas__status").innerText().then(S).catch(() => null);
const sel = () => page.locator(".world-canvas__selection-outline:not(.world-canvas__jump-highlight)").count();
const postsSince = (n) => out.posts.slice(n).filter((p) => /^\/world\/|\/commit$/.test(p));
const tree = (name) => page.locator(".map-tree__map").filter({ hasText: new RegExp(`^${name}$`) }).first();
const jump = async (name) => { const r = tree(name); await r.scrollIntoViewIfNeeded(); await r.click(); await wait(900); };
const mode = async (m) => { await page.getByRole("group", { name: "View" }).getByRole("button", { name: m, exact: true }).click(); await wait(1500); };
const shotBuf = () => page.locator(".world-canvas__viewport").screenshot();

await page.goto("http://127.0.0.1:5183/"); await wait(2500);
await mode("World"); await wait(1500);
const vp = page.locator(".world-canvas__viewport");
let box = await vp.boundingBox();
const hoverAt = async (x, y) => { await page.mouse.move(box.x + x, box.y + y); await wait(40); const h = S(await page.locator(".world-canvas__hover").innerText().catch(() => "")); return /^Hover/.test(h) || !h ? null : h; };
const scan = async (step = 36) => { const hits = new Map(); for (let y = 30; y < box.height - 30; y += step) for (let x = 30; x < box.width - 30; x += step) { const h = await hoverAt(x, y); if (h) { const n = h.split(/\s|·/)[0]; if (!hits.has(n)) hits.set(n, { n, x, y }); } } return [...hits.values()]; };
out.first = { readout: await readout(), status: await status() };

await step("wheelFit", async () => {
  const r = { start: await readout() }; const a = await shotBuf();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -200); await wait(120); } await wait(1000);
  r.wheelIn = await readout(); r.wheelChanged = !a.equals(await shotBuf());
  await page.getByRole("button", { name: "Fit", exact: true }).first().click(); await wait(700);
  r.fit = await readout(); r.fitRestored = a.equals(await shotBuf());
  return r;
});

await step("jumpAnchor", async () => { await jump(anchor); await wait(800); await shot(`${fam}-l1-jump-${anchor}`); return { readout: await readout(), jumpHighlights: await page.locator(".world-canvas__jump-highlight").count() }; });
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await vp.locator("canvas").first().focus(); for (let i = 0; i < 3; i++) { await page.keyboard.press("-"); await wait(300); }
out.scanReadout = await readout();
const hits = await scan(24); out.hits = hits.map((h) => h.n);
const A = hits.find((h) => h.n === anchor) ?? hits[0];
const B = hits.find((h) => h !== A);
const C = hits.find((h) => h !== A && h !== B);

await step("ctrlClick", async () => {
  await page.mouse.click(box.x + A.x, box.y + A.y); await wait(200); const one = await sel();
  await page.keyboard.down("Control"); await page.mouse.click(box.x + B.x, box.y + B.y); await page.keyboard.up("Control"); await wait(200);
  const two = await sel();
  await page.keyboard.down("Control"); await page.mouse.click(box.x + B.x, box.y + B.y); await page.keyboard.up("Control"); await wait(200);
  return { plainClick: one, ctrlAdd: two, ctrlToggleOff: await sel() };
});
await step("marquee", async () => {
  await page.keyboard.press("Escape"); await wait(100);
  await page.getByRole("button", { name: "Fit", exact: true }).first().click(); await wait(700);
  let s = null; for (let y = 20; y < box.height / 2 && !s; y += 20) for (let x = 20; x < box.width / 2 && !s; x += 20) if (!(await hoverAt(x, y))) s = [x, y];
  if (!s) return { skipped: "no empty start" };
  const e = [box.width - 20, box.height - 20];
  await page.keyboard.down("Control"); await page.mouse.move(box.x + s[0], box.y + s[1]); await page.mouse.down();
  await page.mouse.move(box.x + e[0], box.y + e[1], { steps: 8 }); await wait(100);
  const during = await page.locator(".world-canvas__marquee").count();
  await page.mouse.up(); await page.keyboard.up("Control"); await wait(300);
  await shot(`${fam}-l2-marquee`); await jump(anchor); await vp.locator("canvas").first().focus(); for (let i = 0; i < 3; i++) { await page.keyboard.press("-"); await wait(300); }
  return { from: s, to: e, marqueeShown: during, selected: await sel() };
});
await step("groupMove", async () => {
  await page.keyboard.press("Escape"); await page.mouse.click(box.x + A.x, box.y + A.y); await page.keyboard.down("Control"); await page.mouse.click(box.x + B.x, box.y + B.y); await page.keyboard.up("Control"); await wait(200);
  const n0 = await sel(); const p = out.posts.length, g = gets.length;
  const before = await hoverAt(A.x, A.y);
  await page.keyboard.down("Shift"); await page.mouse.move(box.x + A.x, box.y + A.y); await page.mouse.down();
  await page.mouse.move(box.x + A.x + 60, box.y + A.y + 40, { steps: 6 }); await wait(150); await shot(`${fam}-l3-group-drag`);
  await page.mouse.up(); await page.keyboard.up("Shift"); await wait(2500);
  const alerts = (await page.getByRole("alert").allInnerTexts()).map(S);
  await shot(`${fam}-l4-group-rollback`);
  return { selected: n0, postAttempts: postsSince(p), reloadGets: gets.length - g, alerts, rolledBack: (await hoverAt(A.x, A.y)) === before, before };
});
await step("dragOutside", async () => {
  await page.keyboard.press("Escape"); for (const b of await page.getByRole("button", { name: "Dismiss error" }).all()) await b.click().catch(() => {});
  const p = out.posts.length, g = gets.length;
  await page.keyboard.down("Shift"); await page.mouse.move(box.x + C.x, box.y + C.y); await page.mouse.down();
  await page.mouse.move(box.x + C.x + 50, box.y + C.y, { steps: 4 }); await page.mouse.move(box.x + box.width + 120, box.y - 40, { steps: 8 });
  await page.mouse.up(); await page.keyboard.up("Shift"); await wait(2500);
  return { map: C.n, postAttempts: postsSince(p), reloadGets: gets.length - g };
});

await step("warps", async () => {
  for (const b of await page.getByRole("button", { name: "Dismiss error" }).all()) await b.click().catch(() => {});
  let forced = 0;
  await page.route(/\/api\/warps\//, async (r) => { forced += 1; await r.fulfill({ status: 500, contentType: "application/json", body: '{"error":"forced"}' }); });
  await page.getByRole("switch", { name: "Warps" }).click(); await wait(1500);
  const r = { forced, alertsForced: (await page.getByRole("alert").allInnerTexts()).map(S).slice(0, 3), markersForced: await page.locator(".world-canvas__warp-marker").count() };
  await shot(`${fam}-l5-warps-500`);
  await page.unroute(/\/api\/warps\//);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 10, { steps: 4 }); await page.mouse.up(); await wait(2000);
  r.markersAfterPan = await page.locator(".world-canvas__warp-marker").count();
  r.alertsAfterPan = (await page.getByRole("alert").allInnerTexts()).map(S).slice(0, 3);
  await shot(`${fam}-l6-warps-retry`);
  await page.keyboard.press("Escape"); await wait(100);
  const m = page.locator(".world-canvas__warp-marker").first();
  if (await m.count()) { await m.click({ force: true }); await wait(500); r.selAfterMarkerClick = await sel(); r.markerClickText = S(await page.locator(".world-canvas__toast, [class*=popup]").first().innerText().catch(() => "")).slice(0, 120); await shot(`${fam}-l7-marker-click`); }
  await page.getByRole("switch", { name: "Warps" }).click(); await wait(300);
  return r;
});

await step("keys", async () => {
  await jump(anchor); await page.mouse.click(box.x + A.x, box.y + A.y); await wait(200);
  const r = { r0: await readout() }; let a = await shotBuf();
  await page.keyboard.press("+"); await wait(500); r.plus = await readout(); r.plusChanged = !a.equals(a = await shotBuf());
  await page.keyboard.press("-"); await wait(500); r.minus = await readout(); r.minusChanged = !a.equals(await shotBuf());
  await page.keyboard.press("Enter"); await wait(1500);
  r.modeAfterEnter = await page.getByRole("group", { name: "View" }).locator("[aria-pressed=true]").innerText();
  r.mapStatus = S(await page.locator(".app__status").innerText().catch(() => ""));
  await mode("World"); return r;
});
await step("jumpTwice", async () => {
  const anim = () => page.evaluate(() => { const el = document.querySelector(".world-canvas__jump-highlight"); const a = el?.getAnimations()[0]; return el ? { t: Math.round(Number(a?.currentTime ?? -1)), op: getComputedStyle(el).opacity } : null; });
  await jump(anchor); await wait(600); const first = await anim();
  await jump(anchor); const second = await anim();
  return { first, second, restarted: !!(first && second && second.t < first.t) };
});
await step("revealHidden", async () => {
  const before = await status();
  await jump(hidden); await wait(500); await shot(`${fam}-l8-reveal-${hidden}`);
  return { before, after: await status(), highlight: await page.locator(".world-canvas__jump-highlight").count(), hover: await hoverAt(box.width / 2, box.height / 2) };
});
await step("lens", async () => {
  await page.getByRole("button", { name: "Fit", exact: true }).first().click(); await wait(500);
  const a = await shotBuf(); const lens = page.locator(".world-canvas__toolbar button[aria-label*=lens]").first();
  const label = await lens.getAttribute("aria-label"); await lens.click(); await wait(1200);
  const r = { label, pressed: await lens.getAttribute("aria-pressed"), changed: !a.equals(await shotBuf()) };
  await shot(`${fam}-l9-lens`); await lens.click(); await wait(300); return r;
});
await step("spotlight", async () => {
  const a = await shotBuf(); const box2 = page.getByRole("combobox", { name: /spotlight/i });
  await box2.click(); await box2.fill(fam === "gba" ? "Zigzagoon" : "Pidgey"); await wait(500);
  const opts = await page.getByRole("option").allInnerTexts();
  if (opts.length) await page.getByRole("option").first().click(); else await page.keyboard.press("Enter");
  await wait(1200);
  const r = { options: opts.slice(0, 3).map(S), changed: !a.equals(await shotBuf()) };
  await shot(`${fam}-l10-spotlight`); await box2.fill(""); await page.keyboard.press("Escape"); await wait(300); return r;
});
await step("contextMenu", async () => {
  await jump(anchor); await page.mouse.click(box.x + A.x, box.y + A.y, { button: "right" }); await wait(400);
  const items = (await page.getByRole("menuitem").allInnerTexts()).map(S);
  await shot(`${fam}-l11-context-menu`); await page.keyboard.press("Escape"); await wait(200);
  return { items, closed: (await page.getByRole("menu").count()) === 0 };
});
await step("borderMidZoom", async () => {
  await jump(anchor); await vp.locator("canvas").first().focus(); for (let i = 0; i < 2; i++) { await page.keyboard.press("-"); await wait(300); }
  const tg = page.locator(".encounter-border__toggle"); if (await tg.count() && (await tg.getAttribute("aria-pressed")) !== "true") await tg.click();
  await wait(1500); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 8 && !(await page.locator(".encounter-border__strip").count()); i++) { await page.mouse.wheel(0, -200); await wait(400); }
  const rects = await page.locator(".encounter-border__strip").evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; }));
  let overlaps = 0; for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const [a, b] = [rects[i], rects[j]]; if (a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]) overlaps++; }
  await shot(`${fam}-l12-border-mid-zoom`);
  return { readout: await readout(), borders: rects.length, overlaps, sample: rects.slice(0, 4) };
});
await step("tooltipLeft", async () => {
  const icons = page.locator(".encounter-border__sprite");
  const vb0 = await vp.boundingBox();
  const all = await icons.evaluateAll((els, vx) => els.map((e, i) => { const b = e.getBoundingClientRect(); return [i, b.left, b.top + b.height / 2, b.width]; }).filter(([, l, y]) => l >= vx && y > 120 && y < 860).sort((a, b) => a[1] - b[1]), vb0.x);
  if (!all.length) return { skipped: "no border icons" };
  // Pan so the leftmost visible sprite sits 6 px inside the viewport's left edge.
  const dx = Math.round(vb0.x + 6 - all[0][1]), py = all[0][2] + 40;
  await page.mouse.move(vb0.x + vb0.width / 2, py); await page.mouse.down(); await page.mouse.move(vb0.x + vb0.width / 2 + dx, py, { steps: 8 }); await page.mouse.up(); await wait(800);
  all.splice(0, all.length, ...(await icons.evaluateAll((els, vx) => els.map((e, i) => { const b = e.getBoundingClientRect(); return [i, b.left, b.top + b.height / 2, b.width]; }).filter(([, l, y]) => l >= vx && y > 120 && y < 860).sort((a, b) => a[1] - b[1]), vb0.x)));
  await page.mouse.move(all[0][1] + all[0][3] / 2, all[0][2]); await wait(500);
  const tip = page.locator(".encounter-border__tooltip").first();
  const tb = await tip.boundingBox().catch(() => null); const vb = await vp.boundingBox();
  await shot(`${fam}-l13-tooltip-left`);
  return { iconLeft: Math.round(all[0][1]), tip: tb && [Math.round(tb.x), Math.round(tb.width)], viewportLeft: Math.round(vb.x), clamped: !!tb && tb.x >= vb.x - 1 };
});

await step("dungeon", async () => {
  await mode("Dungeon"); const items = page.locator(".dungeon-sidebar__item");
  const r = { dungeons: await items.count() }; if (!r.dungeons) return r;
  await items.first().click(); await wait(2500); box = await vp.boundingBox();
  const lines = () => page.locator(".world-canvas__connections line, .world-canvas__connections path, .world-canvas__connections polyline").count();
  await page.getByRole("switch", { name: "Connection lines" }).click().catch(() => {}); await wait(2000);
  r.name = S(await items.first().innerText()); r.lines = await lines(); r.status = await status();
  await shot(`${fam}-l14-dungeon-lines`);
  const a = await shotBuf(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, -500); await wait(800);
  r.wheelChanged = !a.equals(await shotBuf());
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 500, box.y + box.height / 2, { steps: 10 }); await page.mouse.up(); await wait(1500);
  r.linesAfterPanOffscreen = await lines(); await shot(`${fam}-l15-dungeon-offscreen`);
  await page.getByRole("button", { name: "Fit", exact: true }).first().click(); await wait(800); r.fitChanged = !a.equals(await shotBuf()) ? "differs-from-initial" : "same-as-initial";
  await page.getByRole("switch", { name: "Connection lines" }).click().catch(() => {});
  await mode("World"); box = await vp.boundingBox(); return r;
});

out.errs = errs; out.blockedTotal = out.blocked.length;
out.postSummary = Object.entries(out.posts.reduce((m, p) => { const k = p.replace(/^\/edit\/[^/]+/, "/edit/*"); m[k] = (m[k] ?? 0) + 1; return m; }, {}));
delete out.posts; delete out.applies; delete out.blocked;
console.log(JSON.stringify(out, null, 1));
await browser.close();
