import type { Project } from "@pokemap/core/src/project.js";
import type { Encounters } from "@pokemap/core/src/load/encounters.js";
import type { coverage } from "@pokemap/core/src/analyse/coverage.js";
import type { buildWorld } from "@pokemap/core/src/world/resolve.js";
import type { createSymbolIndexCache } from "./projectSymbols.js";
import type { createGbaAddEventRoutes } from "./addEventRoutes.js";
import type { createEditSessionStore } from "./editSessions.js";
import type { syncTilesetOverlay } from "./tilesetOverlay.js";

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
