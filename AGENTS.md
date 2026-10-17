# PokeMap workflow

Launch steps and the required maintenance rule are in [LAUNCH.md](LAUNCH.md). Keep it updated alongside any launch-related change.

The global `~/.Codex/AGENTS.md` rules still apply: session length, offload, and the cost-discipline rules 0-7. This file only adds risk-based execution on top of them. Where a Superpowers skill's default asks for more process than the task's tier, this file wins.

## Keep Anthropic token use to a minimum

- Run the `delegate` skill before every implementation and every bulk read. It walks the chain: free offload models, then Codex, then Anthropic subagents. Anthropic is the last resort, not the default.
- Codex's own context is for the work only Codex should do: classification, design decisions, review judgment, and final verification. Digesting logs, diffs, unfamiliar code, and large files goes to `offload`.
- Inline Codex edits are allowed only for tiny changes (roughly ≤20 lines, 1-2 files) where writing a brief would cost more than the edit. Log the reason in the task ledger.
- Pick the lowest tier that meets the risk. Do not escalate the tier, the model, or the number of reviews without a stated reason.

## Classify every task before implementing

State the tier and give a one-line reason in the plan or the task ledger.

**Tie-break: if any high-risk trigger applies, or you are in doubt, the task is high risk.**

| Tier | When | Process |
|------|------|---------|
| Low | Isolated, fully specified. No trigger below. | Implement through `delegate`, or inline if tiny. Run the relevant checks. One combined spec-and-quality review only if a review is warranted. |
| Medium | Ordinary feature or a change across connected components, where any wrong answer would fail a test or a check automatically. | Short acceptance criteria. Implementer through `delegate`. One combined spec-and-quality review. |
| High | Any trigger: concurrency or async ordering; independently derived numeric fixtures or oracles; parsing or error boundaries (decomp source, ROM data, hub I/O); writes to subject source repos; save/discard ownership; substantial shared-engine or canvas-core behavior; any case where a wrong answer would not be caught automatically. | Full Superpowers workflow (spec, plan, subagent-driven development) with separate spec and quality reviews. Opus only for these reviews, per global rule 1. |

## Evidence (every tier, scaled to its scope)

- The full gate result (pass / fail / file count), plus passing typecheck and UI build, before any claim that work is done (`superpowers:verification-before-completion`).
- A live check of any UI change in the real app (headless Playwright is fine), with the result recorded.
- High risk: mutation checks showing the new tests fail when the logic breaks.
- Task reports go to `docs/superpowers/task-reports/<plan-slug>/` per global rule 7.

## Planning interviews

- Interview the user only about unresolved decisions. Use `superpowers:brainstorming`. Do not re-ask settled requirements.
- Settled decisions are binding: roadmap decisions D1-D16 in `docs/superpowers/plans/2026-10-14-pokemap-roadmap-unified-ui.md`, rulings in each spec, and the status in `docs/superpowers/RESUME.md`.
- Record new binding decisions and acceptance criteria in those documents: the spec for rulings and criteria, the roadmap for cross-plan decisions, and RESUME for status. Do not create new files for them.
