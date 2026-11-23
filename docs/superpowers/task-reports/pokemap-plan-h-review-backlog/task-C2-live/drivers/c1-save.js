async (page) => {
  const MAP = 'NewBarkTown';
  const log = [];
  const h = r => { const u = r.url(); if (/\/api\/edit\//.test(u)) log.push(`${r.method()} ${u.replace(/^.*\/api\/edit\//, '')}`); };
  page.on('request', h);
  const count = (re) => log.filter(l => re.test(l)).length;
  await page.evaluate(() => { window.confirm = () => true; });
  await page.getByRole('button', { name: 'Pencil' }).click();
  await page.getByRole('button', { name: 'metatile 0x5', exact: true }).click();
  const stroke = async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 40, y, { steps: 4 }); await page.mouse.up(); };
  await stroke(640, 450); await page.waitForTimeout(800);
  const out = {};
  // --- undo waits
  let release; let held = new Promise(r => release = r);
  await page.route('**/paint/apply', async route => { await held; await route.continue(); });
  await stroke(640, 500); await page.waitForTimeout(400);
  const undoBtn = page.getByRole('button', { name: 'Undo' });
  await undoBtn.click({ timeout: 5000 });
  await page.waitForTimeout(1500);
  out.undoSentWhileHeld = count(/POST .*\/undo/);
  release(); await page.waitForTimeout(2500);
  out.undoSentAfter = count(/POST .*\/undo/);
  await page.unroute('**/paint/apply');
  // --- save plan waits
  log.length = 0;
  held = new Promise(r => release = r);
  await page.route('**/paint/apply', async route => { await held; await route.continue(); });
  await stroke(640, 550); await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Save Changes' }).click({ timeout: 5000 });
  await page.waitForTimeout(1500);
  out.planSentWhileHeld = count(/GET .*\/plan/);
  release(); await page.waitForTimeout(3000);
  await page.unroute('**/paint/apply');
  out.planSentAfter = count(/GET .*\/plan/);
  out.dialogText = (await page.getByRole('dialog').first().innerText().catch(() => 'no dialog')).slice(0, 200);
  out.log = log.slice();
  page.off('request', h);
  return out;
}
