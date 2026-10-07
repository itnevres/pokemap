/**
 * The hub server/UI wire payload shapes -- a types-only module, no runtime
 * code, mirroring `gbc/wire.ts`'s own "server annotates with `satisfies`,
 * UI imports the same interfaces" split (Plan 6c A1 fix round, coordinator
 * addition for A2: the UI needs these without depending on the `@pokemap/
 * server` package itself). `packages/server/src/recent.ts` and `hub.ts`
 * import from here rather than declaring their own copies.
 *
 * `ProjectInfo`/`EngineFamily` -- the shapes both families' project servers
 * already produce -- stay in `../family.ts` next to each other; `HubState`
 * below composes `ProjectInfo`, it doesn't duplicate it (same reasoning as
 * `gbc/wire.ts`'s own doc comment on why `ProjectInfo` isn't declared twice).
 */
import type { EngineFamily, ProjectInfo } from "../family.js";

/** One project the hub has opened before, newest first once read back
 *  through `readRecent`/`pushRecent` (`packages/server/src/recent.ts`) --
 *  the hub's own "recent projects" picker list, and what a bare `pokemap`
 *  invocation reopens (`serve.ts`). */
export interface RecentEntry {
  path: string;
  family: EngineFamily;
  openedAt: string; // ISO
}

/** One entry in a `GET /api/hub/browse` listing -- always a directory
 *  (browse never returns files), `family` from `probeEngineFamily`
 *  (`../family.ts`): a real family, `"unsupported"` (some marker present but
 *  ambiguous or refused), or `null` (no marker at all, an ordinary
 *  non-project directory). */
export interface BrowseEntry {
  name: string;
  path: string;
  family: EngineFamily | "unsupported" | null;
}

/** `GET /api/hub/browse`'s response shape. `dir`/`parent` are `null` only
 *  for the win32 "no `dir` given, show drives" case (`dir`) and at any root
 *  -- POSIX `/`, a win32 drive root, or a UNC share root (`parent`); every
 *  other `dir`/`parent` is a normalised absolute path string. */
export interface BrowseResult {
  dir: string | null;
  parent: string | null;
  entries: BrowseEntry[];
}

/** `GET /api/hub`'s response shape -- the hub's own "what's open, what's
 *  recent" summary the picker UI polls. */
export interface HubState {
  current: ProjectInfo | null;
  recent: RecentEntry[];
}

/** `POST /api/hub/open`'s 409 response shape: unsaved edits blocked the
 *  swap, and `force: true` is what overrides it. */
export interface OpenConflict {
  error: string;
  dirtyMaps: string[];
}
