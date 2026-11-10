import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CopyPreview, EventOptions, MapEventOptions, TextPreview } from "@pokemap/core/src/addEvent/types.js";
import type { Visit } from "./useVisit.js";

// Instances are project-scoped by the shell's family:root:generation key. No cache survives a reload.
const invalidators = new Set<() => void>();
export function invalidateEventOptions(): void { for (const invalidate of invalidators) invalidate(); }
export interface EventOptionsQuery { x?: number; y?: number; dest?: string }
interface Cache { project?: EventOptions; maps: Map<string, MapEventOptions>; isCurrent: () => boolean }

export function useEventOptions(mapName: string | null, visit: Visit) {
  const owner = useRef({ mapName, visit });
  owner.current = { mapName, visit };
  const generation = useRef(0);
  const cache = useRef<Cache>({ maps: new Map(), isCurrent: visit.isCurrent });
  const [view, setView] = useState<{ forMap: string | null; project?: EventOptions; map?: MapEventOptions; isCurrent: () => boolean }>({ forMap: mapName, isCurrent: visit.isCurrent });
  // Retire visible values during render, before the new visit's layout effect commits.
  if (view.forMap !== mapName) {
    generation.current++;
    cache.current = { maps: new Map(), isCurrent: visit.isCurrent };
    setView({ forMap: mapName, isCurrent: visit.isCurrent });
  }
  const latestLoad = useRef(0);
  const invalidate = useCallback(() => {
    generation.current++;
    cache.current = { maps: new Map(), isCurrent: owner.current.visit.isCurrent };
    setView({ forMap: owner.current.mapName, isCurrent: owner.current.visit.isCurrent });
  }, []);
  useEffect(() => { invalidators.add(invalidate); return () => { invalidators.delete(invalidate); }; }, [invalidate]);

  const request = useCallback(async <T,>(url: string, current: () => boolean): Promise<T> => {
    try {
      const response = await fetch(url);
      const body = await response.json();
      if (!current()) throw Object.assign(new Error("Event options visit retired"), { stale: true });
      if (!response.ok) throw Object.assign(new Error(typeof body?.error === "string" ? body.error : `GET ${url} -> ${response.status}`), { code: body?.code });
      return body as T;
    } catch (error) {
      if (!current()) throw Object.assign(new Error("Event options visit retired"), { stale: true });
      throw error;
    }
  }, []);

  const load = useCallback(async (q: EventOptionsQuery = {}): Promise<void> => {
    const { mapName: name, visit: ticket } = owner.current;
    if (name === null) return;
    const epoch = generation.current;
    const sequence = ++latestLoad.current;
    const current = () => ticket.isCurrent() && epoch === generation.current;
    if (!cache.current.isCurrent()) cache.current = { maps: new Map(), isCurrent: ticket.isCurrent };
    const params = new URLSearchParams();
    if (q.x !== undefined) params.set("x", String(q.x));
    if (q.y !== undefined) params.set("y", String(q.y));
    if (q.dest !== undefined) params.set("dest", q.dest);
    const query = params.size ? `?${params}` : "";
    const url = `/api/event-options/${encodeURIComponent(name)}${query}`;
    try {
      const [project, map] = await Promise.all([
        cache.current.project ?? request<EventOptions>("/api/event-options", current),
        cache.current.maps.get(url) ?? request<MapEventOptions>(url, current),
      ]);
      if (!current()) return;
      cache.current.project = project;
      cache.current.maps.set(url, map);
      if (sequence === latestLoad.current) setView({ forMap: name, project, map, isCurrent: ticket.isCurrent });
    } catch (error) {
      if (current()) throw error;
    }
  }, [request]);
  const preview = useCallback(<T,>(kind: "copy" | "text", label: string): Promise<T> => {
    const { mapName: name, visit: ticket } = owner.current;
    const epoch = generation.current;
    if (name === null) return Promise.reject(new Error("No map selected"));
    return request<T>(`/api/event-options/${encodeURIComponent(name)}/${kind}?label=${encodeURIComponent(label)}`,
      () => ticket.isCurrent() && generation.current === epoch);
  }, [request]);
  const copy = useCallback((label: string) => preview<CopyPreview>("copy", label), [preview]);
  const text = useCallback((label: string) => preview<TextPreview>("text", label), [preview]);
  // Merged once per (project, map) pair: consumers re-run load() when project identity changes, so a fresh object per
  // load would loop forever while the map has staged flags/vars.
  const merged = useMemo(() => !view.project || !(view.map?.stagedFlags?.length || view.map?.stagedVars?.length) ? view.project : { ...view.project,
    flags: [...new Set([...view.project.flags, ...(view.map.stagedFlags ?? [])])],
    vars: [...new Set([...view.project.vars, ...(view.map.stagedVars ?? [])])] }, [view.project, view.map]);
  return { project: view.isCurrent() ? merged : undefined, map: view.isCurrent() ? view.map : undefined, load, copy, text, invalidate };
}
