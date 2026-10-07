import type { ProjectInfo } from "@pokemap/core/src/family.js";
import type { BrowseResult, HubState, OpenConflict } from "@pokemap/core/src/hub/wire.js";
import { isRecord, isProjectInfo } from "../gbc/guards.js";

/**
 * Pure runtime type guards + the one non-GET fetch this app makes
 * (`openProject`) for the hub UI (Plan 6c A2). Mirrors `gbc/guards.ts`'s own
 * "every fetch response checked against a real guard" posture -- this file
 * never casts a hub response.
 */

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
}

/** `GET /api/hub`'s response shape. `recent` entries are checked
 *  structurally (`path`/`family`/`openedAt`) rather than importing
 *  `RecentEntry` as a type-only shortcut -- same "guard every field a reader
 *  actually needs" posture `isProjectInfo` already takes on `family`. */
export function isHubState(x: unknown): x is HubState {
  if (!isRecord(x)) return false;
  if (x.current !== null && !isProjectInfo(x.current)) return false;
  if (!Array.isArray(x.recent)) return false;
  for (const entry of x.recent) {
    if (!isRecord(entry)) return false;
    if (typeof entry.path !== "string") return false;
    if (entry.family !== "gba" && entry.family !== "gbc") return false;
    if (typeof entry.openedAt !== "string") return false;
  }
  return true;
}

/** `GET /api/hub/browse`'s response shape. `entries[].family` is
 *  `"gba"|"gbc"|"unsupported"|null` -- never a wider `typeof === "string"`
 *  check, same exact-literal posture `isProjectInfo`'s own `family` check
 *  takes. */
export function isBrowseResult(x: unknown): x is BrowseResult {
  if (!isRecord(x)) return false;
  if (x.dir !== null && typeof x.dir !== "string") return false;
  if (x.parent !== null && typeof x.parent !== "string") return false;
  if (!Array.isArray(x.entries)) return false;
  for (const entry of x.entries) {
    if (!isRecord(entry)) return false;
    if (typeof entry.name !== "string") return false;
    if (typeof entry.path !== "string") return false;
    const f = entry.family;
    if (f !== "gba" && f !== "gbc" && f !== "unsupported" && f !== null) return false;
  }
  return true;
}

/** `POST /api/hub/open`'s 409 response shape. */
export function isOpenConflict(x: unknown): x is OpenConflict {
  if (!isRecord(x)) return false;
  if (typeof x.error !== "string") return false;
  if (!isStringArray(x.dirtyMaps)) return false;
  return true;
}

export type OpenProjectResult =
  | { kind: "opened"; info: ProjectInfo }
  | { kind: "conflict"; dirtyMaps: string[]; error: string }
  | { kind: "error"; error: string };

/**
 * The one POST this app makes (everything else goes through
 * `useGuardedFetch`/`fetchGuarded`, GET-only) -- reads and guards its own
 * body the way `SaveDialog.tsx`'s own `save()` does (`r.json().catch(() =>
 * null)`, never a bare cast), and never throws: every failure path (a bad
 * status, a shape that fails its guard, a thrown fetch) resolves to a `kind:
 * "error"` result instead, so a caller never needs its own try/catch around
 * this.
 */
export async function openProject(path: string, force?: boolean): Promise<OpenProjectResult> {
  try {
    const body: Record<string, unknown> = force ? { path, force: true } : { path };
    const r = await fetch("/api/hub/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const parsed: unknown = await r.json().catch(() => null);

    if (r.ok && isProjectInfo(parsed)) {
      return { kind: "opened", info: parsed };
    }
    if (r.status === 409 && isOpenConflict(parsed)) {
      return { kind: "conflict", dirtyMaps: parsed.dirtyMaps, error: parsed.error };
    }
    const message = isRecord(parsed) && typeof parsed.error === "string" ? parsed.error : `Open failed (status ${r.status})`;
    return { kind: "error", error: message };
  } catch (e) {
    return { kind: "error", error: e instanceof Error ? e.message : String(e) };
  }
}
