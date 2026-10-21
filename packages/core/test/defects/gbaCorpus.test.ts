import { expect } from "vitest";
import { gbaMapDefects } from "../../src/defects/gba.js";
import { openProject } from "../../src/project.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

itWithCorpus("GBA structural corpus equals the triaged real-defect allow-list", () => {
  const proj = openProject(SUBJECT_ROOT);
  const hits = proj.mapNames().flatMap((map) => gbaMapDefects(proj, map).map((defect) => ({ map, ...defect })));
  // 640-primary split + 230 secondary metatiles = ids through 869.
  // Independently decoded map.bin contains these ids beyond that ceiling; see Task 3 report.
  // C2 is dropped: 71 off-map events in the subject are staging/edge-adjacent/vanilla leftovers, not provable errors.
  // C3 Saffron_Temp is real: LAYOUT_SAFFRON_TEMP is a registered map (map_groups.json) whose secondary
  // tileset gTileset_SaffronCity has 3680/16 = 230 metatiles (ceiling 869), but map.bin uses ids up to 924.
  expect(hits).toEqual([{
    map: "Saffron_Temp", file: "data/layouts/Saffron_Temp/map.bin", kind: "gameplay",
    message: "Metatile id(s) 876, 877, 879, 882, 883, 888, 892, 893, 894, 902, 915, 916, 919, 920, 921, 922, 923, 924 are out of range for this layout's split.",
    fix: "Replace these ids in data/layouts/Saffron_Temp/map.bin with ids in 0..639 or 640..869.",
  }]);
}, 120_000);

itWithCorpus("Route101 has no defects, including its off-map light", () => {
  expect(gbaMapDefects(openProject(SUBJECT_ROOT), "Route101")).toEqual([]);
});

// The subject's resize is complete: layouts.json 30x22 and map.bin is 1320 bytes (= 30*22*2), so C1 has no real hit.
itWithCorpus("current Navel Rock Zygarde chamber has no size mismatch", () => {
  expect(gbaMapDefects(openProject(SUBJECT_ROOT), "NavelRock_ZygardeChamber")).toEqual([]);
});
