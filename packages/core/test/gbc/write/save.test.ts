import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { commitGbcSave, openGbcEditSession, planGbcSave } from "../../../src/gbc/write/save.js";
import { locateEventCall, spliceArg } from "../../../src/gbc/write/asmSplice.js";
import { loadGbcMapEvents, parseMapEvents } from "../../../src/gbc/load/events.js";
import { openGbcProject } from "../../../src/gbc/project.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../helpers/corpus.js";
import { cleanupFixtures, makeFixture, type Fixture } from "../helpers/saveFixture.js";

afterEach(cleanupFixtures);

describe("openGbcEditSession", () => {
  it("1. blocks/originalBlocks are equal in value but fully independent of each other and of layout.blocks", () => {
    const f = makeFixture();
    const s = openGbcEditSession(f.proj, "Testmap");
    expect(s.blocks).toEqual([{ metatileId: 1 }, { metatileId: 2 }, { metatileId: 3 }, { metatileId: 4 }]);
    expect(s.originalBlocks).toEqual(s.blocks);
    expect(s.originalBlocks).not.toBe(s.blocks);
    expect(s.originalBlocks[0]).not.toBe(s.blocks[0]);
    for (const arr of [s.blocks, s.originalBlocks]) {
      expect(arr).not.toBe(s.layout.blocks);
      expect(arr[0]).not.toBe(s.layout.blocks[0]);
    }
    s.blocks[0]!.metatileId = 99;
    expect(s.originalBlocks[0]!.metatileId).toBe(1);
    expect(s.layout.blocks[0]!.metatileId).toBe(1);
    // The fixture parses as designed (2 objects, 2 consts), and the two parses are independent.
    expect(s.events.objects).toHaveLength(2);
    expect(s.events.objectConsts).toHaveLength(2);
    expect(s.events).not.toBe(s.originalEvents);
    expect(s.events).toEqual(s.originalEvents);
    expect(s.eventsText).toBe(s.originalEventsText);
    expect(s.isDirty).toBe(false);
  });

  it("2. layoutSharedBy lists every same-blkPath map, this one included, in proj.maps order", () => {
    const f = makeFixture({ shared: true });
    expect(openGbcEditSession(f.proj, "Testmap").layoutSharedBy).toEqual(["Zed", "Testmap"]);
  });

  it("3. an unknown map name throws", () => {
    const f = makeFixture();
    expect(() => openGbcEditSession(f.proj, "Nope")).toThrow(/unknown map/);
  });
});


/** Pins both files' mtime to a fixed past instant, so any later write (even of
 *  identical bytes) is visible as an mtime change. */
function pinMtimes(f: Fixture): () => { blk: number; asm: number } {
  const past = new Date("2001-01-01T00:00:00Z");
  utimesSync(f.blk, past, past);
  utimesSync(f.asm, past, past);
  return () => ({ blk: statSync(f.blk).mtimeMs, asm: statSync(f.asm).mtimeMs });
}

const bytes = (p: string) => [...readFileSync(p)];

describe("planGbcSave / commitGbcSave", () => {
  it("4. an unedited session plans nothing, and commit writes nothing (mtime proves it)", () => {
    const f = makeFixture();
    const stamp = pinMtimes(f);
    const before = stamp();
    const plan = planGbcSave(f.proj, openGbcEditSession(f.proj, "Testmap"));
    expect(plan.changes).toEqual([]);
    expect(plan.refusals).toEqual([]);
    commitGbcSave(f.proj, plan);
    expect(stamp()).toEqual(before);
  });

  it("5. painting one block plans one binary change and patches exactly that byte; asm untouched", () => {
    const f = makeFixture();
    const stamp = pinMtimes(f);
    const asmBefore = readFileSync(f.asm);
    const before = stamp();
    const s = openGbcEditSession(f.proj, "Testmap");
    s.blocks[2]!.metatileId = 0;
    const plan = planGbcSave(f.proj, s);
    expect(plan.refusals).toEqual([]);
    expect(plan.changes).toEqual([
      { path: `${f.tmp}/maps/TestLayout.blk`, kind: "binary", summary: "maps/TestLayout.blk -- 1 block changed" },
    ]);
    commitGbcSave(f.proj, plan);
    expect(bytes(f.blk)).toEqual([1, 2, 0, 4]);
    expect(readFileSync(f.asm).equals(asmBefore)).toBe(true);
    expect(stamp().asm).toBe(before.asm);
    // The write went to the layout's blkPath, not a path derived from the map name.
    expect(existsSync(`${f.tmp}/maps/Testmap.blk`)).toBe(false);
  });

  it("6. a layout shared by several maps says so in the summary, and pluralises", () => {
    const f = makeFixture({ shared: true });
    const s = openGbcEditSession(f.proj, "Testmap");
    s.blocks[0]!.metatileId = 0;
    s.blocks[1]!.metatileId = 0;
    expect(planGbcSave(f.proj, s).changes[0]!.summary).toBe("maps/TestLayout.blk -- 2 blocks changed (shared by 2 maps)");
  });

  it("7. G2: an oversized layout stays editable and preserves all three tail bytes", () => {
    const f = makeFixture({ blk: [1, 2, 3, 4, 77, 88, 99] });
    const s = openGbcEditSession(f.proj, "Testmap");
    expect(s.blocks).toEqual([{ metatileId: 1 }, { metatileId: 2 }, { metatileId: 3 }, { metatileId: 4 }]);
    s.blocks[0]!.metatileId = 3;
    const plan = planGbcSave(f.proj, s);
    expect(plan.refusals).toEqual([]);
    commitGbcSave(f.proj, plan);
    expect(bytes(f.blk)).toEqual([3, 2, 3, 4, 77, 88, 99]);
  });

  it("keeps a tail changed on disk before planning", () => {
    const f = makeFixture({ blk: [1, 2, 3, 4, 77, 88, 99] });
    const s = openGbcEditSession(f.proj, "Testmap");
    s.blocks[1]!.metatileId = 0;
    writeFileSync(f.blk, Buffer.from([1, 2, 3, 4, 101, 102, 103]));
    const plan = planGbcSave(f.proj, s);
    expect(plan.refusals).toEqual([]);
    commitGbcSave(f.proj, plan);
    expect(bytes(f.blk)).toEqual([1, 0, 3, 4, 101, 102, 103]);
  });

  it("8. a text change plans one text change; commit writes eventsText byte for byte; blk untouched", () => {
    const f = makeFixture();
    const stamp = pinMtimes(f);
    const blkBefore = readFileSync(f.blk);
    const before = stamp();
    const s = openGbcEditSession(f.proj, "Testmap");
    s.eventsText = spliceArg(s.eventsText, locateEventCall(s.eventsText, "Testmap", "object_event", 1), 0, "3");
    s.events = parseMapEvents(s.eventsText, "Testmap");
    expect(s.eventsText).toContain("object_event  3,");
    const plan = planGbcSave(f.proj, s);
    expect(plan.refusals).toEqual([]);
    expect(plan.changes).toEqual([
      { path: `${f.tmp}/maps/Testmap.asm`, kind: "text", summary: "maps/Testmap.asm -- event block edited" },
    ]);
    commitGbcSave(f.proj, plan);
    expect(readFileSync(f.asm, "utf8")).toBe(s.eventsText);
    expect(readFileSync(f.blk).equals(blkBefore)).toBe(true);
    expect(stamp().blk).toBe(before.blk);
  });

  it("9. a refused commit throws and leaves both files byte- and mtime-identical", () => {
    const f = makeFixture();
    const stamp = pinMtimes(f);
    const [blkBefore, asmBefore, before] = [readFileSync(f.blk), readFileSync(f.asm), stamp()];
    const s = openGbcEditSession(f.proj, "Testmap");
    s.blocks[0]!.metatileId = 9; // cap is 5 (valid ids 0-4)
    expect(() => commitGbcSave(f.proj, planGbcSave(f.proj, s))).toThrow(new Error("save refused: metatile-out-of-range (maps/TestLayout.blk)"));
    expect(readFileSync(f.blk).equals(blkBefore)).toBe(true);
    expect(readFileSync(f.asm).equals(asmBefore)).toBe(true);
    expect(stamp()).toEqual(before);
  });

  it("both files changed in one save: blocks first then text, every changed byte patched, asm written", () => {
    const f = makeFixture();
    const s = openGbcEditSession(f.proj, "Testmap");
    s.blocks[0]!.metatileId = 0;
    s.blocks[3]!.metatileId = 1;
    s.eventsText = spliceArg(s.eventsText, locateEventCall(s.eventsText, "Testmap", "object_event", 1), 0, "3");
    s.events = parseMapEvents(s.eventsText, "Testmap");
    const plan = planGbcSave(f.proj, s);
    expect(plan.refusals).toEqual([]);
    expect(plan.changes.map((c) => c.kind)).toEqual(["binary", "text"]);
    commitGbcSave(f.proj, plan);
    expect(bytes(f.blk)).toEqual([0, 2, 3, 1]);
    expect(readFileSync(f.asm, "utf8")).toBe(s.eventsText);
  });

  it("commit does not mutate the session", () => {
    const f = makeFixture();
    const s = openGbcEditSession(f.proj, "Testmap");
    s.blocks[0]!.metatileId = 0;
    s.eventsText = spliceArg(s.eventsText, locateEventCall(s.eventsText, "Testmap", "object_event", 1), 0, "3");
    s.events = parseMapEvents(s.eventsText, "Testmap");
    const plan = planGbcSave(f.proj, s);
    const snapshot = structuredClone(s);
    commitGbcSave(f.proj, plan);
    expect(s).toEqual(snapshot);
  });

  it("10. a stale plan cannot bypass the guard: commit re-checks the session's CURRENT state", () => {
    const f = makeFixture();
    const stamp = pinMtimes(f);
    const [blkBefore, before] = [readFileSync(f.blk), stamp()];
    const s = openGbcEditSession(f.proj, "Testmap");
    s.blocks[0]!.metatileId = 2;
    const plan = planGbcSave(f.proj, s);
    expect(plan.refusals).toEqual([]);
    s.blocks[1]!.metatileId = 9; // edit lands AFTER the plan was taken
    expect(() => commitGbcSave(f.proj, plan)).toThrow(/save refused/);
    expect(readFileSync(f.blk).equals(blkBefore)).toBe(true);
    expect(stamp()).toEqual(before);
  });
});

// Real corpus, READ-ONLY: none of these may ever call commitGbcSave.
describe("real corpus (read-only; never commits)", () => {
  itWithGbcCorpus("16. NewBarkTown: an unedited plan is empty, and events match loadGbcMapEvents", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const s = openGbcEditSession(proj, "NewBarkTown");
    const plan = planGbcSave(proj, s);
    expect(plan.changes).toEqual([]);
    expect(plan.refusals).toEqual([]);
    expect(s.isDirty).toBe(false);
    expect(s.events.objects.length).toBe(loadGbcMapEvents(proj.root, proj.map("NewBarkTown")).events.objects.length);
  });

  itWithGbcCorpus("17. House1.blk is shared by 50 maps (findings 3.6, re-measured)", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const sharer = proj.maps.find((m) => m.blkPath === "maps/House1.blk");
    expect(sharer).toBeDefined();
    expect(openGbcEditSession(proj, sharer!.name).layoutSharedBy).toHaveLength(50);
  });

  itWithGbcCorpus("18. CeruleanCave2F (oversize .blk): unedited is clean; an in-memory paint is allowed", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const s = openGbcEditSession(proj, "CeruleanCave2F");
    expect(s.layout).not.toHaveProperty("writable");
    const clean = planGbcSave(proj, s);
    expect(clean.changes).toEqual([]);
    expect(clean.refusals).toEqual([]);
    s.blocks[0] = { metatileId: s.blocks[0]!.metatileId + 1 };
    expect(planGbcSave(proj, s).refusals).toEqual([]);
    expect(planGbcSave(proj, s).changes).toEqual([{ path: `${proj.root}/maps/CeruleanCave2F.blk`, kind: "binary", summary: "maps/CeruleanCave2F.blk -- 1 block changed" }]);
    // Deliberately no commitGbcSave: the real corpus is never written.
  });
});
