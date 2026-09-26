import { useEffect, useState } from "react";

export interface UseGuardedFetchResult<T> {
  data: T | null;
  error: string | null;
}

/** Truncates a received-value fragment to 200 characters, so a huge or
 *  malformed body never blows up an error banner. Exported so the one
 *  existing unit test (`useGuardedFetch.test.ts`) can pin the exact
 *  truncation boundary once, rather than every guarded-fetch hook's own
 *  test having to re-derive it. */
export function describeReceived(x: unknown): string {
  let s: string;
  try {
    s = JSON.stringify(x);
  } catch {
    s = String(x);
  }
  return s.length > 200 ? s.slice(0, 200) : s;
}

/**
 * The shared "fetch once, validate the shape, surface every failure
 * visibly" hook shape `useMapGroups.ts` established and `useProjectInfo`/
 * `useGbcGroups` (Task 3) both need identically. Lives here, under the
 * family-agnostic `src/hooks/`, rather than under `src/gbc/` -- it has
 * nothing GBC-specific in it (no GBC types, no GBC routes), and
 * `useProjectInfo` (also family-agnostic: `Root` calls it *before* the
 * family is even known) needs to import it too. Putting a shared,
 * family-agnostic primitive under a family-specific directory would force
 * a GBA-agnostic hook to import from GBC's own tree, which is exactly
 * backwards -- specific code may depend on generic code, never the other
 * way round. GBC-specific hooks (`useGbcGroups`, and Task 4-6's
 * `useGbcMap`/`useGbcWorld`/`useGbcCoverage`) import this from
 * `../../hooks/useGuardedFetch.js`, which is the correct direction.
 *
 * `label` defaults to `url` and only needs to differ once a caller's fetch
 * URL and its human-readable name diverge (e.g. an encoded path segment) --
 * none of Task 3's hooks need that yet, but the parameter costs nothing to
 * have ready for Task 4+.
 *
 * `url === null` (Task 4's `useGbcMap`: "nothing selected yet") fetches
 * nothing at all and resets to the idle `{ data: null, error: null }` state
 * -- the same "null name -> idle, no request" shape `useMapLayout.ts`
 * already established, extended into this shared helper rather than
 * `useGbcMap` hand-rolling its own fetch+guard+error block around it (the
 * Task 3 fix-round convention this file itself exists to enforce).
 *
 * A non-OK status, a thrown fetch, or a response that fails `guard` all set
 * `error` to a real, visible message -- never a silent `.catch`, never an
 * unhandled rejection. The `cancelled` guard mirrors `useMapGroups.ts`
 * exactly: a response that resolves after the caller has unmounted (or
 * `url` has changed) never calls a stale setter.
 *
 * **Every URL change resets BOTH `data` and `error` to `null` before the new
 * fetch even starts** (fix round, spec review finding 3) -- this hook was
 * originally written for Task 3's fixed-URL hooks (`useProjectInfo`/
 * `useGbcGroups`), which never change `url` after mount, so the gap was
 * invisible there. Task 4's `useGbcMap` DOES change `url` (one call per
 * selected map), and without this reset: an `error` from a failed map stuck
 * around forever after selecting a good one afterward (`error` is checked
 * first, and nothing ever cleared it), and a slow map's fetch left the
 * PREVIOUS map's `data` on screen under the new map's name while the new
 * fetch was still in flight (wrong `Fit`, wrong defects banner, wrong
 * metatile-palette request count) until it resolved. For Task 3's own
 * fixed-URL hooks this reset is a harmless no-op (there is only ever the one
 * URL, and both start `null` on mount already).
 */
export function useGuardedFetch<T>(url: string | null, guard: (x: unknown) => x is T, label?: string): UseGuardedFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const effectiveLabel = label ?? url ?? "";

  useEffect(() => {
    setData(null);
    setError(null);
    if (url === null) return;
    let cancelled = false;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`GET ${effectiveLabel} -> ${r.status}`);
        return r.json() as Promise<unknown>;
      })
      .then((d) => {
        if (cancelled) return;
        if (!guard(d)) {
          throw new Error(`GET ${effectiveLabel} returned an unexpected shape: ${describeReceived(d)}`);
        }
        setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [url, guard, label]);

  return { data, error };
}
