import { writeFileSync } from "node:fs";
import { openGbcProject } from "@pokemap/core/src/gbc/project.js";
import { renderGbcMap } from "@pokemap/core/src/gbc/render/map.js";
import { loadGbcMapEvents } from "@pokemap/core/src/gbc/load/events.js";
import type { DataDefect, GbcMap } from "@pokemap/core/src/gbc/model/types.js";
import { encodePng } from "./png.js";
import type { TimeOfDay } from "./args.js";

/** One `warning: <message>\n` line per defect -- the shared format both
 *  `runGbcRender` and `runGbcQuery` print, and the plan-wide rule that a
 *  recoverable `DataDefect` (§`DataDefect`'s own doc comment: loaders never
 *  throw for one) is surfaced to the user by the CLI, never swallowed. */
function warningLines(defects: readonly DataDefect[]): string {
  return defects.map((d) => `warning: ${d.message}\n`).join("");
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
