// usage: node edit.mjs <gba|gbc> <mapName>
// Map view: zoom, wheel, Fit, overlays + legend, hover/status, event drag, dropper, pencil, rect, bucket, sign,
// a pencil drag released outside the canvas, a forced 500 apply; leaves with Discard. Nothing is saved:
// guard.mjs answers every commit and world write with 500 before the page loads.
import { open } from "./lib.mjs";
import { guard } from "./guard.mjs";
const [fam, mapName] = process.argv.slice(2);
const { browser, page, wait, shot, errs } = await open();
const out = { fam, mapName }; await guard(page, out);
page.on("dialog", (d) => { (out.dialogs ??= []).push(d.message().slice(0, 120)); d.accept(); });
const step = async (name, fn) => { try { out[name] = await fn(); } catch (e) { out[name] = { error: String(e?.message ?? e).slice(0, 300) }; await shot(`${fam}-err-${name}`).catch(() => {}); } };
const appliesNow = () => out.posts.filter((p) => p.endsWith("/paint/apply")).length;
const countPosts = (suffix) => out.posts.filter((p) => p.endsWith(suffix)).length;

await page.goto("http://127.0.0.1:5183/"); await wait(3000);
await page.getByRole("navigation", { name: "Maps" }).getByRole("button", { name: mapName, exact: true }).click(); await wait(4000);
const region = page.getByRole("region", { name: `${mapName} canvas` });
const canvas = region.locator("canvas").first();
const zoom = region.getByRole("group", { name: "Zoom" });
const overlays = region.getByRole("group", { name: "Overlays" });
const pressed = async (g) => g.getByRole("button").evaluateAll((bs) => bs.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent));
const readout = () => region.locator(".map-canvas__hover").innerText();

await step("zoom", async () => {
  const r = { start: await pressed(zoom) };
  await zoom.getByRole("button", { name: "2×" }).click(); await wait(400); r.two = await pressed(zoom);
  const b = await canvas.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.wheel(0, -120); await wait(400); r.wheelIn = await pressed(zoom);
  await page.mouse.wheel(0, 120); await wait(400); r.wheelOut = await pressed(zoom);
  await zoom.getByRole("button", { name: "Fit" }).click(); await wait(400); r.fit = await pressed(zoom);
  // Mouse back over the canvas after Fit, then wheel: the listener must still be live.
  await page.mouse.move(b.x + 5, b.y + 5); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.wheel(0, -120); await wait(400); r.wheelAfterFit = await pressed(zoom);
  return r;
});

await step("overlays", async () => {
  const r = { before: await overlays.getByRole("button").evaluateAll((bs) => bs.map((b) => `${b.textContent}=${b.getAttribute("aria-pressed")}`)) };
  for (const btn of await overlays.getByRole("button").all()) { await btn.click(); await wait(400); }
  r.on = await overlays.getByRole("button").evaluateAll((bs) => bs.map((b) => `${b.textContent}=${b.getAttribute("aria-pressed")}`));
  r.legend = (await region.locator(".map-canvas__legend, [class*=legend]").first().innerText().catch(() => "")).replace(/\s+/g, " ");
  await shot(`${fam}-m1-overlays-on`);
  for (const btn of await overlays.getByRole("button").all()) { await btn.click(); await wait(200); }
  r.off = await pressed(overlays);
  return r;
});

// Edit at 4x: cells are big enough to hit exactly. Calibrate screen -> cell from the hover readout.
await zoom.getByRole("button", { name: "4×" }).click(); await wait(600);
const b = await canvas.boundingBox();
const parse = (t) => { const m = /\((\d+), (\d+)\)/.exec(t); const s = /step \((\d+), (\d+)\)/.exec(t); return m ? { bx: +m[1], by: +m[2], sx: s ? +s[1] : null, sy: s ? +s[2] : null } : null; };
const hoverAt = async (x, y) => { await page.mouse.move(x, y); await wait(60); return parse(await readout()); };
let cal;
await step("hover", async () => {
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const h0 = await hoverAt(cx, cy);
  const r = { centre: await readout(), status: (await region.locator(".map-canvas__status, [class*=status]").first().innerText().catch(() => "")).replace(/\s+/g, " ") };
  // Walk right/down 1 px until the cell changes: that is a cell boundary.
  let x = cx; while ((await hoverAt(x, cy))?.bx === h0.bx) x += 1;
  let y = cy; while ((await hoverAt(cx, y))?.by === h0.by) y += 1;
  const cell = fam === "gba" ? 64 : 128; // 16 px or 32 px source blocks at 4x
  cal = { x0: x - (h0.bx + 1) * cell, y0: y - (h0.by + 1) * cell, cell };
  r.cal = cal;
  await page.mouse.move(b.x - 20, b.y - 20); await wait(200); r.afterLeave = await readout();
  return r;
});
// The canvas can move on screen (an event panel opens above it); cell positions track its live box.
const shift = { x: 0, y: 0 };
const sync = async () => { const nb = await canvas.boundingBox(); shift.x = nb.x - b.x; shift.y = nb.y - b.y; return { ...shift }; };
const at = (bx, by) => ({ x: shift.x + cal.x0 + (bx + 0.5) * cal.cell, y: shift.y + cal.y0 + (by + 0.5) * cal.cell });
const stepAt = (sx, sy) => ({ x: shift.x + cal.x0 + (sx + 0.5) * cal.cell / 2 * (fam === "gba" ? 2 : 1), y: shift.y + cal.y0 + (sy + 0.5) * cal.cell / 2 * (fam === "gba" ? 2 : 1) });
const centre = await hoverAt(b.x + b.width / 2, b.y + b.height / 2);
// Self-check: hover the computed centre of the centre cell and shift the calibration by any mismatch.
for (let i = 0; i < 3; i += 1) {
  const p = at(centre.bx, centre.by); const h = await hoverAt(p.x, p.y);
  if (h.bx === centre.bx && h.by === centre.by) break;
  cal.x0 += (centre.bx - h.bx) * cal.cell; cal.y0 += (centre.by - h.by) * cal.cell;
}
out.calChecked = { ...cal, check: await hoverAt(at(centre.bx, centre.by).x, at(centre.bx, centre.by).y) };
const base = { x: centre.bx, y: centre.by };

await step("eventDrag", async () => {
  const data = await page.evaluate(async (n) => (await fetch(`/api/map/${encodeURIComponent(n)}`)).json(), mapName);
  const list = fam === "gba" ? data.map.objectEvents : data.events.objects;
  // Prefer a visible event near the centre; event cells are 16 px (GBA block, GBC step).
  const vis = list.map((e, i) => ({ ...e, i })).filter((e) => { const p = stepAt(e.x, e.y); return p.x > b.x + 10 && p.x < b.x + b.width - 10 && p.y > b.y + 10 && p.y < b.y + b.height - 10; });
  if (!vis.length) return { skipped: "no visible object event at 4x" };
  const e = vis[0]; const from = stepAt(e.x, e.y); const to = stepAt(e.x + 1, e.y);
  const moves0 = countPosts("/event/move");
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await wait(100);
  await page.mouse.move(to.x, to.y, { steps: 4 }); await wait(200);
  const midMoves = countPosts("/event/move");
  await shot(`${fam}-m2-event-drag-preview`);
  await page.mouse.up(); await wait(1200);
  const body = out.posts.filter((p) => p.endsWith("/event/move")).length;
  return { event: { i: e.i, x: e.x, y: e.y }, movesDuringDrag: midMoves - moves0, movesAfterRelease: body - moves0 };
});

const tool = async (name) => { await page.getByRole("button", { name, exact: true }).first().click(); await wait(300); (out.shifts ??= []).push(await sync()); };
await step("dropper", async () => {
  await tool("Dropper");
  const a0 = appliesNow(), p0 = out.posts.length;
  const p = at(base.x, base.y); await page.mouse.click(p.x, p.y); await wait(500);
  return { postsAdded: out.posts.slice(p0), appliesAdded: appliesNow() - a0, selection: (await page.getByText(/^Selection/).first().innerText().catch(() => "")).slice(0, 80) };
});

await step("pencil", async () => {
  await tool("Pencil");
  const a0 = appliesNow(), b0 = countPosts("/paint/begin"), e0 = countPosts("/paint/end");
  const p = at(base.x, base.y + 1);
  await page.mouse.move(p.x, p.y); await wait(100); const startReadout = await readout(); await page.mouse.down(); await wait(150);
  const trail = [];
  // Wiggle inside the start cell, then cross into two new cells, wiggling in each.
  for (const [dx, dy] of [[3, 0], [-3, 2], [0, -2]]) { await page.mouse.move(p.x + dx, p.y + dy); await wait(40); }
  for (const c of [1, 2]) { const q = at(base.x + c, base.y + 1); for (const d of [0, 4, -4]) { await page.mouse.move(q.x + d, q.y); await wait(60); } }
  await page.mouse.up(); await wait(1500);
  return { startReadout: startReadout.slice(0, 12), begins: countPosts("/paint/begin") - b0, applies: appliesNow() - a0, ends: countPosts("/paint/end") - e0, bodies: out.applies.slice(-(appliesNow() - a0)).map((s) => s.slice(0, 70)) };
});

await step("rect", async () => {
  await tool("Rect");
  const a0 = appliesNow();
  const p = at(base.x, base.y + 2), q = at(base.x + 2, base.y + 3);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y, { steps: 6 }); await page.mouse.up(); await wait(1500);
  return { applies: appliesNow() - a0, body: (out.applies.at(-1) ?? "").slice(0, 90) };
});

await step("bucket", async () => {
  await tool("Bucket");
  const a0 = appliesNow();
  const p = at(base.x - 1, base.y - 1); await page.mouse.click(p.x, p.y); await wait(1500);
  return { applies: appliesNow() - a0, body: (out.applies.at(-1) ?? "").slice(0, 90) };
});

await step("sign", async () => {
  await tool("Sign");
  const p = at(base.x, base.y - 1); await page.mouse.click(p.x, p.y); await wait(800);
  const dlg = page.locator('[role="dialog"], .sign-editor, [class*=sign-editor]').first();
  const r = { opened: await dlg.isVisible().catch(() => false), text: (await dlg.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 160) };
  await shot(`${fam}-m3-sign-pick`);
  await page.keyboard.press("Escape"); await wait(400);
  const cancel = page.getByRole("button", { name: /^(Cancel|Close)$/ });
  if (await dlg.isVisible().catch(() => false) && await cancel.count()) await cancel.first().click();
  r.closed = !(await dlg.isVisible().catch(() => false));
  return r;
});

await step("releaseOutside", async () => {
  await tool("Pencil");
  const a0 = appliesNow(), e0 = countPosts("/paint/end");
  const p = at(base.x - 1, base.y + 2), q = at(base.x - 2, base.y + 2);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y, { steps: 3 }); await wait(200);
  await page.mouse.move(b.x + b.width / 2, b.y - 40, { steps: 5 }); await page.mouse.up(); await wait(1200);
  const mid = { applies: appliesNow() - a0, ends: countPosts("/paint/end") - e0 };
  // Back over the canvas with no button: no further applies.
  for (const c of [0, 1, 2]) { const r2 = at(base.x + c, base.y); await page.mouse.move(r2.x, r2.y, { steps: 2 }); await wait(80); }
  await wait(800);
  return { ...mid, appliesAfterReturn: appliesNow() - a0, endsAfterReturn: countPosts("/paint/end") - e0,
    undoEnabled: await page.getByRole("button", { name: "Undo" }).isEnabled() };
});

await step("apply500", async () => {
  let forced = 0;
  await page.route(/\/paint\/apply$/, async (route) => { forced += 1; await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"forced by live check"}' }); });
  const p = at(base.x + 2, base.y); await page.mouse.click(p.x, p.y); await wait(1500);
  await page.unroute(/\/paint\/apply$/);
  const alerts = await page.getByRole("alert").allInnerTexts();
  await shot(`${fam}-m4-apply-500`);
  return { forced, alerts: alerts.map((t) => t.replace(/\s+/g, " ").slice(0, 160)) };
});

if (fam === "gbc") await step("timeSwitch", async () => {
  // Encounters on, then switch the time: the dimmed set must change with no new encounter fetch.
  const gets = []; page.on("request", (r) => { if (r.method() === "GET" && /\/api\/encounters\//.test(r.url())) gets.push(r.url()); });
  const btn = overlays.getByRole("button", { name: "Encounters" });
  if (await btn.getAttribute("aria-pressed") !== "true") { await btn.click(); await wait(2000); }
  const dims = () => page.locator(".encounter-border__sprite--dimmed").count();
  const timeGroup = page.getByRole("group", { name: "Time of day" });
  const times = await timeGroup.getByRole("button").allInnerTexts();
  const r = { times, getsAfterOn: gets.length, rows: [] };
  for (const t of times) { await timeGroup.getByRole("button", { name: t, exact: true }).click(); await wait(1200);
    r.rows.push({ time: t, pressed: await timeGroup.getByRole("button", { name: t, exact: true }).getAttribute("aria-pressed"), dimmed: await dims(), sprites: await page.locator(".encounter-border__sprite").count(), gets: gets.length }); }
  await shot(`${fam}-m5-time-dim`);
  await btn.click(); await wait(300);
  return r;
});
await step("discard", async () => {
  const btn = page.getByRole("button", { name: "Discard Changes" });
  const enabled = await btn.isEnabled();
  if (enabled) { await btn.click(); await wait(800); const d = page.getByRole("dialog"); if (await d.count()) { const ok = d.getByRole("button", { name: /Discard/ }); if (await ok.count()) await ok.first().click(); } await wait(1500); }
  return { enabledBefore: enabled, dirtyAfter: await page.locator('[data-testid="dirty-indicator"]').count() };
});

out.errs = errs;
out.postSummary = Object.entries(out.posts.reduce((m, p) => { const k = p.replace(/^\/edit\/[^/]+/, "/edit/*"); m[k] = (m[k] ?? 0) + 1; return m; }, {})); delete out.posts; out.appliesTotal = out.applies.length; delete out.applies;
console.log(JSON.stringify(out, null, 1));
await browser.close();
