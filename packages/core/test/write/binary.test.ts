import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planBlockdataWrite, planBorderWrite } from "../../src/write/binary.js";
import { encodeBlocks, parseBlocks } from "../../src/load/blocks.js";
import { defaultProfile } from "../../src/config/engine.js";
import { openProject } from "../../src/project.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";
import type { Block, Layout } from "../../src/model/types.js";

const profile = defaultProfile("pokeemerald");

const roots: string[] = [];
const tempRoot = () => { const r = mkdtempSync(join(tmpdir(), "pokemap-bin-")); roots.push(r); return r; };
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

function makeLayout(root: string, blockdataFilepath: string): Layout {
  return {
    id: "LAYOUT_TEST", name: "Test_Layout", width: 4, height: 3,
    borderWidth: 2, borderHeight: 2, primaryTileset: "x", secondaryTileset: "y",
    borderFilepath: "border.bin", blockdataFilepath,
  };
}

describe("planBlockdataWrite", () => {
  it("returns null when nothing changed", () => {
    const root = tempRoot();
    const blocks: Block[] = Array.from({ length: 12 }, (_, i) => ({ metatileId: i, collision: 0, elevation: 3 }));
    writeFileSync(join(root, "map.bin"), encodeBlocks(blocks, profile));
    const plan = planBlockdataWrite(root, makeLayout(root, "map.bin"), blocks, profile);
    expect(plan).toBeNull();
  });

  it("one changed block produces a write whose changedBlocks is [index] and whose bytes differ by exactly 2 bytes", () => {
    const root = tempRoot();
    const original: Block[] = Array.from({ length: 12 }, (_, i) => ({ metatileId: i, collision: 0, elevation: 3 }));
    writeFileSync(join(root, "map.bin"), encodeBlocks(original, profile));
    const edited = original.map((b, i) => (i === 5 ? { ...b, metatileId: 999 & profile.blockMetatileIdMask } : b));
    const plan = planBlockdataWrite(root, makeLayout(root, "map.bin"), edited, profile);
    expect(plan).not.toBeNull();
    expect(plan!.changedBlocks).toEqual([5]);
    const onDisk = readFileSync(join(root, "map.bin"));
    let diffBytes = 0;
    for (let i = 0; i < onDisk.length; i++) if (onDisk[i] !== plan!.bytes[i]) diffBytes++;
    expect(diffBytes).toBe(2);
  });

  it("round-trips: encoding what parseBlocks read back from disk is always null, including a 19-block-longer trailing-block layout", () => {
    const root = tempRoot();
    // 13 blocks on a 4x3=12 layout -- the exact "one extra block past
    // declared dimensions" shape this project's own corpus carries on 19
    // real layouts (Plan 1 Task 11's own measurement).
    const blocks: Block[] = Array.from({ length: 13 }, (_, i) => ({ metatileId: i, collision: 0, elevation: 3 }));
    writeFileSync(join(root, "map.bin"), encodeBlocks(blocks, profile));
    const plan = planBlockdataWrite(root, makeLayout(root, "map.bin"), blocks, profile);
    expect(plan).toBeNull();
  });

  it("editing one block in a trailing-block layout writes a file the SAME length as the original, not two bytes shorter", () => {
    const root = tempRoot();
    const original: Block[] = Array.from({ length: 13 }, (_, i) => ({ metatileId: i, collision: 0, elevation: 3 }));
    writeFileSync(join(root, "map.bin"), encodeBlocks(original, profile));
    // Edit block 0 only -- if planBlockdataWrite ever reconstructed length
    // from layout.width*layout.height (12) instead of encoding the WHOLE
    // Block[] it was handed (13, including the trailing one), this drops
    // the last 2 bytes silently and the I5 gate fails on exactly the 19
    // layouts with this shape, for a reason nobody would guess from the diff.
    const edited = original.map((b, i) => (i === 0 ? { ...b, metatileId: 5 } : b));
    const plan = planBlockdataWrite(root, makeLayout(root, "map.bin"), edited, profile);
    expect(plan).not.toBeNull();
    expect(plan!.bytes.length).toBe(readFileSync(join(root, "map.bin")).length);
  });

  it("refuses (throws) rather than silently writing when a block value does not fit its mask -- delegates to encodeBlocks's own refusal", () => {
    const root = tempRoot();
    writeFileSync(join(root, "map.bin"), encodeBlocks([{ metatileId: 0, collision: 0, elevation: 0 }], profile));
    const bad: Block[] = [{ metatileId: 0, collision: 7, elevation: 0 }]; // collision is 2 bits (mask 0xC00, max 3)
    expect(() => planBlockdataWrite(root, makeLayout(root, "map.bin"), bad, profile)).toThrow(/collision/);
  });

  itWithCorpus("round-trips every one of the 1,020 real layouts in the subject corpus, including all 19 trailing-block ones", () => {
    const proj = openProject(SUBJECT_ROOT);
    let trailingBlockLayouts = 0;
    for (const layout of proj.layouts) {
      const blocks = parseBlocks(readFileSync(`${SUBJECT_ROOT}/${layout.blockdataFilepath}`), proj.profile);
      if (blocks.length !== layout.width * layout.height) trailingBlockLayouts++;
      const plan = planBlockdataWrite(SUBJECT_ROOT, layout, blocks, proj.profile);
      expect(plan, layout.name).toBeNull();
    }
    // Pinned exactly, not just ">0" -- Plan 1 Task 11's own measurement.
    // If this number has moved, the corpus itself changed (the user's own
    // concurrent Porymap work) -- re-measure before assuming this task
    // regressed; do not just update the pin to whatever a first run prints.
    expect(trailingBlockLayouts).toBe(19);
  }, 300_000);
});

describe("planBorderWrite", () => {
  it("returns null when nothing changed", () => {
    const root = tempRoot();
    const border: Block[] = Array.from({ length: 4 }, (_, i) => ({ metatileId: i, collision: 0, elevation: 3 }));
    writeFileSync(join(root, "border.bin"), encodeBlocks(border, profile));
    const plan = planBorderWrite(root, makeLayout(root, "map.bin"), border, profile);
    expect(plan).toBeNull();
  });

  it("one changed block produces a write whose changedBlocks is [index] and whose bytes differ by exactly 2 bytes", () => {
    const root = tempRoot();
    const original: Block[] = Array.from({ length: 4 }, (_, i) => ({ metatileId: i, collision: 0, elevation: 3 }));
    writeFileSync(join(root, "border.bin"), encodeBlocks(original, profile));
    const edited = original.map((b, i) => (i === 1 ? { ...b, metatileId: 999 & profile.blockMetatileIdMask } : b));
    const plan = planBorderWrite(root, makeLayout(root, "map.bin"), edited, profile);
    expect(plan).not.toBeNull();
    expect(plan!.changedBlocks).toEqual([1]);
    const onDisk = readFileSync(join(root, "border.bin"));
    let diffBytes = 0;
    for (let i = 0; i < onDisk.length; i++) if (onDisk[i] !== plan!.bytes[i]) diffBytes++;
    expect(diffBytes).toBe(2);
  });
});
