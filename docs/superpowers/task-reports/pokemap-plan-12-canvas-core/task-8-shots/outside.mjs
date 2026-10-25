// usage: node outside.mjs <gba|gbc> <mapName>  -- Task 9 I1: rect and event drag released outside the canvas
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

const order = async () => page.evaluate(() => { const r = window.__ev ?? []; window.__ev = []; return r.join(" "); });
await page.evaluate(() => { window.__ev = []; const c = document.querySelector("canvas.map-canvas__stage") ?? document.querySelectorAll("section.map-canvas canvas")[0];
  for (const t of ["pointerdown", "pointerup", "lostpointercapture", "mousedown", "mouseleave", "mouseup"]) c.addEventListener(t, (e) => window.__ev.push(t + (e.buttons !== undefined ? `/b${e.buttons}` : "")), true); });
await step("eventOutside", async () => {
  const data = await page.evaluate(async (n) => (await fetch(`/api/map/${encodeURIComponent(n)}`)).json(), mapName);
  const list = fam === "gba" ? data.map.objectEvents : data.events.objects;
  const vis = list.map((e, i) => ({ ...e, i })).filter((e) => { const p = stepAt(e.x, e.y); return p.x > b.x + 10 && p.x < b.x + b.width - 10 && p.y > b.y + 10 && p.y < b.y + b.height - 10; });
  const e = vis[0]; const from = stepAt(e.x, e.y); const m0 = countPosts("/event/move"); const n = out.posts.length;
  await order();
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(from.x, b.y - 30, { steps: 8 }); await page.mouse.up(); await wait(1200);
  return { event: { i: e.i, x: e.x, y: e.y }, moves: countPosts("/event/move") - m0, posts: out.posts.slice(n), order: await order() };
});
const tool = async (name) => { await page.getByRole("button", { name, exact: true }).first().click(); await wait(300); await sync(); };
await tool("Dropper"); { const p = at(base.x, base.y); await page.mouse.click(p.x, p.y); await wait(400); }
await step("rectOutside", async () => {
  await tool("Rect"); const a0 = appliesNow(), e0 = countPosts("/paint/end");
  await order();
  const p = at(base.x, base.y); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x, b.y - 30, { steps: 8 }); await page.mouse.up(); await wait(1500);
  return { applies: appliesNow() - a0, ends: countPosts("/paint/end") - e0, body: appliesNow() > a0 ? out.applies.at(-1).slice(0, 80) : null, order: await order() };
});
await step("discard", async () => {
  const btn = page.getByRole("button", { name: "Discard Changes" });
  if (await btn.isEnabled()) { await btn.click(); await wait(1500); }
  return { dirtyAfter: await page.locator('[data-testid="dirty-indicator"]').count() };
});
out.errs = errs; delete out.posts; delete out.applies;
console.log(JSON.stringify(out, null, 1));
await browser.close();
