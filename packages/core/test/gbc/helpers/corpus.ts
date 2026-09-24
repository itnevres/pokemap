import { existsSync, readFileSync } from "node:fs";
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
