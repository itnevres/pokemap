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
 * A non-OK status, a thrown fetch, or a response that fails `guard` all set
 * `error` to a real, visible message -- never a silent `.catch`, never an
 * unhandled rejection. The `cancelled` guard mirrors `useMapGroups.ts`
 * exactly: a response that resolves after the caller has unmounted (or
 * `url` has changed) never calls a stale setter.
 */
export function useGuardedFetch<T>(url: string, guard: (x: unknown) => x is T, label: string = url): UseGuardedFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`GET ${label} -> ${r.status}`);
        return r.json() as Promise<unknown>;
      })
      .then((d) => {
        if (cancelled) return;
        if (!guard(d)) {
          throw new Error(`GET ${label} returned an unexpected shape: ${describeReceived(d)}`);
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
