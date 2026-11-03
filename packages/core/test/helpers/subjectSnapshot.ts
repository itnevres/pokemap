import { existsSync } from "node:fs";
import { join } from "node:path";

export function subjectSnapshot(): { gba?: string; gbc?: string } {
  const root = process.env.POKEMAP_SUBJECT_SNAPSHOT;
  if (!root) throw new Error("POKEMAP_SUBJECT_SNAPSHOT is unset: run vitest from the repository root with subjectSnapshotSetup globalSetup");
  const out: { gba?: string; gbc?: string } = {};
  for (const family of ["gba", "gbc"] as const) {
    const p = join(root, family);
    if (existsSync(p)) out[family] = p;
  }
  return out;
}
