// usage: node live.mjs <tag> <map> <gba|gbc> <target file the paints change>
// Tab A paints in the UI and opens Save; tab B stages another paint through the API (same hub session);
// tab A's Save must be refused with the PLAN_CHANGED notice, then the re-reviewed Save goes through.
import { createRequire } from "node:module";
const require = createRequire("C:/Users/Serve/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/");
const { chromium } = require("playwright-core");
import { fileURLToPath } from "node:url";
const SHOTS = fileURLToPath(new URL("./", import.meta.url));
const [tag, map, family, target] = process.argv.slice(2);
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const sha = () => createHash("sha1").update(readFileSync(target)).digest("hex").slice(0, 12);
const out = { tag, map, family, net: [] };
const browser = await chromium.launch({ executablePath: "C:/Users/Serve/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const shot = (n) => page.screenshot({ path: `${SHOTS}${tag}-${n}.png` });
const wait = (ms) => page.waitForTimeout(ms);
page.on("pageerror", (e) => out.net.push({ pageerror: String(e).slice(0, 300) }));
page.on("response", async (r) => {
  if (!/\/plan|\/commit/.test(r.url())) return;
  let res = ""; try { res = (await r.text()).slice(0, 600); } catch {}
  out.net.push({ m: r.request().method(), u: r.url().replace(/^.*\/api/, ""), s: r.status(), req: r.request().postData()?.slice(0, 120), res });
});
const dirty = () => page.evaluate(() => !!document.querySelector('[data-testid="dirty-indicator"]'));
const canvas = () => page.locator(family === "gbc" ? "canvas.gbc-map-canvas__stage, canvas.map-canvas__stage" : "canvas.map-canvas__stage").first();
try {
  await page.goto("http://localhost:5183/"); await wait(2500);
  await page.locator(".map-tree, .app__sidebar").getByText(map, { exact: true }).first().click(); await wait(3500);
  await page.keyboard.press("p"); await wait(300);
  await page.mouse.click(1145, family === "gbc" ? 250 : 225); await wait(500); // pick a palette metatile (top-left of the palette column)
  out.selection = await page.getByText(/^Selection/).first().innerText().catch(() => "");
  const b = await canvas().boundingBox();
  for (const f of [0.5, 0.35, 0.65]) {
    await page.mouse.click(b.x + b.width * f, b.y + b.height * f); await wait(1500);
    if (await dirty()) break;
  }
  out.dirtyA = await dirty();
  await page.locator('.toolbar__save button[aria-label="Save Changes"]').click(); await wait(2500);
  const sd = page.locator('[role="dialog"][aria-label="Save changes"]');
  out.dialogBefore = await sd.innerText({ timeout: 3000 }).catch(() => "");
  await shot("1-preview");
  // Tab B: another client edits the same session after tab A's preview.
  const tabB = await ctx.newPage();
  await tabB.goto("http://localhost:5183/"); await tabB.waitForTimeout(1500);
  out.tabB = await tabB.evaluate(async (name) => {
    const post = async (sub, body) => { const r = await fetch(`/api/edit/${encodeURIComponent(name)}/${sub}`, { method: "POST", body: JSON.stringify(body) }); return { s: r.status, j: await r.json() }; };
    const start = await post("paint/begin", {}); const cur = start.j.blocks[0];
    const apply = await post("paint/apply", { tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ ...cur, metatileId: cur.metatileId === 1 ? 2 : 1 }] }, origin: { x: 0, y: 0 } });
    const end = await post("paint/end", {});
    return [start.s, apply.s, end.s];
  }, map);
  out.diskBefore409 = sha();
  await sd.getByRole("button", { name: "Save Changes", exact: true }).click(); await wait(3000);
  out.diskAfter409 = sha();
  out.dialogAfter409 = await sd.innerText({ timeout: 3000 }).catch(() => "");
  out.saveEnabledAfter409 = await sd.getByRole("button", { name: "Save Changes", exact: true }).isEnabled().catch(() => null);
  await shot("2-plan-changed");
  await sd.getByRole("button", { name: "Save Changes", exact: true }).click(); await wait(4000);
  out.dialogsLeft = await page.locator('[role="dialog"]').count();
  out.dirtyAfterSave = await dirty();
  out.diskAfterSave = sha();
  await shot("3-saved");
} catch (e) { out.error = String(e?.stack ?? e).slice(0, 800); await shot("error").catch(() => {}); }
await browser.close();
console.log(JSON.stringify(out, null, 1));
