import { existsSync, readFileSync } from "node:fs";
import type { Project } from "@pokemap/core/project";
import { errorMessage } from "@pokemap/core/errorMessage";

/**
 * Resolves the decomp root either from `--project <path>` or from
 * `pokemap.config.json` in the current working directory -- the shared
 * first step every CLI command takes, GBA or GBC alike, before branching on
 * `detectEngineFamily` (Task 10, `index.ts`).
 *
 * Deliberately does NOT search upward for `pokemap.config.json` -- that
 * would be better UX, but it is new resolution behaviour this task was not
 * asked to add. A clear refusal naming the cwd it looked in and the
 * `--project` alternative is the fix asked for; walking parent directories
 * is a separate decision for later.
 *
 * GBC users pass `--project` explicitly (GBC format findings §"Config and
 * family decision"): `pokemap.config.json`'s `gbc.projectPath` is test-only
 * config for the corpus helpers, never a CLI fallback here -- adding one
 * would let a GBC command silently pick up a config file meant for the test
 * suite alone.
 *
 * `packages/server/src/serve.ts --gbc` is the one place outside the test
 * suite that DOES read `gbc.projectPath` (Plan 6b Task 1a) -- a deliberate
 * dev-server convenience, not a CLI fallback: `serve.ts` has no `--project`
 * flag of its own, and `gbc.projectPath` is exactly the already-configured
 * Crystal project every GBC dev session against this repo launches the UI
 * against. See that file's own comment for why the two differ.
 */
export function resolveRoot(explicit?: string): string {
  if (explicit) return explicit;

  const configPath = "pokemap.config.json";
  if (!existsSync(configPath)) {
    throw new Error(
      `no ${configPath} in ${process.cwd()} and no --project <decomp root> given. ` +
      `Run pokemap from the repo root, or pass --project explicitly.`,
    );
  }

  const raw = readFileSync(configPath, "utf8");
  let cfg: unknown;
  try {
    cfg = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `${configPath} is not valid JSON: ${errorMessage(e)}`,
    );
  }
  const projectPath = (cfg as { projectPath?: unknown } | null)?.projectPath;
  if (typeof projectPath !== "string") {
    throw new Error(
      `${configPath} has no string "projectPath" key (found ${JSON.stringify(projectPath)}). ` +
      `Expected e.g. { "projectPath": "/path/to/decomp" }.`,
    );
  }
  return projectPath;
}

/** `openProject(resolveRoot(explicit))` -- unchanged behaviour and messages
 *  for every existing GBA caller (Task 10 only factored `resolveRoot` out of
 *  this function; it did not change what either half does). */
export async function resolveProject(explicit?: string): Promise<Project> {
  // Loaded here, not at the top, so a GBC command never pays for the GBA
  // project module's import graph (Plan 4 row 6b).
  const { openProject } = await import("@pokemap/core/project");
  return openProject(resolveRoot(explicit));
}

/**
 * Accept either a layout name or a map name.
 *
 * Delegates to `proj.layoutForMap` for the map-name case rather than
 * re-deriving the lookup here: that method is the one place documented (and
 * tested) to throw an I7-quality message naming both map.json and
 * layouts.json when a map's layout id is dangling. Hand-rolling the same
 * lookup with `layoutById` would silently drop that message the moment the
 * two implementations drift.
 */
export function layoutNameFor(proj: Project, target: string): string {
  if (proj.layoutByName(target)) return target; // layoutForMap cannot resolve a layout name
  return proj.layoutForMap(target).name;
}
