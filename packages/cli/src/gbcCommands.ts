import { writeFileSync } from "node:fs";
import { openGbcProject } from "@pokemap/core/src/gbc/project.js";
import { renderGbcMap } from "@pokemap/core/src/gbc/render/map.js";
import { buildGbcWorld } from "@pokemap/core/src/gbc/world/connections.js";
import { renderGbcWorld } from "@pokemap/core/src/gbc/render/world.js";
import { loadGbcMapEvents } from "@pokemap/core/src/gbc/load/events.js";
import type { Conflict } from "@pokemap/core/src/gbc/world/connections.js";
import { gbcEncounterSources, gbcWhereSpecies, gbcCoverage, normalizeGbcSpecies, type GbcEncounterSource, type GbcSpeciesHit } from "@pokemap/core/src/gbc/analyse/atlas.js";
import type { DataDefect, GbcMap } from "@pokemap/core/src/gbc/model/types.js";
import type { GbcProject } from "@pokemap/core/src/gbc/project.js";
import { openGbcEditSession, planGbcSave, commitGbcSave, type GbcEditSession } from "@pokemap/core/src/gbc/write/save.js";
import { paintCells as paintGbcCells, floodFill } from "@pokemap/core/src/gbc/edit/paint.js";
import { moveGbcEvent, addGbcEvent, deleteGbcEvent, findGbcWarpsRetargetedByDelete, type GbcEventKind, type GbcEventEdit } from "@pokemap/core/src/gbc/edit/events.js";
import { formatDiffText } from "@pokemap/core/src/write/diff.js";
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

// ---------------------------------------------------------------------------
// Plan 7 Task 6: GBC write commands -- `paint`/`diff` (GBC branch) and
// `event move|add|delete`. Separate block (see the Task 12 block's own note).
// Every write goes through core's `commitGbcSave`; dry run is the default.
// ---------------------------------------------------------------------------

const GBC_KINDS: readonly GbcEventKind[] = ["warp", "coord", "bg", "object"];
const GBC_TOOLS = ["pencil", "rect", "bucket"] as const;

/** Commander's `Number` parser gives `NaN` for junk and happily takes 1.5. */
function intOpt(name: string, v: unknown): number {
  if (typeof v !== "number" || !Number.isInteger(v)) throw new Error(`--${name} must be an integer, got ${String(v)}`);
  return v;
}

function kindOpt(v: unknown): GbcEventKind {
  if (!GBC_KINDS.includes(v as GbcEventKind)) throw new Error(`--kind must be one of ${GBC_KINDS.join(", ")}, got ${String(v)}`);
  return v as GbcEventKind;
}

/** Mirrors writeCommands.ts dryRunOrCommit (same refusal format) -- keep in step. `warn` (stderr-bound `warning:` lines) is appended to the
 *  thrown message, since a throw returns no stderr and the user would otherwise lose the data defects behind a refusal.
 *  Dry run prints label + plan; `--yes` throws on refusals (the CLI's own message, same format as GBA's), else commits. */
function dryRunOrCommitGbc(proj: GbcProject, session: GbcEditSession, yes: boolean, label: string, warn = ""): string {
  const plan = planGbcSave(proj, session);
  const diffText = formatDiffText(plan);
  if (!yes) return `${label}\n${diffText}\n(dry run -- not written; pass --yes to commit)\n`;
  if (plan.refusals.length > 0) {
    throw new Error(plan.refusals.map((r) => `${r.code} (${r.subject}): ${r.message} -- ${r.fix}`).join("\n") + (warn ? `\n${warn.trimEnd()}` : ""));
  }
  commitGbcSave(proj, plan);
  return `${label}\n${diffText}\ncommitted\n`;
}

export interface RunGbcPaintOptions {
  tool: string;
  /** Block coordinates. */
  x: number;
  y: number;
  x1?: number;
  y1?: number;
  metatile: number;
  yes?: boolean;
}

function gbcPaintSession(proj: GbcProject, mapName: string, opts: RunGbcPaintOptions): GbcEditSession {
  if (!(GBC_TOOLS as readonly string[]).includes(opts.tool)) throw new Error(`--tool must be one of ${GBC_TOOLS.join(", ")}, got ${opts.tool}`);
  const x = intOpt("x", opts.x), y = intOpt("y", opts.y), metatile = intOpt("metatile", opts.metatile);
  const x1 = opts.x1 === undefined ? x : intOpt("x1", opts.x1);
  const y1 = opts.y1 === undefined ? y : intOpt("y1", opts.y1);
  const session = openGbcEditSession(proj, mapName);
  const { width, height } = session.layout;
  if (opts.tool === "bucket") {
    session.blocks = floodFill(session.blocks, width, height, x, y, metatile);
  } else {
    const targets: { x: number; y: number }[] = [];
    if (opts.tool === "rect") {
      for (let ty = Math.min(y, y1); ty <= Math.max(y, y1); ty++) {
        for (let tx = Math.min(x, x1); tx <= Math.max(x, x1); tx++) targets.push({ x: tx, y: ty });
      }
    } else targets.push({ x, y });
    session.blocks = paintGbcCells(session.blocks, width, height, targets, { width: 1, height: 1, cells: [{ metatileId: metatile }] }, x, y);
  }
  return session;
}

/** `layout`'s data defects (e.g. CeruleanCave2F's oversize .blk) as `warning:` lines. */
function layoutWarnings(proj: GbcProject, mapName: string): string {
  return warningLines(proj.layout(proj.map(mapName)).defects);
}

/** `paint <gbcMap>`: dry run unless `opts.yes`. Coordinates are in blocks. */
export function runGbcPaint(root: string, mapName: string, opts: RunGbcPaintOptions): GbcCommandResult {
  const proj = openGbcProject(root);
  const session = gbcPaintSession(proj, mapName, opts);
  const stderr = layoutWarnings(proj, mapName);
  return { stdout: dryRunOrCommitGbc(proj, session, !!opts.yes, `${mapName} (${opts.tool})`, stderr), stderr };
}

/** `diff <gbcMap>`: always a dry run, whatever the caller smuggles into `opts`. */
export function runGbcDiff(root: string, mapName: string, opts: Omit<RunGbcPaintOptions, "yes">): GbcCommandResult {
  const proj = openGbcProject(root);
  const session = gbcPaintSession(proj, mapName, opts);
  return { stdout: `${formatDiffText(planGbcSave(proj, session))}\n`, stderr: layoutWarnings(proj, mapName) };
}

function openEventSession(proj: GbcProject, mapName: string, kind: unknown): { session: GbcEditSession; kind: GbcEventKind } {
  const k = kindOpt(kind);
  return { session: openGbcEditSession(proj, mapName), kind: k };
}

function applyEdit(session: GbcEditSession, edit: GbcEventEdit): void {
  session.eventsText = edit.text;
  session.events = edit.events;
}

export interface RunGbcEventMoveOptions { kind: string; index: number; /** Event steps (16 px). */ x: number; y: number; yes?: boolean }

export function runGbcEventMove(root: string, mapName: string, opts: RunGbcEventMoveOptions): GbcCommandResult {
  const index = intOpt("index", opts.index), x = intOpt("x", opts.x), y = intOpt("y", opts.y);
  const proj = openGbcProject(root);
  const { session, kind } = openEventSession(proj, mapName, opts.kind);
  applyEdit(session, moveGbcEvent(session.eventsText, mapName, kind, index, x, y));
  const stderr = layoutWarnings(proj, mapName);
  return { stdout: dryRunOrCommitGbc(proj, session, !!opts.yes, `${mapName} move ${kind}[${index}] -> (${x}, ${y})`, stderr), stderr };
}

export interface RunGbcEventAddOptions { kind: string; /** The macro's full argument list in source order, comma-separated. */ args: string; const?: string; yes?: boolean }

export function runGbcEventAdd(root: string, mapName: string, opts: RunGbcEventAddOptions): GbcCommandResult {
  const proj = openGbcProject(root);
  const { session, kind } = openEventSession(proj, mapName, opts.kind);
  if (opts.const !== undefined && kind !== "object") throw new Error(`--const only applies to --kind object, got --kind ${kind}`);
  if (typeof opts.args !== "string") throw new Error("--args is required");
  const args = opts.args.split(",").map((a) => a.trim());
  const mapConsts = new Set(proj.maps.map((m) => m.constName));
  applyEdit(session, addGbcEvent(session.eventsText, mapName, kind, args, { mapConsts, objectConst: opts.const }));
  const stderr = layoutWarnings(proj, mapName);
  return { stdout: dryRunOrCommitGbc(proj, session, !!opts.yes, `${mapName} add ${kind}`, stderr), stderr };
}

export interface RunGbcEventDeleteOptions { kind: string; index: number; yes?: boolean }

export function runGbcEventDelete(root: string, mapName: string, opts: RunGbcEventDeleteOptions): GbcCommandResult {
  const index = intOpt("index", opts.index);
  const proj = openGbcProject(root);
  const { session, kind } = openEventSession(proj, mapName, opts.kind);
  let warnings = "";
  if (kind === "warp") {
    // The deleting map contributes its PRE-delete session warps; every other map its on-disk ones.
    const maps = proj.maps.map((m) => ({ name: m.name, warps: m.name === mapName ? session.events.warps : loadGbcMapEvents(root, m).events.warps }));
    const hits = findGbcWarpsRetargetedByDelete(maps, { mapName, mapConst: session.map.constName, index });
    warnings = hits.map((h) => `warning: ${h.fromMap} warp[${h.warpIndex}] -> ${session.map.constName} ${h.destWarp} will be retargeted\n`).join("");
  }
  applyEdit(session, deleteGbcEvent(session.eventsText, mapName, kind, index));
  const stderr = warnings + layoutWarnings(proj, mapName);
  return { stdout: dryRunOrCommitGbc(proj, session, !!opts.yes, `${mapName} delete ${kind}[${index}]`, stderr), stderr };
}
