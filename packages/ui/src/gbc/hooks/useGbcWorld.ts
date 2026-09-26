import type { GbcWorldPayload } from "@pokemap/core/src/gbc/wire.js";
import { isGbcWorldPayload } from "../guards.js";
import { useGuardedFetch, type UseGuardedFetchResult } from "../../hooks/useGuardedFetch.js";

export type UseGbcWorldResult = UseGuardedFetchResult<GbcWorldPayload>;

/**
 * Fetches `/api/world` once for the GBC world view -- built on the same
 * shared `useGuardedFetch` every other GBC hook uses (Task 3's own
 * convention). Unlike `useGbcMap`, the URL never changes (there is only ever
 * the one world), so this is the simplest possible `useGuardedFetch` caller:
 * a fixed URL and a guard, giving a real, visible `error` string on a 404,
 * a network failure, or a shape that fails `isGbcWorldPayload` -- never a
 * silently-empty world.
 */
export function useGbcWorld(): UseGbcWorldResult {
  return useGuardedFetch("/api/world", isGbcWorldPayload);
}
