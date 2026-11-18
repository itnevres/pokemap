/** Shared tileset version store (Task 10b). Every URL builder that renders tiles reads
 *  `useTilesetVersion()` so a staged tileset edit refetches an already-open canvas. */

import { useSyncExternalStore } from "react";

let version = 0;
let currentGeneration = 0;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const getSnapshot = (): number => version;

function setVersion(next: number): void {
  if (next === version) return;
  version = next;
  for (const listener of listeners) listener();
}

/** Records a tileset version announced by a session or map reply. Lower values never lower the store. */
export function noteTilesetVersion(v: unknown, generation?: number): void {
  if (generation !== undefined && generation !== currentGeneration) return;
  if (typeof v !== "number" || !Number.isFinite(v)) return;
  if (v > version) setVersion(v);
}

/** Production role: the FamilyApp unmount resets it, retiring the generation so late replies from the old project are dropped. Also used for test isolation. */
export function resetTilesetVersion(): void {
  currentGeneration++;
  setVersion(0);
}

/** The current tileset version; components that call this re-render when it changes. */
export function useTilesetVersion(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Current value without subscribing, for URL builders that are created outside a component render. */
export function currentTilesetVersion(): number {
  return version;
}

/** Bumped by `resetTilesetVersion`; `noteTilesetVersion` drops replies stamped with an older generation. */
export function tilesetGeneration(): number { return currentGeneration; }
