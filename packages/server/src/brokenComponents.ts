import type { Project } from "@pokemap/core/src/project.js";
import type { BrokenPath, Layout } from "@pokemap/core/src/model/types.js";
import { PathEscapeError } from "@pokemap/core/src/gbc/load/pathGuard.js";
import { assertLayoutUsable, brokenPathOfLayout as coreBrokenPathOfLayout } from "@pokemap/core/src/brokenComponents.js";

/**
 * Plan H F1c / F1d / D25: a layout, or a tileset it uses, whose path leaves the
 * project is a defect on the maps that use it. Those maps cannot be rendered,
 * opened for editing or saved until it is fixed; nothing else is blocked. This
 * is the one place the GBA server decides "is this map's layout usable".
 *
 * The rule itself now lives in core (`brokenComponents.ts`); this module keeps
 * the same exported names and signatures for the server's callers and delegates.
 * A broken layout OR a broken tileset both surface as a `PathEscapeError` from
 * the core helpers (F1d unified the tileset accessor onto `PathEscapeError`).
 */
export function brokenPathOfLayout(project: Project, layout: Layout): BrokenPath | undefined {
  return coreBrokenPathOfLayout(project, layout);
}

/** Throws a `PathEscapeError` carrying the defect when the layout or one of its tilesets is broken. */
export function refuseBrokenLayout(project: Project, layout: Layout): void {
  assertLayoutUsable(project, layout);
}

/** The 409 body for a refusal, or undefined when `error` is not one. Same status as the other typed refusals (`BlockEditRefusal`). */
export function brokenPathBody(error: unknown): BrokenPathBody | undefined {
  return error instanceof PathEscapeError ? refusalBody(error.brokenPath) : undefined;
}

export interface BrokenPathBody { error: string; code: "broken-path"; defect: BrokenPath }
export function refusalBody(defect: BrokenPath): BrokenPathBody {
  return { error: defect.message, code: "broken-path", defect };
}
