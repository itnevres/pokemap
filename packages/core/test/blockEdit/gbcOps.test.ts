import { createHash } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect } from "vitest";
import { openGbcProject, type GbcProject } from "../../src/gbc/project.js";
import type { GbcMap, GbcTileset } from "../../src/gbc/model/types.js";
import { readShadesPng } from "../../src/gbc/load/png.js";
import { sliceTiles } from "../../src/gbc/load/tileset.js";
import { canonicalTilesetPath as canon } from "../../src/blockEdit/canonicalTilesetPath.js";
import { patchGbcCollision, patchGbcPaletteMap, readGbcCollisionRecords } from "../../src/blockEdit/gbcPatch.js";
import { copySheetTile, loadGbcReservedTiles } from "../../src/blockEdit/gbcSheet.js";
import { BlockEditRefusal, type FileOverlay, type StagedGrids } from "../../src/blockEdit/types.js";
import { blockEditRevision, planGbcBlockEdit, resolveGbcEditTarget, type GbcBlockDraft, type GbcBlockEditRequest } from "../../src/blockEdit/gbcOps.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus, copyGbcSubjectToTemp, removeTemp } from "../gbc/helpers/corpus.js";

const timeout = 60_000;
let project: GbcProject | undefined;
const proj = (): GbcProject => (project ??= openGbcProject(GBC_SUBJECT_ROOT));
const bytes = (p: GbcProject, path: string, staged: FileOverlay = new Map()): Buffer => staged.get(canon(path)) ?? readFileSync(join(p.root, path));
const tileId = (index: number): number => index < 0x60 ? index : index + 0x20;
const indexOf = (id: number): number => id < 0x60 ? id : id >= 0x80 && id < 0xe0 ? id - 0x20 : -1;
const pixels = (buf: Buffer): Uint8Array[] => sliceTiles(readShadesPng(buf), "fixture");
const equalPixels = (a: Uint8Array, b: Uint8Array): boolean => Buffer.from(a).equals(Buffer.from(b));
function names(text: string): Map<number, string> {
  const out = new Map<number, string>();
  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    const match = line.replace(/;.*/, "").match(/^\s*tilepal\s+([01])\s*,\s*(.*)$/);
    if (!match) continue;
    const row = match[2]!.split(",").map(s => s.trim());
    expect(row, "palette line has eight names").toHaveLength(8);
    for (const name of row) out.set(tileId(count++), name);
  }
  expect(count, "palette map has 192 entries").toBe(192);
  return out;
}
function revisionOracle(files: ReadonlyMap<string, Buffer>, grid: readonly number[]): string {
  const h = createHash("sha1");
  for (const [path, data] of [...files].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)) h.update(path).update("\0").update(String(data.length)).update("\0").update(data);
  h.update("grid\0").update(String(grid.length)).update("\0").update(grid.join(","));
  return h.digest("hex");
}
function mapFor(p: GbcProject, ts: string, unique = false): GbcMap {
  const found = p.maps.find(m => m.tileset === ts && (!unique || p.maps.filter(n => n.blkPath === m.blkPath).length === 1));
  expect(found, `map using ${ts}${unique ? " with an unshared grid" : ""}`).toBeDefined();
  return found!;
}
function draft(p: GbcProject, ts: GbcTileset, id: number, staged: FileOverlay = new Map()): GbcBlockDraft {
  const meta = bytes(p, ts.metatilesPath, staged);
  const collisions = readGbcCollisionRecords(bytes(p, ts.collisionPath, staged).toString());
  return { tiles: [...meta.subarray(id * 16, id * 16 + 16)], collision: [...collisions[id]!] as GbcBlockDraft["collision"], palettes: [] };
}
function request(map: GbcMap, id: number, d: GbcBlockDraft, mode: GbcBlockEditRequest["mode"] = "ok", from: GbcBlockEditRequest["from"] = "palette"): GbcBlockEditRequest {
  return { map: map.name, blockId: id, draft: d, mode, from };
}
function edit(plan: ReturnType<typeof planGbcBlockEdit>, path: string): { path: string; before: Buffer; after: Buffer } {
  const e = plan.edits.find(x => x.path === canon(path));
  expect(e, `edit for ${path}`).toBeDefined();
  return e!;
}
function refusal(fn: () => unknown, code: string, subjects: string[], prefix?: string, ordered?: string[]): void {
  let caught: unknown;
  try { fn(); } catch (e) { caught = e; }
  expect(caught, `expected ${code}`).toBeInstanceOf(BlockEditRefusal);
  const err = caught as BlockEditRefusal;
  expect(err.code).toBe(code);
  for (const subject of subjects) expect(err.message.toLowerCase()).toContain(subject.toLowerCase());
  if (prefix !== undefined) expect(err.message.toLowerCase().startsWith(prefix.toLowerCase())).toBe(true);
  let position = code === "SHARED_GRID" ? 0 : prefix?.length ?? 0;
  for (const name of ordered ?? []) {
    const next = err.message.indexOf(name, position);
    expect(next, `ordered name ${name} in ${err.message}`).toBeGreaterThanOrEqual(position);
    position = next + name.length;
  }
}
function alternate(name: string): string { return name === "RED" ? "GREEN" : "RED"; }
function forest() { const p = proj(); const ts = p.tileset("TILESET_FOREST"); return { p, ts, map: mapFor(p, ts.constName, true) }; }
function changedDraft(p: GbcProject, ts: GbcTileset, id: number): GbcBlockDraft {
  const d = draft(p, ts, id);
  d.tiles[0] = d.tiles[0] === 1 ? 2 : 1;
  d.collision = d.collision[0] === "WALL" ? ["FLOOR", "FLOOR", "FLOOR", "FLOOR"] : ["WALL", "WALL", "WALL", "WALL"];
  return d;
}
// Independent usage oracle: group map headers by raw .blk file and count bytes.
function usageOracle(p: GbcProject, ts: GbcTileset, id: number) {
  const usedConsts = [...new Set(p.maps.map(m => m.tileset))];
  const matching = usedConsts.map(c => p.tileset(c)).filter(t => canon(t.metatilesPath) === canon(ts.metatilesPath));
  const consts = new Set(matching.map(t => t.constName));
  const groups = new Map<string, GbcMap[]>();
  for (const map of p.maps.filter(m => consts.has(m.tileset))) {
    const group = groups.get(map.blkPath) ?? []; group.push(map); groups.set(map.blkPath,group);
  }
  const maps: {map:string;interior:number;border:number;block0AsBorder:number}[] = [];
  const sharedGrids: {file:string;maps:string[]}[] = [];
  for (const [file, group] of groups) {
    group.sort((a,b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0); const rep = group[0]!;
    const grid = [...bytes(p,file).subarray(0,rep.width*rep.height)];
    const interior = grid.filter(i => i === id).length; const border = group.filter(m => m.border === id).length;
    const block0AsBorder = id === 0 ? 0 : border * grid.filter(i => i === 0).length;
    if (interior + border + block0AsBorder === 0) continue;
    maps.push({map:rep.name,interior,border,block0AsBorder});
    const names = p.maps.filter(m => m.blkPath === file).map(m => m.name).sort();
    if (names.length >= 2) sharedGrids.push({file,maps:names});
  }
  maps.sort((a,b) => a.map < b.map ? -1 : a.map > b.map ? 1 : 0);
  sharedGrids.sort((a,b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
  return {files:[...new Set([canon(ts.metatilesPath),...matching.map(t => canon(t.collisionPath))])].sort(), tilesets:[...consts].sort(), maps, sharedGrids};
}
interface LocalFixture { p: GbcProject; map: GbcMap; ts: GbcTileset; id: number; source: number; square: number; pal: string; free: number[]; sheet: Uint8Array[] }
function localFixture(): LocalFixture {
  const p = proj();
  const reserved = loadGbcReservedTiles(p.root);
  const usedConsts = [...new Set(p.maps.map(m => m.tileset))];
  const tilesets = usedConsts.map(c => p.tileset(c));
  for (const ts of tilesets) {
    if (tilesets.some(t => canon(t.metatilesPath) === canon(ts.metatilesPath) && (canon(t.gfxPath) !== canon(ts.gfxPath) || canon(t.palMapPath) !== canon(ts.palMapPath)))) continue;
    const map = p.maps.find(m => m.tileset === ts.constName && p.maps.filter(n => n.blkPath === m.blkPath).length === 1);
    if (!map) continue;
    const sheet = pixels(bytes(p, ts.gfxPath));
    const palNames = names(bytes(p, ts.palMapPath).toString());
    const used = new Set<number>();
    for (const other of tilesets.filter(t => canon(t.gfxPath) === canon(ts.gfxPath))) for (const b of bytes(p, other.metatilesPath)) used.add(b);
    const meta = bytes(p, ts.metatilesPath);
    for (let id = 0; id < meta.length / 16; id++) {
      const tiles = [...meta.subarray(id * 16, id * 16 + 16)];
      for (const square of [5]) {
        if (tiles[0] === tiles[5] || !palNames.has(tiles[0]!)) continue;
        const source = tiles[square]!; const si = indexOf(source);
        if (si < 0 || si >= sheet.length || reserved.has(source) || !palNames.has(source)) continue;
        const firstIndex = indexOf(tiles[0]!);
        if (firstIndex < 0 || firstIndex >= sheet.length || equalPixels(sheet[firstIndex]!, sheet[si]!)) continue;
        for (const pal of ["RED", "GREEN", "WATER", "GRAY", "YELLOW", "BROWN", "ROOF", "TEXT"]) {
          if (pal === palNames.get(source)) continue;
          if (sheet.some((pix, i) => { const t = tileId(i); return t !== source && !reserved.has(t) && palNames.get(t) === pal && equalPixels(pix, sheet[si]!); })) continue;
          const free = sheet.map((_, i) => tileId(i)).filter(t => palNames.has(t) && !reserved.has(t) && !used.has(t) && !tiles.includes(t));
          if (free.length >= 2 && palNames.get(free[0]!) !== pal && !equalPixels(sheet[indexOf(free[0]!)]!, sheet[si]!)) return { p, map, ts, id, source, square, pal, free, sheet };
        }
      }
    }
  }
  expect.fail("scan found no unshared, matching-sheet local fixture with two free slots and no reusable tile");
}
function localDraft(f: LocalFixture): GbcBlockDraft {
  const d = draft(f.p, f.ts, f.id);
  d.palettes.push({ square: f.square, palName: f.pal, scope: "local" });
  return d;
}
function checkLocal(f: LocalFixture, plan: ReturnType<typeof planGbcBlockEdit>, slot: number, original = draft(f.p, f.ts, f.id)): void {
  const m = edit(plan, f.ts.metatilesPath);
  const baseline = bytes(f.p, f.ts.metatilesPath); expect(m.before).toEqual(baseline);
  const expected = Buffer.from(baseline);
  original.tiles.forEach((t, i) => { if (t === f.source) expected[f.id * 16 + i] = slot; });
  expect(m.after).toEqual(expected);
}

describe("GBC block edit planner", () => {
  itWithGbcCorpus("OK edits only block N's 16 bytes and collision record N", () => {
    const {p, ts, map} = forest(); const id = 1; const d = changedDraft(p, ts, id);
    const plan = planGbcBlockEdit(p, request(map, id, d), new Map(), new Map());
    expect(plan.edits.map(e => e.path)).toEqual([canon(ts.collisionPath), canon(ts.metatilesPath)].sort());
    const m = edit(plan, ts.metatilesPath); const c = edit(plan, ts.collisionPath);
    expect(m.before).toEqual(bytes(p, ts.metatilesPath)); expect(c.before).toEqual(bytes(p, ts.collisionPath));
    const expected = Buffer.from(m.before); Buffer.from(d.tiles).copy(expected, id * 16); expect(m.after).toEqual(expected);
    const before = readGbcCollisionRecords(c.before.toString()); const after = readGbcCollisionRecords(c.after.toString());
    expect(after).toEqual(before.map((r, n) => n === id ? d.collision : r));
    expect(plan.warnings).toEqual([]);
    expect(plan.usage).toEqual(usageOracle(p, ts, id));
    expect(bytes(p, ts.metatilesPath)).toEqual(m.before); expect(bytes(p, ts.collisionPath)).toEqual(c.before);
  }, timeout);
  itWithGbcCorpus("saveAsNew on forest replaces surplus record 40", () => {
    const {p, ts, map} = forest(); const d = changedDraft(p, ts, 1); const orig = bytes(p, ts.metatilesPath);
    expect(orig.length / 16, "forest block count").toBe(40);
    const plan = planGbcBlockEdit(p, request(map, 1, d, "saveAsNew"), new Map(), new Map());
    expect(plan.usage).toEqual(usageOracle(p, ts, 1));
    expect(plan.newBlockId).toBe(40); expect(edit(plan, ts.metatilesPath).after).toEqual(Buffer.concat([orig, Buffer.from(d.tiles)]));
    const c = edit(plan, ts.collisionPath); const before = readGbcCollisionRecords(c.before.toString()); const after = readGbcCollisionRecords(c.after.toString());
    expect(before).toHaveLength(64); expect(after).toHaveLength(64); expect(after).toEqual(before.map((r, i) => i === 40 ? d.collision : r));
  }, timeout);
  itWithGbcCorpus("saveAsNew from palette has no placement", () => {
    const {p, ts, map} = forest(); const plan = planGbcBlockEdit(p, request(map, 1, draft(p, ts, 1), "saveAsNew"), new Map(), new Map());
    expect(plan.placement).toBeUndefined(); expect(plan.confirm).toBe(false);
  }, timeout);
  itWithGbcCorpus("saveAsNew from map places on the clicked cell", () => {
    const {p, ts, map} = forest(); const cell = {x:0,y:0};
    const d = draft(p, ts, 1); const grid = Array(map.width * map.height).fill(2) as number[];
    const plan = planGbcBlockEdit(p, {...request(map, 1, d, "saveAsNew", "map"), cell}, new Map(), new Map([[map.name,grid]]));
    expect(edit(plan,ts.metatilesPath).after.subarray(-16)).toEqual(Buffer.from(d.tiles));
    expect(plan.placement).toEqual({...cell, blockId: bytes(p, ts.metatilesPath).length / 16});
  }, timeout);
  itWithGbcCorpus("saveAsNew on a shared grid refuses SHARED_GRID naming both maps", () => {
    const p = proj(); const map = p.map("OlivinePortPassage"); const other = p.map("VermilionPortPassage"); expect(map.blkPath).toBe(other.blkPath);
    const ts = p.tileset(map.tileset);
    refusal(() => planGbcBlockEdit(p, {...request(map, 1, draft(p, ts, 1), "saveAsNew", "map"), cell:{x:0,y:0}}, new Map(), new Map()), "SHARED_GRID", [map.name, other.name], map.name, p.maps.filter(m => m.blkPath === map.blkPath).map(m => m.name).sort());
  }, timeout);
  itWithGbcCorpus("cap refuses BLOCK_CAP naming the file", () => {
    const {p, ts, map} = forest(); const staged = new Map([[canon(ts.metatilesPath), Buffer.alloc(256*16)]]);
    refusal(() => planGbcBlockEdit(p, request(map, 1, draft(p, ts, 1, staged), "saveAsNew"), staged, new Map()), "BLOCK_CAP", [canon(ts.metatilesPath)], canon(ts.metatilesPath));
  }, timeout);
  itWithGbcCorpus("All rewrites one tilepal name", () => {
    const {p, ts, map} = forest(); const d = draft(p, ts, 1); const source = d.tiles.find(t => names(bytes(p, ts.palMapPath).toString()).has(t));
    expect(source, "block contains a mapped tile").toBeDefined(); const square = d.tiles.indexOf(source!); const text = bytes(p, ts.palMapPath).toString(); const pal = alternate(names(text).get(source!)!);
    d.palettes = [{square, palName:pal, scope:"all"}]; const plan = planGbcBlockEdit(p, request(map, 1, d), new Map(), new Map());
    expect(plan.edits.map(e => e.path)).toEqual([canon(ts.palMapPath)]);
    expect(edit(plan, ts.palMapPath).after.toString()).toBe(patchGbcPaletteMap(text, source!, pal, ts.palMapPath));
  }, timeout);
  itWithGbcCorpus("Local copies to the lowest free non-reserved slot and repoints only this block's squares that used the tile", () => {
    const f = localFixture(); const d = localDraft(f); const plan = planGbcBlockEdit(f.p, request(f.map, f.id, d), new Map(), new Map()); const slot = f.free[0]!;
    checkLocal(f, plan, slot, d);
    expect(plan.edits.map(e => e.path)).toEqual([f.ts.gfxPath, f.ts.metatilesPath, f.ts.palMapPath].map(canon).sort());
    const png = edit(plan, f.ts.gfxPath); const after = pixels(png.after); const before = pixels(png.before);
    expect(after).toHaveLength(before.length);
    after.forEach((tile, i) => expect(equalPixels(tile, i === indexOf(slot) ? before[indexOf(f.source)]! : before[i]!), `sheet tile ${i}`).toBe(true));
    expect(names(edit(plan, f.ts.palMapPath).after.toString()).get(slot)).toBe(f.pal);
  }, timeout);
  itWithGbcCorpus("Local reuses an identical non-reserved copy", () => {
    const f = localFixture(); const slot = f.free[0]!; const png = copySheetTile(bytes(f.p, f.ts.gfxPath), indexOf(f.source), indexOf(slot), f.ts.gfxPath);
    const pal = patchGbcPaletteMap(bytes(f.p, f.ts.palMapPath).toString(), slot, f.pal, f.ts.palMapPath);
    const staged = new Map([[canon(f.ts.gfxPath), png], [canon(f.ts.palMapPath), Buffer.from(pal)]]);
    const d = localDraft(f); const plan = planGbcBlockEdit(f.p, request(f.map, f.id, d), staged, new Map());
    checkLocal(f, plan, slot, d); expect(plan.edits.some(e => e.path === canon(f.ts.gfxPath) || e.path === canon(f.ts.palMapPath))).toBe(false);
  }, timeout);
  itWithGbcCorpus("identical copy in a reserved slot is not reused", () => {
    const f = localFixture(); const reserved = loadGbcReservedTiles(f.p.root);
    const slot = [...reserved].sort((a,b) => indexOf(a)-indexOf(b)).find(t => indexOf(t) >= 0 && indexOf(t) < f.sheet.length && t !== f.source);
    expect(slot, "reserved tile in sheet distinct from source").toBeDefined();
    const png = copySheetTile(bytes(f.p, f.ts.gfxPath), indexOf(f.source), indexOf(slot!), f.ts.gfxPath);
    const pal = patchGbcPaletteMap(bytes(f.p, f.ts.palMapPath).toString(), slot!, f.pal, f.ts.palMapPath);
    const staged = new Map([[canon(f.ts.gfxPath), png], [canon(f.ts.palMapPath), Buffer.from(pal)]]);
    const d = localDraft(f); const plan = planGbcBlockEdit(f.p, request(f.map, f.id, d), staged, new Map());
    checkLocal(f, plan, f.free[0]!, d); expect(edit(plan, f.ts.gfxPath).before).toEqual(png);
  }, timeout);
  itWithGbcCorpus("Local on reserved source refuses RESERVED_TILE", () => {
    const f = localFixture(); const reserved = loadGbcReservedTiles(f.p.root);
    const source = f.sheet.map((_,i) => tileId(i)).find(t => reserved.has(t)); expect(source, "mapped reserved source").toBeDefined();
    const d = draft(f.p, f.ts, f.id); d.tiles[0] = source!; d.palettes = [{square:0, palName:alternate(names(bytes(f.p, f.ts.palMapPath).toString()).get(source!)!), scope:"local"}];
    refusal(() => planGbcBlockEdit(f.p, request(f.map, f.id, d), new Map(), new Map()), "RESERVED_TILE", [`tile $${source!.toString(16).padStart(2,"0")}:`], `tile $${source!.toString(16).padStart(2,"0")}:`);
  }, timeout);
  itWithGbcCorpus("Local with no free slot refuses NO_FREE_TILE naming the sheet", () => {
    const f = localFixture(); const d = localDraft(f); const ids = f.sheet.map((_,i) => tileId(i));
    const full = Buffer.alloc(Math.max(bytes(f.p, f.ts.metatilesPath).length, Math.ceil((ids.length * 2 + 16) / 16) * 16));
    for (let i=0;i<full.length;i++) full[i] = ids[i % ids.length]!;
    Buffer.from(d.tiles).copy(full, f.id * 16);
    const staged = new Map([[canon(f.ts.metatilesPath), full]]);
    refusal(() => planGbcBlockEdit(f.p, request(f.map, f.id, d), staged, new Map()), "NO_FREE_TILE", [canon(f.ts.gfxPath), String(f.sheet.length)], canon(f.ts.gfxPath));
  }, timeout);
  itWithGbcCorpus("Local on Cave metatiles refuses LOCAL_SHEET_MISMATCH naming TilesetCave and TilesetDarkCave", () => {
    const p = proj(); const map = mapFor(p, "TILESET_CAVE"); const ts = p.tileset(map.tileset); const other = p.tileset("TILESET_DARK_CAVE");
    expect(canon(ts.metatilesPath)).toBe(canon(other.metatilesPath)); expect(canon(ts.gfxPath)).not.toBe(canon(other.gfxPath));
    const d = draft(p, ts, 1); const palNames = names(bytes(p, ts.palMapPath).toString()); const square = d.tiles.findIndex(t => palNames.has(t)); expect(square).toBeGreaterThanOrEqual(0);
    d.palettes = [{square, palName:alternate(palNames.get(d.tiles[square]!)!), scope:"local"}];
    refusal(() => planGbcBlockEdit(p, request(map, 1, d), new Map(), new Map()), "LOCAL_SHEET_MISMATCH", [canon(ts.metatilesPath), "TilesetCave", "TilesetDarkCave"], canon(ts.metatilesPath), [...new Set(p.maps.map(m => p.tileset(m.tileset)).filter(t => canon(t.metatilesPath) === canon(ts.metatilesPath)).map(t => t.name))].sort());
  }, timeout);
  itWithGbcCorpus("palette-map-only mismatch also refuses", () => {
    const f = localFixture(); const alternateTs = f.p.maps.map(m => f.p.tileset(m.tileset)).find(t => canon(t.palMapPath) !== canon(f.ts.palMapPath));
    expect(alternateTs, "another existing palette map").toBeDefined();
    const aliasName = "TILESET_TEST_ALIAS"; const aliasMap = {...f.map, name:"Task6Alias", tileset:aliasName};
    const fake: GbcProject = {...f.p, maps:[...f.p.maps, aliasMap], map: n => n === aliasMap.name ? aliasMap : f.p.map(n), tileset: c => c === aliasName ? {...f.ts, constName:aliasName, name:"TilesetTask6Alias", palMapPath:alternateTs!.palMapPath} : f.p.tileset(c)};
    refusal(() => planGbcBlockEdit(fake, request(f.map, f.id, localDraft(f)), new Map(), new Map()), "LOCAL_SHEET_MISMATCH", [canon(f.ts.metatilesPath), f.ts.name, "TilesetTask6Alias"], canon(f.ts.metatilesPath), [...new Set(fake.maps.map(m => fake.tileset(m.tileset)).filter(t => canon(t.metatilesPath) === canon(f.ts.metatilesPath)).map(t => t.name))].sort());
  }, timeout);
  itWithGbcCorpus("free-slot scan counts blocks of every metatiles file loaded with the sheet, staged ones included", () => {
    const f = localFixture(); const candidates = [...new Set(f.p.maps.map(m => m.tileset))].map(c => f.p.tileset(c));
    let other = candidates.find(t => canon(t.gfxPath) === canon(f.ts.gfxPath) && canon(t.metatilesPath) !== canon(f.ts.metatilesPath));
    let p = f.p; let synthetic = false;
    if (!other) {
      const alternative = candidates.find(t => canon(t.metatilesPath) !== canon(f.ts.metatilesPath));
      expect(alternative, "another existing metatiles file for staged sheet alias").toBeDefined();
      const alias = {...f.ts, constName:"TILESET_TASK6_SHEET_ALIAS", name:"TilesetTask6SheetAlias", metatilesPath:alternative!.metatilesPath};
      const aliasMap = {...f.map, name:"Task6SheetAlias", tileset:alias.constName};
      p = {...f.p, maps:[...f.p.maps,aliasMap], map: n => n === aliasMap.name ? aliasMap : f.p.map(n), tileset: c => c === alias.constName ? alias : f.p.tileset(c)};
      other = alias; synthetic = true;
    }
    const original = synthetic ? bytes(f.p, f.ts.metatilesPath) : bytes(f.p, other.metatilesPath);
    const stagedBytes = Buffer.concat([original, Buffer.alloc(16, f.free[0]!)]);
    const staged = new Map([[canon(other.metatilesPath), stagedBytes]]); const d = localDraft(f);
    const used = new Set<number>();
    for (const c of new Set(p.maps.map(m => m.tileset))) {
      const candidate = p.tileset(c); if (canon(candidate.gfxPath) === canon(f.ts.gfxPath)) for (const t of bytes(p,candidate.metatilesPath,staged)) used.add(t);
    }
    const reserved = loadGbcReservedTiles(p.root);
    const expected = f.sheet.map((_,i) => tileId(i)).find(t => !reserved.has(t) && !used.has(t) && !d.tiles.includes(t) && names(bytes(p,f.ts.palMapPath).toString()).has(t));
    expect(expected, "a free tile remains after the staged second file claims the first").toBeDefined();
    expect(expected).not.toBe(f.free[0]);
    const plan = planGbcBlockEdit(p, request(f.map, f.id, d), staged, new Map()); checkLocal(f, plan, expected!, d);
  }, timeout);
  itWithGbcCorpus("reservations unreadable: Local refuses RESERVATIONS_UNREADABLE, All still plans", () => {
    const f = localFixture(); const temp = copyGbcSubjectToTemp();
    try {
      const p = openGbcProject(temp); unlinkSync(join(temp, "engine/tilesets/tileset_anims.asm"));
      const d = localDraft(f); const req = request(f.map, f.id, d);
      refusal(() => planGbcBlockEdit(p, req, new Map(), new Map()), "RESERVATIONS_UNREADABLE", ["tileset_anims.asm"]);
      d.palettes[0]!.scope = "all"; expect(planGbcBlockEdit(p, req, new Map(), new Map()).edits.length).toBeGreaterThan(0);
    } finally { removeTemp(temp); }
  }, timeout);
  itWithGbcCorpus("All + saveAsNew refuses ALL_WITH_SAVE_AS_NEW", () => {
    const f = localFixture(); const d = localDraft(f); d.palettes[0]!.scope = "all";
    refusal(() => planGbcBlockEdit(f.p, request(f.map, f.id, d, "saveAsNew"), new Map(), new Map()), "ALL_WITH_SAVE_AS_NEW", []);
  }, timeout);
  itWithGbcCorpus("mixed draft", () => {
    const f = localFixture(); const d = localDraft(f); const palText = bytes(f.p, f.ts.palMapPath).toString(); const pn = names(palText);
    const allSquare = 0; expect(allSquare, "distinct mapped tile in chosen block").toBeGreaterThanOrEqual(0);
    const allTile = d.tiles[allSquare]!; const allName = alternate(pn.get(allTile)!);
    expect(allTile).not.toBe(f.source); expect(f.square).toBe(5); d.palettes.unshift({square:allSquare, palName:allName, scope:"all"});
    const plan = planGbcBlockEdit(f.p, request(f.map, f.id, d), new Map(), new Map()); const slot = f.free[0]!;
    checkLocal(f, plan, slot, d);
    expect(plan.edits.map(e => e.path)).toEqual([f.ts.gfxPath, f.ts.metatilesPath, f.ts.palMapPath].map(canon).sort());
    const expectedPng = copySheetTile(bytes(f.p, f.ts.gfxPath), indexOf(f.source), indexOf(slot), f.ts.gfxPath);
    expect(pixels(edit(plan, f.ts.gfxPath).after)).toEqual(pixels(expectedPng));
    const expectedPal = patchGbcPaletteMap(patchGbcPaletteMap(palText, allTile, allName, f.ts.palMapPath), slot, f.pal, f.ts.palMapPath);
    expect(edit(plan, f.ts.palMapPath).after.toString()).toBe(expectedPal);
  }, timeout);
  itWithGbcCorpus("painted cell targets its staged block", () => {
    const p = proj(); const a = p.map("OlivinePortPassage"); const b = p.map("VermilionPortPassage"); expect(a.blkPath).toBe(b.blkPath);
    const first = [a.name,b.name].sort()[0]!; const second = [a.name,b.name].sort()[1]!;
    const grids: StagedGrids = new Map([[first, Array(a.width*a.height).fill(7) as number[]], [second, Array(a.width*a.height).fill(8) as number[]]]);
    expect(resolveGbcEditTarget(p, b.name, {x:0,y:0}, grids)).toEqual({blockId:7, viaBorder:false});
  }, timeout);
  itWithGbcCorpus("raw block 0 cell targets the border block", () => {
    const p = proj(); const map = p.maps.find(m => bytes(p, m.blkPath).subarray(0,m.width*m.height).some(id => id !== 0));
    expect(map, "a map with a nonzero disk cell").toBeDefined(); const raw = bytes(p, map!.blkPath); const i = raw.subarray(0,map!.width*map!.height).findIndex(id => id !== 0);
    const staged = Array(map!.width * map!.height).fill(3) as number[]; staged[i] = 0;
    expect(resolveGbcEditTarget(p, map!.name, {x:i % map!.width,y:Math.floor(i/map!.width)}, new Map([[map!.name, staged]]))).toEqual({blockId:map!.border, viaBorder:true});
    refusal(() => resolveGbcEditTarget(p, map!.name, {x:map!.width,y:0}, new Map()), "BAD_VALUE", [map!.name]);
  }, timeout);
  itWithGbcCorpus("staged bytes compose (two plans in a row)", () => {
    const {p, ts, map} = forest(); const d1 = draft(p,ts,1); d1.tiles[0] = d1.tiles[0] === 1 ? 2 : 1;
    const first = planGbcBlockEdit(p, request(map, 1, d1), new Map(), new Map()); const e1 = edit(first, ts.metatilesPath);
    const staged = new Map(first.edits.map(e => [e.path,e.after])); const d2 = draft(p,ts,2,staged); d2.tiles[0] = d2.tiles[0] === 1 ? 2 : 1;
    const second = planGbcBlockEdit(p, request(map, 2, d2), staged, new Map()); const e2 = edit(second, ts.metatilesPath);
    expect(e2.before).toEqual(e1.after); const expected = Buffer.from(e1.after); Buffer.from(d2.tiles).copy(expected, 32); expect(e2.after).toEqual(expected);
  }, timeout);
  itWithGbcCorpus("revision", () => {
    const {p,ts,map} = forest(); const paths = [ts.metatilesPath, ts.collisionPath, ts.palMapPath, ts.gfxPath].map(canon);
    const files = new Map(paths.map(path => [path,bytes(p,path)])); const grid = [...bytes(p,map.blkPath).subarray(0,map.width*map.height)];
    const expected = revisionOracle(files, grid);
    expect(blockEditRevision(files,grid)).toBe(expected); expect(blockEditRevision(new Map([...files].reverse()),grid)).toBe(expected);
    const modified = Buffer.from(files.get(paths[0]!)!); modified[0] = modified[0]! ^ 1; const files2 = new Map(files); files2.set(paths[0]!,modified);
    expect(blockEditRevision(files2,grid)).not.toBe(expected); const grid2 = [...grid]; grid2[0] = (grid2[0]! + 1) % 256; expect(blockEditRevision(files,grid2)).not.toBe(expected);
    const req = request(map,1,draft(p,ts,1)); const plan = planGbcBlockEdit(p,req,new Map(),new Map()); expect(plan.revision).toBe(expected);
    expect(planGbcBlockEdit(p,req,new Map([["unrelated/file",Buffer.from("x")]]),new Map()).revision).toBe(expected);
    expect(planGbcBlockEdit(p,req,files2,new Map()).revision).not.toBe(expected);
    expect(planGbcBlockEdit(p,req,new Map(),new Map([[map.name,grid2]])).revision).not.toBe(expected);
  }, timeout);
  itWithGbcCorpus("BAD_VALUE draft validation", () => {
    const {p,ts,map} = forest(); const d = draft(p,ts,1);
    for (const bad of [
      {...d, tiles:d.tiles.slice(0,15)},
      {...d, tiles:d.tiles.map((v,i) => i === 0 ? 1.5 : v)},
      {...d, collision:["WALL", "WALL", "WALL"] as unknown as GbcBlockDraft["collision"]},
      {...d, palettes:[{square:0,palName:"RED",scope:"bad" as "all"}]},
      {...d, palettes:[{square:0,palName:"MAGENTA",scope:"all" as const}]},
      {...d, palettes:[{square:16,palName:"RED",scope:"all" as const}]},
      {...d, tiles:d.tiles.map((v,i) => i === 0 ? 0x60 : v)},
    ]) refusal(() => planGbcBlockEdit(p,request(map,1,bad),new Map(),new Map()), "BAD_VALUE", []);
  }, timeout);
  itWithGbcCorpus("invalid targets and missing save placement refuse BAD_VALUE", () => {
    const {p,ts,map} = forest(); const d = draft(p,ts,1); const n = bytes(p,ts.metatilesPath).length/16;
    refusal(() => planGbcBlockEdit(p,request(map,n,d),new Map(),new Map()), "BAD_VALUE", []);
    refusal(() => planGbcBlockEdit(p,request(map,-1,d),new Map(),new Map()), "BAD_VALUE", []);
    refusal(() => planGbcBlockEdit(p,{...request(map,1,d,"saveAsNew","map"),cell:{x:map.width,y:0}},new Map(),new Map()), "BAD_VALUE", []);
    refusal(() => planGbcBlockEdit(p,request(map,1,d,"saveAsNew","map"),new Map(),new Map()), "BAD_VALUE", []);
  }, timeout);
  itWithGbcCorpus("palette no-op and conflicting entries", () => {
    const f = localFixture(); const d = draft(f.p, f.ts, f.id); const current = names(bytes(f.p, f.ts.palMapPath).toString()).get(f.source)!;
    d.palettes = [{square:f.square, palName:current, scope:"all"}];
    const noop = planGbcBlockEdit(f.p, request(f.map,f.id,d), new Map(), new Map());
    expect(noop.edits).toEqual([]); expect(noop.confirm).toBe(false);
    expect(planGbcBlockEdit(f.p, request(f.map,f.id,d,"saveAsNew"), new Map(), new Map()).newBlockId).toBe(bytes(f.p,f.ts.metatilesPath).length/16);
    d.palettes = [{square:f.square,palName:f.pal,scope:"all"},{square:f.square,palName:current,scope:"local"}];
    refusal(() => planGbcBlockEdit(f.p,request(f.map,f.id,d),new Map(),new Map()), "BAD_VALUE", []);
    d.palettes = [{square:f.square,palName:f.pal,scope:"all"},{square:f.square,palName:alternate(f.pal),scope:"all"}];
    refusal(() => planGbcBlockEdit(f.p,request(f.map,f.id,d),new Map(),new Map()), "BAD_VALUE", []);
  }, timeout);
  itWithGbcCorpus("unchanged garbage tile is retained", () => {
    const {p,ts,map} = forest(); const meta = Buffer.from(bytes(p,ts.metatilesPath)); meta[16] = 0x60;
    const staged = new Map([[canon(ts.metatilesPath),meta]]); const d = draft(p,ts,1,staged);
    d.tiles[1] = d.tiles[1] === 1 ? 2 : 1;
    const plan = planGbcBlockEdit(p,request(map,1,d),staged,new Map());
    const expected = Buffer.from(meta); Buffer.from(d.tiles).copy(expected,16);
    expect(edit(plan,ts.metatilesPath).after).toEqual(expected); expect(expected[16]).toBe(0x60);
  }, timeout);
  itWithGbcCorpus("same block staged bytes are the draft baseline", () => {
    const {p,ts,map} = forest(); const meta = Buffer.from(bytes(p,ts.metatilesPath));
    meta[16] = meta[16] === 1 ? 2 : 1; const staged = new Map([[canon(ts.metatilesPath),meta]]);
    const d = draft(p,ts,1,staged); d.tiles[1] = d.tiles[1] === 1 ? 2 : 1;
    const plan = planGbcBlockEdit(p,request(map,1,d),staged,new Map()); const out = edit(plan,ts.metatilesPath);
    expect(out.before).toEqual(meta); const expected = Buffer.from(meta); Buffer.from(d.tiles).copy(expected,16); expect(out.after).toEqual(expected);
  }, timeout);
  itWithGbcCorpus("effective palette and collision ignore divergent project overlay", () => {
    const base = forest(); const p = openGbcProject(GBC_SUBJECT_ROOT); const ts = p.tileset(base.ts.constName);
    const d = draft(p,ts,1); const originalPal = bytes(p,ts.palMapPath); const originalColl = bytes(p,ts.collisionPath);
    const palette = names(originalPal.toString()); const square = d.tiles.findIndex(t => palette.has(t)); expect(square).toBeGreaterThanOrEqual(0);
    const tile = d.tiles[square]!; const current = palette.get(tile)!;
    const projectPal = patchGbcPaletteMap(originalPal.toString(),tile,alternate(current),ts.palMapPath);
    const otherNames: GbcBlockDraft["collision"] = d.collision[0] === "WALL" ? ["FLOOR","FLOOR","FLOOR","FLOOR"] : ["WALL","WALL","WALL","WALL"];
    const projectColl = patchGbcCollision(originalColl.toString(),1,otherNames,ts.collisionPath);
    p.setTilesetOverlay(new Map([[canon(ts.palMapPath),Buffer.from(projectPal)],[canon(ts.collisionPath),Buffer.from(projectColl)]]));
    const staged = new Map([[canon(ts.palMapPath),originalPal],[canon(ts.collisionPath),originalColl]]);
    d.palettes = [{square,palName:current,scope:"all"}];
    const plan = planGbcBlockEdit(p,request(base.map,1,d),staged,new Map()); expect(plan.edits).toEqual([]);
  }, timeout);
  itWithGbcCorpus("shared-grid winner controls confirmation and revision per map", () => {
    const {p,ts,map} = forest(); const count = bytes(p,ts.metatilesPath).length/16;
    const id = Array.from({length:count},(_,i) => i).find(i => i > 0 && i !== map.border);
    expect(id, "valid non-border block for shared-grid confirmation").toBeDefined();
    const a = {...map,name:"Task6SharedA"}; const b = {...map,name:"Task6SharedB"};
    const fake: GbcProject = {...p,maps:[a,b],map:n => n === a.name ? a : n === b.name ? b : p.map(n)};
    const first = Array(map.width*map.height).fill(id) as number[]; const second = Array(map.width*map.height).fill(id === 1 ? 2 : 1) as number[];
    const grids = new Map([[b.name,second],[a.name,first]]); const d = changedDraft(p,ts,id!);
    const plan = planGbcBlockEdit(fake,request(a,id!,d),new Map(),grids); expect(plan.confirm).toBe(true);
    const files = new Map([ts.metatilesPath,ts.collisionPath,ts.palMapPath,ts.gfxPath].map(path => [canon(path),bytes(p,path)]));
    expect(plan.revision).toBe(revisionOracle(files,first));
    expect(plan.revision).not.toBe(revisionOracle(files,second));
  }, timeout);
  itWithGbcCorpus("refusal precedence follows validation, All, shared grid, cap, local", () => {
    const p = proj(); const map = p.map("OlivinePortPassage"); const ts = p.tileset(map.tileset); const d = draft(p,ts,1);
    const pn = names(bytes(p,ts.palMapPath).toString()); const sq = d.tiles.findIndex(t => pn.has(t)); expect(sq, "mapped tile in shared-grid block").toBeGreaterThanOrEqual(0);
    d.palettes = [{square:sq,palName:alternate(pn.get(d.tiles[sq]!)!),scope:"all"}];
    const capped = Buffer.alloc(256*16); Buffer.from(d.tiles).copy(capped,16); const staged = new Map([[canon(ts.metatilesPath),capped]]);
    const base = {...request(map,1,d,"saveAsNew","map"),cell:{x:0,y:0}};
    const bad = {...d,tiles:d.tiles.slice(0,15)};
    refusal(() => planGbcBlockEdit(p,{...base,draft:bad},staged,new Map()),"BAD_VALUE",[]);
    refusal(() => planGbcBlockEdit(p,base,staged,new Map()),"ALL_WITH_SAVE_AS_NEW",[]);
    d.palettes[0]!.scope = "local";
    refusal(() => planGbcBlockEdit(p,base,staged,new Map()),"SHARED_GRID",[map.name],map.name);
    const {map:unshared,ts:forestTs} = forest(); const fd = draft(p,forestTs,1); const palNames = names(bytes(p,forestTs.palMapPath).toString());
    const fi = fd.tiles.findIndex(t => palNames.has(t)); expect(fi).toBeGreaterThanOrEqual(0);
    fd.palettes = [{square:fi,palName:alternate(palNames.get(fd.tiles[fi]!)!),scope:"local"}];
    const full = Buffer.alloc(256*16); Buffer.from(fd.tiles).copy(full,16); const cap = new Map([[canon(forestTs.metatilesPath),full]]);
    refusal(() => planGbcBlockEdit(p,request(unshared,1,fd,"saveAsNew"),cap,new Map()),"BLOCK_CAP",[canon(forestTs.metatilesPath)],canon(forestTs.metatilesPath));
  }, timeout);
  itWithGbcCorpus("confirm is false when the draft changes nothing", () => {
    const {p,ts,map} = forest(); const plan = planGbcBlockEdit(p,request(map,1,draft(p,ts,1)),new Map(),new Map());
    expect(plan.edits).toEqual([]); expect(plan.confirm).toBe(false);
  }, timeout);
});

describe("confirmation per map", () => {
  function fixture() {
    const p = proj();
    for (const map of p.maps) {
      if (p.maps.filter(m => m.blkPath === map.blkPath).length !== 1) continue;
      const ts = p.tileset(map.tileset); const meta = bytes(p,ts.metatilesPath);
      const peers = p.maps.filter(m => canon(p.tileset(m.tileset).metatilesPath) === canon(ts.metatilesPath));
      const other = peers.find(m => m.name !== map.name && p.maps.filter(n => n.blkPath === m.blkPath).length === 1);
      if (!other) continue;
      const id = Array.from({length:meta.length/16},(_,i) => i).find(i => i !== 0 && peers.every(m => m.border !== i));
      if (id === undefined || other.border < 1 || other.border >= meta.length / 16 || other.border === map.border) continue;
      return {p,map,other,ts,peers,id,meta};
    }
    expect.fail("scan found no two unshared maps on one metatiles file with an available non-border block");
  }
  function gridsFor(p: GbcProject, excluded: number, use?: {map: GbcMap; id: number}): Map<string, number[]> {
    const filler = excluded === 1 ? 2 : 1;
    return new Map(p.maps.map(m => [m.name, Array(m.width*m.height).fill(m.name === use?.map.name ? use.id : filler) as number[]]));
  }
  itWithGbcCorpus("confirm true when another map draws the block in its interior", () => {
    const f = fixture(); const grids = gridsFor(f.p,f.id,{map:f.other,id:f.id}); const d = changedDraft(f.p,f.ts,f.id);
    expect(planGbcBlockEdit(f.p,request(f.map,f.id,d),new Map(),grids).confirm).toBe(true);
  }, timeout);
  itWithGbcCorpus("confirm true when another map only uses it as its border", () => {
    const f = fixture(); const id = f.other.border; const grids = gridsFor(f.p,id); const d = changedDraft(f.p,f.ts,id);
    expect(grids.get(f.other.name)!.includes(id)).toBe(false);
    expect(planGbcBlockEdit(f.p,request(f.map,id,d),new Map(),grids).confirm).toBe(true);
  }, timeout);
  itWithGbcCorpus("confirm false for same-map-only uses", () => {
    const f = fixture(); const grids = gridsFor(f.p,f.id,{map:f.map,id:f.id}); const d = changedDraft(f.p,f.ts,f.id);
    expect(planGbcBlockEdit(f.p,request(f.map,f.id,d),new Map(),grids).confirm).toBe(false);
  }, timeout);
  itWithGbcCorpus("confirm true for an All edit when another map draws a different block using the tile", () => {
    const f = fixture(); const palNames = names(bytes(f.p,f.ts.palMapPath).toString());
    let candidate: {id:number; otherId:number; square:number; tile:number} | undefined;
    for (let id=1; id<f.meta.length/16 && !candidate; id++) {
      if (f.peers.some(m => m.border === id)) continue;
      for (let square=0;square<16 && !candidate;square++) {
        const tile = f.meta[id*16+square]!; if (!palNames.has(tile)) continue;
        for (let otherId=1;otherId<f.meta.length/16;otherId++) if (otherId !== id && f.meta.subarray(otherId*16,otherId*16+16).includes(tile)) { candidate = {id,otherId,square,tile}; break; }
      }
    }
    expect(candidate, "two distinct blocks sharing a mapped tile and non-border source block").toBeDefined();
    const c = candidate!; const d = draft(f.p,f.ts,c.id); d.palettes = [{square:c.square,palName:alternate(palNames.get(c.tile)!),scope:"all"}];
    const grids = gridsFor(f.p,c.id,{map:f.other,id:c.otherId});
    expect(planGbcBlockEdit(f.p,request(f.map,c.id,d),new Map(),grids).confirm).toBe(true);
  }, timeout);
});
