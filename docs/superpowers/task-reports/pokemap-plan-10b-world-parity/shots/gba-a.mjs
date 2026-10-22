import { open } from "./lib.mjs";
const { browser, page, wait, shot } = await open();
const out = { net: [] };
page.on("response", (r) => { if (/\/api\/world/.test(r.url()) && r.request().method() !== "GET") out.net.push(r.request().method() + " " + r.url().replace(/^.*\/api/, "") + " " + r.status() + " " + (r.request().postData() || "").slice(0, 150)); });
await page.goto("http://localhost:5183/"); await wait(3000);
await page.getByRole("button", { name: "World", exact: true }).click(); await wait(3500);
await shot("gba-a-0-world");
const greyedCount = () => page.locator(".map-tree__map--greyed").count();
out.greyed0 = await greyedCount();
const canvas = page.locator("canvas").first();
const cb = await canvas.boundingBox(); out.canvasBox = cb;
const auto = page.getByRole("switch", { name: "Dungeon auto-layout" });
out.autoInitial = await auto.getAttribute("aria-checked").catch(() => null);
async function treeDrop(name, dx, dy) {
  const row = page.locator(".map-tree__map", { hasText: new RegExp("^" + name + "$") }).first();
  await row.scrollIntoViewIfNeeded();
  const before = (await row.getAttribute("class")).includes("greyed");
  await row.dragTo(canvas, { targetPosition: { x: dx, y: dy } }); await wait(1500);
  const after = (await row.getAttribute("class")).includes("greyed");
  return { name, greyedBefore: before, greyedAfter: after, greyedTotal: await greyedCount() };
}
// pick greyed names
const names = await page.evaluate(() => [...document.querySelectorAll(".map-tree__map--greyed")].map(b => b.textContent));
out.sampleGreyed = names.slice(0, 5);
out.drop1 = await treeDrop(names.find(n => /House/.test(n)) ?? names[0], 300, 300);
await shot("gba-a-1-tree-drop");
out.autoState = await auto.getAttribute("aria-checked").catch(() => null);
console.log(JSON.stringify(out, null, 1)); await browser.close();
