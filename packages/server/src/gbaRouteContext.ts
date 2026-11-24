import type { Project } from "@pokemap/core/src/project.js";
import type { Encounters } from "@pokemap/core/src/load/encounters.js";
import type { coverage } from "@pokemap/core/src/analyse/coverage.js";
import type { buildWorld } from "@pokemap/core/src/world/resolve.js";
import type { createSymbolIndexCache } from "./projectSymbols.js";
import type { createGbaAddEventRoutes } from "./addEventRoutes.js";
import type { createEditSessionStore } from "./editSessions.js";
import type { syncTilesetOverlay } from "./tilesetOverlay.js";
import type { EditSession, planSave } from "@pokemap/core/src/write/save.js";
import type { AtomicEntry } from "@pokemap/core/src/write/atomic.js";
import type { formatDiffJson } from "@pokemap/core/src/write/diff.js";
import type { refreshGbaLinkedSigns } from "./signRefresh.js";
import type { EventKind } from "@pokemap/core/src/edit/events.js";

/**
 * Plan H I1: the closure values the GBA read routes (gbaReadRoutes.ts) read from
 * `createProjectHandler`. Every member is a `const` there (the lazy caches are read
 * through their getters), so a destructured copy never goes stale.
 */
export interface GbaRouteContext {
  project: Project;
  symbols: ReturnType<typeof createSymbolIndexCache>;
  addEvents: ReturnType<typeof createGbaAddEventRoutes>;
  editSessions: ReturnType<typeof createEditSessionStore>;
  syncOverlay: () => ReturnType<typeof syncTilesetOverlay>;
  overlayStamp: () => { tilesetVersion: number; tilesetInstance: string };
  editEntryFor: (name: string) => ReturnType<ReturnType<typeof createEditSessionStore>["open"]>;
  cachedRender: (name: string, border: number) => Buffer | undefined;
  pngCache: Map<string, Buffer>;
  iconCache: Map<string, Buffer>;
  getWorld: () => ReturnType<typeof buildWorld>;
  getEncounters: () => Encounters;
  getCoverage: () => ReturnType<typeof coverage>;
  getSpecies: () => string[];
}

type EditEntry = ReturnType<GbaRouteContext["editEntryFor"]>;
type SignPlanBody = Omit<ReturnType<typeof formatDiffJson>, "refusals"> & {
  tilesetEffects: ReturnType<typeof planSave>["tilesetEffects"];
  refusals: ReturnType<typeof formatDiffJson>["refusals"];
  signNotices: ReturnType<typeof refreshGbaLinkedSigns>["notices"];
  fingerprint: string | null;
};

/**
 * Plan H I2b: what the GBA edit-session routes (gbaEditRoutes.ts) read on top of the read routes' values.
 * Every member is a `const` in `createProjectHandler` except `disposed` and `allMapsCache`: they are `let`s
 * (`dispose()` reassigns the first, the commit route the second), so they are accessors here.
 */
export interface GbaEditRouteContext extends Pick<GbaRouteContext, "project" | "symbols" | "addEvents" | "editSessions" | "syncOverlay" | "overlayStamp" | "editEntryFor" | "pngCache"> {
  readonly disposed: boolean;
  /** Read-write: the commit route resets it (`ctx.allMapsCache = undefined`); `getAllMapsForWarpScan` refills it. */
  allMapsCache: { mapId: string; map: ReturnType<Project["map"]> }[] | undefined;
  signFailure: (name: string, error: unknown) => { refusals: { code: string; fix: string; subject: string; message: string }[] };
  indicatorFailure: (name: string, error: unknown) => { refusals: { code: string; subject: string; message: string; fix: string }[] };
  indicatorParagraphs: (entry: EditEntry, text: string) => string[][];
  signPlan: (name: string) => {
    plan: ReturnType<typeof planSave>;
    prepared: AtomicEntry[];
    prepareError: unknown;
    checkNames: ReturnType<GbaRouteContext["addEvents"]["freshCheck"]>;
    body: SignPlanBody;
  };
  sendSession: (send: (code: number, body: unknown) => void, code: number, entry: EditEntry) => void;
  handleEventOp: <T = undefined>(
    entry: EditEntry, label: string,
    op: (map: EditSession["map"]) => { map: EditSession["map"]; extra?: T },
  ) => { map: EditSession["map"]; isDirty: boolean; extra?: T };
  getAllMapsForWarpScan: () => { mapId: string; map: ReturnType<Project["map"]> }[];
  EVENT_KINDS: Set<EventKind>;
}
