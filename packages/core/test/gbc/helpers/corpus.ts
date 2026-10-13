import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "vitest";

// Mirrors packages/core/test/helpers/corpus.ts, for the gbc config block
// instead of the top-level one. An absent `gbc` block (not yet configured on
// this machine) must skip rather than error, so SUBJECT_ROOT falls back to
// "" -- hasGbcProject("") is false, so itWithGbcCorpus skips every test that
// uses it instead of throwing during module load.
const config = JSON.parse(readFileSync("pokemap.config.json", "utf8")) as {
  gbc?: { projectPath: string; referenceProjects?: string[] };
};

export const GBC_SUBJECT_ROOT = config.gbc?.projectPath ?? "";
export const GBC_REFERENCE_ROOTS = config.gbc?.referenceProjects ?? [];

/** A pokecrystal-family checkout is "present" if its gbc family marker is there. */
export const hasGbcProject = (root: string): boolean => existsSync(`${root}/data/maps/attributes.asm`);

/** Skips rather than fails when the subject decomp is not on this machine. */
export const itWithGbcCorpus = it.skipIf(!hasGbcProject(GBC_SUBJECT_ROOT));

/** The subject root plus every reference root that is actually checked out. */
export const gbcCorpusRoots = (): string[] =>
  [GBC_SUBJECT_ROOT, ...GBC_REFERENCE_ROOTS].filter(hasGbcProject);

/**
 * A hermetic copy of a corpus root (minus `.git`) in a fresh temp dir, for any
 * test that WRITES (Plan 7 Task 4/6/7). Never write a real root itself.
 * Pair with `removeTemp` in `afterAll`.
 */
export function copyGbcRootToTemp(root: string): string {
  const dir = mkdtempSync(join(tmpdir(), "pokemap-gbc-"));
  try {
    cpSync(root, dir, { recursive: true, filter: (src) => !/[\\/]\.git([\\/]|$)/.test(src) });
  } catch (e) {
    removeTemp(dir); // a half-copied temp dir must not leak
    throw e;
  }
  return dir;
}

export const copyGbcSubjectToTemp = (): string => copyGbcRootToTemp(GBC_SUBJECT_ROOT);

/** Windows AV/indexers hold files briefly after thousands of writes (EBUSY), hence the generous retries. */
export function removeTemp(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

/** "subject" (the configured gbc.projectPath) or "pret" (vanilla pret/pokecrystal); anything else throws, so a new reference root cannot silently inherit another root's pins. */
export function gbcRootLabel(root: string): "subject" | "pret" {
  if (root === GBC_SUBJECT_ROOT) return "subject";
  if (/[\\/]pokecrystal$/.test(root)) return "pret";
  throw new Error(`gbcRootLabel: no pins for corpus root ${root}; add them (and a label) before adding a reference project`);
}
