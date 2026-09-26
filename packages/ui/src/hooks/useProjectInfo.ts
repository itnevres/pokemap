import { useEffect, useState } from "react";
import type { ProjectInfo } from "@pokemap/core/src/family.js";
import { isProjectInfo } from "../gbc/guards.js";

export interface UseProjectInfoResult {
  data: ProjectInfo | null;
  error: string | null;
}

/** Truncates a received-value fragment to 200 characters (spec: "name the
 *  received value, truncated to 200 characters"), so a huge or malformed
 *  body never blows up the error banner. */
function describeReceived(x: unknown): string {
  let s: string;
  try {
    s = JSON.stringify(x);
  } catch {
    s = String(x);
  }
  return s.length > 200 ? s.slice(0, 200) : s;
}

/**
 * Fetches `/api/project` once, the family-bootstrap counterpart of
 * `useMapGroups.ts` (same shape: local `data`/`error` state, a `cancelled`
 * guard so a slow response after unmount -- or after `Root` has already
 * routed away -- never calls a stale setter).
 *
 * A non-OK status, a thrown fetch, or a response that fails `isProjectInfo`
 * all set `error` to a message naming what went wrong, never a silent
 * `.catch` and never an unhandled rejection.
 */
export function useProjectInfo(): UseProjectInfoResult {
  const [data, setData] = useState<ProjectInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/project")
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/project -> ${r.status}`);
        return r.json() as Promise<unknown>;
      })
      .then((d) => {
        if (cancelled) return;
        if (!isProjectInfo(d)) {
          throw new Error(`GET /api/project returned an unexpected shape: ${describeReceived(d)}`);
        }
        setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, error };
}
