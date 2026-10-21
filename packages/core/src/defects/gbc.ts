import { readFileSync } from "node:fs";
import type { GbcProject } from "../gbc/project.js";
import { loadGbcMaps } from "../gbc/load/map.js";
import { loadGbcMapEvents } from "../gbc/load/events.js";
import { parseConstDefs } from "../gbc/load/asm.js";
import { parseTilesetsTable } from "../gbc/load/tileset.js";
import { parseIncbins } from "../gbc/load/incbin.js";
import { sizeDefect } from "./size.js";
import type { DataDefect } from "./types.js";
import type { SymbolIndex } from "./symbols.js";

/** Read structural sources afresh, without loading artwork or using project caches. */
export function gbcMapDefects(proj: GbcProject, mapName: string, _opts?: { symbols?: SymbolIndex }): DataDefect[] {
  const read = (file: string) => readFileSync(`${proj.root}/${file}`, "utf8");
  const { maps, map: getMap } = loadGbcMaps(proj.root);
  const map = getMap(mapName);
  const file = `maps/${mapName}.asm`;
  const { events } = loadGbcMapEvents(proj.root, map);
  const out: DataDefect[] = [];
  const add = (kind: DataDefect["kind"], message: string, fix: string, target = file) =>
    out.push({ file: target, kind, message, fix });
  const raw = readFileSync(`${proj.root}/${map.blkPath}`);
  const expected = map.width * map.height;
  if (raw.length !== expected) out.push(sizeDefect(map.blkPath, raw.length, expected,
    `the ${map.constName} map_const dimensions in constants/map_constants.asm`));

  // C2 is dropped under SR14: both corpora stage the Goldenrod GS Ball receptionist
  // off-map (GoldenrodPokecenter1F.asm), then moveobject her into place. Bounds
  // alone cannot separate staging from errors; see the Task 4 corpus report.

  const constants = parseConstDefs(read("constants/tileset_constants.asm"));
  const index = constants.get(map.tileset);
  const table = parseTilesetsTable(read("data/tilesets.asm"));
  const name = index === undefined ? undefined : table[index];
  if (!map.tileset.startsWith("TILESET_") || name === undefined) {
    throw new Error(`constants/tileset_constants.asm: unknown tileset ${map.tileset}`);
  }
  const meta = parseIncbins(read("gfx/tilesets.asm")).find((entry) => entry.labels.includes(`${name}Meta`));
  if (!meta) throw new Error(`gfx/tilesets.asm: no INCBIN for ${name}Meta`);
  const bytes = readFileSync(`${proj.root}/${meta.path}`).length;
  if (bytes % 16 !== 0) throw new Error(`${meta.path}: size ${bytes} is not a multiple of 16`);
  const count = bytes / 16;
  const badIds = [...new Set([...raw.subarray(0, expected)].filter((id) => id !== 0 && id >= count))].sort((a, b) => a - b);
  if (badIds.length) add("gameplay", `Block id(s) ${badIds.join(", ")} are out of range for ${map.tileset} (${count} metatiles).`,
    `Replace these ids in ${map.blkPath} with block 0 (border substitute) or ids in 1..${count - 1}.`, map.blkPath);

  const byConst = new Map(maps.map((m) => [m.constName, m]));
  const byName = new Map(maps.map((m) => [m.name, m]));
  const warpCounts = new Map([[map.constName, events.warps.length]]);
  events.warps.forEach((warp, i) => {
    const dest = byConst.get(warp.mapConst);
    if (!dest) {
      add("build", `Warp ${i} destination ${warp.mapConst} does not exist in constants/map_constants.asm.`,
        `Set warp_event ${i} destination in ${file} to a map_const listed in constants/map_constants.asm.`);
      return;
    }
    if (warp.destWarp === -1) return; // Engine backup warp, not a 1-based destination index.
    let count = warpCounts.get(dest.constName);
    if (count === undefined) {
      count = loadGbcMapEvents(proj.root, dest).events.warps.length;
      warpCounts.set(dest.constName, count);
    }
    if (warp.destWarp < 1 || warp.destWarp > count) add("gameplay",
      `Warp ${i} destination index ${warp.destWarp} is outside ${warp.mapConst}'s ${count} warps (1-based).`,
      `Set warp_event ${i} destination index in ${file} to an existing 1-based warp index in maps/${dest.name}.asm or -1 for a backup warp.`);
  });
  map.connections.forEach((connection, i) => {
    if (!byName.has(connection.targetName) || !byConst.has(connection.targetConst) ||
      byName.get(connection.targetName)!.constName !== connection.targetConst) add("build",
      `Connection ${i} destination ${connection.targetName}, ${connection.targetConst} does not exist as a matching name/constant pair.`,
      `Set connection ${i} in data/maps/attributes.asm to a matching map name from data/maps/maps.asm and constant from constants/map_constants.asm.`,
      "data/maps/attributes.asm");
  });
  return out;
}
