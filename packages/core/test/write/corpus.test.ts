import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { editJson, insertArrayElement, removeArrayElement } from "../../src/write/jsonEdit.js";
import { projectPaths } from "../../src/config/paths.js";
import { parseMapGroups, parseMap } from "../../src/load/maps.js";
import { parseBlocks, encodeBlocks } from "../../src/load/blocks.js";
import { parseLayouts, resolveSplit } from "../../src/load/layouts.js";
import { engineProfile, defaultProfile, parseCfg, type EngineProfile } from "../../src/config/engine.js";
import { parseFieldmapConstants } from "../../src/config/fieldmap.js";
import { paintCells } from "../../src/edit/paint.js";
import { planSave, commitSave, type EditSession } from "../../src/write/save.js";
import type { Project } from "../../src/project.js";
import { stubProject, stubTileset } from "../helpers/stubProject.js";

const cfg = JSON.parse(readFileSync("pokemap.config.json", "utf8")) as {
  projectPath: string; referenceProjects: string[];
};
const roots = [cfg.projectPath, ...cfg.referenceProjects].filter((r) => existsSync(`${r}/data/layouts/layouts.json`));

// This is the JSON identity gate, not the project loader. It needs map names
// and file paths -- nothing about tilesets, palettes or metatiles -- so it is
// built directly on projectPaths + parseMapGroups rather than openProject.
// openProject eagerly parses tileset paths (src/data/tilesets/headers.h at a
// fixed modern-decomp location), and that coupling used to be the only reason
// pokeclassic -- a structurally older fork with no src/data/tilesets/
// directory at all, and no porymap.project.cfg to redirect -- sat outside
// invariant I5, the invariant Plan 0 section 6 names as the thing no plan may
// merge without. Verified directly: pokeclassic has everything this gate
// actually needs (data/maps/map_groups.json with a group_order key, 779
// map.json, data/layouts/layouts.json), so with the tileset dependency gone
// all six configured engines participate below -- no trip wire needed for a
// gap that no longer exists.
function mapNamesOf(root: string): string[] {
  const paths = projectPaths(root);
  return parseMapGroups(readFileSync(paths.mapGroupsJson, "utf8")).allMapNames();
}

// Mirrors project.ts's own profile resolution (existsSync(porymapCfg) ?
// engineProfile(...) : defaultProfile(...)) closely enough for this gate's
// purpose -- it needs the block/metatile-attribute bit layout only, not
// project.ts's further fieldmap-constant merge, which this file's own
// header comment already explains this gate deliberately avoids depending
// on (the same reason it does not call openProject).
function profileOf(root: string): EngineProfile {
  const paths = projectPaths(root);
  return existsSync(paths.porymapCfg)
    ? engineProfile(parseCfg(readFileSync(paths.porymapCfg, "utf8")))
    : defaultProfile("pokeemerald");
}

/**
 * A Project stub built from real, on-disk data wherever that data is
 * reachable without the tileset-path resolution openProject depends on
 * (this file's own header comment explains why pokeclassic rules that out).
 * `profile`/`paths`/`constants`/`splitFor` are all real -- constants comes
 * straight off the real fieldmap.h every one of the six engines actually
 * has (confirmed directly: unlike src/data/tilesets/, pokeclassic does ship
 * include/fieldmap.h), so guardLayoutSave's missing-layout-version and
 * idOutOfRange's own `proj.constants.metatilesTotal` ceiling term are both
 * real per-engine values, not invented ones.
 *
 * `tileset()` is the one deliberately permissive member: idOutOfRange's
 * per-tileset primary/secondary metatileCount terms would need the exact
 * headers.h-driven path resolution this gate exists to avoid (pokeclassic
 * has no src/data/tilesets/headers.h at all -- an older, asm-based fork).
 * That sub-check already has its own dedicated, hand-derived-fixture
 * coverage in guards.test.ts ("the whole thesis of the project... expressed
 * as an assertion"), so this stub bounds both counts at the block format's
 * own id ceiling (blockMetatileIdMask + 1) -- always large enough that a
 * real committed id, or that id +/-1, never trips the primary-vs-secondary
 * split by construction -- while `constants.metatilesTotal` (real) still
 * bounds the overall ceiling idOutOfRange computes. Every OTHER guard path
 * this funnel test can reach (missing-layout-version, border-size-mismatch,
 * warp-tile-moved) is exercised against fully real data.
 */
function projFor(root: string): Project {
  const paths = projectPaths(root);
  const profile = profileOf(root);
  const constants = parseFieldmapConstants(readFileSync(paths.fieldmapH, "utf8"));
  return stubProject({
    paths, profile, constants,
    splitFor: (l) => resolveSplit(l, constants),
    tileset: () => stubTileset("stub", profile.blockMetatileIdMask + 1),
  });
}

// Real single-map collisions with OTHER test files -- in a different
// package in every case here -- that either pin exact byte/field values
// read off the SAME real file the funnel test's "first resolvable map"
// selection would otherwise deterministically choose, or themselves commit
// a real write to it. Same hazard the project already hit and fixed twice
// in Task 18 (writeCommands.test.ts's Route33->Route37, Route34->Route38,
// commit 5de00c0) -- vitest's default parallel-file execution makes two
// independent test files touching the same real path a genuine reader/
// writer race, not a theoretical one. Scoped to the subject root only:
// these are Johto/GSC map names unique to this romhack's own tree, so the
// set is a structural no-op against every reference root's own "first
// resolvable" pick (e.g. PetalburgCity), which is confirmed collision-free
// separately (no reference-root test reads or writes a reference-root
// map.bin by name).
//   - NewBarkTown: pinned byte-for-byte in packages/core/test/load/
//     blocks.test.ts ("reads NewBarkTown's real map.bin").
//   - CherrygroveCity, VioletCity, GoldenrodCity: real paint/commit writes
//     in packages/server/test/paintRoutes.test.ts.
//   - EcruteakCity, OlivineCity, BlackthornCity: real paint/commit writes
//     in packages/server/test/saveRoutes.test.ts.
const EXCLUDED_TARGET_NAMES = new Set([
  "NewBarkTown", "CherrygroveCity", "VioletCity", "GoldenrodCity",
  "EcruteakCity", "OlivineCity", "BlackthornCity",
]);

describe("identity corpus (invariant I5)", () => {
  it("has every reference engine available", () => {
    expect(roots.length).toBeGreaterThanOrEqual(5);
  });

  // NOT `editJson(src, [])`. That returns `src` by an early return before any
  // parsing happens, so asserting it equals `src` is `expect(x).toBe(x)` -- it
  // would pass against an editJson whose entire body was deleted. An earlier
  // draft made that the corpus gate, which is to say the gate Plan 0 section 6
  // names as the thing no plan may merge without was testing nothing at all.
  //
  // The real property is: a round trip through an actual edit is byte-identical,
  // AND the intermediate genuinely differs. Both halves are needed -- a no-op
  // editJson satisfies the first on its own.
  //
  // What this gate does NOT prove: the container-skip fix (defect 2 -- an
  // object value that itself contains an array broke the old `close` logic).
  // Traced directly: that bug only triggers when valueEnd has to scan past an
  // OBJECT that contains an array somewhere inside it, and in every real
  // map.json and layouts.json in this corpus, every array-valued key (the
  // scalars before `music`, connections, object_events, the layouts array
  // itself, ...) is always the outer container at the point something is
  // skipped past it -- never an object wrapping an array. Arrays as the outer
  // container were never buggy (they already recognised both closers), so
  // this corpus, however many files it touches, cannot exercise that shape.
  // The only file in this whole corpus with an object-containing-array shape
  // is wild_encounters.json, which Task 26 reads, not this task. The
  // container-skip fix's only test coverage is the synthetic unit test in
  // jsonEdit.test.ts -- a green corpus gate here does not mean that fix is
  // corpus-proven, and this project has been bitten by exactly that kind of
  // assumption before.
  it.each(roots)("edits and restores every map.json in %s, byte for byte", (root) => {
    const paths = projectPaths(root);
    const names = mapNamesOf(root);
    const unchanged: string[] = [];
    const notRestored: string[] = [];
    let checked = 0;
    let nestedChecked = 0;

    for (const name of names) {
      const path = paths.mapJson(name);
      if (!existsSync(path)) continue;
      checked++;
      const src = readFileSync(path, "utf8");
      const parsed = JSON.parse(src) as { music: string; connections?: { offset: number }[] };
      const original = parsed.music;

      const edited = editJson(src, [{ path: ["music"], value: "MUS_PLACEHOLDER_XYZZY" }]);
      if (edited === src) unchanged.push(name);
      if (editJson(edited, [{ path: ["music"], value: original }]) !== src) notRestored.push(name);

      // `music` alone only ever proves the scanner can skip past a handful of
      // leading scalar keys -- see the file-level comment above for why it
      // (and every other real key in this corpus) never reaches the
      // container-skip shape. It also happens to precede `connections` in
      // every schema, so this second probe -- indexing into the connections
      // array and editing a field pretty-printed across multiple lines, a
      // formatting shape the unit tests never exercise -- adds real,
      // distinguishable coverage (multi-line nested objects at corpus scale).
      if (parsed.connections && parsed.connections.length > 0) {
        nestedChecked++;
        const off = parsed.connections[0]!.offset;
        const nestedEdited = editJson(src, [{ path: ["connections", 0, "offset"], value: off + 1000 }]);
        if (nestedEdited === src) unchanged.push(`${name} (nested)`);
        if (editJson(nestedEdited, [{ path: ["connections", 0, "offset"], value: off }]) !== src) {
          notRestored.push(`${name} (nested)`);
        }
      }
    }

    // Every map.json in all six configured engines carries a `music` key --
    // verified, 0 exceptions across 4,427 files -- so a skipped file means the
    // walk broke, not that the data varies.
    //
    // 4,427 is the filesystem total, not what this loop reaches: 5 map.json
    // files are absent from their tree's map_groups.json entirely -- 4 under
    // pokeemerald-expansion/data/maps ("...UnusedHouse..."-style stubs) and 1
    // under pokeclassic/data/maps (SafariZone_RestHouse) -- so `allMapNames()`
    // never yields them and `checked` tops out at 4,422 across all six
    // engines combined. That is true of parseMapGroups just as it was of
    // openProject's proj.mapNames() -- these files are missing from the group
    // data itself, not from any one loader -- so switching loaders here does
    // not recover them.
    expect(checked).toBeGreaterThan(400);
    // Most maps are fully enclosed interiors with no connections at all --
    // measured 8-15% across these six engines, not a majority -- so this is a
    // floor well under any engine's real count (lowest measured: 41, on
    // pokeclassic), not an expected proportion. If it ever drops to 0, the
    // nested probe above stopped running and "notRestored" staying empty
    // would be vacuous, not reassuring.
    expect(nestedChecked).toBeGreaterThan(30);
    expect(unchanged).toEqual([]);
    expect(notRestored).toEqual([]);
  }, 900_000);

  it.each(roots)("edits and restores layouts.json in %s, byte for byte", (root) => {
    const paths = projectPaths(root);
    const src = readFileSync(paths.layoutsJson, "utf8");
    const original = JSON.parse(src).layouts_table_label as string;

    const edited = editJson(src, [{ path: ["layouts_table_label"], value: "gPlaceholderXyzzy" }]);
    expect(edited).not.toBe(src);
    expect(editJson(edited, [{ path: ["layouts_table_label"], value: original }])).toBe(src);

    // And an edit deep inside the layouts array, at an index chosen to be
    // genuinely deep rather than accidentally trivial: index 0 (an earlier
    // draft's choice) requires enterIndex to skip past zero preceding
    // elements, so it never exercised the "skip past several sibling
    // objects" path this comment describes. Every configured engine has well
    // over 380 layouts (smallest measured: 383), so index 5 is safe
    // everywhere and actually walks past five preceding layout objects to
    // get there.
    const layouts = JSON.parse(src).layouts as { width: number }[];
    const targetIndex = 5;
    const width = layouts[targetIndex]!.width;
    const deep = editJson(src, [{ path: ["layouts", targetIndex, "width"], value: width + 1 }]);
    expect(deep).not.toBe(src);
    expect(editJson(deep, [{ path: ["layouts", targetIndex, "width"], value: width }])).toBe(src);
  }, 900_000);

  // Task 3's insertArrayElement/removeArrayElement were unit-tested against
  // synthetic fixtures only (packages/core/test/write/jsonEdit.test.ts) --
  // exactly the gap this file's own header comment warns about for
  // editJson's container-skip fix: a synthetic test proves the algorithm
  // correct against the shapes its author thought of, not against every
  // real formatting quirk six actual decomp forks contain (trailing
  // commas' absence, one-element arrays, arrays split across lines
  // differently per engine's own JSON formatter). This closes that gap for
  // the array-splice functions the same way the tests above already closed
  // it for scalar editJson.
  it.each(roots)("insertArrayElement then removeArrayElement round-trips every map.json's object_events array byte-identical, across %s", (root) => {
    const paths = projectPaths(root);
    const names = mapNamesOf(root);
    const notRestored: string[] = [];
    const neverDiffered: string[] = [];
    let checked = 0;

    for (const name of names) {
      const path = paths.mapJson(name);
      if (!existsSync(path)) continue;
      const src = readFileSync(path, "utf8");
      const parsed = JSON.parse(src) as { object_events?: unknown[] };
      if (!parsed.object_events || parsed.object_events.length === 0) continue;
      checked++;

      const probe = { graphics_id: "OBJ_EVENT_GFX_PLACEHOLDER_XYZZY", x: 0, y: 0, elevation: 0 };
      const inserted = insertArrayElement(src, ["object_events"], parsed.object_events.length, probe);
      if (inserted === src) neverDiffered.push(name);
      const removed = removeArrayElement(inserted, ["object_events"], parsed.object_events.length);
      if (removed !== src) notRestored.push(name);
    }

    // Every one of these six engines has at least a few hundred maps
    // carrying object events (measured floor across all six: well over
    // 200) -- if this drops to 0 the loop stopped finding real data, not
    // that this corpus genuinely has none.
    expect(checked).toBeGreaterThan(100);
    expect(neverDiffered).toEqual([]);
    expect(notRestored).toEqual([]);
  }, 900_000);

  // The insert-at-END case above never exercises walkArray's "skip past N
  // preceding elements to find the insertion point" path for anything
  // other than N = the whole array. Insert-at-0 (prepend) is the other
  // extreme, and it is where an off-by-one in leadingGap bookkeeping would
  // actually surface -- see Task 3's own derivation notes on this exact
  // failure mode.
  it.each(roots)("insertArrayElement at index 0 then removeArrayElement at index 0 round-trips byte-identical, across %s", (root) => {
    const paths = projectPaths(root);
    const names = mapNamesOf(root);
    const notRestored: string[] = [];
    let checked = 0;

    for (const name of names) {
      const path = paths.mapJson(name);
      if (!existsSync(path)) continue;
      const src = readFileSync(path, "utf8");
      const parsed = JSON.parse(src) as { object_events?: unknown[] };
      if (!parsed.object_events || parsed.object_events.length === 0) continue;
      checked++;

      const probe = { graphics_id: "OBJ_EVENT_GFX_PLACEHOLDER_XYZZY", x: 0, y: 0, elevation: 0 };
      const inserted = insertArrayElement(src, ["object_events"], 0, probe);
      const removed = removeArrayElement(inserted, ["object_events"], 0);
      if (removed !== src) notRestored.push(name);
    }

    expect(checked).toBeGreaterThan(100);
    expect(notRestored).toEqual([]);
  }, 900_000);

  // The JSON gate above proves the SPLICE is exact; this is the binary
  // write path's own equivalent property -- encodeBlocks re-serialises the
  // WHOLE buffer (there is no surgical splice for binary, by design: a
  // fixed-width block record has no "the rest of the file" to preserve
  // around it the way JSON text does), so its correctness rests entirely
  // on parse+encode being exact inverses. A single off-by-one in a mask or
  // shift would corrupt every map.bin this project ever saves.
  it.each(roots)("encodeBlocks(parseBlocks(bytes)) round-trips every layout's map.bin and border.bin byte-identical, across %s", (root) => {
    const paths = projectPaths(root);
    const profile = profileOf(root);
    const { layouts } = parseLayouts(readFileSync(paths.layoutsJson, "utf8"));
    const notRestored: string[] = [];
    let checked = 0;

    for (const layout of layouts) {
      for (const rel of [layout.blockdataFilepath, layout.borderFilepath]) {
        const path = `${root}/${rel}`;
        if (!existsSync(path)) continue;
        checked++;
        const before = readFileSync(path);
        const blocks = parseBlocks(before, profile);
        const after = encodeBlocks(blocks, profile);
        if (!after.equals(before)) notRestored.push(`${layout.name}: ${rel}`);
      }
    }

    // Every configured engine has several hundred layouts, each with both
    // a blockdata and a border file -- a floor of 500 combined files is
    // well under any of the six engines' real counts (smallest measured
    // still exceeds 900), so a drop below it means the walk broke.
    expect(checked).toBeGreaterThan(500);
    expect(notRestored).toEqual([]);
  }, 900_000);

  // The plan's own Success Criteria #1 (this document's header): "Paint a
  // tile in NewBarkTown (hns/640) and in PetalburgCity (emerald/512), save
  // both, and confirm git diff in the decomp shows ONLY the two map.bin
  // files, changed by exactly the bytes painted." This is that criterion,
  // generalised to every configured engine and run as an automated gate
  // rather than a one-off manual check -- guards, binary encoding and the
  // save funnel, acting together on a real file, restored byte-identical
  // afterward no matter what assertion above it failed.
  it.each(roots)("paints one real block on one real map, commits through the full save funnel, and restores byte-identical, in %s", (root) => {
    const paths = projectPaths(root);
    const names = mapNamesOf(root);
    const proj = projFor(root);
    const { layouts } = parseLayouts(readFileSync(paths.layoutsJson, "utf8"));
    const byId = new Map(layouts.map((l) => [l.id, l]));

    // First map whose layout and blockdata both actually resolve on disk,
    // AND whose block (0,0) has no warp sitting on it -- not map index 0
    // specifically, since a handful of maps across these six engines
    // reference a layout id absent from their own layouts.json (see this
    // file's own existing comment on the 5 map.json files missing from
    // map_groups.json entirely -- data gaps like that are real and this
    // loop must skip past them, not fail the whole gate on one). Skipping a
    // warp-at-(0,0) map is a real, legitimate guard (warp-tile-moved) this
    // gate must not paint through -- painting under a stationary warp is
    // exactly the case that guard exists to refuse, so choosing a map that
    // avoids it is a test-construction choice, not a weakened assertion.
    let target: { name: string; layout: ReturnType<typeof parseLayouts>["layouts"][number]; map: ReturnType<typeof parseMap> } | undefined;
    for (const name of names) {
      if (EXCLUDED_TARGET_NAMES.has(name)) continue;
      const mapPath = paths.mapJson(name);
      if (!existsSync(mapPath)) continue;
      const mapJson = readFileSync(mapPath, "utf8");
      const layoutId = (JSON.parse(mapJson) as { layout: string }).layout;
      const layout = byId.get(layoutId);
      if (!layout) continue;
      if (!existsSync(`${root}/${layout.blockdataFilepath}`)) continue;
      const map = parseMap(mapJson);
      if (map.warpEvents.some((w) => w.x === 0 && w.y === 0)) continue;
      target = { name, layout, map };
      break;
    }
    expect(target).toBeDefined();
    const { name: mapName, layout, map } = target!;

    const blockdataPath = `${root}/${layout.blockdataFilepath}`;
    const borderPath = `${root}/${layout.borderFilepath}`;
    const mapJsonPath = paths.mapJson(mapName);
    const beforeBlockdata = readFileSync(blockdataPath);
    const beforeBorder = readFileSync(borderPath);
    const beforeMapJson = readFileSync(mapJsonPath, "utf8");

    try {
      const blocks = parseBlocks(beforeBlockdata, proj.profile);
      const border = parseBlocks(beforeBorder, proj.profile);
      const originalMetatileId = blocks[0]!.metatileId;
      // Bumped by 1 and, if that would land at or past this engine's own
      // real metatilesTotal ceiling (idOutOfRange's ultimate bound even
      // under projFor's permissive per-tileset stub -- see projFor's own
      // doc comment), bumped down instead. Always different from the
      // original id, and always a real, in-range id for this engine.
      const ceiling = proj.constants.metatilesTotal;
      const paintedId = originalMetatileId + 1 < ceiling ? originalMetatileId + 1 : originalMetatileId - 1;
      const paintedBlocks = paintCells(blocks, layout.width, layout.height, [{ x: 0, y: 0 }], { width: 1, height: 1, cells: [{ metatileId: paintedId }] }, 0, 0);

      const session: EditSession = {
        mapName, layout, blocks: paintedBlocks, border, map,
        originalBlocks: blocks, originalMap: parseMap(beforeMapJson),
        originalMapJson: beforeMapJson, jsonEdits: [], insertOps: [], removeOps: [], scriptAppends: [], isDirty: true,
      };
      const plan = planSave(proj, session);
      expect(plan.refusals).toEqual([]);
      expect(plan.changes).toHaveLength(1);
      expect(plan.changes[0]!.kind).toBe("binary");

      commitSave(proj, plan);

      const afterBlockdata = readFileSync(blockdataPath);
      expect(afterBlockdata).not.toEqual(beforeBlockdata);
      const afterBlocks = parseBlocks(afterBlockdata, proj.profile);
      // Pinned against the ORIGINAL block count, not `afterBlocks.length`
      // itself -- the loop below is bounded by `afterBlocks.length`, so a
      // commitSave that silently truncated the file would otherwise still
      // pass every assertion here (a truncated buffer is still "not equal"
      // to `beforeBlockdata`, and an empty-tailed loop trivially finds no
      // mismatches).
      expect(afterBlocks).toHaveLength(blocks.length);
      expect(afterBlocks[0]!.metatileId).toBe(paintedId);
      // Nothing else on the grid moved -- a save that touches the whole
      // buffer instead of exactly the one changed block is exactly the kind
      // of silent corruption this gate exists to catch.
      for (let i = 1; i < afterBlocks.length; i++) expect(afterBlocks[i]).toEqual(blocks[i]);
      expect(readFileSync(mapJsonPath, "utf8")).toBe(beforeMapJson); // untouched -- no json edit was staged
      expect(readFileSync(borderPath)).toEqual(beforeBorder); // untouched -- border was never painted
    } finally {
      writeFileSync(blockdataPath, beforeBlockdata);
      writeFileSync(borderPath, beforeBorder);
      writeFileSync(mapJsonPath, beforeMapJson);
      expect(readFileSync(blockdataPath)).toEqual(beforeBlockdata);
    }
  }, 900_000);
});
