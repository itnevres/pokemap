// usage:
//   node run.mjs <tag> paint <map> <other> <discard|save>
//   node run.mjs <tag> sign <map> <free|name|species> <commit|nocommit> [text]
//   node run.mjs <tag> check <map> <px> <py> <x> <y>
import { createRequire } from "node:module";
const require = createRequire("C:/Users/Serve/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/");
const { chromium } = require("playwright-core");
import { fileURLToPath } from "node:url";
const SHOTS = fileURLToPath(new URL("./shots/", import.meta.url));
const [tag, scenario, map, ...rest] = process.argv.slice(2);
const out = { tag, scenario, map, rest, api: [], net: [] };
const shot = (page, n) => page.screenshot({ path: `${SHOTS}${tag}-${n}.png` });
const wait = (page, ms) => page.waitForTimeout(ms);
const browser = await chromium.launch({ executablePath: "C:/Users/Serve/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe", headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("response", async (r) => {
  const u = r.url(); if (!u.includes("/api/")) return;
  const m = r.request().method(); const short = u.replace(/^.*\/api/, "");
  if (m !== "GET") out.api.push(`${m} ${short} ${r.status()}`);
  if (/\/(plan|commit|sign\/put|sign\/at|discard)/.test(u)) {
    let res = ""; try { res = (await r.text()).slice(0, 3000); } catch {}
    out.net.push({ m, u: short, s: r.status(), req: r.request().postData()?.slice(0, 300), res });
  }
});
const canvas = () => page.locator("canvas.map-canvas__stage").first();
async function openMap(name) {
  await page.goto("http://localhost:5183/"); await wait(page, 2000);
  await page.locator(".map-tree, .app__sidebar").getByText(name, { exact: true }).first().click(); await wait(page, 3000);
}
const tool = (label) => page.locator(`button[title^="${label} ("]`).first().click();
const dirty = () => page.evaluate(() => !!document.querySelector('[data-testid="dirty-indicator"]'));
const editorText = () => page.locator('[role="dialog"][aria-label="Sign editor"]').innerText({ timeout: 1000 }).catch(() => "");

try {
  await openMap(map);
  const box = await canvas().boundingBox();
  if (scenario === "paint") {
    const [other, choice] = rest;
    await tool("Pencil");
    const cells = page.locator(".metatile-palette__cell, .gbc-metatile-palette__cell");
    const px = box.x + box.width / 2, py = box.y + box.height / 2;
    for (let i = 3; i < 40 && !(await dirty()); i += 5) {
      await cells.nth(i).click(); await wait(page, 300);
      await page.mouse.click(px, py); await wait(page, 1200);
      out.paintedCell = i;
    }
    out.dirtyAfterPaint = await dirty();
    out.hover = await page.locator(".map-canvas__hover").first().innerText({ timeout: 1000 }).catch(() => "");
    await shot(page, "1-painted");
    await page.locator(".map-tree, .app__sidebar").getByText(other, { exact: true }).first().click(); await wait(page, 1200);
    const prompt = page.locator('[role="dialog"][aria-label="Unsaved changes"]');
    out.promptShown = await prompt.count() > 0;
    out.promptText = await prompt.innerText({ timeout: 1000 }).catch(() => "");
    await shot(page, "2-prompt");
    if (choice === "discard") {
      await prompt.getByRole("button", { name: "Discard", exact: true }).click(); await wait(page, 3000);
    } else {
      await prompt.getByRole("button", { name: "Save", exact: true }).click(); await wait(page, 2000);
      const dlg = page.locator('[role="dialog"][aria-label="Save changes"]');
      out.saveDialogText = await dlg.innerText({ timeout: 1000 }).catch(() => "");
      await shot(page, "3-savedialog");
      await dlg.getByRole("button", { name: "Save Changes", exact: true }).click(); await wait(page, 4000);
    }
    out.dialogsLeft = await page.locator('[role="dialog"]').count();
    out.dirtyAfter = await dirty();
    await shot(page, "4-after");
  } else if (scenario === "sign") {
    const [mode, commit, text] = rest;
    await tool("Sign"); await wait(page, 300);
    out.pressed = await page.evaluate(() => [...document.querySelectorAll("button[aria-pressed=true]")].map((b) => b.title).join(","));
    let picked = null;
    for (let fy = Number(process.env.FY0 ?? 0.35); fy < 0.95 && !picked; fy += 0.11) for (let fx = 0.3; fx < 0.9 && !picked; fx += 0.09) {
      const px = Math.round(box.x + box.width * fx), py = Math.round(box.y + box.height * fy);
      await page.mouse.click(px, py); await wait(page, 900);
      const t = await editorText();
      if (!t) continue;
      const atReq = out.net.filter((n) => n.u.includes("sign/at")).at(-1);
      if (/already has|too complex|object event/i.test(t) || /Update/.test(t) || !/Place/.test(t)) {
        await page.keyboard.press("Escape"); await wait(page, 300); continue;
      }
      const eb = await page.locator('[role="dialog"][aria-label="Sign editor"]').boundingBox();
      picked = { px, py, at: atReq?.u, editorBox: eb };
    }
    out.picked = picked;
    if (picked) {
      const dlg = page.locator('[role="dialog"][aria-label="Sign editor"]');
      const label = { free: "Free text", name: "Map name", species: "Catchable species" }[mode];
      await dlg.getByLabel(label).check(); await wait(page, 200);
      if (mode === "free") await dlg.getByLabel("Text", { exact: true }).fill(text ?? "HELLO");
      await wait(page, 300);
      out.preview = await dlg.locator('pre[aria-label="Preview"]').innerText({ timeout: 1000 }).catch(() => "");
      await shot(page, "1-editor");
      await dlg.getByRole("button", { name: "Place", exact: true }).click(); await wait(page, 1500);
      out.editorOpenAfterPlace = await dlg.count() > 0;
      out.editorAlert = await dlg.locator('[role="alert"]').innerText({ timeout: 1000 }).catch(() => "");
      out.dirty = await dirty();
      await shot(page, "2-placed");
      if (commit === "commit" && out.dirty) {
        await page.locator('.toolbar__save button[aria-label="Save Changes"]').click(); await wait(page, 2000);
        const sd = page.locator('[role="dialog"][aria-label="Save changes"]');
        out.saveDialogText = await sd.innerText({ timeout: 1000 }).catch(() => "");
        await shot(page, "3-savedialog");
        await sd.getByRole("button", { name: "Save Changes", exact: true }).click(); await wait(page, 4000);
        out.dialogsLeft = await page.locator('[role="dialog"]').count();
        out.dirtyAfter = await dirty();
        await shot(page, "4-saved");
      }
    }
  } else if (scenario === "check") {
    const [px, py, x, y] = rest.map(Number);
    out.signAt = await page.evaluate(async ([m, x, y]) => (await fetch(`/api/edit/${encodeURIComponent(m)}/sign/at?x=${x}&y=${y}`)).text(), [map, x, y]);
    await tool("Sign"); await wait(page, 300);
    await page.mouse.click(px, py); await wait(page, 1200);
    out.editor = await editorText();
    await shot(page, "1-reload-editor");
  }
} catch (e) { out.error = String(e?.stack ?? e).slice(0, 800); await shot(page, "error").catch(() => {}); }
await browser.close();
console.log(JSON.stringify(out, null, 1));
