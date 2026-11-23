async (page) => {
  const MAP = 'NewBarkTown';
  const log = [];
  page.on('request', r => { const u = r.url(); if (/\/api\/edit\//.test(u)) log.push(`${r.method()} ${u.replace(/^.*\/api\/edit\//, '')}`); });
  const session = () => page.evaluate(async (m) => (await fetch(`/api/edit/${m}/session`)).json(), MAP);
  await page.evaluate(() => { window.__confirms = 0; window.confirm = () => { window.__confirms++; return true; }; });
  const pre = await session();
  log.push('pre-existing session isDirty=' + pre.isDirty);
  await page.getByRole('button', { name: MAP, exact: true }).click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Pencil' }).click();
  await page.getByRole('button', { name: 'metatile 0x5', exact: true }).click();
  const stroke = async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 30, y, { steps: 4 }); await page.mouse.up(); };
  const discard = page.getByRole('button', { name: 'Discard Changes' });
  if (!(await discard.isEnabled())) { await stroke(400, 480); await page.waitForTimeout(800); }
  const dirty1 = await discard.isEnabled();
  log.push('dirty before held stroke: ' + dirty1);
  let release; const held = new Promise(r => release = r);
  await page.route('**/paint/apply', async route => { log.push('HELD apply'); await held; await route.continue(); });
  log.push('--- second stroke');
  await stroke(400, 540);
  await page.waitForTimeout(400);
  log.push('--- click discard');
  await discard.click({ timeout: 5000 });
  await page.waitForTimeout(1500);
  const discardsWhileHeld = log.filter(l => /POST .*\/discard/.test(l)).length;
  log.push('--- release');
  release();
  await page.waitForTimeout(2500);
  await page.unroute('**/paint/apply');
  const discardsAfter = log.filter(l => /POST .*\/discard/.test(l)).length;
  const sess = await session();
  const confirms = await page.evaluate(() => window.__confirms);
  return { dirty1, discardsWhileHeld, discardsAfter, confirms, hubIsDirty: sess.isDirty, hubSessionBlocks: sess.blocks.length, log };
}
