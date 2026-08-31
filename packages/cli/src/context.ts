import { existsSync, readFileSync } from "node:fs";
import { openProject, type Project } from "@pokemap/core/src/project.js";

/**
 * Resolves the project either from `--project <path>` or from
 * `pokemap.config.json` in the current working directory.
 *
 * Deliberately does NOT search upward for `pokemap.config.json` -- that
 * would be better UX, but it is new resolution behaviour this task was not
 * asked to add. A clear refusal naming the cwd it looked in and the
 * `--project` alternative is the fix asked for; walking parent directories
 * is a separate decision for later.
 */
export function resolveProject(explicit?: string): Project {
  if (explicit) return openProject(explicit);

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
      `${configPath} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const projectPath = (cfg as { projectPath?: unknown } | null)?.projectPath;
  if (typeof projectPath !== "string") {
    throw new Error(
      `${configPath} has no string "projectPath" key (found ${JSON.stringify(projectPath)}). ` +
      `Expected e.g. { "projectPath": "/path/to/decomp" }.`,
    );
  }
  return openProject(projectPath);
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
