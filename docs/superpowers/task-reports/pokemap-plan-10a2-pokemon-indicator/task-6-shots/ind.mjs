// usage:
//   node ind.mjs <tag> flow <map> <gba|gbc> <species1> <species2> [extraSpecies] [commit]
//   node ind.mjs <tag> check <map> <gba|gbc> <x> <y>
import { createRequire } from "node:module";
const require = createRequire("C:/Users/Serve/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/");
const { chromium } = require("playwright-core");
import { fileURLToPath } from "node:url";
const SHOTS = fileURLToPath(new URL("./shots/", import.meta.url));
const [tag, scenario, map, family, ...rest] = process.argv.slice(2);
const out = { tag, scenario, map, family, rest, api: [], net: [] };
const shot = (page, n) => page.screenshot({ path: `${SHOTS}${tag}-${n}.png` });
const wait = (page, ms) => page.waitForTimeout(ms);
const browser = await chromium.launch({ executablePath: "C:/Users/Serve/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe", headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("pageerror", (e) => out.net.push({ pageerror: String(e).slice(0, 300) }));
page.on("response", async (r) => {
  const u = r.url(); if (!u.includes("/api/")) return;
  const m = r.request().method(); const short = u.replace(/^.*\/api/, "");
  if (m !== "GET") out.api.push(`${m} ${short} ${r.status()}`);
  if (/indicator|\/plan|\/commit/.test(u)) {
    let res = ""; try { res = (await r.text()).slice(0, 1500); } catch {}
    out.net.push({ m, u: short, s: r.status(), req: r.request().postData()?.slice(0, 300), res });
  }
});
const IND = "Pok\u00e9mon Indicator";
const canvas = () => page.locator(family === "gbc" ? "canvas.gbc-map-canvas__stage, canvas.map-canvas__stage" : "canvas.map-canvas__stage").first();
const dirty = () => page.evaluate(() => !!document.querySelector('[data-testid="dirty-indicator"]'));
const hoverText = () => page.locator(".map-canvas__hover").first().innerText({ timeout: 1000 }).catch(() => "");
async function openMap(name) {
  await page.goto("http://localhost:5183/"); await wait(page, 2500);
  await page.locator(".map-tree, .app__sidebar").getByText(name, { exact: true }).first().click(); await wait(page, 3500);
}
// Hover two points and fit a linear pixel<->cell map (GBA block, GBC step).
async function cellAt(px, py) {
  await page.mouse.move(px, py); await wait(page, 250);
  const t = await hoverText();
  const m = family === "gbc" ? /step \((\d+), (\d+)\)/.exec(t) : /^\((\d+), (\d+)\)/.exec(t);
  return m ? { x: +m[1], y: +m[2], t } : null;
}
async function calibrate() {
  const b = await canvas().boundingBox();
  const p1 = [b.x + b.width * 0.42, b.y + b.height * 0.42], p2 = [b.x + b.width * 0.58, b.y + b.height * 0.58];
  const c1 = await cellAt(...p1), c2 = await cellAt(...p2);
  const sx = (p2[0] - p1[0]) / (c2.x - c1.x), sy = (p2[1] - p1[1]) / (c2.y - c1.y);
  const ox = p1[0] - (c1.x + 0.5) * sx, oy = p1[1] - (c1.y + 0.5) * sy; // approx origin of cell grid
  // refine origin so cell centres hit exactly: scan for boundary along x
  return { px: (x) => ox + (x + 0.5) * sx, py: (y) => oy + (y + 0.5) * sy, sx, sy };
}
async function centre(cal, x, y) {
  // nudge until the hover reports the wanted cell
  const offs = []; for (let a = -1; a <= 1; a += 0.25) for (let b = -1; b <= 1; b += 0.25) offs.push([a, b]); offs.sort((p, q) => Math.hypot(...p) - Math.hypot(...q));
  for (const [dx, dy] of offs) {
    const px = cal.px(x) + dx * cal.sx, py = cal.py(y) + dy * cal.sy;
    const c = await cellAt(px, py);
    if (c && c.x === x && c.y === y) return { px, py, t: c.t };
  }
  const last = await cellAt(cal.px(x), cal.py(y)); throw new Error(`cannot locate cell ${x},${y}; at estimate: ${last?.t} sx=${cal.sx} sy=${cal.sy}`);
}
const dialog = () => page.locator(`[role="dialog"][aria-label="${IND}"]`);
async function placeIndicator(species, text, n) {
  await page.locator(`button[title="${IND}"]`).first().click(); await wait(page, 2000);
  const d = dialog();
  const species0 = await d.locator(".sign-composer__species-btn").allInnerTexts();
  out[`speciesList${n}`] = species0.slice(0, 12);
  await d.locator(".sign-composer__species-btn", { hasText: new RegExp(`^${species}\\b`, "i") }).first().click();
  const x = Number(await d.getByLabel("X").inputValue()), y = Number(await d.getByLabel("Y").inputValue());
  await d.getByLabel("Dialogue").fill(text);
  await shot(page, `${n}-dialog`);
  await d.getByRole("button", { name: "Place", exact: true }).click(); await wait(page, 2500);
  out[`dialogOpenAfterPlace${n}`] = await d.count() > 0;
  out[`alert${n}`] = await d.locator('[role="alert"]').allInnerTexts().catch(() => []);
  out[`banner${n}`] = await page.getByText(/Placed Pok\u00e9mon Indicator/).first().innerText({ timeout: 1500 }).catch(() => "");
  return { x, y };
}

try {
  await openMap(map);
  const ev = page.getByRole("button", { name: "Events", exact: true }).first();
  if ((await ev.getAttribute("aria-pressed").catch(() => null)) === "false") { await ev.click(); await wait(page, 500); }
  out.eventsPressed = await ev.getAttribute("aria-pressed").catch(() => null);
  if (scenario === "flow") {
    const [sp1, sp2, extra, commit] = rest;
    // ensure no paint tool is active (select/drag mode)
    await page.keyboard.press("Escape"); await wait(page, 200);
    const pos = await placeIndicator(sp1, "This one is wild.", "1");
    out.placedAt = pos; out.dirtyAfterPlace = await dirty();
    let extraPos = null;
    if (extra && extra !== "-") {
      extraPos = await placeIndicator(extra, "Another wild one here.", "1b");
      out.extraAt = extraPos;
    }
    await shot(page, "2-placed");
    const cal = await calibrate();
    const from = await centre(cal, pos.x, pos.y);
    out.hoverAtPlaced = from.t;
    // drag two cells along x (or back if near the edge), staying off occupied cells
    const target = { x: pos.x >= 4 ? pos.x - 2 : pos.x + 2, y: pos.y };
    const to = await centre(cal, target.x, target.y);
    out.hoverAtTargetBefore = to.t;
    await page.mouse.move(from.px, from.py); await page.mouse.down(); await wait(page, 150);
    for (let i = 1; i <= 8; i++) { await page.mouse.move(from.px + (to.px - from.px) * i / 8, from.py + (to.py - from.py) * i / 8); await wait(page, 60); }
    await page.mouse.up(); await wait(page, 2000);
    out.dragTarget = target;
    const after = await centre(cal, target.x, target.y);
    out.hoverAtTargetAfter = after.t;
    await shot(page, "3-dragged");
    // select it and edit
    await page.mouse.click(after.px, after.py); await wait(page, 2000);
    const editBtn = page.getByRole("button", { name: "Edit Indicator", exact: true }).first();
    out.editTitle = await editBtn.getAttribute("title", { timeout: 3000 }).catch(() => null);
    out.editDisabled = await editBtn.isDisabled({ timeout: 1000 }).catch(() => null);
    await editBtn.click(); await wait(page, 2000);
    const d = dialog();
    out.editHasXY = await d.getByLabel("X").count();
    out.editPrefill = await d.getByLabel("Dialogue").inputValue().catch(() => "");
    out.editPressed = await d.locator('.sign-composer__species-btn[aria-pressed="true"]').allInnerTexts();
    await d.locator(".sign-composer__species-btn", { hasText: new RegExp(`^${sp2}\\b`, "i") }).first().click();
    await d.getByLabel("Dialogue").fill("Changed species and text, long enough to wrap onto more lines.");
    await shot(page, "4-edit");
    await d.getByRole("button", { name: "Update", exact: true }).click(); await wait(page, 2500);
    out.dialogOpenAfterUpdate = await d.count() > 0;
    out.alertUpdate = await d.locator('[role="alert"]').allInnerTexts().catch(() => []);
    await shot(page, "5-updated");
    if (commit === "commit") {
      await page.locator('.toolbar__save button[aria-label="Save Changes"]').click(); await wait(page, 2500);
      const sd = page.locator('[role="dialog"][aria-label="Save changes"]');
      out.saveDialogText = await sd.innerText({ timeout: 2000 }).catch(() => "");
      await shot(page, "6-savedialog");
      await sd.getByRole("button", { name: "Save Changes", exact: true }).click(); await wait(page, 4000);
      out.dialogsLeft = await page.locator('[role="dialog"]').count();
      out.dirtyAfterSave = await dirty();
      await shot(page, "7-saved");
    }
  } else if (scenario === "check") {
    const [x, y] = rest.map(Number);
    await page.keyboard.press("Escape");
    const cal = await calibrate();
    const c = await centre(cal, x, y);
    out.hover = c.t;
    await page.mouse.click(c.px, c.py); await wait(page, 2000);
    const editBtn = page.getByRole("button", { name: "Edit Indicator", exact: true }).first();
    out.editTitle = await editBtn.getAttribute("title", { timeout: 3000 }).catch(() => null);
    await shot(page, "1-reload");
  }
} catch (e) { out.error = String(e?.stack ?? e).slice(0, 800); await shot(page, "error").catch(() => {}); }
await browser.close();
console.log(JSON.stringify(out, null, 1));
