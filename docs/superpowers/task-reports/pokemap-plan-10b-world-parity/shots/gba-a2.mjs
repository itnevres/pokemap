import { open } from "./lib.mjs";
const { browser, page, wait, shot } = await open();
const out = { net: [] };
page.on("response", (r) => { if (/\/api\/world/.test(r.url()) && r.request().method() !== "GET") out.net.push(r.request().method() + " " + r.url().replace(/^.*\/api/, "") + " " + r.status() + " " + (r.request().postData() || "").slice(0, 150)); });
await page.goto("http://localhost:5183/"); await wait(3000);
await page.getByRole("button", { name: "World", exact: true }).click(); await wait(3500);
const canvas = page.locator("canvas").first();
const greyed = () => page.locator(".map-tree__map--greyed").count();
const auto = page.getByRole("switch", { name: "Dungeon auto-layout" });
const rowGrey = async (n) => (await page.locator(".map-tree__map", { hasText: new RegExp("^" + n + "$") }).first().getAttribute("class")).includes("greyed");
out.greyed0 = await greyed();
out.auto0 = await auto.getAttribute("aria-checked");
out.rail0 = await page.locator(".world-canvas__rail-count").innerText().catch(() => "none");
// rail drop (auto off)
const items = page.locator(".world-canvas__rail-item");
out.railItems = await items.count();
if (out.railItems) {
  const name = await items.first().innerText(); out.railName = name;
  out.railRowGreyBefore = await rowGrey(name);
  await items.first().dragTo(canvas, { targetPosition: { x: 450, y: 350 } }); await wait(1500);
  out.railRowGreyAfter = await rowGrey(name);
  out.railCountAfter = await page.locator(".world-canvas__rail-count").innerText();
  out.greyedAfterRail = await greyed();
}
await shot("gba-a-2-rail-drop-off");
// auto ON
await auto.click(); await wait(3000);
out.auto1 = await auto.getAttribute("aria-checked");
out.greyedOn = await greyed();
out.railOn = await page.locator(".world-canvas__rail-count").innerText().catch(() => "none");
const names = await page.evaluate(() => [...document.querySelectorAll(".map-tree__map--greyed")].map(b => b.textContent));
const nm = names.find(n => /PokemonCenter/.test(n)) ?? names[0]; out.treeName = nm;
const row = page.locator(".map-tree__map", { hasText: new RegExp("^" + nm + "$") }).first();
await row.scrollIntoViewIfNeeded();
out.treeGreyBeforeOn = (await row.getAttribute("class")).includes("greyed");
await row.dragTo(canvas, { targetPosition: { x: 600, y: 200 } }); await wait(1500);
out.treeGreyAfterOn = (await row.getAttribute("class")).includes("greyed");
out.greyedAfterOn = await greyed();
await shot("gba-a-3-tree-drop-auto-on");
const items2 = page.locator(".world-canvas__rail-item");
out.railItemsOn = await items2.count();
if (out.railItemsOn) { const n2 = await items2.first().innerText(); out.rail2 = n2; out.rail2GreyBefore = await rowGrey(n2);
  await items2.first().dragTo(canvas, { targetPosition: { x: 700, y: 450 } }); await wait(1500); out.rail2GreyAfter = await rowGrey(n2); }
// toggle back off to match baseline state
await auto.click(); await wait(2500); out.auto2 = await auto.getAttribute("aria-checked");
console.log(JSON.stringify(out, null, 1)); await browser.close();
