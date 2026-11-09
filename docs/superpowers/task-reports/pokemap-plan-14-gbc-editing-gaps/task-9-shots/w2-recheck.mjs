// node w2.mjs <gba|gbc> <ui> <map> — W1/W2 re-check with REAL pointer input: two New-flag item-ball adds unsaved, idle request count, (GBA) Warp dialog with a destination.
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/Serve/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/');
const { chromium } = require('playwright-core');
const [family, ui, map] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: 'C:/Users/Serve/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
page.setDefaultTimeout(20000);
const reqs = []; const errors = []; const res = { family, map, checks: [] };
page.on('request', r => { if (r.url().includes('/api/event-options')) reqs.push({ t: Date.now(), url: r.url().replace(/^.*\/api/, '/api') }); });
page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
page.on('dialog', d => d.accept());
const chk = (name, ok, detail) => { res.checks.push({ name, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', name, detail ? JSON.stringify(detail) : ''); };
const bar = () => page.getByRole('group', { name: 'Add events' });
const dialog = () => page.locator('[role="dialog"].add-event-dialog');
const canvas = () => page.locator('canvas.gbc-map-canvas__stage, canvas.map-canvas__stage').first();
let cell = 0;
async function open(kind) {
  await bar().locator(`button[aria-label^="Add ${kind}"]`).click();            // real pointer
  const b = await canvas().boundingBox(); const n = cell++;
  await page.mouse.click(b.x + b.width * (0.3 + n * 0.1), b.y + b.height * 0.6); // real pointer
  await dialog().waitFor();
  await dialog().getByText('Loading event options...', { exact: true }).waitFor({ state: 'hidden', timeout: 45000 });
}
async function addItemball() {
  await open('Object'); await dialog().getByLabel('Object type').selectOption('itemball');
  for (const el of await dialog().locator('textarea').all()) if (!(await el.inputValue())) await el.fill('W2 RECHECK');
  const resp = page.waitForResponse(r => r.url().includes('/event/create'), { timeout: 45000 });
  await dialog().getByRole('button', { name: 'Add', exact: true }).click();     // real pointer
  const r = await resp; const form = JSON.parse(r.request().postData());
  try { await dialog().waitFor({ state: 'hidden', timeout: 15000 }); }
  catch (e) { await page.screenshot({ path: `w2-${family}-fail.png` }); throw Error(`status ${r.status()} body ${(await r.text()).slice(0, 300)} dialog: ${(await dialog().innerText()).slice(0, 400)}`); }
  return { status: r.status(), flag: form.flag };
}
const idle = async ms => { const n0 = reqs.length; await page.waitForTimeout(ms); return reqs.length - n0; };
try {
  await page.goto(ui);
  await page.locator('.map-tree, .app__sidebar').getByText(map, { exact: true }).first().click();
  await bar().waitFor(); await canvas().waitFor();
  for (const i of [1, 2]) {
    const a = await addItemball();
    chk(`add #${i} item ball with New flag via real clicks`, a.status === 200 && a.flag?.mode === 'new', a);
    const n = await idle(6000);
    chk(`no event-options reload loop after add #${i} (6 s idle)`, n <= 2, { requests: n });
  }
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Undo' }).first().click({ timeout: 10000 });
  chk('real click on Undo responds while New flag staged', true, { ms: Date.now() - t0 });
  if (family === 'gba') {
    await open('Warp');
    const s = dialog().getByLabel('Destination map', { exact: true });
    const v = await s.locator('option').evaluateAll(os => os.map(o => o.value).filter(Boolean));
    const dest = v.find(x => x !== map) ?? v[0]; await s.selectOption(dest);
    const n = await idle(8000); const destN = reqs.filter(r => r.url.includes('dest=')).length;
    const addEnabled = await dialog().getByRole('button', { name: 'Add', exact: true }).isEnabled();
    chk('Warp dialog with destination: no request loop, Add enabled', n <= 3 && addEnabled, { dest, requestsIn8s: n, destRequestsTotal: destN, addEnabled });
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'Discard Changes' }).click({ timeout: 10000 });
  await page.locator('[data-testid="dirty-indicator"]').waitFor({ state: 'hidden' });
  chk('Discard via real click clears staged changes', true);
} catch (e) { chk('run completed', false, String(e).slice(0, 300)); }
res.pageErrors = errors; res.totalOptionRequests = reqs.length;
chk('no page errors', errors.length === 0, errors.slice(0, 3));
console.log(JSON.stringify({ family, total: reqs.length, fails: res.checks.filter(c => !c.ok).length }));
await browser.close();
