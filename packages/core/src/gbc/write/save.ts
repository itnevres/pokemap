import { readFileSync } from "node:fs";
import type { Refusal } from "../../write/guards.js";
import type { PendingChange } from "../../write/save.js";
import type { GbcProject } from "../project.js";
import type { Block, GbcMap, GbcMapEvents, Layout } from "../model/types.js";
import { parseMapEvents } from "../load/events.js";

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
  const eventsText = readFileSync(`${proj.root}/maps/${mapName}.asm`, "utf8");
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

/** Ascending indices `i < min(len)` whose `metatileId` differs. Ids are the
 *  whole of a GBC block (no collision/elevation bits), so this is exactly
 *  the set of bytes a save must patch. */
export function changedBlockIndices(original: Block[], current: Block[]): number[] {
  const out: number[] = [];
  const n = Math.min(original.length, current.length);
  for (let i = 0; i < n; i++) if (original[i]!.metatileId !== current[i]!.metatileId) out.push(i);
  return out;
}
