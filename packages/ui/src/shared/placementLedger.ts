/**
 * Plan 11 Task 4: Placement-version ledger (pure TypeScript, no React).
 * Implements the spec's "Placement saves" reconciliation model (F1-F4).
 * The ledger tracks versions per map, never positions.
 */

export type PlacementVersion = number;

export interface PlacementSnapshot {
  /** For each map that had a version at snapshot time, its latest version and whether it was resolved then. */
  readonly mapStates: ReadonlyMap<string, { readonly version: PlacementVersion; readonly resolved: boolean }>;
}

export interface PlacementLedger {
  /** A drag gesture starts moving `map`; returns a new version, unique across all maps. */
  begin(map: string): PlacementVersion;
  /** The gesture ended off its start tile: a POST tagged `v` was sent. */
  moved(map: string, v: PlacementVersion): void;
  /** The gesture ended on its start tile: nothing POSTed. */
  noop(map: string, v: PlacementVersion): void;
  /** The POST for `v` landed: `ok` -> acknowledged, else failed. */
  resolve(map: string, v: PlacementVersion, ok: boolean): void;
  /** Taken when a world GET is issued. Returns an immutable value. */
  snapshot(): PlacementSnapshot;
  /** At that GET's landing, whether that map shows the server's position. */
  serverShows(map: string, snap: PlacementSnapshot): boolean;
  /** At that GET's landing, for a map the server does not place, whether it leaves the world. */
  dropAbsent(map: string, snap: PlacementSnapshot): boolean;
}

interface VersionState {
  state: "pending" | "acknowledged" | "failed" | "settled";
  isMoved: boolean; // true for moved, false for noop
  waitingOn: PlacementVersion | null; // for noop: the version it waits for; for moved: null
}

interface MapState {
  latestVersion: PlacementVersion;
  versions: Map<PlacementVersion, VersionState>;
}

/** A fresh ledger: no map has a version, so every map shows the server until a gesture begins. */
export function createPlacementLedger(): PlacementLedger {
  let versionCounter = 0;
  const maps = new Map<string, MapState>();

  function getMapState(map: string): MapState {
    let ms = maps.get(map);
    if (!ms) {
      ms = { latestVersion: 0, versions: new Map() };
      maps.set(map, ms);
    }
    return ms;
  }

  function findInFlightMoved(map: string): PlacementVersion | null {
    const ms = maps.get(map);
    if (!ms) return null;
    let candidate: PlacementVersion | null = null;
    for (const [v, state] of ms.versions) {
      if (state.isMoved && state.state === "pending") {
        if (candidate === null || v > candidate) {
          candidate = v;
        }
      }
    }
    return candidate;
  }

  return {
    begin(map: string): PlacementVersion {
      versionCounter++;
      const v = versionCounter;
      const ms = getMapState(map);
      ms.latestVersion = v;
      ms.versions.set(v, { state: "pending", isMoved: false, waitingOn: null });
      return v;
    },

    moved(map: string, v: PlacementVersion): void {
      const state = maps.get(map)?.versions.get(v);
      if (!state) return; // should not happen in correct usage
      state.isMoved = true;
      // state remains pending
    },

    noop(map: string, v: PlacementVersion): void {
      const state = maps.get(map)?.versions.get(v);
      if (!state) return;
      state.isMoved = false;
      const inFlight = findInFlightMoved(map);
      if (inFlight !== null) {
        state.waitingOn = inFlight;
        // state remains pending (waiting)
      } else {
        state.state = "settled";
        state.waitingOn = null;
      }
    },

    resolve(map: string, v: PlacementVersion, ok: boolean): void {
      const ms = maps.get(map);
      if (!ms) return;
      const state = ms.versions.get(v);
      if (!state) return;
      if (state.state !== "pending") return; // already resolved

      const newState = ok ? "acknowledged" : "failed";
      state.state = newState;

      // Propagate to any noop versions waiting on this one.
      for (const [, otherState] of ms.versions) {
        if (otherState.waitingOn === v) {
          otherState.state = newState;
          otherState.waitingOn = null;
        }
      }
    },

    snapshot(): PlacementSnapshot {
      const mapStates = new Map<string, { version: PlacementVersion; resolved: boolean }>();
      for (const [map, ms] of maps) {
        const latest = ms.latestVersion;
        const state = ms.versions.get(latest);
        if (state) {
          mapStates.set(map, { version: latest, resolved: state.state !== "pending" });
        }
      }
      // A fresh Map per call, never handed back to the ledger: later changes cannot alter what it recorded.
      return { mapStates };
    },

    serverShows,

    dropAbsent(map: string, snap: PlacementSnapshot): boolean {
      if (!serverShows(map, snap)) return false;
      const ms = maps.get(map);
      if (!ms) return false; // no version -> not failed/settled
      const state = ms.versions.get(ms.latestVersion);
      if (!state) return false;
      return state.state === "failed" || state.state === "settled";
    },
  };

  /** True when the map has no version, or its latest version now is the one `snap` recorded and was resolved then. */
  function serverShows(map: string, snap: PlacementSnapshot): boolean {
    const ms = maps.get(map);
    if (!ms) return true; // never moved: the server's position
    const snapRecord = snap.mapStates.get(map);
    // No record: the map's first gesture began after this GET was issued.
    if (!snapRecord) return false;
    return ms.latestVersion === snapRecord.version && snapRecord.resolved;
  }
}
