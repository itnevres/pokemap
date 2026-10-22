import { open } from "./lib.mjs";
const { browser, page, wait, shot } = await open();
const out = { runs: [] };
await page.goto("http://localhost:5183/"); await wait(3000);
await page.getByRole("button", { name: "World", exact: true }).click(); await wait(3500);
const canvas = page.locator("canvas").first();
const auto = page.getByRole("switch", { name: "Dungeon auto-layout" });
async function run(label, nm, x, y) {
  const row = page.locator(".map-tree__map", { hasText: new RegExp("^" + nm + "$") }).first();
  await row.scrollIntoViewIfNeeded();
  const before = (await row.getAttribute("class")).includes("greyed");
  const t0 = Date.now(); await row.dragTo(canvas, { targetPosition: { x, y } });
  let ms = null;
  for (let i = 0; i < 60; i++) { if (!(await row.getAttribute("class")).includes("greyed")) { ms = Date.now() - t0; break; } await wait(100); }
  out.runs.push({ label, nm, before, msToUngrey: ms });
}
await run("auto-off", "NewBarkTown_PlayersHouse_1F", 300, 450);
await auto.click(); await wait(3000);
await run("auto-on", "NewBarkTown_PlayersHouse_2F", 500, 450);
await run("auto-on", "CherrygroveCity_House1", 650, 500);
await shot("gba-a-4-tree-drop-auto-on-timed");
await auto.click(); await wait(2500);
console.log(JSON.stringify(out, null, 1)); await browser.close();
