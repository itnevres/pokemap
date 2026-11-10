import {
  cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync,
  readFileSync, realpathSync, rmSync, statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

export interface TestConfig {
  projectPath: string;
  referenceProjects: string[];
  gbc?: { projectPath: string; referenceProjects?: string[] };
  yellowPath?: string;
}
export type Family = "gba" | "gbc";

// Source inputs only. Include gitignored config/sidecars; exclude generated ROMs,
// objects and git metadata even when nested inside one of these directories.
export const COPY_ALLOW_LISTS: Record<Family, readonly string[]> = {
  gba: ["data", "include", "src", "graphics/tilesets",
    "graphics/object_events", "graphics/pokemon", "charmap.txt", "porymap.project.cfg", ".pokemap"],
  gbc: ["data", "constants", "maps", "home", "engine", "gfx/tilesets",
    "gfx/tilesets.asm", "gfx/tileset_palette_maps.asm", "gfx/pokemon", "gfx/pics.asm",
    "gfx/overworld", "gfx/sprites", "porymap.project.cfg", ".pokemap"],
};
const PREFIX = "pokemap-test-roots-";
const ownedScratchDirs = new Set<string>();
const normalize = (path: string): string => resolve(path).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
const inside = (path: string, parent: string): boolean => normalize(path).startsWith(`${normalize(parent)}/`);

/** Resolve even an absent root via its closest existing parent. */
function physicalPath(path: string): string {
  let parent = resolve(path);
  const tail: string[] = [];
  while (!existsSync(parent)) {
    // Broken symlinks must fail closed, not masquerade as absent projects.
    try { lstatSync(parent); throw new Error(`Unresolvable test root: ${path}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const next = dirname(parent);
    if (next === parent) throw new Error(`Unresolvable test root: ${path}`);
    tail.unshift(basename(parent)); parent = next;
  }
  return join(realpathSync.native(parent), ...tail);
}

export function createScratchDir(): string {
  const dir = mkdtempSync(join(realpathSync.native(tmpdir()), PREFIX));
  ownedScratchDirs.add(resolve(dir));
  return dir;
}

/** Only a directory created in this process, directly under the real tmpdir. */
export function removeScratchDir(dir: string): void {
  const absolute = resolve(dir);
  const temp = realpathSync.native(tmpdir());
  if (!ownedScratchDirs.has(absolute) || !basename(absolute).startsWith(PREFIX)
    || normalize(dirname(absolute)) !== normalize(temp)
    || !inside(realpathSync.native(absolute), temp) || lstatSync(absolute).isSymbolicLink()) {
    throw new Error(`Refusing cleanup of unowned scratch directory: ${dir}`);
  }
  rmSync(absolute, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  ownedScratchDirs.delete(absolute);
}

export function configuredRoots(config: TestConfig): { path: string; family: Family }[] {
  return [
    { path: config.projectPath, family: "gba" as const },
    ...config.referenceProjects.map(path => ({ path, family: "gba" as const })),
    ...(config.gbc ? [{ path: config.gbc.projectPath, family: "gbc" as const },
      ...(config.gbc.referenceProjects ?? []).map(path => ({ path, family: "gbc" as const }))] : []),
    ...(config.yellowPath ? [{ path: config.yellowPath, family: "gbc" as const }] : []),
  ];
}

/** Check each root and (deep) every link under it, including links at the root itself. */
export function assertScratchRoots(config: TestConfig, scratchDir: string, deep = true): void {
  const scratch = realpathSync.native(scratchDir);
  for (const { path: root } of configuredRoots(config)) {
    const physicalRoot = root ? physicalPath(root) : "";
    if (!root || !inside(physicalRoot, scratch) || !inside(resolve(root), scratchDir)) {
      throw new Error(`Test root outside scratch directory: ${root}`);
    }
    const visit = (dir: string, ancestors: Set<string>): void => {
      const key = normalize(realpathSync.native(dir));
      if (ancestors.has(key)) throw new Error(`Test root ${root}: cyclic link ${dir}`);
      const next = new Set(ancestors).add(key);
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isSymbolicLink()) {
          const physical = realpathSync.native(path);
          if (!inside(physical, scratch) || (normalize(physical) !== normalize(physicalRoot) && !inside(physical, physicalRoot))) {
            throw new Error(`Test root ${root}: escaping link ${path}`);
          }
          if (statSync(path).isDirectory()) visit(path, next);
        } else if (entry.isDirectory()) visit(path, next);
      }
    };
    if (deep && existsSync(root)) visit(root, new Set());
  }
}

export function testConfig(): TestConfig {
  const path = process.env.POKEMAP_TEST_CONFIG;
  if (!path) throw new Error("POKEMAP_TEST_CONFIG is unset: run Vitest with testRootsSetup");
  const config = JSON.parse(readFileSync(path, "utf8")) as TestConfig;
  // Roots only: the deep link walk runs once in setup (copies are dereferenced); per-file it cost ~5 s.
  assertScratchRoots(config, dirname(path), false);
  return config;
}

function copyAllowed(path: string): boolean {
  return !/(^|[\\/])(?:\.git|build)(?:[\\/]|$)/i.test(path)
    && !/\.(?:o|a|elf|gba|gbc|gb|map|sym|sav|srm|1bpp|2bpp|4bpp|8bpp|lz|gbapal)$/i.test(path);
}

export function copyTestRoots(config: TestConfig, scratchDir: string): { config: TestConfig; files: number; bytes: number } {
  if (!ownedScratchDirs.has(resolve(scratchDir))) throw new Error(`Unowned scratch directory: ${scratchDir}`);
  let files = 0, bytes = 0, index = 0;
  const copy = (source: string, family: Family): string => {
    const target = join(scratchDir, String(index++), basename(source.replace(/\\/g, "/"))).replace(/\\/g, "/");
    if (!inside(target, scratchDir)) throw new Error(`Invalid scratch target for ${source}`);
    if (!existsSync(source)) return target;
    mkdirSync(target, { recursive: true });
    for (const entry of COPY_ALLOW_LISTS[family]) {
      const from = join(source, entry);
      if (!existsSync(from)) continue;
      const to = join(target, entry);
      mkdirSync(dirname(to), { recursive: true });
      cpSync(from, to, { recursive: true, dereference: true, filter: path => {
        if (!copyAllowed(path)) return false;
        const stat = statSync(path);
        if (stat.isFile()) { files++; bytes += stat.size; }
        return true;
      } });
    }
    return target;
  };
  const result: TestConfig = {
    projectPath: copy(config.projectPath, "gba"),
    referenceProjects: config.referenceProjects.map(path => copy(path, "gba")),
    ...(config.gbc ? { gbc: {
      projectPath: copy(config.gbc.projectPath, "gbc"),
      referenceProjects: (config.gbc.referenceProjects ?? []).map(path => copy(path, "gbc")),
    } } : {}),
    ...(config.yellowPath ? { yellowPath: copy(config.yellowPath, "gbc") } : {}),
  };
  assertScratchRoots(result, scratchDir);
  return { config: result, files, bytes };
}

export type RootManifest = Record<string, { size: number; mtimeMs: number }>;
/** Covers all allow-listed files (even ignored outputs) and all top-level files. */
export function rootManifest(root: string, family: Family): RootManifest {
  const manifest: RootManifest = {};
  const walk = (path: string, rel: string, ancestors: Set<string>): void => {
    const key = normalize(realpathSync.native(path));
    if (ancestors.has(key)) throw new Error(`Cyclic source path: ${path}`);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      const next = new Set(ancestors).add(key);
      for (const name of readdirSync(path).sort()) walk(join(path, name), `${rel}/${name}`, next);
    } else if (stat.isFile()) manifest[rel] = { size: stat.size, mtimeMs: stat.mtimeMs };
  };
  if (existsSync(root)) {
    for (const name of readdirSync(root).sort()) {
      if (statSync(join(root, name)).isFile()) walk(join(root, name), name, new Set());
    }
    for (const entry of COPY_ALLOW_LISTS[family]) {
      if (existsSync(join(root, entry))) walk(join(root, entry), entry, new Set());
    }
  }
  return manifest;
}

export function assertManifestUnchanged(root: string, before: RootManifest, after: RootManifest): void {
  const changes: string[] = [];
  for (const file of Object.keys(before).sort()) {
    if (after[file] && (after[file]!.size !== before[file]!.size || after[file]!.mtimeMs !== before[file]!.mtimeMs)) changes.push(`changed ${file}`);
  }
  for (const file of Object.keys(after).sort()) if (!before[file]) changes.push(`added ${file}`);
  for (const file of Object.keys(before).sort()) if (!after[file]) changes.push(`removed ${file}`);
  if (changes.length) throw new Error(`Real root ${root} modified:\n${changes.join("\n")}`);
}

/** Content, not timestamps: save-and-restore tests may legitimately touch mtimes. */
export function contentManifest(root: string): string {
  const out: Record<string, string> = {};
  const visit = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === ".git") continue;
      const path = join(dir, entry.name), name = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Unexpected link in scratch manifest: ${path}`);
      if (entry.isDirectory()) visit(path, name);
      else out[name] = createHash("sha256").update(readFileSync(path)).digest("hex");
    }
  };
  visit(root, "");
  return JSON.stringify(out);
}
