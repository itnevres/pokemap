// usage: node dprobe.mjs <fam> <dungeonName>  -- dungeon view zoomed out: all members and lines (no writes)
import { open } from "./lib.mjs";
import { guard } from "./guard.mjs";
const [fam, dungeon] = process.argv.slice(2);
const { browser, page, wait, shot, errs } = await open();
const out = { fam }; await guard(page, out);
await page.goto("http://127.0.0.1:5183/"); await wait(3000);
await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Dungeon", exact: true }).click(); await wait(2500);
await page.getByRole("navigation", { name: "Dungeons" }).getByRole("button").filter({ hasText: dungeon }).first().click(); await wait(4000);
await page.getByRole("switch", { name: "Connection lines" }).click(); await wait(3000);
const readout = () => page.locator(".world-canvas__zoom-readout").textContent();
out.start = await readout();
await page.getByRole("button", { name: "Fit", exact: true }).first().click(); await wait(2000);
out.afterFit = await readout();
await page.locator(".world-canvas__viewport canvas").first().focus();
for (let i = 0; i < 3; i++) { await page.keyboard.press("-"); await wait(600); }
out.zoomedOut = await readout(); out.lines = await page.locator(".world-canvas__connections line").count();
await shot(`${fam}-d4-dungeon-zoomed-out`);
out.errs = errs; console.log(JSON.stringify(out)); await browser.close();
