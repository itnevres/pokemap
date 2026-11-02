// usage: node explore.mjs <fam> <anchor>  -- find warp markers near an anchor map (no writes)
import { open } from "./lib.mjs";
import { guard } from "./guard.mjs";
const [fam, anchor] = process.argv.slice(2);
const { browser, page, wait, shot, errs } = await open();
const out = { fam }; await guard(page, out);
await page.goto("http://127.0.0.1:5183/"); await wait(2500);
await page.getByRole("group", { name: "View" }).getByRole("button", { name: "World", exact: true }).click(); await wait(2500);
const r = page.locator(".map-tree__map").filter({ hasText: new RegExp(`^${anchor}$`) }).first(); await r.scrollIntoViewIfNeeded(); await r.click(); await wait(1200);
await page.getByRole("switch", { name: "Warps" }).click(); await wait(1500);
out.readout = await page.locator(".world-canvas__zoom-readout").textContent();
out.markers = await page.locator(".world-canvas__warp-marker").evaluateAll((els) => els.slice(0, 12).map((e) => { const b = e.getBoundingClientRect(); return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)]; }));
out.markerCount = await page.locator(".world-canvas__warp-marker").count();
out.views = await page.getByRole("group", { name: "View" }).getByRole("button").allInnerTexts();
await shot(`${fam}-x0-warps`);
out.errs = errs; console.log(JSON.stringify(out)); await browser.close();
