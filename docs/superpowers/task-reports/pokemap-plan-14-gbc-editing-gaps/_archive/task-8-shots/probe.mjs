// usage: node probe.mjs <gba|gbc> <map>   (hub on 5184 serving a SCRATCH clone, Vite on 5183; see task-8-live.md)
// Headless check of Plan 14.1 Tasks 6-8: Add bar, placement cancel paths, dialog open/Escape, one BG create + undo.
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const require = createRequire("C:/Users/Serve/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/");
const { chromium } = require("playwright-core");
const SHOTS = fileURLToPath(new URL("./shots/", import.meta.url)); mkdirSync(SHOTS, { recursive: true });
const [family, map] = process.argv.slice(2);
const out = { family, map, net: [], errs: [] };
const browser = await chromium.launch({ executablePath: "C:/Users/Serve/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${SHOTS}${family}-${n}.png` });
page.on("pageerror", (e) => out.errs.push(String(e).slice(0, 300)));
page.on("request", (r) => { if (r.method() === "POST" && /\/api\/world\//.test(r.url())) r.abort?.(); });
page.on("response", async (r) => {
  if (!/event\/create|event-options|\/undo|\/paint\//.test(r.url())) return;
  let res = ""; try { res = (await r.text()).slice(0, 300); } catch {}
  out.net.push({ m: r.request().method(), u: r.url().replace(/^.*\/api/, ""), s: r.status(), req: r.request().postData()?.slice(0, 300), res });
});
const bar = () => page.getByRole("group", { name: "Add events" });
const btn = (prefix) => bar().locator(`button[aria-label^="${prefix}"]`);
const dialog = () => page.locator('[role="dialog"].add-event-dialog');
const dirty = () => page.evaluate(() => !!document.querySelector('[data-testid="dirty-indicator"]'));
const canvas = () => page.locator("canvas.gbc-map-canvas__stage, canvas.map-canvas__stage").first();
try {
  await page.goto("http://127.0.0.1:5183/"); await wait(3000);
  await page.locator(".map-tree, .app__sidebar").getByText(map, { exact: true }).first().click(); await wait(4000);
  out.bar = await bar().locator("button").evaluateAll(bs => bs.map(b => ({ label: b.getAttribute("aria-label"), pressed: b.getAttribute("aria-pressed"), disabled: b.disabled, title: b.title })));
  await shot("1-bar");
  // Placement cancel paths: Escape and same button.
  await btn("Add Object").click(); await wait(200); out.pressedAfterClick = await btn("Add Object").getAttribute("aria-pressed");
  await page.keyboard.press("Escape"); await wait(200); out.pressedAfterEsc = await btn("Add Object").getAttribute("aria-pressed");
  await btn("Add Object").click(); await wait(200); await btn("Add Object").click(); await wait(200);
  out.pressedAfterReclick = await btn("Add Object").getAttribute("aria-pressed");
  // Placement -> dialog -> Escape.
  const b = await canvas().boundingBox();
  await btn("Add Object").click(); await wait(200);
  await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.5); await wait(6000);
  out.objectDialog = await dialog().getAttribute("aria-label").catch(() => null);
  out.objectFields = await dialog().locator("[aria-label]").evaluateAll(es => es.map(e => e.getAttribute("aria-label"))).catch(() => []);
  await shot("2-object-dialog");
  await page.keyboard.press("Escape"); await wait(500); out.objectDialogAfterEsc = await dialog().count();
  // BG create with a New script, then undo.
  out.dirtyBefore = await dirty();
  await btn("Add BG").click(); await wait(200);
  await page.mouse.click(b.x + b.width * 0.4, b.y + b.height * 0.6); await wait(6000);
  out.bgDialog = await dialog().getAttribute("aria-label").catch(() => null);
  out.bgFields = await dialog().locator("[aria-label]").evaluateAll(es => es.map(e => `${e.tagName}:${e.getAttribute("aria-label")}=${e.value ?? ""}`)).catch(() => []);
  for (const t of await dialog().locator("textarea").all()) if (!(await t.inputValue())) await t.fill("HELLO THERE");
  await shot("3-bg-filled");
  out.addEnabled = await dialog().getByRole("button", { name: "Add", exact: true }).isEnabled();
  if (out.addEnabled) { await dialog().getByRole("button", { name: "Add", exact: true }).click(); await wait(3000); }
  out.bgDialogAfterAdd = await dialog().count();
  out.bgError = await dialog().locator(".save-dialog__error, [role=alert]").innerText().catch(() => null);
  out.dirtyAfterCreate = await dirty();
  await shot("4-after-create");
  await page.getByRole("button", { name: /^Undo/ }).first().click().catch((e) => out.errs.push(`undo: ${e}`)); await wait(2000);
  out.dirtyAfterUndo = await dirty();
  await shot("5-after-undo");
} catch (e) { out.errs.push(`driver: ${String(e).slice(0, 400)}`); await shot("error").catch(() => {}); }
writeFileSync(`${SHOTS}${family}-probe.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
