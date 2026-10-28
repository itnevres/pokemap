// usage: node extra.mjs <gba|gbc> <bigMap> [mockDungeonMaps,comma,separated]
// P12-4m jump fill (highlight rect vs viewport) and, with a mock GET /api/dungeons (GBC has none on disk), dungeon lines.
import { open } from "./lib.mjs";
import { guard } from "./guard.mjs";
const [fam, big, mock] = process.argv.slice(2);
const { browser, page, wait, shot, errs } = await open();
const out = { fam }; await guard(page, out);
if (mock) await page.route(/\/api\/dungeons$/, (r) => r.request().method() === "GET"
  ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "mock", name: "Mock dungeon", maps: mock.split(",") }]) }) : r.continue());
const mode = async (m) => { await page.getByRole("group", { name: "View" }).getByRole("button", { name: m, exact: true }).click(); await wait(2000); };
const rect = (sel) => page.locator(sel).first().boundingBox().then((b) => b && [b.x, b.y, b.width, b.height].map(Math.round)).catch(() => null);
await page.goto("http://127.0.0.1:5183/"); await wait(2500);
await mode("World");
const row = page.locator(".map-tree__map").filter({ hasText: new RegExp(`^${big}$`) }).first();
await row.scrollIntoViewIfNeeded(); await row.click(); await wait(500);
const vp = await rect(".world-canvas__viewport"), hl = await rect(".world-canvas__jump-highlight");
out.jump = { map: big, viewport: vp, highlight: hl, fillW: hl && +(hl[2] / vp[2]).toFixed(3), fillH: hl && +(hl[3] / vp[3]).toFixed(3),
  zoom: await page.locator(".world-canvas__zoom-readout").textContent({ timeout: 300 }).catch(() => null) ?? (/zoom (\d+%)/.exec(await page.locator(".world-canvas__status").innerText()) ?? [])[1] };
await shot(`${fam}-e1-jump-fill-${big}`);
if (mock) {
  await mode("Dungeon");
  await page.locator(".dungeon-sidebar__item").first().click(); await wait(2500);
  const lines = () => page.locator(".world-canvas__connections line").count();
  await page.getByRole("switch", { name: "Connection lines" }).click(); await wait(2500);
  const b = await page.locator(".world-canvas__viewport").boundingBox();
  const r = { lines: await lines() }; await shot(`${fam}-e2-dungeon-lines`);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -200); await wait(150); }
  await page.mouse.down(); await page.mouse.move(b.x + b.width / 2 + 500, b.y + b.height / 2, { steps: 10 }); await page.mouse.up(); await wait(1500);
  r.linesAfterPanOffscreen = await lines(); await shot(`${fam}-e3-dungeon-offscreen`);
  await page.getByRole("button", { name: "Fit", exact: true }).first().click(); await wait(800); r.linesAfterFit = await lines();
  out.dungeon = r;
}
out.errs = errs; out.blockedTotal = out.blocked.length; delete out.posts; delete out.applies; delete out.blocked;
console.log(JSON.stringify(out));
await browser.close();
