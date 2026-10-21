import { expect } from "vitest";
import { gbcMapDefects } from "../../src/defects/gbc.js";
import { openGbcProject } from "../../src/gbc/project.js";
import { gbcCorpusRoots, gbcRootLabel, itWithGbcCorpus } from "../gbc/helpers/corpus.js";

itWithGbcCorpus("GBC structural corpus equals the triaged real-defect allow-list", () => {
  for (const root of gbcCorpusRoots()) {
    const proj = openGbcProject(root);
    const hits = proj.maps.flatMap((map) => gbcMapDefects(proj, map.name).map((defect) => ({ map: map.name, ...defect })));
    // PerfPlus cave blockdata is 400 bytes, but each map_const declares 9*15=135.
    // CeruleanCave1F targets warp 7; CeruleanCity.asm defines only 6 warp_events.
    // C2 is deferred: the Goldenrod receptionist is deliberately staged off-map,
    // then moved into place by the GS Ball scripts (both roots). See Task 4 report.
    expect(hits).toEqual(gbcRootLabel(root) === "pret" ? [] : [{
      map: "CeruleanCave1F", file: "maps/CeruleanCave1F.asm", kind: "gameplay",
      message: "Warp 0 destination index 7 is outside CERULEAN_CITY's 6 warps (1-based).",
      fix: "Set warp_event 0 destination index in maps/CeruleanCave1F.asm to an existing 1-based warp index in maps/CeruleanCity.asm or -1 for a backup warp.",
    }, ...["CeruleanCave2F", "CeruleanCaveB1"].map((name) => ({
      map: name, file: `maps/${name}.blk`, kind: "size",
      message: `maps/${name}.blk: actual size 400 bytes, expected 135 bytes`,
      fix: `Change the ${name === "CeruleanCave2F" ? "CERULEAN_CAVE_2F" : "CERULEAN_CAVE_B1"} map_const dimensions in constants/map_constants.asm or trim/extend maps/${name}.blk from 400 to 135 bytes.`,
    }))]);
  }
}, 120_000);
