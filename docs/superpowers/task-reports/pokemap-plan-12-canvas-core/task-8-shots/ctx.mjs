// usage: node ctx.mjs <gba|gbc>
// In-context editing (World view, "Edit here"): context zoom buttons, wheel, Fit, event drag, dropper, pencil (one apply
// per new cell, read from the apply bodies), rect, bucket, sign, release outside, forced 500 apply, Done + Discard.
// The chromeless canvas has no overlay toggles, legend or status strip: those are checked in Map view (edit.mjs).
import { open } from "./lib.mjs";
import { guard } from "./guard.mjs";
const fam = process.argv[2];
const { browser, page, wait, shot, errs } = await open();
const out = { fam }; await guard(page, out);
page.on("dialog", (d) => { (out.dialogs ??= []).push(d.message().slice(0, 120)); d.accept(); });
const step = async (name, fn) => { try { out[name] = await fn(); } catch (e) { out[name] = { error: String(e?.message ?? e).slice(0, 300) }; await shot(`${fam}-cerr-${name}`).catch(() => {}); } };
const appliesNow = () => out.posts.filter((p) => p.endsWith("/paint/apply")).length;
const countPosts = (suffix) => out.posts.filter((p) => p.endsWith(suffix)).length;
const target = (body) => { const j = JSON.parse(body); return j.targets?.[0] ?? { x: j.x, y: j.y }; };

await page.goto("http://127.0.0.1:5183/"); await wait(3000);
await page.getByRole("button", { name: "World", exact: true }).click(); await wait(6000);
const world = page.getByRole("region", { name: "World canvas" });
const wbox = await world.locator("canvas").first().boundingBox();
const whover = async (x, y) => { await page.mouse.move(wbox.x + x, wbox.y + y); await wait(60); return (await page.locator(".world-canvas__hover").innerText().catch(() => "")).trim(); };
let hit = null;
for (let y = 80; y < wbox.height - 40 && !hit; y += 40) for (let x = 60; x < wbox.width - 60 && !hit; x += 40) { const h = await whover(x, y); if (h && !/^Hover/.test(h) && /Route|Town|City/.test(h)) hit = { x, y, name: h.split(/\s|·/)[0] }; }
out.map = hit.name;
await page.mouse.click(wbox.x + hit.x, wbox.y + hit.y, { button: "right" }); await wait(600);
await page.getByRole("menuitem", { name: /Edit here/ }).click(); await wait(4000);
const region = page.getByRole("region", { name: `${hit.name} canvas` });
const canvas = region.locator("canvas").first();
const bar = page.locator(".world-context-overlay, [class*=context-overlay]").first();
const ctxPressed = () => page.getByRole("button", { name: /^[124]×$/ }).evaluateAll((bs) => bs.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent));
const pct = async () => { const t = await page.locator("body").innerText(); return (/(?:^|\s)(\d+)%(?:\s|$)/.exec(t) ?? [])[1] ?? "?"; };
out.chrome = { toolbarGroups: await region.getByRole("group").count(), status: await region.locator(".map-canvas__hover").count() };

await step("zoom", async () => {
  const r = { start: [await ctxPressed(), await pct()] };
  await page.getByRole("button", { name: "4×", exact: true }).click(); await wait(800); r.four = [await ctxPressed(), await pct()];
  const b = await canvas.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.wheel(0, 240); await wait(800); r.wheelOut = [await ctxPressed(), await pct()];
  await page.getByRole("button", { name: "Fit", exact: true }).first().click(); await wait(800); r.fit = [await ctxPressed(), await pct()];
  await page.mouse.move(b.x + 5, b.y + 5); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.wheel(0, -240); await wait(800); r.wheelAfterFit = [await ctxPressed(), await pct()];
  await page.getByRole("button", { name: "4×", exact: true }).click(); await wait(1000); r.final = [await ctxPressed(), await pct()];
  await shot(`${fam}-c1-context-4x`);
  return r;
});

const b = await canvas.boundingBox();
const vis = { x0: Math.max(b.x, wbox.x) + 40, y0: Math.max(b.y, wbox.y) + 40, x1: Math.min(b.x + b.width, wbox.x + wbox.width) - 40, y1: Math.min(b.y + b.height, wbox.y + wbox.height) - 40 };
out.visible = vis;
const cell = fam === "gba" ? 64 : 64; // 16 px event cell (GBA block, GBC step) at 4x

await step("eventDrag", async () => {
  // No tool yet: scan clicks on the event grid until the event panel reports a selection.
  // Duplicate is enabled only while an event is selected (both families' event panels).
  const dup = page.getByRole("button", { name: "Duplicate", exact: true });
  let at = null;
  for (let y = vis.y0; y < vis.y1 && !at; y += cell) for (let x = vis.x0; x < vis.x1 && !at; x += cell) {
    await page.mouse.click(x, y); await wait(80);
    if (await dup.isEnabled().catch(() => false)) at = { x, y };
  }
  if (!at) return { skipped: "no event found by scan" };
  const m0 = countPosts("/event/move"), n = out.posts.length;
  await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.mouse.move(at.x + cell, at.y, { steps: 4 }); await wait(200);
  const during = countPosts("/event/move") - m0;
  await shot(`${fam}-c2-event-drag-preview`);
  await page.mouse.up(); await wait(1200);
  return { at, movesDuringDrag: during, movesAfterRelease: countPosts("/event/move") - m0, posts: out.posts.slice(n) };
});

const tool = async (name) => { await page.getByRole("button", { name, exact: true }).first().click(); await wait(300); };
const cx = (vis.x0 + vis.x1) / 2, cy = (vis.y0 + vis.y1) / 2;
await step("dropper", async () => {
  await tool("Dropper"); const n = out.posts.length;
  await page.mouse.click(cx, cy); await wait(500);
  return { postsAdded: out.posts.slice(n), selection: (await page.getByText(/^Selection/).first().innerText().catch(() => "")).slice(0, 60) };
});
await step("pencil", async () => {
  await tool("Pencil");
  const a0 = appliesNow(), e0 = countPosts("/paint/end");
  const pc = fam === "gba" ? 64 : 128; // paint cell at 4x
  await page.mouse.move(cx, cy + pc); await page.mouse.down(); await wait(100);
  // Fine 4 px steps across ~3 paint cells: many moves land in each cell.
  for (let dx = 0; dx <= pc * 3; dx += 4) { await page.mouse.move(cx + dx, cy + pc); await wait(10); }
  await page.mouse.up(); await wait(1500);
  const cells = out.applies.slice(a0).map((s) => target(s)).map((t) => `${t.x},${t.y}`);
  const consecutiveDupes = cells.filter((c, i) => i > 0 && c === cells[i - 1]).length;
  return { moves: Math.floor(pc * 3 / 4) + 1, applies: appliesNow() - a0, cells, consecutiveDupes, distinct: new Set(cells).size, ends: countPosts("/paint/end") - e0 };
});
await step("rect", async () => {
  await tool("Rect"); const a0 = appliesNow();
  await page.mouse.move(cx - 100, cy - 100); await page.mouse.down(); await page.mouse.move(cx - 20, cy - 40, { steps: 8 }); await page.mouse.up(); await wait(1500);
  return { applies: appliesNow() - a0, body: (out.applies.at(-1) ?? "").slice(0, 80) };
});
await step("bucket", async () => {
  await tool("Bucket"); const a0 = appliesNow();
  await page.mouse.click(cx + 100, cy - 100); await wait(1500);
  return { applies: appliesNow() - a0, body: (out.applies.at(-1) ?? "").slice(0, 80) };
});
await step("sign", async () => {
  await tool("Sign");
  await page.mouse.click(cx - 60, cy + 60); await wait(800);
  const dlg = page.locator('[role="dialog"], [class*=sign-editor]').first();
  const r = { opened: await dlg.isVisible().catch(() => false), text: (await dlg.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 120) };
  await shot(`${fam}-c3-sign-pick`);
  await page.keyboard.press("Escape"); await wait(400);
  const cancel = page.getByRole("button", { name: /^(Cancel|Close)$/ });
  if (await dlg.isVisible().catch(() => false) && await cancel.count()) await cancel.first().click();
  r.closed = !(await dlg.isVisible().catch(() => false));
  return r;
});
await step("releaseOutside", async () => {
  await tool("Pencil");
  const a0 = appliesNow(), e0 = countPosts("/paint/end");
  await page.mouse.move(cx, cy + 40); await page.mouse.down(); await page.mouse.move(cx + 70, cy + 40, { steps: 4 });
  // Leave the map canvas (over the tool rail above the world), then release there.
  await page.mouse.move(cx + 70, wbox.y - 30, { steps: 8 }); await page.mouse.up(); await wait(1200);
  const mid = { applies: appliesNow() - a0, ends: countPosts("/paint/end") - e0 };
  for (const dx of [0, 70, 140]) { await page.mouse.move(cx + dx, cy + 160, { steps: 2 }); await wait(80); }
  await wait(800);
  return { ...mid, appliesAfterReturn: appliesNow() - a0, endsAfterReturn: countPosts("/paint/end") - e0, undoEnabled: await page.getByRole("button", { name: "Undo" }).isEnabled() };
});
await step("apply500", async () => {
  let forced = 0;
  await page.route(/\/paint\/apply$/, async (route) => { forced += 1; await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"forced by live check"}' }); });
  await page.mouse.click(cx + 140, cy + 160); await wait(1500);
  await page.unroute(/\/paint\/apply$/);
  const alerts = await page.getByRole("alert").allInnerTexts();
  await shot(`${fam}-c4-apply-500`);
  return { forced, alerts: alerts.map((t) => t.replace(/\s+/g, " ").slice(0, 160)) };
});
await step("discard", async () => {
  const btn = page.getByRole("button", { name: "Discard Changes" });
  const enabled = await btn.isEnabled();
  if (enabled) { await btn.click(); await wait(800); const d = page.getByRole("dialog"); if (await d.count()) { const ok = d.getByRole("button", { name: /Discard/ }); if (await ok.count()) await ok.first().click(); } await wait(1500); }
  const r = { enabledBefore: enabled, dirtyAfter: await page.locator('[data-testid="dirty-indicator"]').count() };
  const done = page.getByRole("button", { name: /^Done editing/ });
  if (await done.count()) { await done.click(); await wait(1500); }
  r.contextClosed = (await page.getByRole("region", { name: `${hit.name} canvas` }).count()) === 0;
  r.switchDialogs = await page.getByRole("dialog").count();
  return r;
});

out.errs = errs;
out.postSummary = Object.entries(out.posts.reduce((m, p) => { const k = p.replace(/^\/edit\/[^/]+/, "/edit/*"); m[k] = (m[k] ?? 0) + 1; return m; }, {}));
delete out.posts; out.appliesTotal = out.applies.length; delete out.applies;
console.log(JSON.stringify(out, null, 1));
await browser.close();
