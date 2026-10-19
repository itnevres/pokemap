import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdtempSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planSave, prepareSave, commitSave, type EditSession } from "../../src/write/save.js";
import { planFingerprint, type AtomicEntry, type AtomicIo } from "../../src/write/atomic.js";
import { encodeBlocks } from "../../src/load/blocks.js";
import { defaultProfile } from "../../src/config/engine.js";
import type { Block, Layout } from "../../src/model/types.js";
import { parseMap, type MapData } from "../../src/load/maps.js";
import type { Project } from "../../src/project.js";
import { stubProject, stubTileset } from "../helpers/stubProject.js";

const profile = defaultProfile("pokeemerald");
const LAYOUT: Layout = {
  id: "LAYOUT_TEST", name: "Test_Layout", width: 2, height: 2,
  borderWidth: 2, borderHeight: 2, primaryTileset: "x", secondaryTileset: "y",
  borderFilepath: "border.bin", blockdataFilepath: "map.bin",
};
const MAP_JSON = `{
  "id": "MAP_TEST",
  "name": "Test",
  "layout": "LAYOUT_TEST",
  "music": "MUS_ROUTE101",
  "region_map_section": "MAPSEC_TEST",
  "map_type": "MAP_TYPE_ROUTE",
  "weather": "WEATHER_NONE",
  "connections": 0,
  "object_events": [],
  "warp_events": [],
  "coord_events": [],
  "bg_events": []
}`;

const roots: string[] = [];
function tempProject(): { root: string; proj: Project } {
  const root = mkdtempSync(join(tmpdir(), "pokemap-save-"));
  roots.push(root);
  const blocks: Block[] = Array.from({ length: 4 }, () => ({ metatileId: 1, collision: 0, elevation: 3 }));
  const border: Block[] = Array.from({ length: 4 }, () => ({ metatileId: 0, collision: 0, elevation: 0 }));
  writeFileSync(join(root, "map.bin"), encodeBlocks(blocks, profile));
  writeFileSync(join(root, "border.bin"), encodeBlocks(border, profile));
  writeFileSync(join(root, "Test.json"), MAP_JSON);
  const proj = stubProject({
    paths: { root, mapJson: (name: string) => `${root}/${name}.json` } as Project["paths"],
    profile,
    constants: { metatilesTotal: 1024 } as Project["constants"],
    splitFor: () => ({ version: "emerald", tiles: 512, metatiles: 512, pals: 6 }),
    tileset: (symbol) => stubTileset(symbol, symbol === LAYOUT.secondaryTileset ? 100 : 512, symbol === LAYOUT.secondaryTileset),
  });
  return { root, proj };
}
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

function baseSession(): EditSession {
  const blocks: Block[] = Array.from({ length: 4 }, () => ({ metatileId: 1, collision: 0, elevation: 3 }));
  const border: Block[] = Array.from({ length: 4 }, () => ({ metatileId: 0, collision: 0, elevation: 0 }));
  // parseMap (not a raw JSON.parse) -- MapData's fields are camelCase
  // (warpEvents, objectEvents, ...), produced only by the real parser;
  // it also already coerces the decomp's `"connections": 0` idiom to `[]`.
  const map: MapData = parseMap(MAP_JSON);
  return {
    mapName: "Test", layout: LAYOUT, blocks, border, map,
    originalBlocks: structuredClone(blocks), originalMap: structuredClone(map),
    originalMapJson: MAP_JSON, jsonEdits: [], insertOps: [], removeOps: [], isDirty: false,
  };
}


// Fail only the final swap; assert prior files really reached their after bytes.
function failLastRename(entries: AtomicEntry[]): { io: AtomicIo; swaps: string[] } {
  const swaps: string[] = [];
  const io: AtomicIo = {
    existsSync, readFileSync, writeFileSync, unlinkSync,
    renameSync(from, to) {
      if (to === entries[entries.length - 1]!.path) {
        expect(swaps).toEqual(entries.slice(0, -1).map((e) => e.path));
        for (const entry of entries.slice(0, -1)) expect(readFileSync(entry.path)).toEqual(entry.after);
        throw new Error("injected final rename failure");
      }
      renameSync(from, to);
      swaps.push(to);
    },
  };
  return { io, swaps };
}

function changedFixture() {
  const { root, proj } = tempProject();
  const session = baseSession();
  session.blocks[0] = { ...session.blocks[0]!, metatileId: 5 };
  session.jsonEdits = [{ path: ["music"], value: "MUS_NEW" }];
  const script = join(root, "scripts.inc");
  writeFileSync(script, "Old:\r\n\tend\r\n");
  session.scriptAppends = [{ path: script, text: "New:\r\n\tend\r\n" }];
  return { root, proj, session, script };
}

describe("GBA prepared saves", () => {
  it("prepares and commits literal CRLF replace + ordered appends on one path", () => {
    const { root, proj } = tempProject();
    const session = baseSession();
    const path = join(root, "scripts.inc");
    const before = "Old:\r\n\tmsgbox Text\r\n\tend\r\n\r\nText:\r\n\t.string \"Pok\u00e9mon \u00a7$\"";
    writeFileSync(path, before);
    session.scriptReplaces = [{ path, before, after: before.replace("Old:", "Renamed:") }];
    session.scriptAppends = [
      { path, text: "First:\r\n\tend\r\n" },
      { path, text: "Second:\r\n\tend" },
    ];
    // Independently spelled out: no separator helper or serializer builds this oracle.
    const expected = Buffer.from("Renamed:\r\n\tmsgbox Text\r\n\tend\r\n\r\nText:\r\n\t.string \"Pok\u00e9mon \u00a7$\"\r\n\r\nFirst:\r\n\tend\r\n\r\nSecond:\r\n\tend", "utf8");
    const prepared = prepareSave(proj, session);
    expect(prepared).toEqual([{ path, before: Buffer.from(before, "utf8"), after: expected }]);
    expect(readFileSync(path)).toEqual(Buffer.from(before, "utf8"));
    expect(readdirSync(root).some((name) => name.includes(".pokemap-tmp-"))).toBe(false);
    const plan = planSave(proj, session);
    expect(plan.refusals).toEqual([]);
    commitSave(proj, plan, prepared);
    expect(readFileSync(path)).toEqual(expected);
  });

  it("restores blockdata + map.json when the final scripts.inc rename fails", () => {
    const { root, proj, session, script } = changedFixture();
    const plan = planSave(proj, session);
    expect(plan.refusals).toEqual([]);
    const entries = prepareSave(proj, session);
    expect(entries.map((e) => e.path)).toEqual([`${root}/map.bin`, `${root}/Test.json`, script]);
    expect(entries).toHaveLength(3);
    for (const entry of entries) expect(entry.after.equals(entry.before!)).toBe(false);
    const { io, swaps } = failLastRename(entries);
    expect(() => commitSave(proj, plan, entries, io)).toThrow("injected final rename failure");
    expect(swaps).toHaveLength(2);
    for (const entry of entries) expect(readFileSync(entry.path)).toEqual(entry.before);
    expect(readdirSync(root).filter((name) => name.includes(".pokemap-tmp-"))).toEqual([]);
  });

  it("creates a missing blockdata target on success", () => {
    const { root, proj, session } = changedFixture();
    const path = `${root}/map.bin`;
    unlinkSync(path);
    const entries = prepareSave(proj, session);
    expect(entries[0]).toEqual({ path, before: null, after: encodeBlocks(session.blocks, profile) });
    expect(existsSync(path)).toBe(false);
    const plan = planSave(proj, session);
    expect(plan.refusals).toEqual([]);
    commitSave(proj, plan, entries);
    expect(readFileSync(path)).toEqual(encodeBlocks(session.blocks, profile));
  });

  it("removes newly created blockdata on a later rename failure", () => {
    const { root, proj, session } = changedFixture();
    const path = `${root}/map.bin`;
    unlinkSync(path);
    const entries = prepareSave(proj, session);
    expect(entries[0]!.before).toBeNull();
    const plan = planSave(proj, session);
    expect(plan.refusals).toEqual([]);
    const { io, swaps } = failLastRename(entries);
    expect(() => commitSave(proj, plan, entries, io)).toThrow("injected final rename failure");
    expect(swaps).toHaveLength(2);
    expect(existsSync(path)).toBe(false);
    for (const entry of entries.slice(1)) expect(readFileSync(entry.path)).toEqual(entry.before);
    expect(readdirSync(root).filter((name) => name.includes(".pokemap-tmp-"))).toEqual([]);
  });

  it("fingerprints the same non-empty session and disk deterministically without writes", () => {
    const { proj, session } = changedFixture();
    const original = structuredClone(session);
    const first = prepareSave(proj, session);
    const second = prepareSave(proj, session);
    expect(first).toHaveLength(3);
    const fingerprint = planFingerprint(first);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(planFingerprint(second)).toBe(fingerprint);
    expect(session).toEqual(original);
    for (const entry of first) expect(readFileSync(entry.path)).toEqual(entry.before);
  });

  it("fingerprints an outside byte change even when planned map.json output stays identical", () => {
    const { root, proj, session } = changedFixture();
    const first = prepareSave(proj, session);
    const path = `${root}/Test.json`;
    const disk = readFileSync(path);
    disk[disk.indexOf(Buffer.from("MUS_ROUTE101"))] = "X".charCodeAt(0);
    writeFileSync(path, disk);
    const second = prepareSave(proj, session);
    expect(second.find((e) => e.path === path)!.after).toEqual(first.find((e) => e.path === path)!.after);
    expect(planFingerprint(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(planFingerprint(second)).not.toBe(planFingerprint(first));
  });

  it("commits exactly prepared buffers despite subsequent session edits", () => {
    const { proj, session } = changedFixture();
    const plan = planSave(proj, session);
    const entries = prepareSave(proj, session);
    session.jsonEdits = [{ path: ["music"], value: "MUS_LATER" }];
    commitSave(proj, plan, entries);
    for (const entry of entries) expect(readFileSync(entry.path)).toEqual(entry.after);
  });

  it("refuses a target changed after prepare before swapping any file", () => {
    const { root, proj, session } = changedFixture();
    const plan = planSave(proj, session);
    const entries = prepareSave(proj, session);
    const path = `${root}/Test.json`;
    const external = Buffer.concat([readFileSync(path), Buffer.from("\n")]);
    writeFileSync(path, external);
    expect(() => commitSave(proj, plan, entries)).toThrow("changed on disk since the save was previewed");
    expect(readFileSync(path)).toEqual(external);
    for (const entry of entries.filter((e) => e.path !== path)) expect(readFileSync(entry.path)).toEqual(entry.before);
    expect(readdirSync(root).filter((name) => name.includes(".pokemap-tmp-"))).toEqual([]);
  });

  it("keeps the fresh refusal gate ahead of preparation and supplied entries", () => {
    const { proj, session } = changedFixture();
    const plan = planSave(proj, session);
    const entries = prepareSave(proj, session);
    session.blocks[0]!.metatileId = 999;
    session.scriptAppends = [{ path: "missing-script.inc", text: "unused" }];
    expect(() => commitSave(proj, plan)).toThrow("save refused");
    expect(() => commitSave(proj, plan, entries)).toThrow("save refused");
    for (const entry of entries) expect(readFileSync(entry.path)).toEqual(entry.before);
  });
});
