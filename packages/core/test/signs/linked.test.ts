import { afterEach, describe, expect, it, vi } from "vitest";
import { openProject } from "../../src/project.js";
import { openGbcProject } from "../../src/gbc/project.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../gbc/helpers/corpus.js";
import { gbaMapDisplayName, gbcMapDisplayName, gbaSpeciesNames, gbcSpeciesNames, linkedSpecies, linkedText } from "../../src/signs/linked.js";

const fixtures = vi.hoisted(() => new Map<string, string>());
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, readFileSync: (...args: Parameters<typeof actual.readFileSync>) =>
    fixtures.has(String(args[0])) ? fixtures.get(String(args[0]))! : actual.readFileSync(...args) };
});

describe("linked text", () => {
  afterEach(() => fixtures.clear());
  it("formats map names, species and empty lists", () => {
    expect(linkedText("name", "ROUTE 29", ["PIDGEY"])).toBe("ROUTE 29");
    expect(linkedText("species", "ROUTE 29", ["PIDGEY", "SENTRET"])).toBe("ROUTE 29\n\nPIDGEY, SENTRET");
    expect(linkedText("species", "HOUSE", [])).toBe("HOUSE\n\nNo wild POKEMON here.");
  });

  itWithCorpus("resolves Route101's section to its display name", () => {
    const proj = openProject(SUBJECT_ROOT);
    expect(gbaMapDisplayName(proj, proj.map("Route101"))).toBe("ROUTE 101");
    expect(gbaSpeciesNames(proj).get("SPECIES_ESPEON")).toBe("ESPEON");
    expect(() => gbaMapDisplayName(proj, { ...proj.map("Route101"), regionMapSection: "MAPSEC_MISSING" }))
      .toThrow(/region_map_entries\.h.*MAPSEC_MISSING/);
  });

  itWithGbcCorpus("resolves New Bark's BSP and Route29's landmark", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    expect(gbcMapDisplayName(proj.root, proj.map("NewBarkTown"))).toBe("NEW BARK TOWN");
    expect(gbcMapDisplayName(proj.root, proj.map("Route29"))).toBe("ROUTE 29");
    expect(gbcSpeciesNames(proj.root).get("BULBASAUR")).toBe("BULBASAUR");
    expect(() => gbcMapDisplayName(proj.root, { ...proj.map("Route29"), landmark: "LANDMARK_MISSING" }))
      .toThrow(/landmark_constants\.asm.*LANDMARK_MISSING/);
  });

  itWithCorpus("pins the coordinator's Route101 oracle verbatim", () => {
    expect(linkedSpecies("gba", openProject(SUBJECT_ROOT), "Route101")).toEqual(
      ["ESPEON","SOLROCK","UMBREON","WURMPLE","POOCHYENA","WEEDLE","ZIGZAGOON","EEVEE","RATTATA"],
    );
  });

  itWithGbcCorpus("pins the coordinator's Route29 oracle verbatim", () => {
    expect(linkedSpecies("gbc", openGbcProject(GBC_SUBJECT_ROOT), "Route29")).toEqual(
      ["MAGIKARP","KRABBY","HOOTHOOT","PIDGEY","RATTATA","SENTRET","PINECO","CORSOLA","STARYU","EXEGGCUTE",
        "LEDYBA","SPINARAK","HOPPIP","KINGLER"],
    );
  });

  itWithCorpus("returns no species and the empty text for a real GBA map", () => {
    const proj = openProject(SUBJECT_ROOT);
    const species = linkedSpecies("gba", proj, "PalletTown");
    expect(species).toEqual([]);
    const name = gbaMapDisplayName(proj, proj.map("PalletTown"));
    expect(linkedText("species", name, species)).toBe(`${name}\n\nNo wild POKEMON here.`);
  });

  itWithGbcCorpus("returns no species and the empty text for a real GBC map", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const map = proj.map("CeruleanGym");
    expect(map.fishGroup).toBe("FISHGROUP_NONE");
    const species = linkedSpecies("gbc", proj, map.name);
    expect(species).toEqual([]);
    const name = gbcMapDisplayName(proj.root, map);
    expect(linkedText("species", name, species)).toBe(`${name}\n\nNo wild POKEMON here.`);
  });

  itWithCorpus("refuses missing GBA labels and species names with file and key", () => {
    const proj = openProject(SUBJECT_ROOT);
    const file = `${proj.paths.regionMapDir}/region_map_entries.h`;
    fixtures.set(file, '[MAPSEC_ROUTE_101] = { 0, 0, 1, 1, sMapName_Missing }');
    expect(() => gbaMapDisplayName(proj, proj.map("Route101"))).toThrow(/region_map_entries\.h.*sMapName_Missing/);
    fixtures.set(file, '// [MAPSEC_ROUTE_101] = { 0, 0, 1, 1, sMapName_Fake }');
    expect(() => gbaMapDisplayName(proj, proj.map("Route101"))).toThrow(/region_map_entries\.h.*MAPSEC_ROUTE_101/);
    fixtures.set(`${proj.paths.root}/src/data/text/species_names.h`, '[SPECIES_NONE] = _("NONE")');
    expect(() => linkedSpecies("gba", proj, "Route101")).toThrow(/species_names\.h.*SPECIES_ESPEON/);
  });

  itWithGbcCorpus("preserves landmark tokens, resolves enum offsets and refuses missing entries", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const root = proj.root;
    fixtures.set(`${root}/constants/landmark_constants.asm`, 'const_def 1\nconst LANDMARK_ROUTE_29\n');
    const file = `${root}/data/maps/landmarks.asm`;
    fixtures.set(file, 'landmark 0, 0, Other\nlandmark 1, 2, TestName\nTestName:\n db "<PK><BSP><MN>@" ; comment\n');
    expect(gbcMapDisplayName(root, proj.map("Route29"))).toBe("<PK> <MN>");
    fixtures.set(file, 'landmark 0, 0, Other\n');
    expect(() => gbcMapDisplayName(root, proj.map("Route29"))).toThrow(/landmarks\.asm.*LANDMARK_ROUTE_29/);
    fixtures.set(file, 'landmark 0, 0, Other\nlandmark 1, 2, MissingLabel\n');
    expect(() => gbcMapDisplayName(root, proj.map("Route29"))).toThrow(/landmarks\.asm.*MissingLabel/);
  });

  itWithGbcCorpus("refuses a truncated species table with its missing species key", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    fixtures.set(`${proj.root}/data/pokemon/names.asm`, 'db "BULBASAUR@"\n');
    expect(() => gbcSpeciesNames(proj.root)).toThrow(/names\.asm.*IVYSAUR/);
  });

  itWithGbcCorpus("excludes swarm sources and includes header fishing even on a dry map", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const data = proj.wild();
    const base = data.grass.find((entry) => entry.mapConst === "ROUTE_29" && !entry.swarm)!;
    const slots = base.slots.morn.map((slot) => ({ ...slot, species: "DITTO" }));
    const withSwarm = { ...proj, wild: () => ({ ...data, grass: [...data.grass,
      { ...base, swarm: true, slots: { morn: slots, day: slots, nite: slots } }] }) };
    expect(linkedSpecies("gbc", withSwarm, "Route29")).toEqual(linkedSpecies("gbc", proj, "Route29"));
    expect(linkedSpecies("gbc", proj, "PlayersHouse1F")).toEqual(
      ["MAGIKARP", "KRABBY", "CORSOLA", "STARYU", "KINGLER"],
    );
  });
});
