// usage: node accept.mjs <gba|gbc> <anchorMap> <dungeonName> [markerIdx] [dungeonMarkerIdx]
// Plan 13 Task 6 live acceptance, one family, against a SCRATCH subject clone (commits are intended here).
// World writes (placement/dungeon toggles) stay blocked.
import { open } from "./lib.mjs";
const [fam, anchor, dungeon, mi = "0", dmi = "0"] = process.argv.slice(2);
const { browser, page, wait, shot, errs } = await open();
const out = { fam, posts: [], blocked: [], net: [] };
await page.route((u) => /^\/api\/world\/(placement|dungeons)/.test(u.pathname), async (route) => {
  if (route.request().method() !== "POST") return route.continue();
  out.blocked.push(new URL(route.request().url()).pathname);
  await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"blocked by live check"}' });
});
page.on("request", (r) => { if (r.method() === "POST") out.posts.push(new URL(r.url()).pathname); });
page.on("response", (r) => {
  const u = new URL(r.url());
  if (/^\/api\/(render|warps|world)/.test(u.pathname) || /commit$/.test(u.pathname)) out.net.push(`${r.request().method()} ${u.pathname}${u.search} ${r.status()}`);
});
const step = async (name, fn) => {
  try { out[name] = await fn(); } catch (e) { out[name] = { error: String(e?.message ?? e).slice(0, 300) }; await shot(`${fam}-err-${name}`).catch(() => {}); }
};
const popup = page.locator("[data-warp-popup]");
const prompt = page.getByRole("dialog", { name: "Unsaved changes" });
const saveDlg = page.getByRole("dialog", { name: "Save changes" });
const selected = () => page.locator('.map-tree__map[aria-current="true"]').first().innerText({ timeout: 1000 }).catch(() => null);
const popupName = () => popup.getAttribute("aria-label", { timeout: 1000 }).catch(() => null);
const btn = (scope, name) => scope.getByRole("button", { name, exact: true });
const enabled = (scope, name) => btn(scope, name).first().isEnabled({ timeout: 1000 }).catch(() => null);
const alerts = async () => (await page.getByRole("alert").allInnerTexts()).map((s) => s.replace(/\s+/g, " ").trim());
const mode = async (m) => { await page.getByRole("group", { name: "View" }).getByRole("button", { name: m, exact: true }).click(); await wait(2500); };
const markers = () => page.locator(".world-canvas__warp-marker").evaluateAll((els) => els.map((e) => {
  const b = e.getBoundingClientRect(); return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)];
}));
const inView = (m) => m.filter(([x, y]) => x > 300 && x < 1140 && y > 120 && y < 860);
const openAt = async ([x, y]) => { await page.mouse.dblclick(x, y); await popup.waitFor({ timeout: 15000 }); await wait(2500); return popupName(); };
const paint = async (dx = 0) => {
  // Cycles palette cells and spots until a stroke changes the map (Undo enables): a scratch tile may already hold the pick.
  const pal = await popup.locator(".metatile-palette__grid, .gbc-metatile-palette__grid").first().boundingBox({ timeout: 3000 }).catch(() => null);
  await btn(popup, "Pencil").click({ timeout: 3000 }).catch(() => {});
  const boxes = await popup.locator("canvas").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
  const [x, y, w, h] = boxes.sort((a, b) => b[2] * b[3] - a[2] * a[3])[0];
  const n = out.posts.length; let at = null;
  for (const [px, py] of [[40, 24], [230, 40], [120, 80], [200, 120], [60, 140]]) {
    if (pal) { await page.mouse.click(pal.x + px, pal.y + py); await wait(300); }
    for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.5], [0.5, 0.3], [0.5, 0.7]]) {
      await page.mouse.click(x + w * fx + dx, y + h * fy); await wait(900);
      if (await enabled(popup, "Undo")) { at = [px, py, fx, fy]; break; }
    }
    if (at) break;
  }
  return { canvas: [Math.round(w), Math.round(h)], at, posts: out.posts.slice(n), undo: await enabled(popup, "Undo") };
};
const netSince = (n) => out.net.slice(n);
const jump = async (name) => {
  const row = page.locator(".map-tree__map").filter({ hasText: new RegExp(`^${name}$`) }).first();
  await row.scrollIntoViewIfNeeded(); await row.click(); await wait(1500);
};

await page.goto("http://127.0.0.1:5183/"); await wait(3000);
await mode("World");
await jump(anchor);
await page.getByRole("switch", { name: "Warps" }).click(); await wait(2000);
const wm = inView(await markers()); out.worldMarkers = wm.length; const M = wm[Number(mi)];

await step("w1_open", async () => {
  const before = await selected(); const name = await openAt(M); await shot(`${fam}-w1-popup`);
  const tools = await popup.getByRole("group", { name: "Tools" }).getByRole("button")
    .evaluateAll((b) => b.map((x) => `${x.getAttribute("aria-label")}${x.getAttribute("aria-pressed") === "true" ? "*" : ""}`)).catch(() => null);
  return { source: before, popup: name, selectedNow: await selected(), tools };
});
await step("w2_paintUndoRedo", async () => {
  const p = await paint(); await shot(`${fam}-w2-painted`);
  const state = async () => ({ undo: await enabled(popup, "Undo"), redo: await enabled(popup, "Redo"), save: await enabled(popup, "Save Changes") });
  await btn(popup, "Undo").click(); await wait(800); const afterUndo = await state();
  await btn(popup, "Redo").click(); await wait(800); const afterRedo = await state();
  return { paint: p, afterUndo, afterRedo };
});
await step("w3_dirtyCloseCancel", async () => {
  await btn(popup, "Close").click(); await prompt.waitFor({ timeout: 5000 }); await shot(`${fam}-w3-prompt`);
  await btn(prompt, "Cancel").click(); await wait(800);
  return { promptGone: !(await prompt.isVisible()), popupOpen: await popup.isVisible(), popup: await popupName(), undo: await enabled(popup, "Undo"), selected: await selected() };
});
await step("w4_dirtyCloseDiscard", async () => {
  await btn(popup, "Close").click(); await prompt.waitFor({ timeout: 5000 });
  await btn(prompt, "Discard").click(); await wait(2000);
  return { popupOpen: await popup.isVisible(), selected: await selected(), backToSource: (await selected()) === anchor };
});
await step("w5_escapeInSaveDialog", async () => {
  const name = await openAt(M); await paint(16);
  await btn(popup, "Close").click(); await prompt.waitFor({ timeout: 5000 });
  await btn(prompt, "Save").click(); await saveDlg.waitFor({ timeout: 10000 }); await wait(1500); await shot(`${fam}-w5-savedialog`);
  await page.keyboard.press("Escape"); await wait(800);
  return { popup: name, saveDialogGone: !(await saveDlg.isVisible()), promptVisible: await prompt.isVisible(), popupOpen: await popup.isVisible(), undo: await enabled(popup, "Undo"), selected: await selected() };
});
await step("w6_dirtyCloseSave", async () => {
  if (await prompt.isVisible()) await btn(prompt, "Cancel").click();
  const n = out.net.length, dest = (await popupName())?.replace(/ \(warp destination\)$/, "");
  await btn(popup, "Close").click(); await prompt.waitFor({ timeout: 5000 });
  await btn(prompt, "Save").click(); await saveDlg.waitFor({ timeout: 10000 }); await wait(2500);
  await btn(saveDlg, "Save Changes").click(); await wait(6000); await shot(`${fam}-w6-after-save`);
  return { dest, popupOpen: await popup.isVisible(), selected: await selected(), backToSource: (await selected()) === anchor, alerts: await alerts(), net: netSince(n) };
});

await step("w7_worldTileRefresh", async () => {
  const dest = out.w6_dirtyCloseSave?.dest; const n = out.net.length;
  await jump(dest); await wait(2500); await shot(`${fam}-w7-saved-tile`);
  return { dest, tileRequests: netSince(n).filter((x) => x.includes(`/render/${dest}.png`)) };
});
await step("d1_dungeon", async () => {
  out.preDungeonSelected = await selected();
  await mode("Dungeon");
  const n = out.net.length;
  await page.getByRole("navigation", { name: "Dungeons" }).getByRole("button").filter({ hasText: dungeon }).first().click(); await wait(4000);
  await page.getByRole("switch", { name: "Connection lines" }).click(); await wait(3000);
  const scoped = await page.evaluate(async () => {
    const j = await fetch("/api/world?scope=dungeon").then((r) => r.json());
    return Array.isArray(j.placements) ? j.placements.length : Object.keys(j.placements ?? {}).length;
  });
  await shot(`${fam}-d1-dungeon-lines`);
  return {
    autoLayoutSwitch: await page.getByRole("switch", { name: /auto-layout/i }).count(),
    lines: await page.locator(".world-canvas__connections line").count(), scopedPlacements: scoped,
    status: await page.locator(".world-canvas__status").innerText().catch(() => null), net: netSince(n).filter((s) => /world/.test(s)),
  };
});
await step("d2_popupSave", async () => {
  await page.getByRole("switch", { name: "Warps" }).click(); await wait(2500);
  if (process.env.ZOOMAT) {
    // Dungeon fit can open below the marker zoom; wheel in on the anchored member (x,y in page pixels).
    const [zx, zy] = process.env.ZOOMAT.split(",").map(Number); await page.mouse.move(zx, zy);
    for (let i = 0; i < Number(process.env.ZOOMTICKS ?? 12); i++) { await page.mouse.wheel(0, -200); await wait(150); }
    await wait(2500); await shot(`${fam}-d1b-zoomed`);
  }
  const dm = inView(await markers()); const linesBefore = await page.locator(".world-canvas__connections line").count();
  const source = await selected(); const name = await openAt(dm[Number(dmi)]); await shot(`${fam}-d2-popup`);
  const p = await paint(); const n = out.net.length;
  await btn(popup, "Save Changes").click(); await saveDlg.waitFor({ timeout: 10000 }); await wait(2500);
  await btn(saveDlg, "Save Changes").click(); await wait(6000);
  const afterSave = { popupOpen: await popup.isVisible(), undo: await enabled(popup, "Undo") };
  await btn(popup, "Close").click(); await wait(3000); await shot(`${fam}-d2-after-close`);
  const dest = name?.replace(/ \(warp destination\)$/, "");
  await page.getByRole("navigation", { name: "Dungeons" }).getByText(dest, { exact: true }).first().click(); await wait(3500);
  await btn(page, "Fit").first().click(); await wait(3500); await shot(`${fam}-d3-saved-member`);
  const unused = name?.replace(/ \(warp destination\)$/, "");
  const fitTile = netSince(n).filter((x) => x.includes(`/render/${dest}.png`) && !x.includes("border=1"));
  const fitLines = await page.locator(".world-canvas__connections line").count();
  await mode("Map"); const mapViewSelected = await selected();
  return { fitTile, fitLines, mapViewSelected,
    markers: dm.length, source, popup: name, paint: p, afterSave, popupOpenAfterClose: await popup.isVisible(), selected: await selected(),
    backToSource: (await selected()) === source, linesBefore, linesAfter: await page.locator(".world-canvas__connections line").count(), net: netSince(n),
  };
});

await step("f1_warpFailures", async () => {
  await page.goto("http://127.0.0.1:5183/"); await wait(3000);
  let failing = true;
  await page.route((u) => u.pathname.startsWith("/api/warps/"), (r) => failing
    ? r.fulfill({ status: 500, contentType: "application/json", body: '{"error":"forced failure"}' }) : r.continue());
  await mode("World"); await jump(anchor);
  const sw = page.getByRole("switch", { name: "Warps" });
  if ((await sw.getAttribute("aria-checked")) !== "true") await sw.click();
  await wait(2500);
  const during = await alerts(); await shot(`${fam}-f1-failing`);
  failing = false;
  await page.locator(".world-canvas__viewport canvas").first().focus(); await page.keyboard.press("-"); await wait(3000);
  const after = await alerts(); await shot(`${fam}-f2-recovered`);
  return { during, after, markersAfter: await page.locator(".world-canvas__warp-marker").count() };
});
out.errs = errs; console.log(JSON.stringify(out, null, 1)); await browser.close();
