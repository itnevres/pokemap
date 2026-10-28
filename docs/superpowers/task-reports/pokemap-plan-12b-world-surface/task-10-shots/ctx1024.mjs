// usage: node ctx1024.mjs <gba|gbc> <anchorMap>  -- in-context editing at 1024 px, then the world tile refresh after a paint
import { open } from "./lib.mjs";
import { guard } from "./guard.mjs";
const [fam, anchor] = process.argv.slice(2);
const { browser, page, wait, shot, errs } = await open();
await page.setViewportSize({ width: 1024, height: 768 });
const out = { fam }; await guard(page, out);
page.on("dialog", (d) => { (out.dialogs ??= []).push(d.message().slice(0, 120)); d.accept(); });
const renders = []; page.on("requestfinished", (r) => { const p = decodeURIComponent(new URL(r.url()).pathname); if (p.startsWith("/api/render/") && p.includes(anchor)) renders.push({ p, t: Date.now() }); });
await page.goto("http://127.0.0.1:5183/"); await wait(2500);
const discard = async () => { const disc = page.getByRole("button", { name: "Discard Changes" });
  if (await disc.isEnabled().catch(() => false)) { await disc.click(); await wait(600); const d = page.getByRole("dialog"); if (await d.count()) await d.getByRole("button", { name: /Discard/ }).first().click(); await wait(1500); return true; } return false; };
out.leftoverDraftDiscarded = await discard();
await page.getByRole("group", { name: "View" }).getByRole("button", { name: "World", exact: true }).click(); await wait(2500);
const vp = page.locator(".world-canvas__viewport");
out.railBefore = await page.locator(".world-canvas__rail").isVisible().catch(() => false);
const row = page.locator(".map-tree__map").filter({ hasText: new RegExp(`^${anchor}$`) }).first();
await row.scrollIntoViewIfNeeded(); await row.click(); await wait(1500);
const b = await vp.boundingBox(); const wb = b;
await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { button: "right" }); await wait(400);
await page.getByRole("menuitem", { name: /Edit here/ }).click(); await wait(3500);
out.railInContext = await page.locator(".world-canvas__rail").isVisible().catch(() => false);
// Every visible toolbar-ish row: one line (height) and no horizontal overflow.
out.toolbars = await page.locator("[role=toolbar], [class*=toolbar]:not([class*=toolbar-] )").evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => ({ c: e.className.slice(0, 50), w: e.clientWidth, sw: e.scrollWidth, h: e.clientHeight, right: Math.round(e.getBoundingClientRect().right) })));
out.pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
await shot(`${fam}-x1-context-1024`);

const region = page.getByRole("region", { name: `${anchor} canvas` });
const cb = await region.locator("canvas").first().boundingBox();
const cx = Math.round(b.x + b.width * 0.3), cy = Math.round(b.y + b.height * 0.3);
await page.getByRole("button", { name: "Dropper", exact: true }).first().click(); await wait(200); await page.mouse.click(cx + 120, cy + 120); await wait(400);
await page.getByRole("button", { name: "Pencil", exact: true }).first().click(); await wait(300);
out.pick = { cb: [cb.x, cb.y, cb.width, cb.height].map(Math.round), at: [cx, cy], selection: (await page.getByText(/Selection/).first().innerText().catch(() => "")).slice(0, 80), pencilPressed: await page.getByRole("button", { name: "Pencil", exact: true }).first().getAttribute("aria-pressed") };
// Leave context; sample the world canvas at the map centre every frame while its tile refetches.
await page.evaluate(({ x, y }) => {
  window.__px = []; const t0 = performance.now();
  const tick = () => {
    const c = document.querySelector(".world-canvas__viewport canvas"); const r = c.getBoundingClientRect();
    const px = c.getContext("2d")?.getImageData(Math.round((x - r.left) * c.width / r.width), Math.round((y - r.top) * c.height / r.height), 1, 1).data;
    window.__px.push(px ? Array.from(px).join(",") : "none");
    if (performance.now() - t0 < 4000) requestAnimationFrame(tick);
  }; requestAnimationFrame(tick);
}, { x: cx + 20, y: cy });
const r0 = renders.length;
const a0 = out.applies.length;
await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 40, cy, { steps: 6 }); await page.mouse.up(); await wait(1500);
out.applies = out.applies.length - a0; await shot(`${fam}-x1b-after-stroke`);
await wait(2000); await page.getByRole("button", { name: `Done editing ${anchor}` }).click(); await wait(1000);
out.doneDialog = (await page.getByRole("dialog").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 120);
const cancel = page.getByRole("dialog").getByRole("button", { name: "Cancel" }); if (await cancel.count()) { await cancel.click(); await wait(500); }
const px = await page.evaluate(() => window.__px);
out.refresh = { renderRequests: renders.slice(r0).map((r) => r.p.slice(0, 60)), frames: px.length, distinct: [...new Set(px)].slice(0, 6), blankFrames: px.filter((p) => p === "0,0,0,0" || p === "none").length };
await shot(`${fam}-x2-after-done`);
out.discarded = await discard();
out.dirtyAfterDiscard = await page.locator('[data-testid="dirty-indicator"]').count();
out.errs = errs; out.blockedTotal = out.blocked.length;
out.postSummary = Object.entries(out.posts.reduce((m, p) => { const k = p.replace(/^\/edit\/[^/]+/, "/edit/*"); m[k] = (m[k] ?? 0) + 1; return m; }, {}));
delete out.posts; delete out.blocked;
console.log(JSON.stringify(out, null, 1));
await browser.close();
