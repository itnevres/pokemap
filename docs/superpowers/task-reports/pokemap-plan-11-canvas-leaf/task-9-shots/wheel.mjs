import { open } from "./lib.mjs";
const fam = process.argv[2];
const { browser, page, wait, shot } = await open();
await page.goto("http://localhost:5183/"); await wait(3000);
await page.getByRole("button", { name: "World", exact: true }).click(); await wait(6000);
const region = page.getByRole("region", { name: "World canvas" });
const canvas = region.locator("canvas.world-canvas__stage"); const box = await canvas.boundingBox();
const readout = async () => (await region.getByText(/^\d+%$/).count()) ? region.getByText(/^\d+%$/).first().innerText() : ((await page.locator(".world-canvas__status").innerText()).match(/zoom (\d+%)/) ?? [])[1];
const out = { start: await readout() };
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -120); await wait(250); }
out.afterIn = await readout();
for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, 120); await wait(250); }
out.afterOut = await readout();
await region.getByRole("button", { name: "Fit" }).click(); await wait(800); out.fit = await readout(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -120); await wait(250); }
out.fitThenIn = await readout();
await shot(`${fam}-w1b-wheel`);
// interactivity: hover finds a map
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await wait(100);
out.hover = await page.locator(".world-canvas__hover").innerText().catch(() => "");
console.log(JSON.stringify(out));
await browser.close();
