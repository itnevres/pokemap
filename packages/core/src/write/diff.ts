import type { SavePlan } from "./save.js";

/** The only two fields either formatter reads. Widened from `SavePlan` so a
 *  GBC plan (`GbcSavePlan`, which carries a different `session`) renders
 *  through the same formatters with no GBC-specific copy. Type-only: GBA
 *  behaviour is unchanged. */
type Renderable = Pick<SavePlan, "changes" | "refusals">;

/** Human-readable rendering for the CLI's `pokemap diff`. */
export function formatDiffText(plan: Renderable): string {
  const lines: string[] = [];
  for (const c of plan.changes) lines.push(c.summary);
  for (const r of plan.refusals) lines.push(`REFUSED [${r.code}] ${r.subject}: ${r.message} -- ${r.fix}`);
  if (lines.length === 0) return "nothing to save";
  return lines.join("\n");
}

/** Structured rendering for the UI's SaveDialog -- deliberately drops
 *  `session` (not JSON-safe, and not the caller's business: the dialog
 *  renders what would change, not the raw edit state that produced it). */
export function formatDiffJson(plan: Renderable): { changes: SavePlan["changes"]; refusals: SavePlan["refusals"] } {
  return { changes: plan.changes, refusals: plan.refusals };
}
