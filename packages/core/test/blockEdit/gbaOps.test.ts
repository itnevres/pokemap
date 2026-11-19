import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openProject, type Project } from "../../src/project.js";
import { BlockEditRefusal, type FileOverlay, type StagedGrids } from "../../src/blockEdit/types.js";
import { gbaCrossHalfWarnings, planGbaBlockEdit, type GbaBlockDraft, type GbaBlockEditRequest } from "../../src/blockEdit/gbaOps.js";
import type { TileEntry } from "../../src/load/tilesetData.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";
import { makeGbaFixture } from "./gbaFixture.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });
function fixture(triple = false): Project { const root = makeGbaFixture(triple); roots.push(root); return openProject(root); }
const empty = new Map<string, Buffer>();
const noGrids = new Map<string, readonly number[]>();
function draft(p: Project, symbol = "gTileset_A", local = 1): GbaBlockDraft {
  const t = p.tileset(symbol); return { entries: t.metatile(local), behavior: t.behavior(local), layerType: t.layerType(local) };
}
function request(p: Project, map = "Emerald", id = 1, symbol = "gTileset_A", local = 1): GbaBlockEditRequest {
  return { map, metatileId: id, mode: "ok", from: "map", cell: { x: 1, y: 0 }, draft: draft(p, symbol, local) };
}
function bytes(p: Project, path: string): Buffer { return readFileSync(join(p.paths.root, path)); }
function encode(entries: readonly TileEntry[]): Buffer {
  const out = Buffer.alloc(16); entries.forEach((e, i) => out.writeUInt16LE(e.tile | (e.xFlip ? 0x400 : 0) | (e.yFlip ? 0x800 : 0) | (e.palette << 12), i * 2)); return out;
}
function refusal(fn: () => unknown, code: string): BlockEditRefusal {
  try { fn(); } catch (e) { expect(e).toBeInstanceOf(BlockEditRefusal); expect((e as BlockEditRefusal).code).toBe(code); return e as BlockEditRefusal; }
  throw new Error(`expected ${code}`);
}
function revision(p: Project, symbol: string, ids: readonly number[], staged: FileOverlay = empty): string {
  const paths = p.tilesetPaths(symbol); const hash = createHash("sha1");
  for (const path of [paths.metatilesBin, paths.attributesBin].sort()) { const b = staged.get(path) ?? bytes(p, path); hash.update(path).update("\0").update(String(b.length)).update("\0").update(b); }
  return hash.update("grid\0").update(String(ids.length)).update("\0").update(ids.join(",")).digest("hex");
}
function plan(p: Project, r: GbaBlockEditRequest, staged: FileOverlay = empty, grids: StagedGrids = noGrids) { return planGbaBlockEdit(p, r, staged, grids); }
function changed(r: GbaBlockEditRequest) { r.draft.entries[7] = { ...r.draft.entries[7]!, xFlip: true }; return r; }
/** The text from `id` up to the next layout id, so a source cannot be borrowed from another layout. */
function segment(message: string, id: string, ids: readonly string[]): string {
  const at = message.search(new RegExp(`\\b${id}\\b`));
  expect(at).toBeGreaterThanOrEqual(0);
  const later = ids.map(other => message.search(new RegExp(`\\b${other}\\b`))).filter(pos => pos > at);
  return message.slice(at, later.length === 0 ? undefined : Math.min(...later));
}

describe("GBA block edit planner", () => {
  it("OK edits entry N and attribute word N only", () => {
    const p = fixture(), r = changed(request(p)); r.draft.behavior = 0x34; r.draft.layerType = 2;
    const paths = p.tilesetPaths("gTileset_A"), beforeM = bytes(p, paths.metatilesBin), beforeA = bytes(p, paths.attributesBin);
    const out = plan(p, r); expect(out.edits.map(e => e.path)).toEqual([paths.attributesBin, paths.metatilesBin].sort());
    const m = Buffer.from(beforeM); encode(r.draft.entries).copy(m, 16);
    const a = Buffer.from(beforeA); a.writeUInt16LE(0x2a34, 2);
    for (const [path, before, after] of [[paths.metatilesBin, beforeM, m], [paths.attributesBin, beforeA, a]] as const) {
      expect(out.edits.find(e => e.path === path)).toEqual({ path, before, after }); expect(bytes(p, path)).toEqual(before);
    }
    expect(out.newBlockId).toBeUndefined(); expect(out.placement).toBeUndefined();
    expect(plan(p, request(p)).edits).toEqual([]);
  });
  it("primary edit allowed; usage counts every paired layout", () => {
    const p = fixture(), out = plan(p, changed(request(p))); const paths = p.tilesetPaths("gTileset_A");
    // Count the raw fixture words independently, once per grid and border file.
    const maps = [["Emerald", "E"], ["Extra", "X"], ["Frlg", "F"], ["SharedA", "H"]] as const;
    const count = (path: string) => { const b = bytes(p, path); let n = 0; for (let i = 0; i < b.length; i += 2) if ((b.readUInt16LE(i) & 0x3ff) === 1) n++; return n; };
    expect(out.usage).toEqual({ files: [paths.metatilesBin, paths.attributesBin].sort(), tilesets: ["gTileset_A"], maps: maps.map(([map, id]) => ({ map, interior: count(`data/layouts/${id}/map.bin`), border: count(`data/layouts/${id}/border.bin`), block0AsBorder: 0 })), sharedGrids: [{ file: "data/layouts/H/map.bin", maps: ["SharedA", "SharedB"] }] });
    expect(out.confirm).toBe(true);
  });
  it.each([["Emerald", 8], ["Frlg", 12]] as const)("saveAsNew appends at the file-local index; map-visible id = split.metatiles + index for a secondary, under each split (%s)", (map, split) => {
    const p = fixture(), r = request(p, map, split + 1, "gTileset_S"); r.mode = "saveAsNew"; r.cell = { x: 0, y: 1 };
    const paths = p.tilesetPaths("gTileset_S"), before = bytes(p, paths.metatilesBin), out = plan(p, r);
    expect(out.newBlockId).toBe(split + 3); expect(out.placement).toEqual({ x: 0, y: 1, blockId: split + 3 });
    expect(out.edits.find(e => e.path === paths.metatilesBin)?.after).toEqual(Buffer.concat([before, encode(r.draft.entries)])); expect(bytes(p, paths.metatilesBin)).toEqual(before);
  });
  it.each([["Emerald", 8], ["Frlg", 12]] as const)("saveAsNew keeps the cell's collision and elevation (%s)", (map, split) => {
    const p = fixture(), r = request(p, map, split + 1, "gTileset_S"); r.mode = "saveAsNew"; r.cell = { x: 0, y: 1 }; r.draft.behavior = 0x45; r.draft.layerType = 3;
    const gridPath = p.layoutForMap(map).blockdataFilepath, grid = bytes(p, gridPath); expect(grid.readUInt16LE(4) & 0xfc00).toBe(0x5800); expect(grid.readUInt16LE(4) & 0x3ff).toBe(r.metatileId);
    const path = p.tilesetPaths("gTileset_S").attributesBin, before = bytes(p, path), out = plan(p, r), after = out.edits.find(e => e.path === path)!.after;
    expect(before.readUInt16LE(2)).toBe(0x0a12); expect(after.subarray(0, before.length)).toEqual(before); expect(after.readUInt16LE(before.length)).toBe(0x3a45);
    expect(Object.keys(out.placement!).sort()).toEqual(["blockId", "x", "y"]); expect(out.placement).toEqual({ x: 0, y: 1, blockId: split + 3 }); expect(bytes(p, gridPath)).toEqual(grid); expect(bytes(p, path)).toEqual(before);
  });
  for (const cell of [{ x: 2, y: 0 }, { x: 0, y: 2 }]) {
    it(`saveAsNew from the map refuses a cell outside the layout: ${cell.x},${cell.y}`, () => {
      const p = fixture(), r = request(p, "Emerald");
      r.mode = "saveAsNew";
      r.cell = cell;
      const e = refusal(() => plan(p, r), "BAD_VALUE");
      expect(e.message.startsWith("Emerald")).toBe(true);
    });
  }
  it("saveAsNew from palette appends only", () => {
    const p = fixture(), r = request(p);
    r.mode = "saveAsNew";
    r.from = "palette";
    delete r.cell;
    const out = plan(p, r);
    expect(out.newBlockId).toBe(4);
    expect(out.placement).toBeUndefined();
    expect(out.confirm).toBe(false);
    expect(out.edits).toHaveLength(2);
  });
  it("saveAsNew from the palette on a shared grid plans a new block without SHARED_GRID", () => {
    const p = fixture(), r = request(p, "SharedA");
    r.mode = "saveAsNew";
    r.from = "palette";
    delete r.cell;
    const out = plan(p, r);
    expect(out.newBlockId).toBe(4);
    expect(out.placement).toBeUndefined();
    expect(out.confirm).toBe(false);
    expect(out.edits).toHaveLength(2);
  });
  it("saveAsNew on the shared grid refuses SHARED_GRID", () => { const p = fixture(), r = request(p, "SharedB"); r.mode = "saveAsNew"; const e = refusal(() => plan(p, r), "SHARED_GRID"); expect(e.message.startsWith("SharedB")).toBe(true); expect(e.message).toMatch(/SharedA.*SharedB/); });
  it("append limit refuses SPLIT_LIMIT under the tighter split", () => {
    const p = fixture(), r = request(p, "Emerald", 9, "gTileset_S");
    r.mode = "saveAsNew";
    const paths = p.tilesetPaths("gTileset_S");
    const m = Buffer.alloc(20 * 16), a = Buffer.alloc(20 * 2);
    bytes(p, paths.metatilesBin).copy(m);
    bytes(p, paths.attributesBin).copy(a);
    const e = refusal(() => plan(p, r, new Map([[paths.metatilesBin, m], [paths.attributesBin, a]])), "SPLIT_LIMIT");
    expect(e.message.startsWith(paths.metatilesBin)).toBe(true);
    expect(e.message).toMatch(/\bF\b/);
    expect(e.message).toContain("20 metatiles");
  });
  it("append limit names S's metatiles file, layout F and its 20-metatile limit", () => {
    const p = fixture(), r = request(p, "Emerald", 9, "gTileset_S");
    r.mode = "saveAsNew";
    r.cell = { x: 0, y: 1 };
    const paths = p.tilesetPaths("gTileset_S");
    const m = Buffer.alloc(21 * 16), a = Buffer.alloc(21 * 2);
    bytes(p, paths.metatilesBin).copy(m);
    bytes(p, paths.attributesBin).copy(a);
    const e = refusal(() => plan(p, r, new Map([[paths.metatilesBin, m], [paths.attributesBin, a]])), "SPLIT_LIMIT");
    expect(e.message.startsWith(paths.metatilesBin)).toBe(true);
    expect(e.message).toMatch(/\bF\b/);
    expect(e.message).toContain("20 metatiles");
    // The staged count is 21, so a message that only echoed the count cannot satisfy the limit.
    expect(e.message).toContain("cannot append metatile 21");
    expect(e.message).toContain("layout F (secondary) allows 20 metatiles; cannot append metatile 21");
  });
  it("append limit for a primary names A's metatiles file, layout E and its 8-metatile limit", () => {
    const p = fixture(), r = request(p, "Frlg");
    r.mode = "saveAsNew";
    r.cell = { x: 0, y: 0 };
    const paths = p.tilesetPaths("gTileset_A");
    const m = Buffer.alloc(9 * 16), a = Buffer.alloc(9 * 2);
    bytes(p, paths.metatilesBin).copy(m);
    bytes(p, paths.attributesBin).copy(a);
    const e = refusal(() => plan(p, r, new Map([[paths.metatilesBin, m], [paths.attributesBin, a]])), "SPLIT_LIMIT");
    expect(e.message.startsWith(paths.metatilesBin)).toBe(true);
    expect(e.message).toMatch(/\bE\b/);
    expect(e.message).toContain("8 metatiles");
    expect(e.message).toContain("cannot append metatile 9");
    expect(e.message).toContain("layout E (primary) allows 8 metatiles; cannot append metatile 9");
  });
  it.each([["tile", 25], ["palette", 6], ["palette", 13]] as const)("structural refusal: changed %s %i", (field, value) => {
    const p = fixture(), r = request(p); r.draft.entries[0] = { ...r.draft.entries[0]!, [field]: value };
    const e = refusal(() => plan(p, r), "SPLIT_LIMIT"); expect(e.message.startsWith("gTileset_A")).toBe(true); expect(e.message).toMatch(/\bE\b/);
  });
  it("structural check uses every consuming layout: tile 25 from F is invalid in E", () => {
    const p = fixture(), r = request(p, "Frlg");
    // F's split tiles are 12, so 25 - 12 = 13 is a valid F-local tile, but E's split is 8 and S has 16 tiles.
    r.draft.entries[0] = { ...r.draft.entries[0]!, tile: 25 };
    const e = refusal(() => plan(p, r), "SPLIT_LIMIT");
    expect(e.message.startsWith("gTileset_A")).toBe(true);
    expect(e.message).toMatch(/\bE\b/);
  });
  it("structural check uses every consuming layout: palette 5 from X is invalid in E", () => {
    const p = fixture(), r = request(p, "Extra");
    // T has 13 palettes and passes in X, but E resolves palette 5 in S, which has only 5.
    r.draft.entries[0] = { ...r.draft.entries[0]!, palette: 5 };
    const e = refusal(() => plan(p, r), "SPLIT_LIMIT");
    expect(e.message.startsWith("gTileset_A")).toBe(true);
    expect(e.message).toMatch(/\bE\b/);
  });
  it("structural check accepts tile 20 from every consuming layout", () => {
    const p = fixture(), r = request(p, "Emerald");
    // E: 20 - 8 = 12 < 16, F: 20 - 12 = 8 < 16, H/X: 20 - 8 = 12 < 16 (T).
    r.draft.entries[0] = { ...r.draft.entries[0]!, tile: 20 };
    const out = plan(p, r);
    expect(out.edits.length).toBeGreaterThan(0);
  });
  const crossHalfCases: {
    name: string; symbol: string; map: string; id: number; local: number;
    fields: Partial<TileEntry>; kind: string; pairs: readonly (readonly [string, string])[];
  }[] = [
    {
      name: "primary secondary-range tile", symbol: "gTileset_A", map: "Emerald", id: 1, local: 1,
      fields: { tile: 8 }, kind: "tile",
      // A tile above 8 is in S under E, but still primary A under F, and in T under H/X.
      pairs: [["E", "gTileset_S"], ["F", "gTileset_A"], ["H", "gTileset_T"], ["X", "gTileset_T"]],
    },
    {
      name: "primary secondary-range palette only", symbol: "gTileset_A", map: "Emerald", id: 1, local: 1,
      fields: { palette: 2 }, kind: "palette",
      pairs: [["E", "gTileset_S"], ["F", "gTileset_A"], ["H", "gTileset_T"], ["X", "gTileset_T"]],
    },
    {
      name: "secondary primary-range tile", symbol: "gTileset_S", map: "Emerald", id: 9, local: 1,
      fields: { tile: 0 }, kind: "tile",
      // Tile 0 is primary A under E/F and primary B under O.
      pairs: [["E", "gTileset_A"], ["F", "gTileset_A"], ["O", "gTileset_B"]],
    },
  ];
  for (const c of crossHalfCases) {
    it(`cross-half warnings: ${c.name}`, () => {
      const p = fixture(), r = request(p, c.map, c.id, c.symbol, c.local);
      const original = r.draft.entries.map(e => ({ ...e }));
      r.draft.entries[0] = { ...r.draft.entries[0]!, ...c.fields } as TileEntry;
      const direct = gbaCrossHalfWarnings(p, c.symbol, r.draft, original), warnings = plan(p, r).warnings;
      expect(warnings).toEqual(direct);
      const relevant = warnings.filter(w => new RegExp(`\\b${c.kind}\\b`, "i").test(w));
      expect(relevant).toHaveLength(1);
      const message = relevant[0]!;
      expect(message).toMatch(/\b0\b/);
      expect(new Set(warnings).size).toBe(warnings.length);
      const ids = c.pairs.map(([id]) => id);
      for (const [id, source] of c.pairs) {
        expect(segment(message, id, ids)).toContain(source);
      }
    });
  }
  it("cross-half warnings: no warning when every source is identical", () => { const p = fixture(), r = request(p), original = r.draft.entries.map(e => ({ ...e })); r.draft.entries[0] = { ...r.draft.entries[0]!, tile: 3 }; expect(gbaCrossHalfWarnings(p, "gTileset_A", r.draft, original)).toEqual([]); expect(plan(p, r).warnings).toEqual([]); });
  it("existing palette 13-15 / cross-half entries untouched keep their bytes and warn nothing", () => { const p = fixture(), r = changed(request(p, "Emerald", 2, "gTileset_A", 2)), path = p.tilesetPaths("gTileset_A").metatilesBin, before = bytes(p, path), out = plan(p, r); expect(out.warnings).toEqual([]); expect(out.edits.find(e => e.path === path)!.after.subarray(32, 38)).toEqual(before.subarray(32, 38)); });
  it("triple-layer project refuses TRIPLE_LAYER", () => { const p = fixture(true), r = request(p); r.draft.entries = []; const e = refusal(() => plan(p, r), "TRIPLE_LAYER"); expect(e.message.startsWith(p.paths.porymapCfg)).toBe(true); });
  it.each(["7 entries", "tile 1024", "palette 16", "behavior mask", "past count", "missing cell", "flip type"])("BAD_VALUE: %s", which => {
    const p = fixture(), r = request(p);
    if (which === "7 entries") r.draft.entries.pop(); if (which === "tile 1024") r.draft.entries[0]!.tile = 1024; if (which === "palette 16") r.draft.entries[0]!.palette = 16;
    if (which === "behavior mask") r.draft.behavior = 256; if (which === "past count") r.metatileId = 4; if (which === "missing cell") { r.mode = "saveAsNew"; delete r.cell; } if (which === "flip type") (r.draft.entries[0] as unknown as { xFlip: number }).xFlip = 1;
    refusal(() => plan(p, r), "BAD_VALUE");
  });
  it("check order: invalid draft precedes shared grid, shared grid precedes append limit", () => { const p = fixture(), r = request(p, "SharedA"); r.mode = "saveAsNew"; r.draft.entries.pop(); refusal(() => plan(p, r), "BAD_VALUE"); r.draft = draft(p); const paths = p.tilesetPaths("gTileset_A"), staged = new Map([[paths.metatilesBin, Buffer.alloc(8 * 16)], [paths.attributesBin, Buffer.alloc(8 * 2)]]); refusal(() => plan(p, r, staged), "SHARED_GRID"); });
  it("revision equals independent R9 oracle and changes with staged bytes or grid", () => {
    const p = fixture(), r = request(p), ids = [1, 1, 9, 0], base = plan(p, r); expect(base.revision).toBe(revision(p, "gTileset_A", ids));
    const path = p.tilesetPaths("gTileset_A").attributesBin, b = Buffer.from(bytes(p, path)); b[0] = b[0]! ^ 1; const staged = new Map([[path, b]]);
    expect(plan(p, r, staged).revision).toBe(revision(p, "gTileset_A", ids, staged)); expect(plan(p, r, staged).revision).not.toBe(base.revision);
    const grids = new Map([["Emerald", [0, 1, 9, 0]]]); expect(plan(p, r, empty, grids).revision).toBe(revision(p, "gTileset_A", [0, 1, 9, 0])); expect(plan(p, r, empty, grids).revision).not.toBe(base.revision);
    const shared = request(p, "SharedB"); const both = new Map([["SharedB", [0, 0]], ["SharedA", [1, 0]]]); expect(plan(p, shared, empty, both).revision).toBe(revision(p, "gTileset_A", [1, 0]));
  });
  it("staged bytes compose (two plans in a row)", () => {
    const p = fixture(), first = changed(request(p)); first.draft.behavior = 0x33; const one = plan(p, first), overlay = new Map(one.edits.map(e => [e.path, e.after]));
    const second = request(p); second.draft.entries = first.draft.entries.map(e => ({ ...e })); second.draft.behavior = 0x44;
    const two = plan(p, second, overlay), paths = p.tilesetPaths("gTileset_A"); expect(two.edits.map(e => e.path)).toEqual([paths.attributesBin]); expect(two.edits[0]!.before).toEqual(overlay.get(paths.attributesBin)); expect(two.edits[0]!.before.readUInt16LE(2)).toBe(0x0a33); expect(two.edits[0]!.after.readUInt16LE(2)).toBe(0x0a44); expect(bytes(p, paths.attributesBin).readUInt16LE(2)).toBe(0x0a12); expect(two.revision).toBe(revision(p, "gTileset_A", [1, 1, 9, 0], overlay)); expect(bytes(p, paths.metatilesBin)).not.toEqual(overlay.get(paths.metatilesBin));
  });
});

itWithCorpus.each(["emerald", "frlg"] as const)("subject smoke: unchanged General block under %s split", version => {
  const p = openProject(SUBJECT_ROOT); const map = p.mapNames().find(name => { const l = p.layoutForMap(name); return l.primaryTileset === "gTileset_General" && p.splitFor(l).version === version; });
  expect(map).toBeDefined(); const r = request(p, map!, 0, "gTileset_General", 0), out = plan(p, r); expect(out.edits).toEqual([]); expect(out.revision).toMatch(/^[0-9a-f]{40}$/); expect(out.usage.tilesets).toEqual(["gTileset_General"]);
});

it("staged original determines changed entries and unchanged edits", () => {
  const p = fixture(), path = p.tilesetPaths("gTileset_A").metatilesBin, stagedBytes = Buffer.from(bytes(p, path));
  stagedBytes.writeUInt16LE(0xd009, 16); const staged = new Map([[path, stagedBytes]]), r = request(p);
  r.draft.entries[0] = { tile: 9, xFlip: false, yFlip: false, palette: 13 };
  const out = plan(p, r, staged); expect(out.edits).toEqual([]); expect(out.warnings).toEqual([]); expect(out.confirm).toBe(false);
});

it("shared grid uses the alphabetically first staged map for usage and confirmation", () => {
  const p = fixture(), r = changed(request(p, "Emerald"));
  const grids = new Map([["SharedB", [1, 1, 1]], ["SharedA", [0, 0, 0]], ["Frlg", [0]], ["Extra", [0]]]);
  const out = plan(p, r, empty, grids); const shared = out.usage.maps.find(m => m.map === "SharedA");
  expect(shared?.interior).toBe(0); expect(shared?.border).toBe(1);
  expect(out.usage.sharedGrids).toContainEqual({ file: "data/layouts/H/map.bin", maps: ["SharedA", "SharedB"] });
  // A local 1's target id 1 is also every border's cell, so use local 2 for the
  // case where only the R3 winner can confirm.
  const r2 = changed(request(p, "Emerald", 2, "gTileset_A", 2));
  const both = new Map([["SharedA", [0, 0, 0]], ["SharedB", [2, 0, 0]], ["Frlg", [0]], ["Extra", [0]]]);
  expect(plan(p, r2, empty, both).confirm).toBe(false);
  const onlyB = new Map([["SharedB", [2, 0, 0]], ["Frlg", [0]], ["Extra", [0]]]);
  expect(plan(p, r2, empty, onlyB).confirm).toBe(true);
});

it("cross-half warnings distinguish different local tiles within the same source tileset", () => {
  const p = fixture(), r = request(p, "Emerald", 9, "gTileset_S"), original = r.draft.entries.map(e => ({ ...e }));
  r.draft.entries[0] = { ...r.draft.entries[0]!, tile: 12, palette: 4 };
  const warnings = gbaCrossHalfWarnings(p, "gTileset_S", r.draft, original);
  expect(plan(p, r).warnings).toEqual(warnings); expect(warnings.join(" ").toLowerCase()).toContain("tile");
  for (const id of ["E", "F", "O"]) expect(warnings.join(" ")).toMatch(new RegExp(`\\b${id}\\b`)); expect(warnings).toHaveLength(1); expect(warnings[0]).toContain("gTileset_S");
});

it("confirmation follows other maps' effective grids and borders", () => {
  const p = fixture(), r = changed(request(p));
  for (const id of ["F", "X", "H"]) writeFileSync(join(p.paths.root, `data/layouts/${id}/border.bin`), Buffer.alloc(8));
  const grids = new Map([["Frlg", [0]], ["Extra", [0]], ["SharedA", [0]]]);
  expect(plan(p, r, empty, grids).confirm).toBe(false);
  const border = Buffer.alloc(8); border.writeUInt16LE(1); writeFileSync(join(p.paths.root, "data/layouts/F/border.bin"), border);
  expect(plan(p, r, empty, grids).confirm).toBe(true);
});

it("planner staged bytes override the project's separate overlay", () => {
  const p = fixture(), paths = p.tilesetPaths("gTileset_A"), disk = bytes(p, paths.metatilesBin);
  const projectBytes = Buffer.from(disk); projectBytes.writeUInt16LE(0xd009, 16); p.setTilesetOverlay(new Map([[paths.metatilesBin, projectBytes]]));
  const r = request(p); r.draft.entries[0] = { tile: 1, xFlip: false, yFlip: false, palette: 0 };
  expect(plan(p, r).edits).toEqual([]); expect(plan(p, r).warnings).toEqual([]);
  const stagedBytes = Buffer.from(disk); stagedBytes.writeUInt16LE(0xe00a, 16);
  r.draft.entries[0] = { tile: 10, xFlip: false, yFlip: false, palette: 14 };
  expect(plan(p, r, new Map([[paths.metatilesBin, stagedBytes]])).edits).toEqual([]);
  expect(bytes(p, paths.metatilesBin)).toEqual(disk);
});

it("append limit precedes structural refusal and applies to every primary split", () => {
  const p = fixture(), r = request(p, "Frlg");
  r.mode = "saveAsNew";
  r.draft.entries[0] = { ...r.draft.entries[0]!, tile: 25 };
  const paths = p.tilesetPaths("gTileset_A"), m = Buffer.alloc(8 * 16), a = Buffer.alloc(8 * 2);
  bytes(p, paths.metatilesBin).copy(m); bytes(p, paths.attributesBin).copy(a);
  const e = refusal(() => plan(p, r, new Map([[paths.metatilesBin, m], [paths.attributesBin, a]])), "SPLIT_LIMIT");
  expect(e.message.startsWith(paths.metatilesBin)).toBe(true);
  expect(e.message).toMatch(/\bE\b/);
  expect(e.message).toContain("8 metatiles");
});

it.each([["Emerald", 8], ["Frlg", 12]] as const)("unchanged S local 0 at the primary/secondary boundary is a valid secondary block (%s)", (map, split) => {
  const p = fixture(), out = plan(p, request(p, map, split, "gTileset_S", 0));
  expect(out.edits).toEqual([]);
  expect(out.usage.tilesets).toEqual(["gTileset_S"]);
});

it("a failed tileset read is BAD_VALUE naming the path", () => {
  const p = fixture(), r = request(p), path = p.tilesetPaths("gTileset_A").attributesBin;
  rmSync(join(p.paths.root, path));
  const e = refusal(() => plan(p, r), "BAD_VALUE");
  expect(e.message.startsWith(path)).toBe(true);
});

it("an unknown map is a BAD_VALUE naming the map", () => {
  const p = fixture();
  const e = refusal(() => plan(p, request(p, "Nope")), "BAD_VALUE");
  expect(e.message.startsWith("Nope")).toBe(true);
});

it("a failed border read inside usage is a BAD_VALUE naming the map", () => {
  const p = fixture(), r = request(p, "Emerald", 9, "gTileset_S", 1);
  r.mode = "saveAsNew";
  r.from = "palette";
  delete r.cell;
  rmSync(join(p.paths.root, "data/layouts/O/border.bin"));
  const e = refusal(() => plan(p, r), "BAD_VALUE");
  expect(e.message.startsWith("Emerald")).toBe(true);
});

it("BAD_VALUE: a null draft entry", () => {
  const p = fixture(), r = request(p);
  r.draft.entries[0] = null as unknown as TileEntry;
  // The explicit shape check names the metatiles file; the R1b wrapper alone would name the map.
  const e = refusal(() => plan(p, r), "BAD_VALUE");
  expect(e.message.startsWith(p.tilesetPaths("gTileset_A").metatilesBin)).toBe(true);
});

it("BAD_VALUE: behavior missing", () => {
  const p = fixture(), r = request(p);
  r.draft.behavior = undefined as unknown as number;
  const e = refusal(() => plan(p, r), "BAD_VALUE");
  expect(e.message.startsWith(p.tilesetPaths("gTileset_A").attributesBin)).toBe(true);
});

it("BAD_VALUE: layerType missing", () => {
  const p = fixture(), r = request(p);
  r.draft.layerType = undefined as unknown as number;
  const e = refusal(() => plan(p, r), "BAD_VALUE");
  expect(e.message.startsWith(p.tilesetPaths("gTileset_A").attributesBin)).toBe(true);
});

it.each([["ok", false], ["saveAsNew", true]] as const)("BAD_VALUE: one surplus attribute word (%s)", (_mode, saveAsNew) => {
  const p = fixture(), r = request(p, "Emerald");
  if (saveAsNew) r.mode = "saveAsNew";
  const path = p.tilesetPaths("gTileset_A").attributesBin;
  const staged = new Map([[path, Buffer.concat([bytes(p, path), Buffer.alloc(2)])]]);
  const e = refusal(() => plan(p, r, staged), "BAD_VALUE");
  expect(e.message.startsWith(path)).toBe(true);
  expect(e.message).toContain("5 attribute words for 4 metatiles");
});

it("BAD_VALUE: attributes.bin that is not a whole number of words names the byte count", () => {
  const p = fixture(), r = request(p, "Emerald");
  const path = p.tilesetPaths("gTileset_A").attributesBin;
  const staged = new Map([[path, Buffer.concat([bytes(p, path), Buffer.alloc(1)])]]);
  const e = refusal(() => plan(p, r, staged), "BAD_VALUE");
  expect(e.message.startsWith(path)).toBe(true);
  expect(e.message).toContain("9 bytes is not a whole number of 2-byte attribute words");
});

it("palette 13 is refused even when every consuming secondary holds 16 palettes (NUM_PALS_TOTAL)", () => {
  // T has 16 palettes and is consumed only by X and H (Emerald split: 8 metatiles, 2 palettes),
  // so palettes[13] exists in every consumer and only the NUM_PALS_TOTAL bound refuses it.
  const p = fixture(), r = request(p, "Extra", 8, "gTileset_T", 0);
  r.draft.entries[0] = { ...r.draft.entries[0]!, palette: 13 };
  const e = refusal(() => plan(p, r), "SPLIT_LIMIT");
  expect(e.message.startsWith("gTileset_T")).toBe(true);
  expect(e.message).toContain("palette 13 is invalid");
});

it.each([["ok", false], ["saveAsNew", true]] as const)("BAD_VALUE: one attribute word short (%s)", (_mode, saveAsNew) => {
  const p = fixture(), r = request(p, "Emerald");
  if (saveAsNew) r.mode = "saveAsNew";
  const path = p.tilesetPaths("gTileset_A").attributesBin;
  const staged = new Map([[path, bytes(p, path).subarray(0, 6)]]);
  const e = refusal(() => plan(p, r, staged), "BAD_VALUE");
  expect(e.message.startsWith(path)).toBe(true);
  expect(e.message).toContain("3 attribute words for 4 metatiles");
});

it("confirmation for a secondary-role edit uses each layout's own target id", () => {
  const p = fixture(), r = changed(request(p, "Emerald", 9, "gTileset_S", 1));
  // S local 1 is id 9 under E/O and id 13 under F. Only F's staged grid draws 13.
  const withFrlg = new Map([["Frlg", [13]], ["Other", [0]]]);
  expect(plan(p, r, empty, withFrlg).confirm).toBe(true);
  const withoutFrlg = new Map([["Frlg", [0]], ["Other", [0]]]);
  expect(plan(p, r, empty, withoutFrlg).confirm).toBe(false);
});

it("usage for a secondary block counts each layout's map-visible id", () => {
  const p = fixture(), out = plan(p, request(p, "Emerald", 9, "gTileset_S", 1));
  const paths = p.tilesetPaths("gTileset_S");
  const count = (path: string, target: number) => {
    const b = bytes(p, path);
    let n = 0;
    for (let i = 0; i < b.length; i += 2) if ((b.readUInt16LE(i) & 0x3ff) === target) n++;
    return n;
  };
  const use = (map: string, layout: string, target: number) => ({
    map,
    interior: count(`data/layouts/${layout}/map.bin`, target),
    border: count(`data/layouts/${layout}/border.bin`, target),
    block0AsBorder: 0,
  });
  expect(out.usage).toEqual({
    files: [paths.metatilesBin, paths.attributesBin].sort(),
    tilesets: ["gTileset_S"],
    maps: [use("Emerald", "E", 9), use("Frlg", "F", 13), use("Other", "O", 9)],
    sharedGrids: [],
  });
});

it.each([["Emerald", 8], ["Frlg", 12]] as const)("BAD_VALUE: secondary index exactly equals effective count (%s)", (map, split) => {
  const p = fixture(), r = request(p, map, split + 3, "gTileset_S", 1);
  refusal(() => plan(p, r), "BAD_VALUE");
});

it.each([["Emerald", 8], ["Frlg", 12]] as const)("staged extension makes its new local index a valid source (%s)", (map, split) => {
  const p = fixture(), paths = p.tilesetPaths("gTileset_S");
  const entries: TileEntry[] = Array.from({ length: 8 }, () => ({ tile: 2, palette: 0, xFlip: false, yFlip: false }));
  const word = Buffer.alloc(2); word.writeUInt16LE(0x0b22);
  const staged = new Map([[paths.metatilesBin, Buffer.concat([bytes(p, paths.metatilesBin), encode(entries)])], [paths.attributesBin, Buffer.concat([bytes(p, paths.attributesBin), word])]]);
  const r = request(p, map, split + 3, "gTileset_S", 1); r.draft = { entries, behavior: 0x22, layerType: 0 };
  expect(plan(p, r, staged).edits).toEqual([]);
});

describe("E1 file-keyed consumers", () => {
  function aliasFixture(): Project {
    const root = makeGbaFixture(false, true); roots.push(root); return openProject(root);
  }
  function diskIds(p: Project, path: string): number[] {
    const raw = readFileSync(join(p.paths.root, path));
    return Array.from({ length: raw.length / 2 }, (_, i) => raw.readUInt16LE(i * 2) & 0x3ff);
  }
  function draws(p: Project, map: string, local: number): boolean {
    const layout = p.layoutForMap(map);
    return diskIds(p, layout.blockdataFilepath).includes(local) || diskIds(p, layout.borderFilepath).includes(local);
  }

  it("E1.3: an OK edit through A confirms when only the A2 map draws its local id", () => {
    const p = aliasFixture(), local = 3;
    expect(draws(p, "AliasTwo", local)).toBe(true);
    for (const map of ["Emerald", "Frlg", "Extra", "SharedA", "SharedB", "AliasThree"]) expect(draws(p, map, local)).toBe(false);
    const out = plan(p, changed(request(p, "Emerald", local, "gTileset_A", local)));
    expect(out.edits.length).toBeGreaterThan(0);
    // Red today: usedElsewhere excludes the A2 consumer when editing through A.
    expect(out.confirm).toBe(true);
  });

  it("E1.3: an OK edit through A2 confirms when only A's maps draw its local id", () => {
    const p = aliasFixture(), local = 1;
    expect(draws(p, "Emerald", local)).toBe(true);
    expect(draws(p, "AliasTwo", local)).toBe(false); expect(draws(p, "AliasThree", local)).toBe(false);
    const out = plan(p, changed(request(p, "AliasTwo", local, "gTileset_A2", local)));
    expect(out.edits.length).toBeGreaterThan(0);
    // Red today: the A2 symbol has no other map, so A's consumers cannot confirm.
    expect(out.confirm).toBe(true);
  });

  it("E1.4: append through A2 respects A's tighter primary split", () => {
    const p = aliasFixture(), r = request(p, "AliasTwo", 1, "gTileset_A2", 1);
    r.mode = "saveAsNew";
    const paths = p.tilesetPaths("gTileset_A"), count = 8;
    expect(p.splitFor(p.layoutForMap("AliasTwo")).metatiles).toBeGreaterThan(count);
    expect(p.splitFor(p.layoutForMap("Emerald")).metatiles).toBe(count);
    const metatiles = Buffer.alloc(count * 16), attributes = Buffer.alloc(count * 2);
    bytes(p, paths.metatilesBin).copy(metatiles); bytes(p, paths.attributesBin).copy(attributes);
    const staged: FileOverlay = new Map([[paths.metatilesBin, metatiles], [paths.attributesBin, attributes]]);
    // Red today: append checks only J's 12-entry split, omitting A's 8-entry layouts.
    const e = refusal(() => plan(p, r, staged), "SPLIT_LIMIT");
    expect(e.message.startsWith(paths.metatilesBin)).toBe(true);
    expect(e.message).toContain("layout E (primary) allows 8 metatiles; cannot append metatile 8");
  });

  it("E1.5: structural validation reads A2's own shorter primary tile sheet", () => {
    const p = aliasFixture(), r = request(p);
    // Tile 9 is S/T-local 1 in E/H/X and A-local 9 in F, all within 16 tiles.
    // J's FRLG split keeps 9 primary, beyond A2's disk PNG width 64 = 8 tiles.
    for (const id of ["E", "F", "H", "X", "J"]) {
      const layout = p.layoutById(id)!;
      const symbol = 9 < p.splitFor(layout).tiles ? layout.primaryTileset : layout.secondaryTileset;
      const tile = 9 < p.splitFor(layout).tiles ? 9 : 9 - p.splitFor(layout).tiles;
      const png = bytes(p, p.tilesetPaths(symbol).tilesPng);
      const count = (png.readUInt32BE(16) / 8) * (png.readUInt32BE(20) / 8);
      expect(tile < count).toBe(id !== "J");
    }
    r.draft.entries[0] = { ...r.draft.entries[0]!, tile: 9 };
    // Red today: structural uses omit J (and substituting edited A for A2 would also pass).
    const e = refusal(() => plan(p, r), "SPLIT_LIMIT");
    expect(e.message).toContain("tile 9 is invalid in layout J");
  });

  it("E1.6: cross-half warnings include the alias layout's own primary data", () => {
    const p = aliasFixture(), original = draft(p).entries.map(entry => ({ ...entry })), edited = draft(p);
    edited.entries[0] = { ...edited.entries[0]!, tile: 3 };
    // Below every split: A's own E/F/H/X all resolve A[3], hence no warning alone.
    const plain = fixture(), plainDraft = draft(plain);
    plainDraft.entries[0] = { ...plainDraft.entries[0]!, tile: 3 };
    expect(gbaCrossHalfWarnings(plain, "gTileset_A", plainDraft, draft(plain).entries)).toEqual([]);
    expect(bytes(p, p.tilesetPaths("gTileset_A2").tilesPng)).not.toEqual(bytes(p, p.tilesetPaths("gTileset_A").tilesPng));
    const warnings = gbaCrossHalfWarnings(p, "gTileset_A", edited, original);
    // Red today: J is omitted; replacing its own A2 half with edited A would hide the difference.
    expect(warnings.filter(message => /\btile\b/.test(message))).toHaveLength(1);
    expect(warnings.join(" ")).toContain("J -> gTileset_A2[3]");
  });

  it("E1c: an alias in the secondary slot resolves secondary-range tiles from the layout's own secondary", () => {
    // Layout M = primary gTileset_A, secondary gTileset_A2 (emerald: split.tiles 8), so tile 9 is A2-local 1 in
    // both of M's uses. Taking the secondary half from the edited symbol would print "M -> gTileset_A[1]".
    const p = aliasFixture(), original = draft(p).entries.map(entry => ({ ...entry })), edited = draft(p);
    edited.entries[0] = { ...edited.entries[0]!, tile: 9 };
    const tile = gbaCrossHalfWarnings(p, "gTileset_A", edited, original).filter(message => /\btile\b/.test(message)).join(" ");
    expect(tile).toContain("M -> gTileset_A2[1]");
    expect(tile).not.toContain("M -> gTileset_A[1]");
  });
});
