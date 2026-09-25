import { readFileSync } from "node:fs";
import type { Project } from "@pokemap/core/src/project.js";
import { parseBlocks } from "@pokemap/core/src/load/blocks.js";
import { paintCells, type Stamp } from "@pokemap/core/src/edit/paint.js";
import { addEvent } from "@pokemap/core/src/edit/events.js";
import { rankSpeciesForSign, suggestSignPlacement } from "@pokemap/core/src/signs/suggest.js";
import { buildWildSign, guardSignWrite } from "@pokemap/core/src/signs/write.js";
import { planSave, commitSave, type EditSession } from "@pokemap/core/src/write/save.js";
import { formatDiffText } from "@pokemap/core/src/write/diff.js";

/** Mirrors packages/server/src/editSessions.ts's own `open()` exactly (see
 *  this task's own Step 1) -- the CLI has no server process to hold a
 *  session between invocations, so every write command builds one fresh,
 *  uses it for the lifetime of one process, and lets it go.
 *
 *  `originalMap: structuredClone(map)`, NOT `originalMap: map` -- aliasing
 *  it would violate EditSession.originalMap's own doc comment (MUST be an
 *  independent copy), exactly as editSessions.ts's own open() avoids for
 *  the identical reason. */
export function openCliEditSession(proj: Project, mapName: string): EditSession {
  const map = proj.map(mapName);
  const layout = proj.layoutForMap(mapName);
  const blocks = parseBlocks(readFileSync(`${proj.paths.root}/${layout.blockdataFilepath}`), proj.profile);
  const border = parseBlocks(readFileSync(`${proj.paths.root}/${layout.borderFilepath}`), proj.profile);
  const originalMapJson = readFileSync(proj.paths.mapJson(mapName), "utf8");
  return {
    mapName, layout, blocks, border, map,
    originalBlocks: blocks.map((b) => ({ ...b })), originalMap: structuredClone(map),
    originalMapJson, jsonEdits: [], insertOps: [], removeOps: [], scriptAppends: [], isDirty: false,
  };
}

/** Shared end-of-command shape every write command below uses: print the
 *  plan; commit only with `--yes` (I6 extended to the CLI -- see this
 *  task's own header). Returns the combined text a command should print.
 *
 *  `label` is printed on BOTH paths, not just folded into the "committed"
 *  string -- a dry run is the default and the one place a caller most needs
 *  to see what this write would be called (e.g. the derived sign script
 *  label) before deciding whether to add `--yes`. */
function dryRunOrCommit(proj: Project, session: EditSession, yes: boolean, label: string): string {
  const plan = planSave(proj, session);
  const diffText = formatDiffText(plan);
  if (!yes) return `${label}\n${diffText}\n(dry run -- not written; pass --yes to commit)`;
  if (plan.refusals.length > 0) {
    throw new Error(plan.refusals.map((r) => `${r.code} (${r.subject}): ${r.message} -- ${r.fix}`).join("\n"));
  }
  commitSave(proj, plan);
  return `${label}\n${diffText}\ncommitted`;
}

export function runSignSuggest(proj: Project, mapName: string): string {
  const ranked = rankSpeciesForSign(proj, mapName);
  const placement = suggestSignPlacement(proj, mapName);
  const lines = ranked.map((r) => `  ${r.percent.toFixed(1).padStart(5)}%  Lv ${r.minLevel}-${r.maxLevel}  ${r.species}  (${r.method})`);
  const placementLine = placement ? `suggested placement: (${placement.x}, ${placement.y})` : "no tall grass on this map -- no placement suggested";
  return ranked.length === 0
    ? `${mapName} has no wild encounter table -- nothing to suggest\n${placementLine}`
    : `${lines.join("\n")}\n${placementLine}`;
}

export interface SignAddArgs { map: string; x: number; y: number; elevation: number; species: string; dialogue: string; yes: boolean }

export function runSignAdd(proj: Project, args: SignAddArgs): string {
  const built = buildWildSign(args.map, args);
  const refusals = guardSignWrite(proj.paths.root, args.map, built.scriptLabel);
  if (refusals.length > 0) {
    throw new Error(refusals.map((r) => `${r.code} (${r.subject}): ${r.message} -- ${r.fix}`).join("\n"));
  }
  const session = openCliEditSession(proj, args.map);
  const { map, insertOp } = addEvent(session.map, "object", built.objectEvent);
  session.map = map;
  session.insertOps = [...session.insertOps, insertOp];
  session.scriptAppends = [...(session.scriptAppends ?? []), { path: proj.paths.mapScriptsInc(args.map), text: built.scriptAppendText }];
  return dryRunOrCommit(proj, session, args.yes, built.scriptLabel);
}

/** OBJ_EVENT_GFX_SPECIES(...) is the ONE signal a wild sign object event
 *  carries that a hand-placed NPC never does (see Task 15's own header
 *  comment) -- this is a read-only scan, no EditSession needed. */
export function runSignList(proj: Project, mapName: string): string {
  const map = proj.map(mapName);
  const signs = map.objectEvents.filter((e) => /^OBJ_EVENT_GFX_SPECIES\(/.test(e.graphicsId));
  if (signs.length === 0) return `${mapName}: no wild signs found`;
  return signs.map((e) => `  (${e.x}, ${e.y}) ${e.graphicsId} -> ${e.script}`).join("\n");
}

export interface PaintArgs { map: string; tool: "pencil" | "rect" | "bucket"; x: number; y: number; x1?: number; y1?: number; metatileId: number; yes: boolean }

function stampFor(args: PaintArgs): Stamp {
  return { width: 1, height: 1, cells: [{ metatileId: args.metatileId }] };
}

function targetsFor(args: PaintArgs): { x: number; y: number }[] {
  if (args.tool === "rect") {
    const targets: { x: number; y: number }[] = [];
    const x1 = args.x1 ?? args.x, y1 = args.y1 ?? args.y;
    for (let y = Math.min(args.y, y1); y <= Math.max(args.y, y1); y++) {
      for (let x = Math.min(args.x, x1); x <= Math.max(args.x, x1); x++) targets.push({ x, y });
    }
    return targets;
  }
  return [{ x: args.x, y: args.y }];
}

/** `bucket` (flood fill) is intentionally out of scope for this command --
 *  it needs `floodFill`'s own seed-color read off the live grid, which this
 *  thin single-shot wrapper has no reason to duplicate ahead of a real
 *  need; `pencil`/`rect` cover the CLI's own stated use case (scripted,
 *  single-shot edits), and the UI (Task 11/12) already has the full tool
 *  set for interactive work. */
function paintSession(proj: Project, args: PaintArgs): EditSession {
  if (args.tool === "bucket") throw new Error("pokemap paint: --tool bucket is not supported from the CLI yet -- use pencil or rect, or paint interactively in the UI");
  const session = openCliEditSession(proj, args.map);
  session.blocks = paintCells(session.blocks, session.layout.width, session.layout.height, targetsFor(args), stampFor(args), args.x, args.y);
  return session;
}

export function runPaint(proj: Project, args: PaintArgs): string {
  const session = paintSession(proj, args);
  return dryRunOrCommit(proj, session, args.yes, `${args.map} (${args.tool})`);
}

/** Always a dry run, regardless of what the caller passes for `yes` --
 *  `diff` exists specifically so a script can preview an edit with no way
 *  to accidentally commit it; `paint --yes` is the only path that writes. */
export function runDiff(proj: Project, args: Omit<PaintArgs, "yes">): string {
  const session = paintSession(proj, { ...args, yes: false });
  const plan = planSave(proj, session);
  return formatDiffText(plan);
}
