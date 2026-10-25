// usage: node world.mjs <family-prefix>   -- world-view checks shared by both families
import { open } from "./lib.mjs";
const fam = process.argv[2];
const { browser, page, wait, shot, errs } = await open();
const out = {}; const net = [];
page.on("request", (r) => { if (r.url().includes("/api/world")) net.push({ t: Date.now(), m: r.method(), u: r.url().replace(/^.*\/api/, ""), b: (r.postData() || "").slice(0, 120) }); });
await page.goto("http://localhost:5183/"); await wait(3000);
await page.getByRole("button", { name: "World", exact: true }).click(); await wait(6000);
const canvas = page.getByRole("region", { name: "World canvas" }).locator("canvas.world-canvas__stage");
const box = await canvas.boundingBox();
const hover = async (x, y) => { await page.mouse.move(box.x + x, box.y + y); await wait(60); return (await page.locator(".world-canvas__hover").innerText().catch(() => "")).trim(); };
const readout = () => page.locator(".app__canvas").getByText(/^\d+%$/).first().innerText().catch(() => "?");
// Zoom: Fit and wheel
out.zoom0 = await readout();
await page.getByRole("region", { name: "World canvas" }).getByRole("button", { name: "Fit" }).click(); await wait(800); out.zoomFit = await readout();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, -300); await wait(800); out.zoomWheelIn = await readout();
await page.mouse.wheel(0, 300); await wait(800); out.zoomWheelOut = await readout();
await shot(`${fam}-w1-zoom`);
// Lens overlay + legend
const lens = page.getByRole("group", { name: "Coverage lenses" }).getByRole("button").first();
await lens.click(); await wait(1500); out.lensPressed = await lens.getAttribute("aria-pressed"); out.lensName = await lens.getAttribute("aria-label") ?? await lens.innerText();
await shot(`${fam}-w2-lens`); await lens.click(); await wait(800);
// Find three distinct maps on a coarse grid
const seen = new Map();
for (let y = 60; y < box.height - 40 && seen.size < 12; y += 45) for (let x = 40; x < box.width - 40 && seen.size < 12; x += 45) {
  const h = await hover(x, y); const name = h.split(/\s|·/)[0];
  if (name && !/^Hover/.test(h) && !seen.has(name)) seen.set(name, { x, y, h });
}
out.found = [...seen].map(([n, p]) => `${n}@${p.x},${p.y}`);
const pts = [...seen.values()].slice(0, 3);
// Group move: Ctrl-select three, Shift-drag the first by 3 tiles' worth of px
let mark = net.length;
for (const p of pts) { await page.mouse.move(box.x + p.x, box.y + p.y); await page.keyboard.down("Control"); await page.mouse.down(); await page.mouse.up(); await page.keyboard.up("Control"); await wait(150); }
await page.keyboard.down("Shift"); await page.mouse.move(box.x + pts[0].x, box.y + pts[0].y); await page.mouse.down();
await page.mouse.move(box.x + pts[0].x + 30, box.y + pts[0].y + 30, { steps: 6 }); await page.mouse.up(); await page.keyboard.up("Shift");
await wait(4000);
out.group = net.slice(mark).map((n) => `${n.m} ${n.u} ${n.b}`);
out.groupWorldGets = net.slice(mark).filter((n) => n.m === "GET" && n.u === "/world").length;
out.groupPosts = net.slice(mark).filter((n) => n.m === "POST").length;
await shot(`${fam}-w3-group-move`);
// Single Shift-drag on a fourth map (Escape clears the selection first)
await page.keyboard.press("Escape"); await page.mouse.click(box.x + 5, box.y + box.height - 5); await wait(300);
const q = [...seen.values()][3] ?? pts[1];
mark = net.length;
await page.keyboard.down("Shift"); await page.mouse.move(box.x + q.x, box.y + q.y); await page.mouse.down();
await page.mouse.move(box.x + q.x - 30, box.y + q.y + 20, { steps: 6 }); await page.mouse.up(); await page.keyboard.up("Shift");
await wait(4000);
out.single = net.slice(mark).map((n) => `${n.m} ${n.u} ${n.b}`);
await shot(`${fam}-w4-shift-drag`);
// Dungeon switch double toggle: record every aria-checked value it shows
const sw = page.getByRole("switch", { name: "Dungeon auto-layout" });
out.switch0 = await sw.getAttribute("aria-checked");
await page.evaluate(() => { const el = document.querySelector('[role="switch"][aria-label="Dungeon auto-layout"]') ?? [...document.querySelectorAll('[role="switch"]')][0]; window.__seq = [el.getAttribute("aria-checked")]; new MutationObserver(() => window.__seq.push(el.getAttribute("aria-checked"))).observe(el, { attributes: true, attributeFilter: ["aria-checked"] }); });
mark = net.length;
await sw.click(); await wait(40); await sw.click();
await wait(6000);
out.switchSeq = await page.evaluate(() => window.__seq);
out.switchNet = net.slice(mark).map((n) => `${n.m} ${n.u} ${n.b}`);
out.switchFinal = await sw.getAttribute("aria-checked");
await shot(`${fam}-w5-double-toggle`);
// F11: a failed reload keeps the canvas and shows a dismissible alert
let fail = true;
await page.route("**/api/world", (route) => { if (fail && route.request().method() === "GET") { fail = false; return route.fulfill({ status: 500, body: "boom" }); } return route.continue(); });
await sw.click(); await wait(4000);
out.reloadAlert = await page.getByRole("alert").filter({ hasText: "Could not reload the world" }).innerText().catch(() => null);
out.canvasKept = await canvas.isVisible();
out.hoverAfterFail = await hover(pts[0].x, pts[0].y);
await shot(`${fam}-w6-reload-alert`);
await page.getByRole("alert").filter({ hasText: "Could not reload the world" }).getByRole("button", { name: /Dismiss/ }).click().catch((e) => { out.dismissErr = String(e).slice(0, 200); });
await wait(500);
out.alertAfterDismiss = await page.getByRole("alert").filter({ hasText: "Could not reload the world" }).count();
await page.unroute("**/api/world");
await sw.click(); await wait(4000); out.switchRestored = await sw.getAttribute("aria-checked");
out.alerts = await page.getByRole("alert").allInnerTexts();
out.errs = errs;
console.log(JSON.stringify(out, null, 1));
await browser.close();
