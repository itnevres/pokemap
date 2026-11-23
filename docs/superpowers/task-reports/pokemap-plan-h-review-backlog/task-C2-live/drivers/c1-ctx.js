async (page) => {
  const MAP = 'NewBarkTown';
  const MODE = 'mapThenDiscard'; // overwritten by sed: ctxDiscard | mapThenDiscard
  const log = [];
  const h = r => { const u = r.url(); if (/\/api\/edit\//.test(u)) log.push(`${r.method()} ${u.replace(/^.*\/api\/edit\//, '')}`); };
  page.on('request', h);
  const session = () => page.evaluate(async (m) => (await fetch(`/api/edit/${m}/session`)).json(), MAP);
  const count = (re) => log.filter(l => re.test(l)).length;
  await page.evaluate(() => { window.confirm = () => true; });
  const stroke = async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 40, y, { steps: 4 }); await page.mouse.up(); };
  const discard = page.getByRole('button', { name: 'Discard Changes' });
  const out = { mode: MODE };
  out.pencilPressed = await page.getByRole('button', { name: 'Pencil' }).getAttribute('aria-pressed');
  await stroke(400, 600); await page.waitForTimeout(800);
  out.dirtyBefore = await discard.isEnabled();
  let release; const held = new Promise(r => release = r);
  await page.route('**/paint/apply', async route => { log.push('HELD apply'); await held; await route.continue(); });
  log.push('--- held stroke');
  await stroke(400, 650); await page.waitForTimeout(400);
  if (MODE === 'mapThenDiscard') {
    log.push('--- click Map mode');
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await page.waitForTimeout(800);
  }
  log.push('--- click Discard');
  await discard.click({ timeout: 5000 });
  await page.waitForTimeout(1500);
  out.discardSentWhileHeld = count(/POST .*\/discard/);
  log.push('--- release');
  release(); await page.waitForTimeout(3000);
  await page.unroute('**/paint/apply');
  out.discardSentAfter = count(/POST .*\/discard/);
  const sess = await session();
  out.hubIsDirty = sess.isDirty; out.hubBlocks = sess.blocks.length;
  out.log = log;
  page.off('request', h);
  return out;
}
