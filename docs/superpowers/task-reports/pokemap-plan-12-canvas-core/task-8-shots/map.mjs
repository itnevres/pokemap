// usage: node map.mjs <prefix> <mapName>
import { open } from "./lib.mjs";
const [fam, mapName] = process.argv.slice(2);
const { browser, page, wait, shot, errs } = await open();
const out = {};
await page.goto("http://127.0.0.1:5183/"); await wait(3000);
await page.getByRole("navigation", { name: "Maps" }).getByRole("button", { name: mapName, exact: true }).click(); await wait(4000);
const region = page.getByRole("region", { name: `${mapName} canvas` });
const zoom = region.getByRole("group", { name: "Zoom" });
const pressed = async () => (await zoom.getByRole("button").evaluateAll((bs) => bs.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent)));
out.zoom0 = await pressed();
await zoom.getByRole("button", { name: "2×" }).click(); await wait(500); out.zoom2 = await pressed();
const c = await region.locator("canvas").first().boundingBox();
await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2); await page.mouse.wheel(0, -120); await wait(500); out.wheelIn = await pressed();
await page.mouse.wheel(0, 120); await wait(500); await page.mouse.wheel(0, 120); await wait(500); out.wheelOut = await pressed();
await zoom.getByRole("button", { name: "Fit" }).click(); await wait(500); out.fit = await pressed();
const overlays = region.getByRole("group", { name: "Overlays" });
out.overlayNames = await overlays.getByRole("button").evaluateAll((bs) => bs.map((b) => (b.getAttribute("aria-label") ?? b.textContent) + "=" + b.getAttribute("aria-pressed")));
for (const b of await overlays.getByRole("button").all()) { await b.click(); await wait(400); }
out.overlaysOn = await overlays.getByRole("button").evaluateAll((bs) => bs.map((b) => (b.getAttribute("aria-label") ?? b.textContent) + "=" + b.getAttribute("aria-pressed")));
out.legend = (await region.innerText()).split("\n").filter((l) => l.trim()).slice(0, 30).join(" | ");
await shot(`${fam}-m1-overlays-on`);
for (const b of await overlays.getByRole("button").all()) { await b.click(); await wait(200); }
out.collisionNames = await page.getByRole("button", { name: /collision/i }).evaluateAll((bs) => bs.map((b) => `${b.getAttribute("aria-label")}|${b.textContent}|${b.getAttribute("title")}`));
out.errs = errs;
console.log(JSON.stringify(out, null, 1));
await browser.close();
