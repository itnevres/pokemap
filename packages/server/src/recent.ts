import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { norm } from "@pokemap/core/src/config/paths.js";
import type { EngineFamily } from "@pokemap/core/src/family.js";

/** One project the hub has opened before, newest first once read back through
 *  `readRecent`/`pushRecent` -- the hub's own "recent projects" picker list,
 *  and (Plan 6c A1 spec, serve.ts) what a bare `pokemap` invocation reopens. */
export interface RecentEntry {
  path: string;
  family: EngineFamily;
  openedAt: string; // ISO
}

interface RecentFile {
  version: 1;
  entries: RecentEntry[];
}

/** `home ?? POKEMAP_HOME ?? ~/.pokemap` -- every caller (hub.ts, serve.ts,
 *  and every test in recent.test.ts) goes through this rather than inlining
 *  the fallback chain, so there is exactly one place that ever reads
 *  `POKEMAP_HOME` or `homedir()` for this file's own purpose. */
export function recentHome(home?: string): string {
  return home ?? process.env.POKEMAP_HOME ?? join(homedir(), ".pokemap");
}

function recentJsonPath(home: string): string {
  return join(home, "recent.json");
}

function isRecentFile(v: unknown): v is RecentFile {
  const f = v as Partial<RecentFile> | null;
  return !!f && f.version === 1 && Array.isArray(f.entries) && f.entries.every((e) =>
    typeof e?.path === "string" && (e.family === "gba" || e.family === "gbc") && typeof e.openedAt === "string",
  );
}

/** Never throws, even on a missing or corrupt file (I7/G4 in spirit, but for
 *  a file this code itself owns rather than the decomp corpus): a hub with a
 *  bad recent.json must still start, not crash on the first read. A file
 *  that fails to parse OR fails the shape guard is renamed to
 *  `recent.json.bad` (overwriting any previous `.bad`) so the bytes aren't
 *  silently lost, and this function answers `[]` either way. */
export function readRecent(home: string): RecentEntry[] {
  const path = recentJsonPath(home);
  if (!existsSync(path)) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    quarantine(path);
    return [];
  }
  if (!isRecentFile(parsed)) {
    quarantine(path);
    return [];
  }
  return parsed.entries;
}

function quarantine(path: string): void {
  const badPath = `${path}.bad`;
  if (existsSync(badPath)) rmSync(badPath, { force: true });
  renameSync(path, badPath);
}

/** New entry first, deduped by normalised path (case-insensitive on win32,
 *  matching how Windows paths are actually case-insensitive on disk), capped
 *  at 10. Writes `${home}/recent.json` pretty-printed with a trailing
 *  newline and returns the list that was written. */
export function pushRecent(home: string, entry: { path: string; family: EngineFamily }, now: Date = new Date()): RecentEntry[] {
  const path = norm(entry.path);
  const key = process.platform === "win32" ? path.toLowerCase() : path;
  const existing = readRecent(home).filter((e) => (process.platform === "win32" ? norm(e.path).toLowerCase() : norm(e.path)) !== key);
  const entries = [{ path, family: entry.family, openedAt: now.toISOString() }, ...existing].slice(0, 10);

  mkdirSync(home, { recursive: true });
  const file: RecentFile = { version: 1, entries };
  writeFileSync(recentJsonPath(home), `${JSON.stringify(file, null, 2)}\n`);
  return entries;
}
