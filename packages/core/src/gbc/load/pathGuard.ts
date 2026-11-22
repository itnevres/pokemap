import { insideRoot } from "../../config/paths.js";
import type { BrokenPath } from "../../model/types.js";

/**
 * D25: a GBC `INCBIN`/`INCLUDE` path that leaves the project is a defect on
 * the component that owns it (one map's blocks, one tileset, the roof set,
 * the palette tables), with file and line context -- the project still
 * opens, and nothing outside the project is ever read. Every loader that
 * resolves a decomp-sourced path to a file it then reads calls
 * `assertInsideRoot` first, so an escaping spelling is refused there instead
 * of reaching the filesystem.
 */
export interface PathWhere {
  /** Repo-relative decomp file the directive lives in, e.g. "data/maps/blocks.asm". */
  file: string;
  /** 1-based line of the directive, when known. */
  line?: number;
  /** The directive itself, e.g. "INCBIN" or "INCLUDE". */
  key: string;
}

export class PathEscapeError extends Error {
  readonly brokenPath: BrokenPath;

  constructor(brokenPath: BrokenPath) {
    super(brokenPath.message);
    this.name = "PathEscapeError";
    this.brokenPath = brokenPath;
  }
}

/**
 * The non-throwing form: a ready `BrokenPath` defect record when `path`
 * leaves the project, `undefined` when it stays inside.
 */
export function brokenPathFor(path: string, where: PathWhere): BrokenPath | undefined {
  if (insideRoot(path)) return undefined;
  const at = where.line === undefined ? where.file : `${where.file}:${where.line}`;
  return {
    file: where.file,
    ...(where.line === undefined ? {} : { line: where.line }),
    key: where.key,
    path,
    message: `${at}: ${where.key} path "${path}" leaves the project`,
    fix: `Point the ${where.key} at a file inside the project (no "..", drive letter, or leading "/").`,
  };
}

/** Throws `PathEscapeError` (carrying the `BrokenPath`) when `path` leaves the project. */
export function assertInsideRoot(path: string, where: PathWhere): void {
  const brokenPath = brokenPathFor(path, where);
  if (brokenPath) throw new PathEscapeError(brokenPath);
}
