import { useLayoutEffect, useRef, useState } from "react";

/** A committed visit identity shared by the GBA and GBC editing hooks. It
 * lets each hook retire per-map UI state during render, before children see it. */
export interface Visit {
  /** True on the render where `key` changed from the previous visit. */
  changed: boolean;
  /** False once this render's visit is no longer committed, including A -> B -> A or unmount. */
  isCurrent(): boolean;
}

/** Keeps a visit object stable until its key changes; consumers use it to preserve
 * their stable canvas/body position while retiring only their visit-scoped state. */
export function useVisit(key: string | null): Visit {
  const [visit, setVisit] = useState({ key });
  const currentVisit = useRef<typeof visit | null>(visit);
  const changed = visit.key !== key;
  if (changed) setVisit({ key });
  useLayoutEffect(() => {
    currentVisit.current = visit;
    return () => { currentVisit.current = null; };
  }, [visit]);
  return { changed, isCurrent: () => currentVisit.current === visit };
}
