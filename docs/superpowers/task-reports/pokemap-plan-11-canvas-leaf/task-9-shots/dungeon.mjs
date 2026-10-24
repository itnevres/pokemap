// usage: node dungeon.mjs <prefix>  -- a dungeon-mode rail drop marks the map; its World row un-greys
import { open } from "./lib.mjs";
const fam = process.argv[2];
const { browser, page, wait, shot, errs } = await open();
const out = {}; const net = [];
page.on("request", (r) => { if (r.url().includes("/api/world")) net.push(`${r.method()} ${r.url().replace(/^.*\/api/, "")} ${(r.postData() || "").slice(0, 100)}`); });
await page.goto("http://localhost:5183/"); await wait(3000);
await page.getByRole("button", { name: "World", exact: true }).click(); await wait(6000);
const greyed = () => page.evaluate(() => [...document.querySelectorAll(".map-tree__map--greyed")].map((b) => b.textContent));
const greyedBefore = await greyed();
await page.getByRole("button", { name: "Dungeon", exact: true }).click(); await wait(2500);
const items = page.locator(".dungeon-sidebar__item");
out.dungeons = await items.count();
let picked = null;
for (let i = 0; i < out.dungeons && !picked; i++) {
  await items.nth(i).click(); await wait(4000);
  const rail = page.locator(".world-canvas__rail-item");
  const names = await rail.allInnerTexts();
  const candidate = names.find((n) => greyedBefore.includes(n.trim()));
  if (candidate) picked = { dungeon: (await items.nth(i).innerText()).replace(/\n/g, " "), map: candidate.trim() };
}
out.picked = picked;
if (picked) {
  const canvas = page.locator("canvas.world-canvas__stage"); const box = await canvas.boundingBox();
  const item = page.locator(".world-canvas__rail-item", { hasText: new RegExp("^" + picked.map + "$") }).first();
  const mark = net.length;
  await item.dragTo(canvas, { targetPosition: { x: Math.round(box.width / 2), y: Math.round(box.height / 2) } }); await wait(3000);
  out.net = net.slice(mark);
  out.railStill = (await page.locator(".world-canvas__rail-item").allInnerTexts()).map((s) => s.trim()).includes(picked.map);
  await shot(`${fam}-d1-dungeon-drop`);
  // Back to World: the row is no longer greyed straight away (shell merge), and after the visibility GET
  await page.getByRole("button", { name: "World", exact: true }).click(); await wait(300);
  out.greyedSoon = (await greyed()).includes(picked.map);
  await wait(5000);
  out.greyedLater = (await greyed()).includes(picked.map);
  await shot(`${fam}-d2-world-row`);
}
out.errs = errs; out.alerts = await page.getByRole("alert").allInnerTexts();
console.log(JSON.stringify(out, null, 1));
await browser.close();
