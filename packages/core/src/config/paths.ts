export interface ProjectPaths {
  root: string;
  layoutsJson: string;
  mapGroupsJson: string;
  fieldmapH: string;
  porymapCfg: string;
  wildEncountersJson: string;
  /** Region map files are globbed from here — the subject repo has two
   *  (`region_map_sections.json` and `region_map_sections_johto.json`) and
   *  Porymap knows about only one. Plan 3 Task 4 depends on the directory,
   *  not on a single hardcoded filename. */
  regionMapDir: string;
  regionMapSections: string;
  tilesetHeadersH: string;
  tilesetMetatilesH: string;
  tilesetGraphicsH: string;
  eventObjectsH: string;
  sidecar: string;
  mapDir(name: string): string;
  mapJson(name: string): string;
  mapScriptsInc(name: string): string;
  layoutDir(name: string): string;
  /** `speciesLower` is the lowercase directory form, e.g. "espeon" — not the C `SPECIES_ESPEON` constant. */
  monIconPng(speciesLower: string): string;
  /** `speciesLower` is the lowercase directory form, e.g. "espeon" — not the C `SPECIES_ESPEON` constant. */
  monOverworldPng(speciesLower: string): string;
}

const norm = (s: string) => s.replace(/\\/g, "/").replace(/\/+$/, "");

export function projectPaths(root: string): ProjectPaths {
  const r = norm(root);
  return {
    root: r,
    layoutsJson: `${r}/data/layouts/layouts.json`,
    mapGroupsJson: `${r}/data/maps/map_groups.json`,
    fieldmapH: `${r}/include/fieldmap.h`,
    porymapCfg: `${r}/porymap.project.cfg`,
    wildEncountersJson: `${r}/src/data/wild_encounters.json`,
    regionMapDir: `${r}/src/data/region_map`,
    regionMapSections: `${r}/src/data/region_map/region_map_sections.json`,
    tilesetHeadersH: `${r}/src/data/tilesets/headers.h`,
    tilesetMetatilesH: `${r}/src/data/tilesets/metatiles.h`,
    tilesetGraphicsH: `${r}/src/data/tilesets/graphics.h`,
    eventObjectsH: `${r}/include/constants/event_objects.h`,
    sidecar: `${r}/.pokemap/world.json`,
    mapDir: (n) => `${r}/data/maps/${n}`,
    mapJson: (n) => `${r}/data/maps/${n}/map.json`,
    mapScriptsInc: (n) => `${r}/data/maps/${n}/scripts.inc`,
    layoutDir: (n) => `${r}/data/layouts/${n}`,
    monIconPng: (s) => `${r}/graphics/pokemon/${s}/icon.png`,
    monOverworldPng: (s) => `${r}/graphics/object_events/pics/pokemon/${s}.png`,
  };
}
