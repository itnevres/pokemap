import { createRequire } from "node:module";
const require = createRequire("C:/Users/Serve/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/");
export const { chromium } = require("playwright-core");
import { fileURLToPath } from "node:url";
export const SHOTS = fileURLToPath(new URL("./", import.meta.url));
export async function open() {
  const browser = await chromium.launch({ executablePath: "C:/Users/Serve/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe", headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 300)));
  return { browser, ctx, page, errs, shot: (n) => page.screenshot({ path: `${SHOTS}${n}.png` }), wait: (ms) => page.waitForTimeout(ms) };
}
