import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLayout } from "../../../src/gbc/load/map.js";
import { norm } from "../../../src/config/paths.js";
import type { GbcProject } from "../../../src/gbc/project.js";
import type { GbcMap } from "../../../src/gbc/model/types.js";
import { stubGbcProject } from "./stubGbcProject.js";

/** Shared by save.test.ts and guards.test.ts: the hermetic 2x2 `Testmap`
 *  fixture from Plan 7 Task 1's spec. LF, final newline. 2 objects, 2 consts. */
export const TESTMAP_ASM = [
  "\tobject_const_def",
  "\tconst TESTMAP_A",
  "\tconst TESTMAP_B",
  "",
  "Testmap_MapScripts:",
  "\tdef_scene_scripts",
  "",
  "\tdef_callbacks",
  "",
  "Testmap_MapEvents:",
  "\tdb 0, 0 ; filler",
  "",
  "\tdef_warp_events",
  "\twarp_event  1,  1, OTHER_MAP, 1",
  "",
  "\tdef_coord_events",
  "",
  "\tdef_bg_events",
  "",
  "\tdef_object_events",
  "\tobject_event  1,  2, SPRITE_A, SPRITEMOVEDATA_STILL, 0, 0, -1, -1, 0, OBJECTTYPE_SCRIPT, 0, ScriptA, -1",
  "\tobject_event  2,  2, SPRITE_B, SPRITEMOVEDATA_STILL, 0, 0, -1, -1, 0, OBJECTTYPE_SCRIPT, 0, ScriptB, -1",
  "",
].join("\n");

/** Same file with no `object_const_def` block at all (40 of 391 real maps). */
export const TESTMAP_ASM_NO_CONSTS = TESTMAP_ASM.replace(/^\tobject_const_def\n\tconst TESTMAP_A\n\tconst TESTMAP_B\n\n/, "");

/** 5, not the spec's 4: the spec's own bytes [1,2,3,4] (tests 4-5, 7) contain id 4,
 *  which a cap of 4 would refuse (valid ids are 0..cap-1). With cap 5, ids 0-4
 *  are valid and 5 is the first out-of-range id (test 11's boundary). */
export const TILESET_CAP = 5;

const tmpDirs: string[] = [];
/** Call from `afterEach`. */
export function cleanupFixtures(): void {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
}

export interface Fixture {
  tmp: string;
  proj: GbcProject;
  blk: string;
  asm: string;
}

/**
 * Builds a real tmpdir with `maps/TestLayout.blk` + `maps/Testmap.asm` and a stub project whose
 * `layout` is the REAL `loadLayout` (so writable/oversize behave for real).
 * With `shared: true`, `Zed` shares Testmap's blkPath and is listed first
 * while `Other` does not, so `layoutSharedBy` must be ["Zed", "Testmap"], in
 * `maps` order. By default Testmap is unshared (plan summaries carry no
 * "shared by" suffix). The blkPath (`maps/TestLayout.blk`) deliberately differs
 * from `maps/<mapName>.blk`: a writer that built the path from the map name
 * would hit a different file, and the tests would see it (real corpus: 50 maps
 * share House1.blk).
 */
export function makeFixture(opts: { blk?: number[]; asm?: string; shared?: boolean } = {}): Fixture {
  const tmp = norm(mkdtempSync(join(tmpdir(), "pokemap-gbc-save-")));
  tmpDirs.push(tmp);
  mkdirSync(`${tmp}/maps`);
  writeFileSync(`${tmp}/maps/TestLayout.blk`, Buffer.from(opts.blk ?? [1, 2, 3, 4]));
  writeFileSync(`${tmp}/maps/Testmap.asm`, opts.asm ?? TESTMAP_ASM);

  const base: Omit<GbcMap, "name" | "blkPath"> = {
    constName: "TESTMAP", group: 1, number: 1, width: 2, height: 2, tileset: "TILESET_TEST",
    environment: "TOWN", landmark: "L", music: "M", phoneFlag: "0", palette: "PAL", fishGroup: "FISHGROUP_NONE",
    border: 0, connectionFlags: "0", connections: [],
  };
  const maps: GbcMap[] = [
    ...(opts.shared ? [{ ...base, name: "Zed", blkPath: "maps/TestLayout.blk" }] : []),
    { ...base, name: "Other", blkPath: "maps/Other.blk" },
    { ...base, name: "Testmap", blkPath: "maps/TestLayout.blk" },
  ];
  const proj = stubGbcProject({
    root: tmp,
    maps,
    map: (n: string) => {
      const m = maps.find((x) => x.name === n);
      if (!m) throw new Error(`unknown map ${n}`);
      return m;
    },
    layout: (m) => loadLayout(tmp, m),
    tileset: () => ({ constName: "TILESET_TEST", metatiles: new Array(TILESET_CAP) }) as never,
  });
  return { tmp, proj, blk: `${tmp}/maps/TestLayout.blk`, asm: `${tmp}/maps/Testmap.asm` };
}
