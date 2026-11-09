// node accept.mjs <gba|gbc> <cloneRoot> <map> [scenario...] [--coord-map=MAP] [--no-slot]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const require = createRequire('C:/Users/Serve/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/');
const { chromium } = require('playwright-core');
const [family, root, map, ...args] = process.argv.slice(2);
const names = ['bar', 'kinds-defaults', 'script-modes', 'undo-redo', 'discard', 'refusals'];
const selected = args.filter(x => !x.startsWith('--'));
const coordMap = args.find(x => x.startsWith('--coord-map='))?.slice(12);
const noSlot = args.includes('--no-slot');
if (!['gba', 'gbc'].includes(family) || !root || !map || selected.some(x => !names.includes(x))) throw Error('Invalid arguments');
const shots = fileURLToPath(new URL('./shots/', import.meta.url)); mkdirSync(shots, { recursive: true });
const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const initialStatus = git('status', '--porcelain');
const out = { family, map, initialStatus, scenarios: [], network: [], pageErrors: [], resets: [] };
const browser = await chromium.launch({ executablePath: 'C:/Users/Serve/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
page.setDefaultTimeout(20000); page.setDefaultNavigationTimeout(20000);
page.on('pageerror', e => out.pageErrors.push(String(e)));
page.on('dialog', d => d.accept());
page.on('response', async r => {
  if (!/event\/create|event-options|\/commit(?:\?|$)|\/discard|\/undo|\/redo/.test(r.url())) return;
  let body; try { body = await r.json(); } catch { body = null; }
  out.network.push({ scenario: current, method: r.request().method(), url: r.url().replace(/^.*\/api/, '/api'), status: r.status(), code: body?.code ?? body?.error?.code ?? body?.refusals?.map(x => x.code) ?? null, body });
});
let current = '', cell = 0;
const check = (ok, message) => { if (!ok) throw Error(message); };
const bar = () => page.getByRole('group', { name: 'Add events' });
const button = name => bar().locator(`button[aria-label^="Add ${name}"]`);
const dialog = () => page.locator('[role="dialog"].add-event-dialog');
const dirty = () => page.locator('[data-testid="dirty-indicator"]');
const canvas = () => page.locator('canvas.gbc-map-canvas__stage, canvas.map-canvas__stage').first();
async function selectMap(name) { await page.locator('.map-tree, .app__sidebar').getByText(name, { exact: true }).first().click(); await bar().waitFor(); await canvas().waitFor(); }
async function load(name = map) { await page.goto('http://127.0.0.1:5183/'); await selectMap(name); }
async function open(kind) {
  await button(kind).click();
  const b = await canvas().boundingBox(); check(b, 'Canvas has no bounding box');
  const n = cell++; await page.mouse.click(b.x + b.width * (0.25 + (n % 5) * 0.1), b.y + b.height * (0.25 + (Math.floor(n / 5) % 5) * 0.1));
  await dialog().waitFor();
  await dialog().getByText('Loading event options...', { exact: true }).waitFor({ state: 'hidden', timeout: 45000 });
  await dialog().getByRole('button', { name: 'Add', exact: true }).waitFor({ timeout: 45000 });
}
async function fillRequired() {
  for (const el of await dialog().locator('textarea').all()) if (!(await el.inputValue())) await el.fill('POKEMAP ACCEPTANCE TEXT');
  const elevation = dialog().getByLabel('Elevation', { exact: true }); if (await elevation.count() && !(await elevation.inputValue())) await elevation.fill('0');
}
async function add() {
  await fillRequired(); const addButton = dialog().getByRole('button', { name: 'Add', exact: true });
  await addButton.waitFor({ state: 'visible' }); await page.waitForFunction(() => !document.querySelector('.add-event-dialog button[type=submit]')?.disabled, null, { timeout: 20000 });
  const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/event/create'), { timeout: 45000 });
  await addButton.click(); const res = await response; check(res.ok(), `Create failed ${res.status()}: ${await res.text()}`);
  const form = JSON.parse(res.request().postData()); await dialog().waitFor({ state: 'hidden', timeout: 45000 }); await dirty().waitFor(); return form;
}
async function discard() { await page.getByRole('button', { name: 'Discard Changes' }).click(); await dirty().waitFor({ state: 'hidden' }); }
async function save() {
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  const d = page.getByRole('dialog', { name: 'Save changes' }); await d.waitFor();
  const b = d.getByRole('button', { name: 'Save Changes', exact: true });
  await page.waitForFunction(() => { const d = document.querySelector('[aria-label="Save changes"][role="dialog"]'); return [...(d?.querySelectorAll('button') ?? [])].some(b => b.textContent.trim() === 'Save Changes' && !b.disabled); }, null, { timeout: 20000 });
  await b.click(); await d.waitFor({ state: 'hidden' }); await dirty().waitFor({ state: 'hidden' });
}
async function reset() {
  // Only undo tracked files written by this driver; never remove untracked files.
  check(!initialStatus, 'Refusing reset: clone was not clean at startup');
  const changed = git('diff', '--name-only').trim().split(/\r?\n/).filter(Boolean);
  if (changed.length) git('checkout', '--', ...changed);
  out.resets.push({ action: 'git checkout tracked changed paths; page reload', paths: changed });
  await load();
}
async function firstOption(label) {
  const s = dialog().getByLabel(label, { exact: true });
  const value = await s.locator('option').evaluateAll(os => os.find(o => o.value)?.value || '');
  check(value, `No option for ${label}`); await s.selectOption(value); return value;
}
async function defaults(kind, type, bg) {
  await open(kind); if (type) await dialog().getByLabel('Object type').selectOption(type);
  if (bg) await dialog().getByLabel('BG type').selectOption(bg);
  return add();
}
async function runBar(r) {
  const buttons = bar().locator('button'); check(await buttons.count() === 4, 'Expected four buttons');
  r.buttons = await buttons.evaluateAll(bs => bs.map(b => ({ label: b.getAttribute('aria-label'), title: b.title, disabled: b.disabled })));
  check(r.buttons.every(b => b.title), 'Missing tooltip');
  if (family === 'gbc' && await button('Coord').isDisabled()) check(/no scenes/i.test(await button('Coord').getAttribute('title')), 'Missing no-scenes reason');
  await button('Object').click(); check(await button('Object').getAttribute('aria-pressed') === 'true', 'Placement did not start');
  await page.keyboard.press('Escape'); check(await button('Object').getAttribute('aria-pressed') === 'false', 'Escape did not cancel');
  await button('Object').click(); await button('Object').click(); check(await button('Object').getAttribute('aria-pressed') === 'false', 'Re-click did not cancel');
  await button('Object').click(); const tools = page.getByRole('group', { name: 'Tools' }).locator('button:not([disabled]):not([aria-pressed="true"])'); check(await tools.count(), 'No alternate tool'); await tools.first().click();
  check(await button('Object').getAttribute('aria-pressed') === 'false', 'Tool change did not cancel');
  await button('Object').click();
  const other = page.locator('.map-tree__map:not([aria-current="true"])').first();
  check(await other.count(), 'No alternate map in tree'); const otherName = (await other.innerText()).trim();
  await other.click(); await page.locator('.map-tree__map[aria-current="true"]').filter({ hasText: otherName }).waitFor();
  check(await button('Object').getAttribute('aria-pressed') === 'false', 'Map switch did not cancel');
  await selectMap(map); check(await button('Object').getAttribute('aria-pressed') === 'false', 'Placement returned on switching back');
}
async function runKinds(r) {
  const forms = [];
  for (const type of ['npc', 'itemball', 'trainer']) forms.push(await defaults('Object', type));
  forms.push(await defaults('Warp'));
  if (await button('Coord').isEnabled()) forms.push(await defaults('Coord')); else r.coord = 'n/a: no scenes on selected map';
  for (const bg of family === 'gba' ? ['sign', 'hidden_item'] : ['BGEVENT_READ', 'BGEVENT_ITEM', 'BGEVENT_IFSET']) forms.push(await defaults('BG', null, bg));
  await save(); const diff = git('diff', '--no-ext-diff'); writeFileSync(`${shots}${family}-kinds.diff`, diff);
  r.paths = git('diff', '--name-only').trim().split(/\r?\n/).filter(Boolean);
  const patterns = family === 'gba' ? [/MSGBOX_NPC/, /MSGBOX_SIGN/, /finditem/i, /hidden_item/i, /trainerbattle_single/i, /#define\s+FLAG_/] : [/jumptextfaceplayer/i, /jumptext\s/i, /itemball/i, /hiddenitem/i, /conditional_event/i, /OBJECTTYPE_TRAINER/i, /const\s+EVENT_/];
  for (const p of patterns) check(p.test(diff), `Diff missing ${p}`);
  const allowed = family === 'gba' ? [`data/maps/${map}/map.json`, `data/maps/${map}/scripts.inc`, 'include/constants/flags.h', 'include/constants/vars.h'] : [`maps/${map}.asm`, 'constants/event_flags.asm'];
  check(r.paths.every(p => allowed.includes(p)), `Unexpected paths: ${r.paths.filter(p => !allowed.includes(p)).join(', ')}`);
  const added = diff.split(/\r?\n/).filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line => line.slice(1)).join('\n');
  for (const f of forms) {
    const flag = f.flag?.mode === 'new' ? f.flag.name : null;
    if (flag) {
      const line = family === 'gba' ? new RegExp(`^\\s*#define\\s+${flag}\\b`, 'gm') : new RegExp(`^\\s*const\\s+${flag}\\b`, 'gm');
      check([...added.matchAll(line)].length === 1, `Expected one constants line for ${flag}`);
    }
    const label = f.script?.mode === 'new' ? f.script.label : f.fields?.label;
    if (label) check(added.includes(label), `Missing added label ${label}`);
  }
  const expectedFlags = forms.filter(f => f.flag?.mode === 'new').length;
  const flagLines = family === 'gba' ? [...added.matchAll(/^\s*#define\s+FLAG_\w+/gm)].length : [...added.matchAll(/^\s*const\s+EVENT_\w+/gm)].length;
  check(flagLines === expectedFlags, `Expected ${expectedFlags} new flag lines, got ${flagLines}`);
  r.unchecked = ['per-item exact event fields and script blocks', ...(coordMap && family === 'gbc' && r.coord ? ['coord-map separate save'] : [])];
}
async function runScripts(r) {
  r.modes = []; const made = []; const source = scriptFile();
  const nonEntry = [...source.text.matchAll(/^([A-Za-z_]\w*)::?\s*\r?\n\s*(?:\.string|text\b|line\b|step\b|walk_|face_)/gm)].map(m => m[1]);
  for (const kind of ['Object', 'BG']) for (const mode of ['existing', 'copy', 'new']) {
    await open(kind); await dialog().getByLabel('Script source').selectOption(mode);
    if (mode === 'existing') {
      const choices = await dialog().getByLabel('Script', { exact: true }).locator('option').evaluateAll(os => os.map(o => o.value));
      check(nonEntry.length, `No recognizable text or movement label in ${source.path}`);
      check(nonEntry.every(n => !choices.includes(n)), `Non-entry label offered: ${nonEntry.filter(n => choices.includes(n)).join(', ')}`);
      r.modes.push({ kind, mode, choice: await firstOption('Script'), excluded: nonEntry });
    }
    if (mode === 'copy') {
      const from = await firstOption('Script copy from');
      await dialog().getByText('Loading script...', { exact: true }).waitFor({ state: 'hidden' });
      const alert = await dialog().getByRole('alert').allTextContents(); r.modes.push({ kind, mode, from, refusal: alert.join(' ') });
      if (alert.length) { await page.keyboard.press('Escape'); continue; }
    }
    made.push(await add());
  }
  await save(); const diff = git('diff', '--no-ext-diff'); writeFileSync(`${shots}${family}-scripts.diff`, diff); check(diff.length > 0, 'Empty scripts diff');
  r.paths = git('diff', '--name-only').trim().split(/\r?\n/).filter(Boolean);
  const added = diff.split(/\r?\n/).filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line => line.slice(1)).join('\n');
  for (const f of made.filter(f => f.script?.mode === 'new')) {
    const label = f.script.label;
    check(added.includes(label + ':'), `Missing new script ${label}`);
    const opcode = family === 'gba' ? (f.kind === 'object' ? 'MSGBOX_NPC' : 'MSGBOX_SIGN') : (f.kind === 'object' ? 'jumptextfaceplayer' : 'jumptext');
    check(added.includes(opcode), `Missing generated ${opcode}`);
  }
  r.unchecked = ['copy label and text reference renames', 'exact new generated bodies and custom text'];
}
async function history(action) {
  const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/' + action), { timeout: 45000 });
  await page.getByRole('button', { name: action === 'undo' ? 'Undo' : 'Redo', exact: true }).click();
  const r = await response; check(r.ok(), `${action} failed: ${r.status()}`); return r.json();
}
function countEvents(body) {
  const events = body.events ?? body.session?.events;
  check(events && typeof events === 'object', 'History response lacks events');
  return Object.values(events).filter(Array.isArray).reduce((n, a) => n + a.length, 0);
}
async function runUndo(r) {
  await defaults('BG'); const undo = await history('undo'); await dirty().waitFor({ state: 'hidden' });
  const redo = await history('redo'); await dirty().waitFor();
  const undoAgain = await history('undo'); await dirty().waitFor({ state: 'hidden' });
  r.eventCounts = [undo, redo, undoAgain].map(countEvents);
  check(r.eventCounts[1] === r.eventCounts[0] + 1 && r.eventCounts[2] === r.eventCounts[0], 'History event counts do not show removal and restoration');
}
async function runDiscard() { await defaults('Object', 'npc'); await defaults('Object', 'itemball'); await discard(); check(git('status', '--porcelain') === initialStatus, 'Discard changed clone status'); }
function scriptFile() {
  const path = family === 'gba' ? `data/maps/${map}/scripts.inc` : `maps/${map}.asm`;
  check(existsSync(join(root, path)), `Missing map script file ${path}`);
  return { path, text: readFileSync(join(root, path), 'utf8') };
}
async function refusalSubmit() {
  const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/event/create'), { timeout: 45000 });
  await dialog().getByRole('button', { name: 'Add', exact: true }).click();
  const res = await response; const body = await res.json();
  check(!res.ok(), 'Expected create refusal'); await dialog().getByRole('alert').waitFor();
  return { status: res.status(), body, text: await dialog().getByRole('alert').innerText() };
}
async function runRefusals(r) {
  await open('Object'); const label = dialog().getByLabel('Script label'); await label.fill('1invalid'); await fillRequired();
  check(await dialog().getByRole('button', { name: 'Add', exact: true }).isDisabled() || await dialog().getByRole('alert').count(), 'Invalid identifier accepted');
  check(await label.inputValue() === '1invalid', 'Invalid form not retained'); await page.keyboard.press('Escape');
  const source = scriptFile(); const existing = source.text.match(/^([A-Za-z_]\w*)::?\s*(?:[;@].*)?$/m)?.[1];
  check(existing, `No existing label in ${source.path}`);
  await open('Object'); await dialog().getByLabel('Script label').fill(existing); await fillRequired();
  r.duplicate = await refusalSubmit();
  check((r.duplicate.text + JSON.stringify(r.duplicate.body)).includes(map), 'Duplicate refusal does not name map');
  check((r.duplicate.text + JSON.stringify(r.duplicate.body)).includes(source.path), 'Duplicate refusal does not name file');
  check(await dialog().getByLabel('Script label').inputValue() === existing, 'Duplicate form not retained'); await page.keyboard.press('Escape');
  if (!noSlot) r.noSlot = 'n/a: --no-slot was not passed';
  else {
    await open('Object'); await dialog().getByLabel('Object type').selectOption('itemball'); await fillRequired();
    const flag = dialog().getByLabel('Flag name'); const name = await flag.inputValue(); check(name, 'New flag name missing');
    r.noSlot = await refusalSubmit(); const description = r.noSlot.text + JSON.stringify(r.noSlot.body);
    check(/NO_FLAG_SLOT|no free (?:event )?flag|no free FLAG_UNUSED/i.test(description), 'Missing no-slot refusal');
    check(await flag.inputValue() === name, 'No-slot form not retained'); await page.keyboard.press('Escape');
  }
}
const handlers = { bar: runBar, 'kinds-defaults': runKinds, 'script-modes': runScripts, 'undo-redo': runUndo, discard: runDiscard, refusals: runRefusals };
try {
  await load();
  for (const name of (selected.length ? selected : names)) {
    current = name; const result = { name, status: 'pass' }; out.scenarios.push(result);
    try {
      await handlers[name](result);
      if (result.unchecked?.length || result.coord?.startsWith('not run')) result.status = 'incomplete';
    } catch (e) { result.status = 'fail'; result.error = String(e); result.dialogText = await page.locator('[role=dialog]:visible').allInnerTexts().catch(() => []); result.visibleButtons = await page.locator('button:visible').allTextContents().catch(() => []); await page.screenshot({ path: `${shots}${family}-${name}-failure.png` }).catch(() => {}); }
    if (await dialog().count()) await page.keyboard.press('Escape').catch(() => {});
    if (await dirty().count()) await discard().catch(e => { result.cleanupError = String(e); });
    if (name === 'kinds-defaults' || name === 'script-modes' || name === 'discard') {
      try { await reset(); } catch (e) { result.status = 'fail'; result.cleanupError = String(e); break; }
    }
  }
} catch (e) { out.fatal = String(e); out.dialogText = await page.locator('[role=dialog]:visible').allInnerTexts().catch(() => []); out.visibleButtons = await page.locator('button:visible').allTextContents().catch(() => []); await page.screenshot({ path: `${shots}${family}-fatal.png` }).catch(() => {}); }
finally { await browser.close(); writeFileSync(`${shots}${family}-accept.json`, JSON.stringify(out, null, 2)); }
console.table(out.scenarios.map(({ name, status, error }) => ({ scenario: name, status, error: error ?? '' })));
if (out.fatal || out.scenarios.some(x => x.status !== 'pass')) process.exitCode = 1;
