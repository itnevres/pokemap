import { readFileSync, writeFileSync } from "node:fs";
import type { Project } from "../project.js";
import type { Block, Layout } from "../model/types.js";
import type { MapData } from "../load/maps.js";
import { guardLayoutSave, guardMapSave, type Refusal } from "./guards.js";
import { planBlockdataWrite, planBorderWrite } from "./binary.js";
import { editJson, insertArrayElement, removeArrayElement, type JsonEdit, type JsonPath } from "./jsonEdit.js";

export interface InsertOp { path: JsonPath; index: number; value: unknown; }
export interface RemoveOp { path: JsonPath; index: number; }
/** A plain-text append targeting a NON-json decomp file -- currently only
 *  `scripts.inc` (Task 17's wild-sign write path). Deliberately NOT a
 *  JsonEdit/InsertOp: a `.inc` script file has no JSON structure for
 *  jsonEdit.ts's splice machinery to operate on, and an append is already
 *  exact and lossless with no re-serialisation risk (I2 concerns JSON
 *  documents specifically; a plain-text append changes nothing it doesn't
 *  touch by construction). */
export interface ScriptAppend { path: string; text: string; }

/**
 * The open map's current, possibly-edited state, plus enough of its
 * ORIGINAL state to guard against (guardMapSave needs the map/blocks
 * BEFORE this session's edits, not just after) and to splice against
 * (`originalMapJson` is the raw text `editJson`/`insertArrayElement`/
 * `removeArrayElement` all operate on -- I2 forbids ever re-serialising the
 * whole document, so the raw source text is not optional scaffolding, it
 * is the only thing that can be written back).
 *
 * Lives server-side (see this plan's own architecture note) -- the browser
 * never holds one of these directly, it only ever sees the JSON-safe
 * projection the server sends back after each edit op.
 */
export interface EditSession {
  mapName: string;
  layout: Layout;
  /** Current, possibly-edited interior blocks (parseBlocks's own full
   *  array, trailing block included -- see binary.ts's own doc comment for
   *  why this must never be reconstructed from width*height). */
  blocks: Block[];
  border: Block[];
  /** Current, possibly-edited map data -- object_events/warp_events/etc.
   *  reflect insertOps/removeOps already applied, so guardMapSave can read
   *  real "next" event positions off it directly. */
  map: MapData;
  /** The ORIGINAL blocks this session opened with -- guardMapSave's own
   *  warp-tile-moved check needs a prev/next pair, and `blocks` above is
   *  already "next" by the time a save is being planned. */
  originalBlocks: Block[];
  /** The ORIGINAL map data this session opened with, for the identical
   *  prev/next reason. */
  originalMap: MapData;
  /** Raw, unparsed map.json text -- the splice target for every jsonEdits/
   *  insertOps/removeOps entry below. */
  originalMapJson: string;
  /** Scalar field replacements, applied via editJson. */
  jsonEdits: JsonEdit[];
  /** Array insertions, applied via insertArrayElement, in the order given
   *  (each one's own `index` is relative to the array's state AFTER every
   *  earlier op in this same array has already applied -- callers building
   *  a session incrementally, one op at a time, naturally produce indices
   *  in this shape already; see Task 8's editSessions.ts). */
  insertOps: InsertOp[];
  removeOps: RemoveOp[];
  /** Optional (Task 4 predates Task 17's wild-sign feature; every EARLIER
   *  task's own EditSession fixtures construct one without this field, so
   *  it defaults to empty rather than becoming a required breaking change
   *  to every fixture already written into this plan) -- pending plain-text
   *  appends, currently only ever populated by Task 17's sign write path. */
  scriptAppends?: ScriptAppend[];
  isDirty: boolean;
}

export interface PendingChange {
  path: string;
  kind: "json" | "binary" | "text";
  summary: string;
}

export interface SavePlan {
  session: EditSession;
  changes: PendingChange[];
  refusals: Refusal[];
}

/**
 * Computes what a save WOULD do, without writing. Safe to call on every
 * keystroke (I6's "no autosave" half is enforced by never being the thing
 * that writes; `commitSave` is the only writer, and it is always an
 * explicit, separate call).
 */
export function planSave(proj: Project, session: EditSession): SavePlan {
  const refusals: Refusal[] = [
    ...guardLayoutSave(proj, session.layout, session.blocks, session.border),
    ...guardMapSave(proj, session.layout, session.originalMap, session.map, session.originalBlocks, session.blocks),
  ];

  const changes: PendingChange[] = [];

  const blockPlan = planBlockdataWrite(proj.paths.root, session.layout, session.blocks, proj.profile);
  if (blockPlan) {
    changes.push({
      path: blockPlan.path, kind: "binary",
      summary: `${session.layout.blockdataFilepath} -- ${blockPlan.changedBlocks.length} block${blockPlan.changedBlocks.length === 1 ? "" : "s"} changed`,
    });
  }

  const borderPlan = planBorderWrite(proj.paths.root, session.layout, session.border, proj.profile);
  if (borderPlan) {
    changes.push({
      path: borderPlan.path, kind: "binary",
      summary: `${session.layout.borderFilepath} -- ${borderPlan.changedBlocks.length} block${borderPlan.changedBlocks.length === 1 ? "" : "s"} changed`,
    });
  }

  const jsonText = applyJsonOps(session);
  if (jsonText !== session.originalMapJson) {
    const opCount = session.jsonEdits.length + session.insertOps.length + session.removeOps.length;
    changes.push({
      path: proj.paths.mapJson(session.mapName), kind: "json",
      summary: `${session.mapName}.json -- ${opCount} field edit${opCount === 1 ? "" : "s"}`,
    });
  }

  // Every entry here was placed by an explicit, already-guarded write (e.g.
  // Task 17's addWildSign, checked by guardSignWrite BEFORE it ever reaches
  // a session) -- unlike jsonText above, there is no "compare against
  // original" step, because scriptAppends never exist unless the player
  // explicitly added one.
  for (const append of session.scriptAppends ?? []) {
    changes.push({
      path: append.path, kind: "text",
      summary: `${append.path} -- append ${append.text.split("\n").length} line${append.text.split("\n").length === 1 ? "" : "s"}`,
    });
  }

  return { session, changes, refusals };
}

/**
 * The ONLY function in this codebase that writes to a decomp path (I8),
 * other than sidecar.ts/dungeons.ts's own separate `.pokemap/` writers,
 * which are I8-exempt by design (they never touch a decomp data file).
 * Throws rather than writing anything when refusals are non-empty -- a UI
 * that simply does not RENDER a refusal cannot bypass this guard by
 * omission, the check lives here, not in whatever calls it.
 */
export function commitSave(proj: Project, plan: SavePlan): void {
  if (plan.refusals.length > 0) {
    throw new Error(`save refused: ${plan.refusals.map((r) => `${r.code} (${r.subject})`).join(", ")}`);
  }
  const { session } = plan;

  const blockPlan = planBlockdataWrite(proj.paths.root, session.layout, session.blocks, proj.profile);
  if (blockPlan) writeFileSync(blockPlan.path, blockPlan.bytes);

  const borderPlan = planBorderWrite(proj.paths.root, session.layout, session.border, proj.profile);
  if (borderPlan) writeFileSync(borderPlan.path, borderPlan.bytes);

  const jsonText = applyJsonOps(session);
  if (jsonText !== session.originalMapJson) writeFileSync(proj.paths.mapJson(session.mapName), jsonText);

  // Read-concat-write, the same "read real state, write back the whole
  // file" shape as the map.json branch above -- NOT appendFileSync, so
  // Task 4's own noStrayWrites grep (which checks writeFileSync/writeFile
  // only) keeps covering every write this function makes with no second
  // exempted call shape to track.
  for (const append of session.scriptAppends ?? []) {
    const existing = readFileSync(append.path, "utf8");
    const sep = existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
    writeFileSync(append.path, existing + sep + append.text);
  }
}

/** jsonEdits (scalar replace) first, then insertOps, then removeOps --
 *  scalar replacement never shifts array indices, so it is always safe to
 *  apply before any structural change; insertOps are applied in the order
 *  given (see EditSession.insertOps's own doc comment on index semantics);
 *  removeOps last, highest index first within each distinct array path, so
 *  removing several elements from the same array in one commit does not
 *  invalidate a later removal's own index. */
function applyJsonOps(session: EditSession): string {
  let text = session.originalMapJson;
  if (session.jsonEdits.length > 0) text = editJson(text, session.jsonEdits);
  for (const op of session.insertOps) text = insertArrayElement(text, op.path, op.index, op.value);
  const removesByPath = new Map<string, number[]>();
  for (const op of session.removeOps) {
    const key = JSON.stringify(op.path);
    removesByPath.set(key, [...(removesByPath.get(key) ?? []), op.index]);
  }
  for (const [key, indices] of removesByPath) {
    const path = JSON.parse(key) as JsonPath;
    for (const index of [...indices].sort((a, b) => b - a)) text = removeArrayElement(text, path, index);
  }
  return text;
}
