# Task 2 implementation report

Status: implementation present; focused native checks pass. Coordinator Vitest gate, typecheck, UI build, and independent high-risk reviews remain required.

## Scope and routing ledger

- Tier: High, because prepared saves and rollback own writes to subject repositories.
- BASE: `a030c28ccfcaaf1a7201e203551803c2607ba1d2`; initial worktree status clean.
- Requirements read in order: scratchpad `task-2-codex.md`, `task-2-brief.md`, `spec-10a3.md` D-A/D-B/D-C and R1-R10, then Task 1 `atomic.ts`.
- Applied delegate and ponytail skills. This is the coordinator's assigned Codex implementation task (multi-file, failure handling, save bytes); implemented in this isolated supplied worktree rather than recursively dispatching another implementer. No Anthropic usage, external model calls, or source-repository writes.
- Detection: the new GBA/GBC tests assert exact prepared and committed bytes, actual earlier swaps before injected final-rename failure, restoration/removal and cleanup, fresh refusal ordering, exact prepared-buffer use, deterministic fingerprints and sensitivity to one-byte disk edits. Full project commands remain the coordinator's gate because dependencies are absent in this checkout.

## Changes

- `packages/core/src/write/save.ts`: added `prepareSave`; preserves blockdata/border comparison rules, nullable before for missing binary files, map.json surgical edits and UTF-8 encoding, first-appearance script path ordering and one final entry per script path with replace then ordered appends. Commits recheck fresh refusals first and delegate exact supplied entries (or freshly prepare when omitted) to the atomic writer; optional fourth io argument supports failure injection. Updated guarantee and limits.
- `packages/core/src/gbc/write/save.ts`: added `prepareGbcSave`; copies the actual .blk before buffer and patches changed indices only, then prepares changed events text. Commit follows the same refusal-first, supplied-or-fresh prepared entries behavior and atomic writer; updated docs.
- `packages/core/src/write/atomic.ts`: added SHA-256 `planFingerprint` using eight-byte big-endian byte lengths, ordered UTF-8 paths, explicit absent/present marker, before bytes and after bytes, lowercase hex.
- `packages/core/test/write/noStrayWrites.test.ts`: removed both save funnels from exemptions, kept atomic/sidecar/dungeons, widened mutation-call pattern exactly as requested.
- Existing CLI/server two-argument callers intentionally stay unchanged under the binding optional-prepared ruling. Hub enforcement and UI changes belong to subsequent tasks.
- No existing test was edited except noStrayWrites. No new dependencies or BOMs.

## New tests

`packages/core/test/write/preparedSave.test.ts` (9 cases): hermetic save fixture based on existing save tests, using existing shared Project/Tileset stubs; literal CRLF, tabs, non-ASCII and no-final-newline replace-plus-two-appends fixture checked against prepare and commit; three-file last-rename failure proving two swaps and byte-identical restoration; missing blockdata create and rollback-to-absence cases; repeat nonempty deterministic fingerprints without writes/session mutation; one-byte map.json disk change changes fingerprint despite identical after bytes; commits supplied buffers despite later session edits; post-prepare disk changes refuse with no swaps; fresh refusal gate precedes both fallback preparation and supplied entries.

`packages/core/test/gbc/write/preparedSave.test.ts` (4 cases): existing shared saveFixture; distinct .blk/.asm final-rename failure proving the .blk was swapped before rollback; deterministic nonempty fingerprints and one-byte disk sensitivity; exact prepared-buffer success despite later session edit; fresh refusal gate before fallback preparation and supplied entries.

`packages/core/test/write/planFingerprint.test.ts` (2 cases): independent literal hexadecimal frames for present/absent before, empty-versus-absent distinction, field framing, path and output sensitivity, entry order, fixed empty SHA-256 digest.

## Verification evidence

- `node docs/superpowers/task-reports/plan-10a3-save-integrity/task-2-native-assertions.mjs`: **15 passed, 0 failed, 3 files**. Complete output in `task-2-native-pass.log`. This adapter runs the actual new synchronous tests using node:assert and a .js-to-.ts resolution hook; it is explicitly not Vitest and provides neither TypeScript type checking nor project-wide verification.
- Six in-memory mutation checks, each in a fresh Node process, all exit 1 with actual test assertion failures and a completed test summary. Production source on disk is never mutated. Complete transcripts are `task-2-mutation-<name>.log`:
  - restore skipped: 12 pass / 3 fail (both families and absent-file rollback).
  - cleanup skipped: 11 pass / 4 fail.
  - before check skipped: 14 pass / 1 fail.
  - before bytes excluded from fingerprint: 12 pass / 3 fail.
  - GBA supplied prepare ignored/recomputed: 13 pass / 2 fail.
  - GBC supplied prepare ignored/recomputed: 14 pass / 1 fail.
- Dependency-free scan using widened noStrayWrites regex: **76 source files, 0 offenders**.
- `node --check` plus UTF-8/no-BOM inspection: **7 changed implementation/test files pass**.
- `git diff --check`: passes (only Git LF/CRLF working-copy warnings).
- Full Vitest gate: **NOT RUN**, as task brief directs; no node_modules here. No full-gate pass or file count is claimed.
- `npm.cmd run typecheck`: exit 1, `'tsc' is not recognized as an internal or external command` (missing dependencies).
- `npm.cmd run build --workspace packages/ui`: exit 1, `'vite' is not recognized as an internal or external command` (missing dependencies).
- Live UI check: not applicable to this task; no UI changes. Plan-level live acceptance remains with later hub/UI tasks.

## Tooling failures and corrections

The first native adapter attempt used its still-evaluating entry module as the vitest replacement and exited with an unsettled top-level await at the dynamic test import. Separating the assertion adapter and runner resolved the import cycle; all reported native and mutation results above come from the corrected harness. The first GBA recompute mutation used an overly broad `/write/save.ts` suffix, caught GBA assertions, then also matched GBC and failed target lookup; its complete original output is preserved as `task-2-mutation-recomputeGba-attempt-1.log`. The corrected exact `/src/write/save.ts` target completes all three files and catches two assertions.

PowerShell initially selected npm.ps1, rejected by execution policy. Retrying with npm.cmd reached the package scripts and confirmed missing tsc/vite, with the exact failures above. Nothing was installed or changed to work around the environment.

## Remaining concerns

Fresh refusal rechecks deliberately inspect live sessions even when prepared buffers were supplied. The writer then checks the prepared before bytes; it never recomputes after bytes. Fingerprint matching is intentionally not added to server routes in Task 2. Crash mid-swap and external writes between final check and rename retain the approved limits. Independent spec and quality reviews and the dependency-backed project gates are pending coordinator execution; this report does not claim overall plan completion.

## Commit result

`git add --` the seven scoped implementation/test files and this report directory failed before staging with exit 1: `fatal: Unable to create 'C:/Programming Projects/PokeMap/.git/worktrees/wt-10a3/index.lock': Permission denied`. Commit is blocked by the sandbox; all changes remain in the supplied worktree, uncommitted. No permission escalation was requested.
