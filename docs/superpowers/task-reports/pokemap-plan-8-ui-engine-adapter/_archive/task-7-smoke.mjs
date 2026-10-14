// Plan 8 Task 7 Step 3 smoke: picker open, Map/World/Dungeon, context edit (paint -> beforeunload armed -> undo -> disarmed -> Done).
import { pix } from "./pix.mjs";
const CFG = {
  gbc: { path: "C:/Programming Projects/pokecrystal-PerfPlus", A: "NewBarkTown", mt: "metatile 0x7" },
  gba: { path: "C:/Programming Projects/Pokemon Game/game", A: "LittlerootTown", mt: "metatile 0x7" },
};
const fam = process.env.FAM;
export default async (page) => {
  const c = CFG[fam];
  const reqs = [];
  page.on("request", (r) => { if (r.method() === "POST") reqs.push(r.url().replace(/^.*\/api/, "")); });
  page.on("pageerror", (e) => reqs.push("PAGEERROR " + e.message.slice(0, 200)));
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("http://127.0.0.1:5183/"); await page.waitForTimeout(2500);
  await page.locator(".hub-switcher__btn").click(); await page.waitForTimeout(800);
  await page.locator(".hub-picker__recent .hub-picker__row").filter({ hasText: c.path }).getByRole("button", { name: "Open" }).click();
  await page.waitForTimeout(4000);
  const current = await page.locator(".hub-switcher__btn").getAttribute("title");
  await page.getByRole("button", { name: c.A, exact: true }).click(); await page.waitForTimeout(1500);
  const mapMode = { canvas: await page.locator(".map-canvas canvas").count(), toolbar: await page.locator(".toolbar").count() };
  await page.getByRole("button", { name: "Dungeon", exact: true }).click(); await page.waitForTimeout(2500);
  const dungeon = { text: (await page.locator("main, .app").first().innerText()).slice(0, 120).replace(/\s+/g, " ") };
  await page.getByRole("button", { name: "World", exact: true }).click(); await page.waitForTimeout(3000);
  const world = { stage: await page.locator("canvas.world-canvas__stage").count() };
  await page.mouse.move(5, 845);
  await page.locator("canvas.world-canvas__stage").focus();
  await page.keyboard.press("ContextMenu");
  await page.getByRole("menuitem", { name: /Edit here/ }).click(); await page.waitForTimeout(2500);
  const inCtx = await page.locator(".world-canvas__context").count();
  const unload = () => page.evaluate(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  const u0 = await unload();
  await page.getByRole("button", { name: "pencil", exact: true }).click();
  await page.getByRole("button", { name: c.mt, exact: true }).click(); await page.waitForTimeout(1200);
  if (fam === "gbc") {
    const p = await pix(page, 32, undefined);
    await page.mouse.click(p.ovBox[0] + p.body[0] + 5 * 32 + 16, p.ovBox[1] + p.body[1] + 4 * 32 + 16);
  } else {
    const r = await page.evaluate(() => { const b = document.querySelector(".world-canvas__context canvas").getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; });
    await page.mouse.move(r[0] + r[2] * 0.72, r[1] + r[3] * 0.37); await page.waitForTimeout(200);
    await page.mouse.down(); await page.waitForTimeout(100); await page.mouse.up();
  }
  await page.waitForTimeout(1200);
  const dirty = await page.locator('[data-testid="dirty-indicator"]').count();
  const u1 = await unload();
  await page.getByRole("button", { name: "Undo", exact: true }).click(); await page.waitForTimeout(1000);
  const u2 = await unload();
  await page.getByRole("button", { name: new RegExp("Done editing " + c.A) }).click(); await page.waitForTimeout(1000);
  const after = { ctx: await page.locator(".world-canvas__context").count(), dlg: await page.locator('[role="dialog"]').count() };
  await page.getByRole("button", { name: "Map", exact: true }).click(); await page.waitForTimeout(1500);
  const backToMap = await page.locator(".map-canvas canvas").count();
  return { fam, current, mapMode, dungeon, world, inCtx, unload: { clean: u0, dirty: u1, afterUndo: u2 }, dirtyDot: dirty, after, backToMap, posts: reqs };
};
