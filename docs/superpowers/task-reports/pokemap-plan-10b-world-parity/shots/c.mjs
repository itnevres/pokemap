import { open } from "./lib.mjs";
const { browser, page, wait, shot } = await open();
const net = [];
page.on("response", async (r) => { if (/defect/i.test(r.url())) net.push(r.url().replace(/^.*\/api/, "") + " " + r.status() + " " + (await r.text().catch(()=>"")).slice(0, 700)); });
await page.goto("http://localhost:5183/"); await wait(3000);
const out = {};
for (const [m, tag] of [["NavelRockZygardeChamber", "c-1-zygarde"], ["NavelRock_ZygardeChamber", "c-1-zygarde"], ["Route101", "c-2-route101"]]) {
  const row = page.locator(".map-tree").getByText(m, { exact: true }).first();
  if (!(await row.count())) { out[m] = "no row"; continue; }
  await row.scrollIntoViewIfNeeded(); await row.click(); await wait(3500);
  out[m] = { banner: await page.locator("[class*=defect]").allInnerTexts() };
  await shot("gba-" + tag + "-" + m);
}
console.log(JSON.stringify({ out, net }, null, 1)); await browser.close();
