import { writeFileSync } from "node:fs";
import { openGbcProject } from "@pokemap/core/src/gbc/project.js";
import { renderGbcMap } from "@pokemap/core/src/gbc/render/map.js";
import { buildGbcWorld } from "@pokemap/core/src/gbc/world/connections.js";
import { renderGbcWorld } from "@pokemap/core/src/gbc/render/world.js";
import { loadGbcMapEvents } from "@pokemap/core/src/gbc/load/events.js";
import type { Conflict } from "@pokemap/core/src/gbc/world/connections.js";
import { gbcEncounterSources, gbcWhereSpecies, gbcCoverage, normalizeGbcSpecies, type GbcEncounterSource, type GbcSpeciesHit } from "@pokemap/core/src/gbc/analyse/atlas.js";
import type { DataDefect, GbcMap } from "@pokemap/core/src/gbc/model/types.js";
import { encodePng } from "./png.js";
import type { TimeOfDay, Bbox } from "./args.js";

/** One `warning: <message>\n` line per defect -- the shared format both
 *  `runGbcRender` and `runGbcQuery` print, and the plan-wide rule that a
 *  recoverable `DataDefect` (§`DataDefect`'s own doc comment: loaders never
 *  throw for one) is surfaced to the user by the CLI, never swallowed. */
function warningLines(defects: readonly DataDefect[]): string {
  return defects.map((d) => `warning: ${d.message}\n`).join("");
}

/**
 * One `note: <map> placed via <viaB.from>; <viaA.from> disagrees by (dx,dy)\n`
 * line per drawn `Conflict` (Task 11 fix round 1, spec review Minor m1).
 * Purely informational, unlike `warningLines`' `DataDefect`s: a `Conflict` is
 * real, in-game connection data that fails to embed in a plane (task-11-spec-review.md
 * §1 -- confirmed identical in vanilla pret/pokecrystal), not a malformed or
 * worked-around file the way a `DataDefect` is (`DataDefect`'s own doc
 * comment). It never affects `process.exitCode` (`index.ts`'s action sets
 * that from a thrown error alone). `dx`/`dy` = `viaA - viaB`: `viaB` is
 * `world.conflicts`' documented "map that actually placed it" (what
 * `world.placements` really holds, up to the shared per-component pack
 * shift), so a positive `dx`/`dy` means the disagreeing path (`viaA`) would
 * have put the map that much further along +x/+y.
 */
function noteLines(conflicts: readonly Conflict[]): string {
  return conflicts
    .map((c) => `note: ${c.map} placed via ${c.viaB.from}; ${c.viaA.from} disagrees by (${c.viaA.x - c.viaB.x},${c.viaA.y - c.viaB.y})\n`)
    .join("");
}

/** Shared return shape for every thin handler in this file: the text
 *  `index.ts`'s action should print, rather than this file writing to
 *  stdout/stderr (or calling `process.exit`) itself, so each handler stays
 *  testable without spawning a process -- mirrors `writeCommands.ts`'s own
 *  *principle* of returning instead of writing, though not its literal
 *  shape (its handlers each return one `string`, not a `{ stdout, stderr }`
 *  pair; kept as its own type here since Task 11/12 add more handlers that
 *  need the same pair rather than duplicating this interface per handler). */
export interface GbcCommandResult {
  stdout: string;
  stderr: string;
}

export interface RunGbcRenderOptions {
  out: string;
  border?: number;
  /** Defaults to "day", mirroring `render`'s own commander default -- kept
   *  here too so this thin handler behaves the same when called directly
   *  from a test as it does from `index.ts`'s wiring. */
  time?: TimeOfDay;
}

/** `render <gbcMap>` (Task 10). Renders via `openGbcProject` + `renderGbcMap`
 *  and writes the PNG to `opts.out`. See `GbcCommandResult`'s own doc
 *  comment for what it returns and why. */
export function runGbcRender(root: string, mapName: string, opts: RunGbcRenderOptions): GbcCommandResult {
  const proj = openGbcProject(root);
  const raster = renderGbcMap(proj, mapName, { border: opts.border, time: opts.time ?? "day" });
  writeFileSync(opts.out, encodePng(raster));
  return {
    stdout: `${opts.out} ${raster.width}x${raster.height} outOfRange=${raster.outOfRangeCount} unmapped=${raster.unmappedTileCount}\n`,
    stderr: warningLines(raster.defects),
  };
}

export interface RunGbcRenderWorldOptions {
  /** In blocks -- `GbcWorld.placements`' own coordinate space (Task 11), not
   *  pixels and not GBA's tile units. */
  bbox: Bbox;
  out: string;
  /** Pixels per block. The CLI's own default (`index.ts`) is 8, not GBA
   *  `render-world`'s 4 -- see `index.ts`'s own comment on why the two
   *  families need different defaults despite both being "a quarter". */
  scale: number;
  time?: TimeOfDay;
}

/**
 * `render-world` on a GBC root (Task 11). Stitches every map with
 * `buildGbcWorld`, renders the bbox-intersecting slice with `renderGbcWorld`,
 * and writes the PNG to `opts.out`. Mirrors `runGbcRender`'s shape: returns
 * the text `index.ts`'s action should print rather than writing to
 * stdout/stderr itself. Fix round 1: returns the shared `GbcCommandResult`
 * (it previously declared its own byte-identical `RunGbcRenderWorldResult`).
 *
 * Unlike GBA's `render-world` (`index.ts`), there is no `--no-dungeons`
 * equivalent here and no sidecar/resolve step -- `buildGbcWorld` places every
 * map unconditionally (GBC has no warp-based dungeon auto-layout UI in Plan 6,
 * task spec "Out of scope"), so `world.placements` IS the full set this
 * renders from.
 *
 * stderr carries `warningLines` (real data defects) THEN `noteLines`
 * (informational conflict notes, fix round 1 Minor m1) -- defects are the
 * more serious of the two categories, so they lead.
 */
export function runGbcRenderWorld(root: string, opts: RunGbcRenderWorldOptions): GbcCommandResult {
  const proj = openGbcProject(root);
  const world = buildGbcWorld(proj);
  const raster = renderGbcWorld(proj, world, { bbox: opts.bbox, scale: opts.scale, time: opts.time ?? "day" });
  writeFileSync(opts.out, encodePng(raster));
  return {
    stdout: `${opts.out} ${raster.width}x${raster.height} maps=${raster.drawn}\n`,
    stderr: warningLines(raster.defects) + noteLines(raster.conflicts),
  };
}

export interface RunGbcQueryOptions {
  header?: boolean;
  connections?: boolean;
  events?: boolean;
}

/**
 * `query <gbcMap>` (Task 10). Mirrors the GBA `query` command's own flag
 * semantics exactly: no flag selected means all three sections. `--header`
 * only ever loads `proj.layout(map)` (never `loadGbcMapEvents`), and
 * `--events`/no-flag only ever load events -- so a defect the OTHER loader
 * would have reported never appears unless that section was actually
 * requested. See `GbcCommandResult`'s own doc comment for what this returns
 * and why.
 */
export function runGbcQuery(root: string, mapName: string, opts: RunGbcQueryOptions): GbcCommandResult {
  const proj = openGbcProject(root);
  const map: GbcMap = proj.map(mapName);

  const all = !opts.header && !opts.connections && !opts.events;
  const out: Record<string, unknown> = {};
  const defects: DataDefect[] = [];

  if (all || opts.header) {
    const { connections: _connections, ...rest } = map;
    const { layout, defects: layoutDefects } = proj.layout(map);
    out.header = {
      ...rest,
      layout: { blkPath: layout.blkPath, width: layout.width, height: layout.height, writable: layout.writable },
    };
    defects.push(...layoutDefects);
  }
  if (all || opts.connections) out.connections = map.connections;
  if (all || opts.events) {
    const { events, defects: eventDefects } = loadGbcMapEvents(root, map);
    out.events = events;
    defects.push(...eventDefects);
  }

  return { stdout: `${JSON.stringify(out, null, 2)}\n`, stderr: warningLines(defects) };
}

// ---------------------------------------------------------------------------
// Plan 6 Task 12: the GBC encounter atlas -- `encounters`/`where`/`coverage`.
// Kept in its own block (below every Task 10 handler) so a merge with the
// parallel Task 11 worktree's own appends to this file stays mechanical.
// ---------------------------------------------------------------------------

/** `grass (morn, rate 9.8%)` / `fish (rod good, bite 50.0%)` / `headbutt
 *  (common)` / `rock (rate 40.0%)` -- one tag per optional field that source
 *  carries, in a fixed order, comma-joined; no tags at all just prints the
 *  bare method name (never an empty "()"). */
function sourceHeader(s: GbcEncounterSource): string {
  const tags: string[] = [];
  if (s.time) tags.push(s.time);
  if (s.rod) tags.push(`rod ${s.rod}`);
  if (s.list) tags.push(s.list);
  if (s.conditional) tags.push(s.conditional);
  if (s.encounterRate !== undefined) tags.push(`rate ${s.encounterRate.toFixed(1)}%`);
  if (s.biteChance !== undefined) tags.push(`bite ${s.biteChance.toFixed(1)}%`);
  return tags.length > 0 ? `${s.method} (${tags.join(", ")})` : s.method;
}

export interface RunGbcEncountersOptions {
  json?: boolean;
}

/** `encounters <map>` (Task 12). Human output: grouped by source, a header
 *  line per `sourceHeader`, then one `  pct%  Lv min-max  SPECIES` row per
 *  merged chance (mirrors the GBA `encounters` command's own row format,
 *  `packages/cli/src/index.ts`). `--json` prints the raw `GbcEncounterSource[]`.
 *  Data-defect warnings (the kanto_grass.asm terminator) go to stderr, never
 *  stdout, exactly like every other GBC command in this file. */
export function runGbcEncounters(root: string, mapName: string, opts: RunGbcEncountersOptions): GbcCommandResult {
  const proj = openGbcProject(root);
  const sources = gbcEncounterSources(proj, mapName);
  const stderr = warningLines(proj.wild().defects);

  if (opts.json) return { stdout: `${JSON.stringify(sources, null, 2)}\n`, stderr };

  let stdout = "";
  for (const s of sources) {
    stdout += `${sourceHeader(s)}\n`;
    for (const c of s.chances) {
      stdout += `  ${c.percent.toFixed(1).padStart(5)}%  Lv ${c.minLevel}-${c.maxLevel}  ${c.species}\n`;
    }
  }
  return { stdout, stderr };
}

export interface RunGbcWhereOptions {
  json?: boolean;
}

/** `method[/time][/rod][/list][ swarm]`, e.g. `grass/morn`, `fish/old/day`,
 *  `headbutt/rare`, `rock`, `grass/nite swarm`. */
function hitTag(h: GbcSpeciesHit): string {
  let tag: string = h.method;
  if (h.time) tag += `/${h.time}`;
  if (h.rod) tag += `/${h.rod}`;
  if (h.list) tag += `/${h.list}`;
  if (h.conditional) tag += " swarm";
  return tag;
}

/** `where <species>` (Task 12). `species` is the user's raw, unmodified
 *  input (`index.ts` no longer pre-normalizes it) -- see `normalizeGbcSpecies`
 *  (Plan 6b Task 2: moved to `core/gbc/analyse/atlas.ts` so this CLI handler
 *  and the server's `/api/where/:species` route share one implementation,
 *  rather than each normalising the same way independently; this handler's
 *  own behaviour and tests are unchanged by the move).
 *  The "no encounter table" message echoes the RAW input, exactly as typed,
 *  mirroring the GBA `where` command's own empty-result message (which also
 *  prints its raw `species` argument, not its own normalized lookup key).
 *  `--json` prints the raw `GbcSpeciesHit[]`. */
export function runGbcWhere(root: string, species: string, opts: RunGbcWhereOptions): GbcCommandResult {
  const proj = openGbcProject(root);
  const hits = gbcWhereSpecies(proj, normalizeGbcSpecies(species));
  const stderr = warningLines(proj.wild().defects);

  if (opts.json) return { stdout: `${JSON.stringify(hits, null, 2)}\n`, stderr };
  if (hits.length === 0) return { stdout: `${species} appears in no encounter table\n`, stderr };

  let stdout = "";
  for (const h of hits) {
    stdout += `${h.mapName.padEnd(32)} ${h.percent.toFixed(1).padStart(5)}%  Lv ${h.minLevel}-${h.maxLevel}  ${hitTag(h)}\n`;
  }
  return { stdout, stderr };
}

export interface RunGbcCoverageOptions {
  empty?: boolean;
  unused?: boolean;
  json?: boolean;
}

/** `coverage` (Task 12). Text output mirrors the GBA `coverage` command's own
 *  flag semantics: a summary line always, `--empty`/`--unused` each add one
 *  indented line per entry. `--json` prints the full `GbcCoverage` (including
 *  `fishGroupWithoutWater`/`sourcesByMethod`/`levelByMap`/`defects`, which the
 *  text mode does not surface, again mirroring the GBA command). */
export function runGbcCoverage(root: string, opts: RunGbcCoverageOptions): GbcCommandResult {
  const proj = openGbcProject(root);
  const c = gbcCoverage(proj);
  const stderr = warningLines(proj.wild().defects);

  if (opts.json) return { stdout: `${JSON.stringify(c, null, 2)}\n`, stderr };

  let stdout = `${c.mapsWithEncounters} maps with encounters, ${c.mapsWithoutEncounters.length} without\n`;
  if (opts.empty) for (const m of c.mapsWithoutEncounters) stdout += `  ${m}\n`;
  if (opts.unused) for (const s of c.unusedSpecies) stdout += `  ${s}\n`;
  return { stdout, stderr };
}
