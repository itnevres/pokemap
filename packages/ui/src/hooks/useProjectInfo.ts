import type { ProjectInfo } from "@pokemap/core/src/family.js";
import { isProjectInfo } from "../gbc/guards.js";
import { useGuardedFetch, type UseGuardedFetchResult } from "./useGuardedFetch.js";

export type UseProjectInfoResult = UseGuardedFetchResult<ProjectInfo>;

/**
 * Fetches `/api/project` once, the family-bootstrap counterpart of
 * `useMapGroups.ts` (same shape: local `data`/`error` state, a `cancelled`
 * guard so a slow response after unmount -- or after `Root` has already
 * routed away -- never calls a stale setter). Built on the shared
 * `useGuardedFetch` (see that file's own doc comment for why it lives in
 * this family-agnostic directory, not under `src/gbc/`).
 *
 * A non-OK status, a thrown fetch, or a response that fails `isProjectInfo`
 * all set `error` to a message naming what went wrong, never a silent
 * `.catch` and never an unhandled rejection.
 */
export function useProjectInfo(): UseProjectInfoResult {
  return useGuardedFetch("/api/project", isProjectInfo);
}
