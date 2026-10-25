// GBA, server reachable but every placement POST and the next world GET fail (routed; nothing reaches the subject):
// the save and reload toasts must both be visible, stacked, not covering each other.
import { open } from "./lib.mjs";
const { browser, page, wait, shot } = await open();
await page.goto("http://localhost:5183/"); await wait(3000);
await page.getByRole("button", { name: "World", exact: true }).click(); await wait(6000);
await page.route("**/api/world/placement", (r) => r.fulfill({ status: 500, body: "down" }));
await page.route("**/api/world", (r) => (r.request().method() === "GET" ? r.fulfill({ status: 500, body: "down" }) : r.continue()));
const canvas = page.locator("canvas.world-canvas__stage"); const box = await canvas.boundingBox();
await page.getByRole("region", { name: "World canvas" }).getByRole("button", { name: "Fit" }).click(); await wait(800);
const cx = box.x + 355, cy = box.y + 60;
await page.keyboard.down("Shift"); await page.mouse.move(cx, cy); await page.mouse.down();
await page.mouse.move(cx + 40, cy + 40, { steps: 6 }); await page.mouse.up(); await page.keyboard.up("Shift");
await wait(3000);
const boxes = await page.evaluate(() => [...document.querySelectorAll(".world-canvas__toast")].map((t) => { const r = t.getBoundingClientRect(); return { text: t.textContent.slice(0, 60), top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left) }; }));
const overlap = boxes.length > 1 && boxes.some((a, i) => boxes.some((b, j) => i < j && a.top < b.bottom && b.top < a.bottom));
console.log(JSON.stringify({ boxes, overlap }));
await shot("gba-w7-toast-stack");
await browser.close();
