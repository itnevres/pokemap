import { open } from "./lib.mjs";
import { guard } from "./guard.mjs";
const { browser, page, wait, shot } = await open();
const out = {}; await guard(page, out); let n = 0;
page.on("requestfinished", (r) => { if (new URL(r.url()).pathname.startsWith("/api/render/")) n++; });
await page.goto("http://127.0.0.1:5183/"); await wait(3000);
await page.getByRole("group", { name: "View" }).getByRole("button", { name: "World" }).click();
const t0 = Date.now(); const marks = [];
for (const s of [1, 2, 4, 6, 8, 10]) { await page.waitForTimeout(s * 1000 - (Date.now() - t0)); marks.push(`${s}s:${n}`); await shot(`film-cold-${String(s).padStart(2, "0")}s`); }
console.log(JSON.stringify({ marks, blocked: out.blocked })); await browser.close();
