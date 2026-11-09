// node accept.mjs <gba|gbc> <cloneRoot> <map> [scenario...] [--coord-map=MAP] [--no-slot] [--ui=URL]
// Live acceptance driver for Plan 14.1 Add Event (headless Playwright against a hub serving a scratch git clone).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const require = createRequire('C:/Users/Serve/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/');
const { chromium } = require('playwright-core');
let [family, root, map, ...args] = process.argv.slice(2);
const names = ['bar', 'kinds-defaults', 'script-modes', 'undo-redo', 'discard', 'refusals'];
const selected = args.filter(x => !x.startsWith('--'));
const coordMap = args.find(x => x.startsWith('--coord-map='))?.slice(12);
const noSlot = args.includes('--no-slot');
const ui = args.find(x => x.startsWith('--ui='))?.slice(5) ?? 'http://127.0.0.1:5193/';
if (!['gba', 'gbc'].includes(family) || !root || !map || selected.some(x => !names.includes(x))) throw Error('Invalid arguments');
const shots = fileURLToPath(new URL('./shots/', import.meta.url)); mkdirSync(shots, { recursive: true });
const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const initialStatus = git('status', '--porcelain');
const startMap = map;
const out = { family, map, ui, initialStatus, scenarios: [], network: [], pageErrors: [], resets: [] };
const browser = await chromium.launch({ executablePath: 'C:/Users/Serve/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
// React dev builds record every render with performance.measure (structured clone of props incl. 200 KB option lists); clear the buffer so long sessions do not run out of memory.
const clearPerf = () => page.evaluate(() => { performance.clearMeasures(); performance.clearMarks(); }).catch(() => {});
page.setDefaultTimeout(20000); page.setDefaultNavigationTimeout(20000);
page.on('pageerror', e => out.pageErrors.push(String(e)));
page.on('dialog', d => d.accept());
page.on('response', async r => {
  if (!/event\/create|event-options|\/commit(?:\?|$)|\/discard|\/undo|\/redo/.test(r.url())) return;
  let body; try { body = await r.json(); } catch { body = null; }
  out.network.push({ scenario: current, method: r.request().method(), url: r.url().replace(/^.*\/api/, '/api'), status: r.status(), code: body?.code ?? body?.error?.code ?? body?.refusals?.map(x => x.code) ?? null, ...(r.ok() ? {} : { body }) });
});
let current = '', cell = 0, lastCreate = null, lastSaveDialog = '';
const check = (ok, message) => { if (!ok) throw Error(message); };
const bar = () => page.getByRole('group', { name: 'Add events' });
const button = name => bar().locator(`button[aria-label^="Add ${name}"]`);
const dialog = () => page.locator('[role="dialog"].add-event-dialog');
const dirty = () => page.locator('[data-testid="dirty-indicator"]');
const canvas = () => page.locator('canvas.gbc-map-canvas__stage, canvas.map-canvas__stage').first();
async function selectMap(name) { await page.locator('.map-tree, .app__sidebar').getByText(name, { exact: true }).first().click(); await bar().waitFor(); await canvas().waitFor(); }
async function load(name = map) { await page.goto(ui); await selectMap(name); }
// After a New-flag add the GBC page stops handling real pointer input (see report finding W1), so button presses use DOM click().
const log = m => console.error(new Date().toISOString().slice(11, 19), current, m);
async function open(kind) {
  log('open ' + kind);
  await button(kind).evaluate(e => e.click());
  const b = await canvas().boundingBox(); check(b, 'Canvas has no bounding box');
  const n = cell++; const px = b.x + b.width * (0.25 + (n % 5) * 0.1), py = b.y + b.height * (0.25 + (Math.floor(n / 5) % 5) * 0.1);
  // Synthetic click: real pointer input wedges the GBC page after a New-flag add (finding W1).
  await canvas().evaluate((el, [x, y]) => { for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) { const E = t.startsWith('pointer') ? PointerEvent : MouseEvent; el.dispatchEvent(new E(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: t.endsWith('down') ? 1 : 0, pointerId: 1, isPrimary: true })); } }, [px, py]);
  await dialog().waitFor();
  await dialog().getByText('Loading event options...', { exact: true }).waitFor({ state: 'hidden', timeout: 45000 });
  await dialog().getByRole('button', { name: 'Add', exact: true }).waitFor({ timeout: 45000 });
}
async function fillRequired() {
  for (const el of await dialog().locator('textarea').all()) if (!(await el.inputValue())) await el.fill('POKEMAP ACCEPTANCE TEXT');
  const elevation = dialog().getByLabel('Elevation', { exact: true }); if (await elevation.count() && !(await elevation.inputValue())) await elevation.fill('0');
}
async function inspector() {
  const empty = await page.locator('.event-inspector--empty').count() > 0;
  const title = empty ? null : (await page.locator('.event-inspector__title').first().innerText().catch(() => null))?.trim() ?? null;
  const subtitle = empty ? null : (await page.locator('.event-inspector__subtitle').first().innerText().catch(() => null))?.trim() ?? null;
  return { empty, title, subtitle };
}
async function add() {
  log('add: fill'); await fillRequired(); const addButton = dialog().getByRole('button', { name: 'Add', exact: true });
  await addButton.waitFor({ state: 'visible' }); await page.waitForFunction(() => !document.querySelector('.add-event-dialog button[type=submit]')?.disabled, null, { timeout: 20000 });
  const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/event/create'), { timeout: 45000 });
  log('add: click'); await addButton.evaluate(e => e.click()); const res = await response; log('add: response ' + res.status()); check(res.ok(), `Create failed ${res.status()}: ${await res.text()}`);
  lastCreate = await res.json().catch(() => null); log('add: json');
  const form = JSON.parse(res.request().postData()); await dialog().waitFor({ state: 'hidden', timeout: 45000 }); await dirty().waitFor();
  await page.locator('.event-inspector__title').first().waitFor({ timeout: 8000 }).catch(() => {});
  await clearPerf(); log('add: inspector'); Object.defineProperty(form, 'inspectorAfterAdd', { value: await inspector(), enumerable: false });
  return form;
}
async function discard() { await page.getByRole('button', { name: 'Discard Changes' }).evaluate(e => e.click()); await dirty().waitFor({ state: 'hidden' }); }
async function save() {
  await page.getByRole('button', { name: 'Save Changes', exact: true }).evaluate(e => e.click());
  const d = page.getByRole('dialog', { name: 'Save changes' }); await d.waitFor();
  const b = d.getByRole('button', { name: 'Save Changes', exact: true });
  await page.waitForFunction(() => { const d = document.querySelector('[aria-label="Save changes"][role="dialog"]'); return [...(d?.querySelectorAll('button') ?? [])].some(b => b.textContent.trim() === 'Save Changes' && !b.disabled); }, null, { timeout: 30000 });
  lastSaveDialog = (await d.innerText().catch(() => '')).slice(0, 1500);
  await b.evaluate(e => e.click()); await d.waitFor({ state: 'hidden' }); await dirty().waitFor({ state: 'hidden' });
}
async function resetClone() {
  // Only revert tracked files this driver wrote; never remove untracked files (.pokemap/, porymap.project.cfg).
  const changed = git('diff', '--name-only').trim().split(/\r?\n/).filter(Boolean);
  if (changed.length) git('checkout', '--', ...changed);
  out.resets.push({ action: 'git checkout of the tracked changed paths, then page reload (new visit; the hub re-reads disk)', paths: changed });
  map = startMap; await load();
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

// ---- assertion helpers ----
const q = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const R = src => new RegExp(src, 'm');
const lf = s => s.replace(/\r/g, '');
const snake = s => s.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
function parseDiff(diff) {
  const files = {}; let cur = null;
  for (const line of lf(diff).split('\n')) {
    const m = /^diff --git a\/(.+) b\//.exec(line); if (m) { cur = files[m[1]] = { added: [], removed: [] }; continue; }
    if (!cur || /^(---|\+\+\+) (a\/|b\/|\/dev\/null)/.test(line) || line.startsWith('@@') || line.startsWith('index ')) continue;
    if (line.startsWith('+')) cur.added.push(line.slice(1)); else if (line.startsWith('-')) cur.removed.push(line.slice(1));
  }
  for (const f of Object.values(files)) { f.addedText = f.added.join('\n'); f.removedText = f.removed.join('\n'); }
  return files;
}
const chk = (r, name, ok, detail) => { (r.checks ??= []).push({ name, status: ok ? 'pass' : 'fail', ...(detail === undefined ? {} : { detail }) }); };
const na = (r, name, reason) => { (r.checks ??= []).push({ name, status: 'n/a', detail: reason }); };
function finish(r) { const bad = (r.checks ?? []).filter(c => c.status === 'fail'); check(!bad.length, `${bad.length} sub-check(s) failed: ${bad.map(c => c.name).join(' | ')}`); }
const gbaText = String.raw`\t\.string "POKEMAP ACCEPTANCE\\n"\n\t\.string "TEXT\$"`;
const gbcText = String.raw`\ttext "POKEMAP ACCEPTANCE"\n\tline "TEXT"\n\tdone`;
const mapFile = () => family === 'gba' ? `data/maps/${map}/map.json` : `maps/${map}.asm`;
const scriptPath = () => family === 'gba' ? `data/maps/${map}/scripts.inc` : `maps/${map}.asm`;
const constPaths = () => family === 'gba' ? ['include/constants/flags.h', 'include/constants/vars.h'] : ['constants/event_flags.asm'];
const allowedPaths = () => family === 'gba' ? [mapFile(), scriptPath(), ...constPaths()] : [mapFile(), ...constPaths()];
function gbaJsonObjects(file) {
  const res = [];
  for (const line of file?.added ?? []) { const t = line.trim().replace(/,$/, ''); if (t.startsWith('{') && t.endsWith('}')) { try { res.push(JSON.parse(t)); } catch { /* not a one-line event */ } } }
  return res;
}
const sortedJson = o => JSON.stringify(Object.keys(o).sort().map(k => [k, String(o[k])]));
const sameEvent = (a, b) => sortedJson(a) === sortedJson(b);
function constChecks(r, files, forms, tag) {
  const news = forms.flatMap(f => [f.flag, f.varName].filter(c => c?.mode === 'new').map(c => c.name));
  const cAdded = constPaths().map(p => files[p]?.addedText ?? '').join('\n'), cRemoved = constPaths().map(p => files[p]?.removedText ?? '').join('\n');
  for (const name of news) {
    const re = family === 'gba' ? String.raw`^#define\s+${q(name)}\s+(0x[0-9A-Fa-f]+)` : String.raw`^\tconst\s+${q(name)}\s*$`;
    const hits = [...cAdded.matchAll(new RegExp(re, 'gm'))];
    chk(r, `${tag}constants: exactly one added line for ${name}`, hits.length === 1, hits.map(h => h[0]));
    if (family === 'gba' && hits[0]) chk(r, `${tag}constants: ${name} renamed an unused define with value ${hits[0][1]}`, R(String.raw`^#define\s+(?:FLAG|VAR)_UNUSED_\w+\s+${q(hits[0][1])}\b`).test(cRemoved));
    for (const p of Object.keys(files)) if (!constPaths().includes(p)) chk(r, `${tag}${name} is not defined in ${p}`, !R(String.raw`^(?:#define\s+|\tconst\s+)${q(name)}\b`).test(files[p].addedText));
  }
  const addedCount = [...cAdded.matchAll(family === 'gba' ? /^#define\s+(?:FLAG|VAR)_\w+/gm : /^\tconst\s+EVENT_\w+/gm)].length;
  chk(r, `${tag}constants: added-line count == New flag/var count (${news.length})`, addedCount === news.length, addedCount);
  if (family === 'gba') chk(r, `${tag}constants: removed FLAG_/VAR_UNUSED define count == ${news.length}`, [...cRemoved.matchAll(/^#define\s+(?:FLAG|VAR)_UNUSED_\w+/gm)].length === news.length);
  else chk(r, `${tag}constants: nothing removed from ${constPaths()[0]}`, !(files[constPaths()[0]]?.removed.length));
  return news.length;
}
function gbaExpect(r, files, f, tag) {
  const objs = gbaJsonObjects(files[mapFile()]), s = files[scriptPath()]?.addedText ?? '', fx = f.fields ?? {};
  const L = f.script?.label ?? fx.label, base = { x: f.x, y: f.y, elevation: Number(fx.elevation) };
  let ev, body = null;
  if (f.kind === 'object') {
    const common = { ...base, movement_type: fx.movement, movement_range_x: Number(fx.rangeX), movement_range_y: Number(fx.rangeY) };
    if (f.objectType === 'npc') { ev = { graphics_id: fx.sprite, ...common, trainer_type: 'TRAINER_TYPE_NONE', trainer_sight_or_berry_tree_id: '0', script: L, flag: f.flag.name }; body = R(String.raw`^${q(L)}::\n\tmsgbox (${q(map)}_Text_PokemapObject\d+), MSGBOX_NPC\n\tend\n\n\1:\n${gbaText}`); }
    else if (f.objectType === 'itemball') { ev = { graphics_id: 'OBJ_EVENT_GFX_ITEM_BALL', ...common, trainer_type: 'TRAINER_TYPE_NONE', trainer_sight_or_berry_tree_id: '0', script: L, flag: f.flag.name }; body = R(String.raw`^${q(L)}::\n\tfinditem ${q(fx.item)}\n\tend$`); }
    else {
      ev = { graphics_id: fx.sprite, ...common, trainer_type: 'TRAINER_TYPE_NORMAL', trainer_sight_or_berry_tree_id: fx.sightRange, script: L, flag: f.flag.name };
      const m = R(String.raw`^${q(L)}::\n\ttrainerbattle_single ${q(fx.trainer)}, (\w+), (\w+)\n\tmsgbox (\w+), MSGBOX_AUTOCLOSE\n\tend$`).exec(s);
      chk(r, `${tag} script: trainerbattle_single ${fx.trainer}, Seen, Beaten + after-battle msgbox`, !!m, m?.[0]);
      if (m) for (const t of m.slice(1)) chk(r, `${tag} text ${t} defined with the generated text`, R(String.raw`^${q(t)}:\n${gbaText}`).test(s));
    }
  } else if (f.kind === 'warp') {
    ev = { x: f.x, y: f.y, elevation: Number(fx.elevation), dest_map: 'MAP_' + snake(fx.destMap), dest_warp_id: fx.destWarp };
  } else if (f.kind === 'coord') {
    ev = { type: 'trigger', ...base, var: f.varName.name, var_value: fx.varValue, script: L };
    body = R(String.raw`^${q(L)}::\n\tlockall\n\tmsgbox (${q(map)}_Text_PokemapCoord\d+), MSGBOX_DEFAULT\n\treleaseall\n\tend\n\n\1:\n${gbaText}`);
  } else if (fx.bgType === 'sign') {
    ev = { type: 'sign', ...base, player_facing_dir: fx.facing, script: L };
    body = R(String.raw`^${q(L)}::\n\tmsgbox (${q(map)}_Text_PokemapBg\d+), MSGBOX_SIGN\n\tend\n\n\1:\n${gbaText}`);
  } else ev = { type: 'hidden_item', ...base, item: fx.item, flag: f.flag.name };
  chk(r, `${tag} map.json event object is exactly ${JSON.stringify(ev)}`, objs.some(o => sameEvent(o, ev)), objs.filter(o => o.x === f.x && o.y === f.y));
  if (body) chk(r, `${tag} script block exact`, body.test(s), body.source.slice(0, 120));
}
function gbcExpect(r, files, f, tag) {
  const s = files[mapFile()]?.addedText ?? '', fx = f.fields ?? {};
  const L = f.script?.label ?? fx.label, at = `${f.x},\\s*${f.y}`, lineEnd = String.raw`\s*$`;
  const text = name => chk(r, `${tag} text block ${name}: text/line/done`, R(String.raw`^${q(name)}:\n${gbcText}`).test(s));
  if (f.kind === 'object') {
    const pre = String.raw`^\s*object_event\s+${at},\s*${q(fx.sprite)},\s*${q(fx.movement)},\s*${fx.rangeX},\s*${fx.rangeY},\s*${fx.hourStart},\s*${fx.hourEnd},\s*${q(fx.palette)},\s*`;
    if (f.objectType === 'npc') {
      chk(r, `${tag} object_event line (OBJECTTYPE_SCRIPT, 0, ${L}, ${f.flag.name})`, R(pre + String.raw`OBJECTTYPE_SCRIPT,\s*0,\s*${q(L)},\s*${q(f.flag.name)}` + lineEnd).test(s));
      chk(r, `${tag} script jumptextfaceplayer`, R(String.raw`^${q(L)}:\n\tjumptextfaceplayer ${q(L)}Text\n\n${q(L)}Text:\n${gbcText}`).test(s));
    } else if (f.objectType === 'itemball') {
      chk(r, `${tag} object_event line (OBJECTTYPE_ITEMBALL, 0, ${L}, ${f.flag.name})`, R(pre + String.raw`OBJECTTYPE_ITEMBALL,\s*0,\s*${q(L)},\s*${q(f.flag.name)}` + lineEnd).test(s));
      chk(r, `${tag} data label itemball ${fx.item}`, R(String.raw`^${q(L)}:\n\titemball ${q(fx.item)}$`).test(s));
    } else {
      const [cls, id] = fx.trainer.split(',');
      chk(r, `${tag} object_event line (OBJECTTYPE_TRAINER, ${fx.sightRange}, ${L}, -1)`, R(pre + String.raw`OBJECTTYPE_TRAINER,\s*${fx.sightRange},\s*${q(L)},\s*-1` + lineEnd).test(s));
      chk(r, `${tag} trainer header with seen/beaten/after labels and flag ${f.flag.name}`, R(String.raw`^${q(L)}:\n\ttrainer ${q(cls)}, ${q(id)}, ${q(f.flag.name)}, ${q(L)}SeenText, ${q(L)}BeatenText, 0, ${q(L)}After$`).test(s));
      chk(r, `${tag} after-battle script`, R(String.raw`^${q(L)}After:\n\tendifjustbattled\n\tjumptext ${q(L)}AfterText$`).test(s));
      for (const t of ['SeenText', 'BeatenText', 'AfterText']) text(L + t);
    }
  } else if (f.kind === 'warp') {
    chk(r, `${tag} warp_event ${fx.destMap}, ${fx.destWarp}`, R(String.raw`^\s*warp_event\s+${at},\s*${q(fx.destMap)},\s*${fx.destWarp}` + lineEnd).test(s));
  } else if (f.kind === 'coord') {
    chk(r, `${tag} coord_event scene ${fx.scene}`, R(String.raw`^\s*coord_event\s+${at},\s*${q(fx.scene)},\s*${q(L)}` + lineEnd).test(s));
    chk(r, `${tag} coord script opentext/writetext/waitbutton/closetext/end`, R(String.raw`^${q(L)}:\n\topentext\n\twritetext ${q(L)}Text\n\twaitbutton\n\tclosetext\n\tend\n\n${q(L)}Text:\n${gbcText}`).test(s));
  } else if (fx.bgType === 'BGEVENT_READ') {
    chk(r, `${tag} bg_event READ`, R(String.raw`^\s*bg_event\s+${at},\s*BGEVENT_READ,\s*${q(L)}` + lineEnd).test(s));
    chk(r, `${tag} script jumptext`, R(String.raw`^${q(L)}:\n\tjumptext ${q(L)}Text\n\n${q(L)}Text:\n${gbcText}`).test(s));
  } else if (fx.bgType === 'BGEVENT_ITEM') {
    chk(r, `${tag} bg_event ITEM -> wrapper`, R(String.raw`^\s*bg_event\s+${at},\s*BGEVENT_ITEM,\s*${q(fx.label)}` + lineEnd).test(s));
    chk(r, `${tag} hiddenitem ${fx.item}, ${f.flag.name}`, R(String.raw`^${q(fx.label)}:\n\thiddenitem ${q(fx.item)}, ${q(f.flag.name)}$`).test(s));
  } else {
    chk(r, `${tag} bg_event ${fx.bgType} -> wrapper`, R(String.raw`^\s*bg_event\s+${at},\s*${fx.bgType},\s*${q(fx.label)}` + lineEnd).test(s));
    chk(r, `${tag} conditional_event ${f.flag.name}, ${L}`, R(String.raw`^${q(fx.label)}:\n\tconditional_event ${q(f.flag.name)}, ${q(L)}$`).test(s));
    chk(r, `${tag} script jumptext`, R(String.raw`^${q(L)}:\n\tjumptext ${q(L)}Text\n\n${q(L)}Text:\n${gbcText}`).test(s));
  }
}
function verifyForms(r, forms, diffName, tag = '') {
  const diff = git('diff', '--no-ext-diff'); writeFileSync(`${shots}${family}-${diffName}.diff`, diff);
  const files = parseDiff(diff); r.paths = [...(r.paths ?? []), ...Object.keys(files)];
  chk(r, `${tag}changed paths within allowlist [${allowedPaths().join(', ')}]`, Object.keys(files).every(p => allowedPaths().includes(p)), Object.keys(files));
  chk(r, `${tag}map events file and script file both changed`, [mapFile(), scriptPath()].every(p => files[p]));
  const mf = files[mapFile()];
  if (family === 'gba') {
    chk(r, `${tag}map.json removed lines are only closing braces`, (mf?.removed ?? []).every(l => /^\s*[}\]],?\s*$/.test(l)), mf?.removed);
    chk(r, `${tag}scripts.inc: nothing removed`, !(files[scriptPath()]?.removed.length));
  } else chk(r, `${tag}map asm: nothing removed`, !(mf?.removed.length), mf?.removed);
  forms.forEach((f, i) => (family === 'gba' ? gbaExpect : gbcExpect)(r, files, f, `${tag}#${i + 1} ${f.kind}${f.objectType ? '/' + f.objectType : ''}${f.fields?.bgType ? '/' + f.fields.bgType : ''}`));
  if (family === 'gbc') chk(r, `${tag}object constants added == object count`, [...(mf?.addedText ?? '').matchAll(/^\tconst [A-Z0-9_]+$/gm)].length === forms.filter(f => f.kind === 'object').length);
  constChecks(r, files, forms, tag);
  return files;
}

// ---- scenarios ----
async function runBar(r) {
  const buttons = bar().locator('button'); chk(r, 'four buttons', await buttons.count() === 4);
  r.buttons = await buttons.evaluateAll(bs => bs.map(b => ({ label: b.getAttribute('aria-label'), title: b.title, disabled: b.disabled, pressed: b.getAttribute('aria-pressed') })));
  chk(r, 'every enabled button has a tooltip equal to its aria-label; a disabled button shows its reason as the tooltip', r.buttons.every(b => b.title && (b.disabled || b.title === b.label)), r.buttons);
  chk(r, 'buttons are Object, Warp, Coord, BG with icons only (no text content)', ['Object', 'Warp', 'Coord', 'BG'].every(k => r.buttons.some(b => b.label.startsWith('Add ' + k))) && (await buttons.allTextContents()).every(t => !t.trim()));
  if (family === 'gbc') {
    const coordOff = await button('Coord').isDisabled();
    if (coordOff) chk(r, 'GBC Coord disabled with a "no scenes" reason', /no scenes/i.test(await button('Coord').getAttribute('title')), await button('Coord').getAttribute('title'));
    else na(r, 'GBC Coord disabled reason', `n/a: ${map} has scenes so Coord is enabled (the reason is pinned by the scene-less map run)`);
  } else na(r, 'disabled reasons', 'n/a: GBA has no scene gating; the object-cap and read-only reasons need a full or read-only map');
  const pressed = async () => (await button('Object').getAttribute('aria-pressed')) === 'true';
  await button('Object').click(); chk(r, 'click starts placement (aria-pressed true)', await pressed());
  await page.keyboard.press('Escape'); chk(r, 'Escape cancels (aria-pressed false)', !(await pressed()));
  await button('Object').click(); await button('Object').click(); chk(r, 'same-button re-click cancels', !(await pressed()));
  await button('Object').click(); const tools = page.getByRole('group', { name: 'Tools' }).locator('button:not([disabled]):not([aria-pressed="true"])');
  const toolCount = await tools.count(); chk(r, 'an alternate tool exists', toolCount > 0);
  if (toolCount) { await tools.first().click(); chk(r, 'tool change cancels', !(await pressed())); }
  await button('Object').click(); chk(r, 'placement restarted before map switch', await pressed());
  const other = page.locator('.map-tree__map:not([aria-current="true"])').first();
  chk(r, 'an alternate map exists in the tree', await other.count() > 0);
  if (await other.count()) {
    const otherName = (await other.innerText()).trim(); await other.click(); await page.locator('.map-tree__map[aria-current="true"]').filter({ hasText: otherName }).waitFor();
    await bar().waitFor(); chk(r, `switching to ${otherName} cancels (aria-pressed false)`, !(await pressed()));
    await selectMap(map); chk(r, 'placement does not return on switching back', !(await pressed()));
  }
  finish(r);
}
async function runKinds(r) {
  const forms = []; r.forms = forms; r.saves = 0;
  // Finding W1: while a New flag/var is staged the page stops handling input, so New-flag adds come last and each is saved at once with a DOM click.
  const addForm = async (...a) => { const f = await defaults(...a); forms.push(f); if (f.flag?.mode === 'new') { await save(); r.saves++; await load(); } return f; };
  const hasScenes = await button('Coord').isEnabled();
  await addForm('Object', 'npc');
  const destRequests = () => out.network.filter(n => n.scenario === current && n.url.includes("dest=")).length;
  try { await addForm('Warp'); chk(r, 'Warp dialog becomes ready and Add succeeds', true, { destRequests: destRequests() }); }
  catch (e) { chk(r, 'Warp dialog becomes ready and Add succeeds (finding W2: endless ?dest= option loads keep Add disabled)', false, { error: String(e).slice(0, 200), destRequests: destRequests() }); await page.screenshot({ path: `${shots}${family}-warp-dialog-failure.png` }).catch(() => {}); r.warpDialogText = await dialog().innerText().catch(() => null); await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(300); na(r, 'warp_event / dest_map assertions', 'n/a: the Warp add itself failed (see the failed sub-check)'); }
  if (family === 'gba' || hasScenes) await addForm('Coord'); else na(r, `coord event on ${map}`, `n/a: no scenes on ${map} (Coord disabled)${coordMap ? `; asserted on ${coordMap} below` : ''}`);
  await addForm('BG', null, family === 'gba' ? 'sign' : 'BGEVENT_READ');
  for (const t of [['Object', 'itemball'], ['Object', 'trainer']]) await addForm(t[0], t[1]);
  for (const bg of family === 'gba' ? ['hidden_item'] : ['BGEVENT_ITEM', 'BGEVENT_IFSET']) await addForm('BG', null, bg);
  r.inspectorAfterAdd = forms.map(f => ({ kind: f.kind, objectType: f.objectType, ...f.inspectorAfterAdd }));
  chk(r, 'inspector shows the new event right after each add', forms.every(f => f.inspectorAfterAdd && !f.inspectorAfterAdd.empty && f.inspectorAfterAdd.title), r.inspectorAfterAdd);
  if (await dirty().count()) { await save(); r.saves++; } r.saveDialog = lastSaveDialog; verifyForms(r, forms, 'kinds');
  if (family === 'gbc') {
    const after = readFileSync(join(root, constPaths()[0]), 'utf8'); const news = forms.filter(f => f.flag?.mode === 'new').map(f => f.flag.name);
    chk(r, 'new EVENT_ consts sit inside the unused gap (before the final const_next)', news.every(n => after.indexOf('\tconst ' + n) > 0 && after.indexOf('\tconst ' + n) < after.lastIndexOf('const_next')));
  }
  if (family === 'gbc' && !hasScenes) {
    if (!coordMap) na(r, 'GBC coord event (separate map)', 'n/a: map has no scenes and no --coord-map was given');
    else {
      await resetClone(); await selectMap(coordMap); map = coordMap;
      chk(r, `${coordMap}: Coord button enabled (map has scenes)`, await button('Coord').isEnabled());
      const cf = await defaults('Coord'); r.coordForm = cf;
      chk(r, `${coordMap}: inspector shows the new coord event`, !!cf.inspectorAfterAdd && !cf.inspectorAfterAdd.empty, cf.inspectorAfterAdd);
      await save(); r.paths = []; verifyForms(r, [cf], 'kinds-coord', `[${coordMap}] `);
    }
  }
  finish(r);
}
function sourceBlock(text, label) {
  const lines = lf(text).split('\n'); const i = lines.findIndex(l => R(String.raw`^${q(label)}::?\s*$`).test(l)); if (i < 0) return null;
  let j = i + 1; while (j < lines.length && !/^[A-Za-z_]\w*::?/.test(lines[j])) j++;
  return lines.slice(i, j).join('\n');
}
async function pickCopy(srcText) {
  const sel = dialog().getByLabel('Script copy from', { exact: true });
  const opts = await sel.locator('option').evaluateAll(os => os.map(o => o.value).filter(Boolean));
  const tried = [];
  // Previews are slow: try the shortest bodies first, at most 6.
  const size = o => (sourceBlock(srcText, o) ?? 'x'.repeat(9999)).length;
  for (const from of [...opts].sort((a, b) => size(a) - size(b)).slice(0, 6)) {
    await sel.selectOption(from);
    await page.waitForFunction(() => { const d = document.querySelector('.add-event-dialog'); return d && (d.querySelector('[role=alert]') || d.querySelector('textarea[aria-label="Script body"]')?.value); }, null, { timeout: 30000 });
    const alert = (await dialog().getByRole('alert').allTextContents()).join(' ');
    if (alert) { tried.push({ from, refusal: alert }); continue; }
    const body = await dialog().getByLabel('Script body', { exact: true }).inputValue();
    const texts = await dialog().locator('textarea[aria-label^="Copied text "]').evaluateAll(es => es.map(e => ({ label: e.getAttribute('aria-label').slice('Copied text '.length), value: e.value })));
    return { from, body, texts, tried, label: await dialog().getByLabel('Script label', { exact: true }).inputValue() };
  }
  return { from: null, tried, optionCount: opts.length };
}
function offeredAreEntryPoints(offered, staged) { // every offered label is really used as an event script (GBA) / defined in this file or ROM0 (GBC)
  const bad = [];
  for (const l of offered.filter(x => x !== '0x0' && x !== 'ObjectEvent' && !staged.includes(x)).slice(0, 12)) { // sample: git grep per label is slow
    try {
      if (family === 'gba') git('grep', '-q', '-E', `"script"\\s*:\\s*"${l}"`, '--', 'data/maps');
      else if (!R(String.raw`^${q(l)}::?\s*$`).test(lf(readFileSync(join(root, scriptPath()), 'utf8')))) git('grep', '-q', '-E', `^${l}::?\\s*$`, '--', 'home');
    } catch { bad.push(l); }
  }
  return bad;
}
async function runScripts(r) {
  r.modes = []; const made = []; const source = scriptFile();
  const ops = family === 'gba'
    ? String.raw`\.string|\.2byte|\.4byte|\.byte|map_script|map_script_2|walk_\w+|face_\w+|lock_facing_direction|unlock_facing_direction|step_end|jump_\w+|delay_\w+|slide_\w+|player_\w+`
    : String.raw`text|text_start|line|para|cont|done|step|turn_head|turn_step|slow_step|jump_step|fix_facing|remove_fixed_facing|step_end|db|dw|def_scene_scripts|scene_script|big_step`;
  const nonEntry = [...lf(source.text).matchAll(new RegExp(String.raw`^([A-Za-z_]\w*)::?[ \t]*(?:[;@].*)?\n[ \t]*(?:${ops})\b`, 'gm'))].map(m => m[1]);
  r.nonEntryLabels = nonEntry.slice(0, 60);
  chk(r, `parsed ${nonEntry.length} movement/text/map-script labels from ${source.path} (need >0)`, nonEntry.length > 0, nonEntry.slice(0, 6));
  for (const [kind, bgType] of [['Object', null], ['BG', family === 'gba' ? 'sign' : 'BGEVENT_READ']]) {
    const tag = `${kind}/${bgType ?? 'npc'}`;
    for (const mode of ['existing', 'copy', 'new']) {
      await open(kind); if (bgType) await dialog().getByLabel('BG type').selectOption(bgType);
      await dialog().getByLabel('Script source').selectOption(mode);
      const meta = { tag, mode };
      if (mode === 'existing') {
        const choices = await dialog().getByLabel('Script', { exact: true }).locator('option').evaluateAll(os => os.map(o => o.value).filter(Boolean));
        meta.offered = choices; meta.choice = await firstOption('Script');
        chk(r, `${tag} existing: list is non-empty (${choices.length} entries)`, choices.length > 0, choices.slice(0, 12));
        const leaked = nonEntry.filter(n => choices.includes(n));
        chk(r, `${tag} existing: none of ${nonEntry.length} movement/text/map-script labels offered (e.g. ${nonEntry.slice(0, 2).join(', ')})`, leaked.length === 0, leaked);
        const staged = made.map(x => x.form.script?.label).filter(Boolean); meta.stagedLabelsInList = choices.filter(c => staged.includes(c));
        const bad = offeredAreEntryPoints(choices, staged);
        chk(r, `${tag} existing: the first 12 offered labels (staged ones from this session excepted: spec says staged text is visible) are ${family === 'gba' ? 'used as a "script" in some map.json' : 'defined in this map file or ROM0 (home/)'}`, bad.length === 0, bad);
      }
      if (mode === 'copy') {
        const pick = await pickCopy(source.text); meta.copy = pick;
        if (!pick.from) { chk(r, `${tag} copy: some entry point is copyable (${pick.optionCount} offered)`, false, { tried: pick.tried }); r.modes.push(meta); await page.keyboard.press('Escape'); continue; }
        na(r, `${tag} copy refusals shown before the first copyable: ${pick.tried.length}`, pick.tried.length ? JSON.stringify(pick.tried) : 'none refused');
        const block = sourceBlock(source.text, pick.from); meta.sourceBlock = block;
        chk(r, `${tag} copy: preview label ${pick.label} differs from source ${pick.from}`, pick.label !== pick.from);
        chk(r, `${tag} copy: preview body never mentions the source label`, !R(String.raw`\b${q(pick.from)}\b`).test(pick.body), pick.body);
        const defined = new Set([...lf(source.text).matchAll(/^\.?([A-Za-z_]\w*)::?[ \t]*$/gm)].map(m => m[1]));
        const refs = block ? [...new Set([...block.matchAll(/\b[A-Za-z_]\w*\b/g)].map(m => m[0]))].filter(w => w !== pick.from && defined.has(w)) : [];
        meta.sameFileRefs = refs;
        const everything = pick.body + '\n' + pick.texts.map(t => t.value).join('\n');
        const kept = refs.filter(w => R(String.raw`\b${q(w)}\b`).test(everything));
        na(r, `${tag} copy preview shows the ORIGINAL names (renaming happens at create, checked in the diff below)`, JSON.stringify({ source: pick.from, newLabel: pick.label, sameFileRefs: refs, previewTexts: pick.texts.map(t => t.label) }));
      }
      if (mode === 'new') { meta.text = 'HELLO FROM POKEMAP'; await dialog().getByLabel('Script text', { exact: true }).fill(meta.text); }
      meta.form = await add(); r.modes.push(meta); made.push(meta);
    }
  }
  await save(); r.saveDialog = lastSaveDialog; const diff = git('diff', '--no-ext-diff'); writeFileSync(`${shots}${family}-scripts.diff`, diff); check(diff.length > 0, 'Empty scripts diff');
  const files = parseDiff(diff); r.paths = Object.keys(files);
  const allowed = family === 'gba' ? [mapFile(), scriptPath()] : [mapFile()];
  chk(r, `changed paths within [${allowed.join(', ')}] (no constants file: existing flags only)`, r.paths.every(p => allowed.includes(p)), r.paths);
  const sf = files[scriptPath()], added = sf?.addedText ?? '', ev = files[mapFile()];
  chk(r, 'script file: nothing removed (originals untouched)', family === 'gba' ? !(sf?.removed.length) : !(ev?.removed.length), sf?.removed);
  if (family === 'gba') chk(r, 'map.json removed lines are only closing braces', (ev?.removed ?? []).every(l => /^\s*[}\]],?\s*$/.test(l)));
  const labelDef = l => R(String.raw`^${q(l)}::?\s*$`);
  const refEvent = (f, L) => family === 'gba' ? gbaJsonObjects(ev).some(o => o.x === f.x && o.y === f.y && o.script === L) : R(String.raw`^\s*(?:object_event|bg_event)\s+${f.x},\s*${f.y},.*[\s,]${q(L)}(?:,[^,]*)?\s*$`).test(ev?.addedText ?? '');
  for (const m of made) {
    const f = m.form, tag = `${m.tag} ${m.mode}`;
    if (m.mode === 'existing') {
      chk(r, `${tag}: event line references ${m.choice}`, refEvent(f, m.choice));
      chk(r, `${tag}: no new definition added for ${m.choice}`, !labelDef(m.choice).test(added));
    } else if (m.mode === 'new') {
      const L = f.script.label, bg = m.tag.startsWith('BG');
      const body = family === 'gba'
        ? R(String.raw`^${q(L)}::\n\tmsgbox (${q(map)}_Text_Pokemap\w+), ${bg ? 'MSGBOX_SIGN' : 'MSGBOX_NPC'}\n\tend\n\n\1:\n\t\.string "${q(m.text)}\$"$`)
        : R(String.raw`^${q(L)}:\n\t${bg ? 'jumptext' : 'jumptextfaceplayer'} ${q(L)}Text\n\n${q(L)}Text:\n\ttext "${q(m.text)}"\n\tdone$`);
      chk(r, `${tag}: exact generated body for ${L} with custom text "${m.text}"`, body.test(added), added.split('\n').filter(l => l.includes(L)).slice(0, 5));
      chk(r, `${tag}: event line references ${L}`, refEvent(f, L));
    } else if (m.copy?.from) {
      const L = f.script.label, S = m.copy.from;
      chk(r, `${tag}: copy defined under new label ${L} and source ${S} not redefined`, labelDef(L).test(added) && !labelDef(S).test(added));
      const nonEmpty = m.copy.body.split(/\r?\n/).map(l => l.trimEnd()).filter(Boolean);
      const blockLines = (sourceBlock(added, L) ?? '').split('\n').map(l => l.trimEnd()).filter(Boolean).slice(1);
      chk(r, `${tag}: new block has the same number of body lines as the preview (${nonEmpty.length})`, blockLines.length === nonEmpty.length, blockLines);
      const map1 = {}; let consistent = true; const tk = l => l.match(/[A-Za-z_]\w*|\S/g) ?? [];
      nonEmpty.forEach((pl, k) => { const a1 = tk(pl), b1 = tk(blockLines[k] ?? ''); if (a1.length !== b1.length) consistent = false; a1.forEach((t, n) => { if (t !== b1[n]) { if (map1[t] && map1[t] !== b1[n]) consistent = false; map1[t] = b1[n]; } }); });
      r.renames = { ...(r.renames ?? {}), [tag]: map1 };
      chk(r, `${tag}: body differs from the preview only by consistent label renames ${JSON.stringify(map1)}`, consistent);
      const origs = [S, ...m.copy.texts.map(t => t.label), ...m.sameFileRefs];
      chk(r, `${tag}: renamed labels are exactly the source's self/text/local references`, Object.keys(map1).every(k => origs.includes(k)), Object.keys(map1));
      chk(r, `${tag}: no original label (${[...new Set(origs)].join(', ')}) appears in the added text`, [...new Set(origs)].every(w => !new RegExp('\\b' + q(w) + '\\b').test(added)));
      for (const t of m.copy.texts) {
        const N = map1[t.label], blk = sourceBlock(added, N) ?? '';
        chk(r, `${tag}: copied text ${t.label} -> ${N} defined once with the previewed text`, !!N && [...added.matchAll(new RegExp('^' + q(N) + ':', 'gm'))].length === 1 && t.value.split(/\r?\n/).filter(Boolean).every(l => blk.includes(l.trim())), blk);
      }
      chk(r, `${tag}: event line references ${L}`, refEvent(f, L));
    }
  }
  finish(r);
}
async function history(action) {
  const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/' + action), { timeout: 45000 });
  await page.getByRole('button', { name: action === 'undo' ? 'Undo' : 'Redo', exact: true }).evaluate(e => e.click());
  const r = await response; check(r.ok(), `${action} failed: ${r.status()}`); return r.json();
}
function countEvents(body) {
  const m = body?.map ?? body?.events;
  check(m && typeof m === 'object', 'Response lacks events/map');
  return Object.entries(m).filter(([k, v]) => Array.isArray(v) && (/Events$/.test(k) || ['objects', 'warps', 'coords', 'bgs', 'objectEvents'].includes(k) || body.map === undefined)).reduce((n, [, v]) => n + v.length, 0);
}
async function runUndo(r) {
  const f = await defaults('BG'); const added = countEvents(lastCreate);
  chk(r, 'inspector shows the added event', !f.inspectorAfterAdd.empty && !!f.inspectorAfterAdd.title, f.inspectorAfterAdd);
  const undo = await history('undo'); const gone = await dirty().waitFor({ state: 'hidden', timeout: 8000 }).then(() => true, () => false); r.undoResponse = { isDirty: undo.isDirty, canUndo: undo.canUndo, canRedo: undo.canRedo };
  chk(r, 'after Undo: dirty indicator gone (response isDirty=' + undo.isDirty + ')', gone, r.undoResponse);
  const afterUndo = await inspector(); chk(r, 'after Undo: map clean (dirty indicator gone), inspector back to empty', afterUndo.empty, afterUndo);
  chk(r, 'after Undo: clone files untouched', git('status', '--porcelain') === initialStatus);
  const redo = await history('redo'); const dirtyAgain = await dirty().waitFor({ timeout: 8000 }).then(() => true, () => false); const afterRedo = await inspector();
  chk(r, 'after Redo: dirty indicator back', dirtyAgain);
  const undoAgain = await history('undo'); const gone2 = await dirty().waitFor({ state: 'hidden', timeout: 8000 }).then(() => true, () => false); chk(r, 'after second Undo: dirty indicator gone (isDirty=' + undoAgain.isDirty + ')', gone2);
  r.eventCounts = { afterAdd: added, afterUndo: countEvents(undo), afterRedo: countEvents(redo), afterSecondUndo: countEvents(undoAgain) }; r.inspectorAfterRedo = afterRedo;
  chk(r, `session event count: add ${r.eventCounts.afterAdd} -> undo ${r.eventCounts.afterUndo} -> redo ${r.eventCounts.afterRedo} -> undo ${r.eventCounts.afterSecondUndo}`, r.eventCounts.afterUndo === added - 1 && r.eventCounts.afterRedo === added && r.eventCounts.afterSecondUndo === added - 1);
  na(r, 'canvas marker count', 'n/a: the event overlay is painted on a bitmap canvas; counted through the session events in the undo/redo responses and the inspector instead');
  finish(r);
}
async function runDiscard(r) {
  await defaults('Object', 'npc'); const b = await defaults('Object', 'itemball');
  chk(r, 'second add used a New flag', b.flag?.mode === 'new', b.flag);
  chk(r, 'dirty indicator shown after two adds', await dirty().count() > 0);
  r.eventsBeforeDiscard = countEvents(lastCreate); await discard();
  chk(r, 'dirty indicator gone after Discard', await dirty().count() === 0);
  chk(r, 'git status --porcelain of the clone equals the starting status (files untouched)', git('status', '--porcelain') === initialStatus, git('status', '--porcelain'));
  { const i = await inspector(); chk(r, 'inspector back to empty after Discard', i.empty, i); }
  finish(r);
}
function scriptFile() {
  const path = scriptPath();
  check(existsSync(join(root, path)), `Missing map script file ${path}`);
  return { path, text: readFileSync(join(root, path), 'utf8') };
}
async function refusalSubmit() {
  const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/event/create'), { timeout: 45000 });
  await dialog().getByRole('button', { name: 'Add', exact: true }).evaluate(e => e.click());
  const res = await response; const body = await res.json().catch(() => null);
  await dialog().getByRole('alert').waitFor();
  return { status: res.status(), body, text: await dialog().getByRole('alert').innerText() };
}
async function runRefusals(r) {
  await open('Object'); const label = dialog().getByLabel('Script label'); await label.fill('1invalid'); await fillRequired();
  const disabled = await dialog().getByRole('button', { name: 'Add', exact: true }).isDisabled();
  chk(r, '(a) invalid identifier in New script name: Add disabled or error shown', disabled || await dialog().getByRole('alert').count() > 0, { disabled });
  chk(r, '(a) form kept (label still typed, dialog open)', await label.inputValue() === '1invalid' && await dialog().count() === 1); await page.keyboard.press('Escape');
  const source = scriptFile(); const existing = source.text.match(/^([A-Za-z_]\w*)::?[ \t]*(?:[;@].*)?$/m)?.[1];
  check(existing, `No existing label in ${source.path}`);
  await open('Object'); await dialog().getByLabel('Script label').fill(existing); await fillRequired();
  r.duplicate = await refusalSubmit(); const text = r.duplicate.text + ' ' + JSON.stringify(r.duplicate.body);
  chk(r, `(b) duplicate label ${existing}: create refused (HTTP ${r.duplicate.status}, code ${r.duplicate.body?.code})`, r.duplicate.status >= 400 && r.duplicate.body?.code === 'LABEL_TAKEN', r.duplicate.body);
  chk(r, `(b) refusal text names the file ${source.path}`, text.includes(source.path), r.duplicate.text);
  chk(r, `(b) refusal text names the map ${map}`, text.includes(map), r.duplicate.text);
  chk(r, '(b) form kept (label still typed)', await dialog().getByLabel('Script label').inputValue() === existing); await page.keyboard.press('Escape');
  chk(r, '(b) refused create staged nothing (map still clean)', await dirty().count() === 0);
  if (!noSlot) { na(r, '(c) NO_FLAG_SLOT', 'n/a: --no-slot was not passed (needs the clone free range pre-filled)'); if (family === 'gba') na(r, '(c) NO_VAR_SLOT', 'n/a: --no-slot was not passed'); }
  else {
    await open('Object'); await dialog().getByLabel('Object type').selectOption('itemball'); await fillRequired();
    const flag = dialog().getByLabel('Flag name'); const name = await flag.inputValue(); check(name, 'New flag name missing');
    r.noFlagSlot = await refusalSubmit(); const d = r.noFlagSlot.text + ' ' + JSON.stringify(r.noFlagSlot.body);
    chk(r, `(c) New flag with no free slot: refused (HTTP ${r.noFlagSlot.status}, code ${r.noFlagSlot.body?.code})`, r.noFlagSlot.status >= 400 && r.noFlagSlot.body?.code === 'NO_FLAG_SLOT', r.noFlagSlot.body);
    chk(r, '(c) refusal text names the constants file', /flags\.h|event_flags\.asm/.test(d), r.noFlagSlot.text);
    chk(r, '(c) form still filled (flag name kept, dialog open)', await flag.inputValue() === name && await dialog().count() === 1); await page.keyboard.press('Escape');
    if (family === 'gba') {
      await open('Coord'); await dialog().getByLabel('Var source').selectOption('new'); await fillRequired();
      const vn = dialog().getByLabel('Var name'); const vname = await vn.inputValue(); check(vname, 'New var name missing');
      r.noVarSlot = await refusalSubmit(); const dv = r.noVarSlot.text + ' ' + JSON.stringify(r.noVarSlot.body);
      chk(r, `(c) New var with no free slot: refused (HTTP ${r.noVarSlot.status}, code ${r.noVarSlot.body?.code})`, r.noVarSlot.status >= 400 && r.noVarSlot.body?.code === 'NO_VAR_SLOT', r.noVarSlot.body);
      chk(r, '(c) refusal text names vars.h', /vars\.h/.test(dv), r.noVarSlot.text);
      chk(r, '(c) form still filled (var name kept)', await vn.inputValue() === vname); await page.keyboard.press('Escape');
    }
    chk(r, '(c) refused creates staged nothing', await dirty().count() === 0);
  }
  finish(r);
}
const handlers = { bar: runBar, 'kinds-defaults': runKinds, 'script-modes': runScripts, 'undo-redo': runUndo, discard: runDiscard, refusals: runRefusals };
try {
  await load();
  for (const name of (selected.length ? selected : names)) {
    current = name; const result = { name, status: 'pass' }; out.scenarios.push(result); cell = 0; map = startMap;
    try { await handlers[name](result); }
    catch (e) { result.status = 'fail'; result.error = String(e); result.dialogText = await page.locator('[role=dialog]:visible').allInnerTexts().catch(() => []); result.visibleButtons = await page.locator('button:visible').allTextContents().catch(() => []); await page.screenshot({ path: `${shots}${family}-${name}-failure.png` }).catch(() => {}); }
    if (await dialog().count()) await page.keyboard.press('Escape').catch(() => {});
    if (await dirty().count()) await discard().catch(e => { result.cleanupError = String(e); });
    result.counts = ['pass', 'fail', 'n/a'].reduce((o, s) => ({ ...o, [s]: (result.checks ?? []).filter(c => c.status === s).length }), {});
    result.net = out.network.filter(n => n.scenario === name).map(({ method, url, status, code }) => ({ method, url: url.slice(0, 60), status, code }));
    if (['kinds-defaults', 'script-modes', 'discard'].includes(name)) {
      try { await resetClone(); } catch (e) { result.status = 'fail'; result.cleanupError = String(e); break; }
    }
  }
} catch (e) { out.fatal = String(e); out.dialogText = await page.locator('[role=dialog]:visible').allInnerTexts().catch(() => []); out.visibleButtons = await page.locator('button:visible').allTextContents().catch(() => []); await page.screenshot({ path: `${shots}${family}-fatal.png` }).catch(() => {}); }
finally { await browser.close(); out.finalStatus = git('status', '--porcelain'); writeFileSync(`${shots}${family}-accept${selected.length ? "-" + selected.join("+") : ""}${noSlot ? "-noslot" : ""}.json`, JSON.stringify(out, null, 2)); }
console.table(out.scenarios.map(({ name, status, counts, error }) => ({ scenario: name, status, pass: counts?.pass, fail: counts?.fail, na: counts?.['n/a'], error: (error ?? '').slice(0, 160) })));
if (out.fatal || out.scenarios.some(x => x.status !== 'pass')) process.exitCode = 1;
