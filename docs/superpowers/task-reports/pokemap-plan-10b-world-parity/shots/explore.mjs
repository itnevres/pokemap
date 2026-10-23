import { open } from "./lib.mjs";
const { browser, page, wait, shot } = await open();
await page.goto("http://localhost:5183/"); await wait(3000);
console.log(await page.evaluate(() => [...document.querySelectorAll("button,[role=tab],[role=switch]")].filter(b=>!b.closest(".map-tree")).map(b => (b.getAttribute("aria-label")||b.innerText||"").trim().slice(0,30)+"|"+b.className.slice(0,40)).join("\n")));
await shot("explore"); await browser.close();
