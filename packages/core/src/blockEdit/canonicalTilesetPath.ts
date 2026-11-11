import { posix } from "node:path";

/** One repo-relative identity for tileset files, independent of source spelling. */
export function canonicalTilesetPath(path: string): string {
  return posix.normalize(path.replace(/\\/g, "/"));
}
