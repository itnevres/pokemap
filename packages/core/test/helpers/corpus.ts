import { existsSync } from "node:fs";
import { it } from "vitest";
import { testConfig } from "./testRoots.js";
import { projectPaths } from "../../src/config/paths.js";

const config = testConfig();

export const SUBJECT_ROOT = config.projectPath;
export const REFERENCE_ROOTS = config.referenceProjects;

/** A decomp checkout is "present" if the one file every engine has is there. */
export const hasProject = (root: string): boolean =>
  existsSync(projectPaths(root).layoutsJson);

/** Skips rather than fails when the subject decomp is not on this machine. */
export const itWithCorpus = it.skipIf(!hasProject(SUBJECT_ROOT));

export const availableReferenceRoots = (): string[] => REFERENCE_ROOTS.filter(hasProject);

/**
 * A reference engine by directory name, e.g. `referenceRoot("pokefirered")`.
 * Returns undefined when that engine is not configured or not checked out,
 * so a caller can skip rather than fail.
 */
export const referenceRoot = (name: string): string | undefined =>
  REFERENCE_ROOTS.find((r) => projectPaths(r).root.split("/").pop() === name && hasProject(r));
