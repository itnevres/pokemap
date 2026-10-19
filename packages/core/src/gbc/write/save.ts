import { readFileSync } from "node:fs";
import { writeFilesAtomically, type AtomicEntry, type AtomicIo } from "../../write/atomic.js";
import type { Refusal } from "../../write/guards.js";
import type { PendingChange } from "../../write/save.js";
import type { GbcProject } from "../project.js";
import type { Block, GbcMap, GbcMapEvents, Layout } from "../model/types.js";
import { parseMapEvents } from "../load/events.js";
import { blkFilePath, changedBlockIndices, eventsFilePath, guardGbcSave } from "./guards.js";

// Public surface of the funnel; the definitions live in guards.ts so that file
// needs only a type import from here (no runtime import cycle).
export { blkFilePath, changedBlockIndices, eventsFilePath };

/**
 * The open GBC map's current, possibly-edited state, plus the exact state it
 * was opened with (the guards need both sides of every diff).
 *
 * Unlike GBA's `EditSession`, this holds CURRENT TEXT, not an op list. GBA
 * replays `jsonEdits`/`insertOps`/`removeOps` against `originalMapJson` at
 * plan time only because `jsonEdit.ts` needs the original to splice against.
 * A GBC event edit is a surgical `asmSplice` applied immediately
 * (`eventsText -> eventsText'`, then `events = parseMapEvents(eventsText')`),
 * and every op re-locates its target in the CURRENT text, so there is no
 * index-shift bookkeeping and no stale `AsmCall` offsets to track. G3 still
 * holds: text only ever changes through splice primitives, never by
 * regenerating it from `events`.
 */
export interface GbcEditSession {
  mapName: string;
  /** `proj.map(mapName)` -- the project's cached header. Never mutated. */
  map: GbcMap;
  /** `proj.layout(map).layout` as opened. `layout.blocks` is the as-opened
   *  array and is never mutated (it is what `loadLayout` handed back). */
  layout: Layout;
  /** Current, possibly-edited blocks (length === width*height). */
  blocks: Block[];
  /** The ORIGINAL blocks this session opened with -- `changedBlockIndices`
   *  and the file-changed-on-disk guard both need the "before" side, and
   *  `blocks` above is already "after" by the time a save is planned.
   *
   *  **MUST be a deep, independent copy -- never the same array/object
   *  reference as `blocks` (nor as `layout.blocks`).** Aliasing them (e.g.
   *  `originalBlocks: blocks` instead of `blocks.map((b) => ({ ...b }))`)
   *  silently defeats every diff with no runtime error: `before`/`after`
   *  would always be the identical object, so no paint could ever register
   *  as a change and a save would quietly write nothing. Any other
   *  constructor of a session (tests, the server's editSessions) must copy
   *  the same way. */
  originalBlocks: Block[];
  /** Current `maps/<mapName>.asm` text. Changes ONLY via asmSplice-family
   *  primitives (G3). */
  eventsText: string;
  /** The literal text read from disk at open.
   *
   *  **Never regenerated and never reassigned** (not even to track
   *  `eventsText`'s edits): it is the baseline "did the text change?" and
   *  "did someone else change the file under us?" are both measured against.
   *  If it drifted, both checks would reason about a different starting
   *  point than the one actually on disk, with no error to catch it. */
  originalEventsText: string;
  /** `parseMapEvents(eventsText, mapName)` -- every edit op must keep this in
   *  step with `eventsText` (re-parse after each splice). */
  events: GbcMapEvents;
  /** `parseMapEvents(originalEventsText, mapName)`. A separate parse, so
   *  mutating `events` can never move it -- the object-const-desync guard
   *  compares the two. */
  originalEvents: GbcMapEvents;
  /** Names of every map whose `blkPath === layout.blkPath`, this one
   *  included, in `proj.maps` order. `.blk` <-> map is not 1:1 (House1.blk
   *  backs dozens of maps), so a paint here changes all of them -- the plan
   *  summary says so. */
  layoutSharedBy: string[];
  /** A plain field, as in GBA. Task 4's command stack owns setting it; this
   *  module only ever initialises it to `false`. */
  isDirty: boolean;
}

export interface GbcSavePlan {
  session: GbcEditSession;
  changes: PendingChange[];
  /** Refusals as of `planGbcSave`'s own snapshot of `session` --
   *  **informational / display-only** (`formatDiffText`/`formatDiffJson`
   *  render these before the player confirms). This is NOT the save gate:
   *  `session` is live/mutable, and a plan can be held across an intervening
   *  edit, so this field can go stale. The actual gate is `commitGbcSave`'s
   *  own fresh re-validation against `plan.session`'s CURRENT state at commit
   *  time -- never rely on this field alone to prevent a write. */
  refusals: Refusal[];
}

/**
 * Opens a map for editing. An unknown map name throws inside `proj.map`
 * (G4: unknown map); that error is deliberately not caught or re-worded here.
 * Reads `maps/<mapName>.asm` (the fixed path, GBC findings §3.1) and parses it
 * twice so `events` and `originalEvents` can never alias.
 */
export function openGbcEditSession(proj: GbcProject, mapName: string): GbcEditSession {
  const map = proj.map(mapName);
  const { layout } = proj.layout(map);
  const eventsText = readFileSync(eventsFilePath(proj, mapName), "utf8");
  return {
    mapName,
    map,
    layout,
    blocks: layout.blocks.map((b) => ({ ...b })),
    originalBlocks: layout.blocks.map((b) => ({ ...b })),
    eventsText,
    originalEventsText: eventsText,
    events: parseMapEvents(eventsText, mapName),
    originalEvents: parseMapEvents(eventsText, mapName),
    layoutSharedBy: proj.maps.filter((m) => m.blkPath === layout.blkPath).map((m) => m.name),
    isDirty: false,
  };
}

/**
 * Computes what a save WOULD do, without writing. Safe to call on every
 * keystroke: this never writes; `commitGbcSave` is the only writer, always an
 * explicit, separate call. Blocks first, then text, nothing else.
 */
export function planGbcSave(proj: GbcProject, session: GbcEditSession): GbcSavePlan {
  const refusals = guardGbcSave(proj, session);
  const changes: PendingChange[] = [];
  const { layout, mapName } = session;

  const changed = changedBlockIndices(session.originalBlocks, session.blocks);
  if (changed.length > 0) {
    const shared = session.layoutSharedBy.length > 1 ? ` (shared by ${session.layoutSharedBy.length} maps)` : "";
    changes.push({
      path: blkFilePath(proj, layout),
      kind: "binary",
      summary: `${layout.blkPath} -- ${changed.length} block${changed.length === 1 ? "" : "s"} changed${shared}`,
    });
  }
  if (session.eventsText !== session.originalEventsText) {
    changes.push({
      path: eventsFilePath(proj, mapName),
      kind: "text",
      summary: `maps/${mapName}.asm -- event block edited`,
    });
  }
  return { session, changes, refusals };
}

/** Computes complete final bytes without writing; patches only changed block ids. */
export function prepareGbcSave(proj: GbcProject, session: GbcEditSession): AtomicEntry[] {
  const entries: AtomicEntry[] = [];
  const changed = changedBlockIndices(session.originalBlocks, session.blocks);
  if (changed.length > 0) {
    const path = blkFilePath(proj, session.layout);
    const before = readFileSync(path);
    const after = Buffer.from(before);
    for (const i of changed) after[i] = session.blocks[i]!.metatileId;
    entries.push({ path, before, after });
  }
  if (session.eventsText !== session.originalEventsText) {
    const path = eventsFilePath(proj, session.mapName);
    entries.push({ path, before: readFileSync(path), after: Buffer.from(session.eventsText, "utf8") });
  }
  return entries;
}

/**
 * Commits through the shared all-or-nothing writer, after a FRESH guardGbcSave
 * against the live session (never trusting the plan's snapshot).
 * Stages and checks every target before swapping; handled failures restore
 * swapped targets and remove owned temps best effort, reporting any failures.
 * A crash mid-swap or another program writing between check and rename is
 * outside this guarantee. Does not mutate the session.
 */
export function commitGbcSave(proj: GbcProject, plan: GbcSavePlan, prepared?: AtomicEntry[], io?: AtomicIo): void {
  const { session } = plan;
  const refusals = guardGbcSave(proj, session);
  if (refusals.length > 0) {
    throw new Error(`save refused: ${refusals.map((r) => `${r.code} (${r.subject})`).join(", ")}`);
  }
  writeFilesAtomically(prepared ?? prepareGbcSave(proj, session), io);
}
