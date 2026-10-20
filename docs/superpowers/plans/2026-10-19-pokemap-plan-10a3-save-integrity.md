# Plan 10a3: save integrity — implementation plan

Spec: `docs/superpowers/specs/2026-10-19-pokemap-plan-10a3-save-integrity-design.md` (binding; rulings R1-R10 there).
Branch `plan-10a3-save-integrity` from `878d5a2`. Baseline gate: 3,201 pass / 0 fail / 195 files; typecheck and
UI build pass. Known flakes (rerun alone before calling a regression): GbcAppEditing "beforeunload is registered
only while dirty"; App.test "P selects Pencil".

## Global constraints

- A successful save writes exactly the bytes it writes today, including creating a missing GBA blockdata/border
  file. Do not edit existing save, golden or corpus tests.
- Handle file contents as `Buffer`; never re-encode. Preserve CRLF/LF, final newline, tabs.
- Every refusal is located (file or map, fix text). No git dependency.
- Both families get the same behaviour.
- Gate before every commit touching `packages/`: `npm test` (read the Tests / Test Files lines), `npm run typecheck`,
  `npm run build -w @pokemap/ui`.

## Task 1: all-or-nothing writer — High (error boundaries, silent corruption)

Files: create `packages/core/src/write/atomic.ts`, `packages/core/test/write/atomic.test.ts`.

- `writeFilesAtomically(entries: { path: string; before: Buffer | null; after: Buffer }[], io?: AtomicIo): void`
  per spec D-B steps 1-4. `AtomicIo` covers exactly the calls the writer makes; default is `node:fs`.
- Temp name `<path>.pokemap-tmp-<pid>-<random hex>`, recorded as owned before the exclusive (`wx`) write; on
  `EEXIST` pick a new name. Never unlink a target and retry a rename.
- An empty list is a no-op.
- Tests (real temp dir, plus an `io` wrapper that fails a chosen call, including one that writes part of the
  bytes and then throws): success writes bytes exactly (CRLF and no-final-newline buffers) and creates an
  absent target; with three distinct targets, failure at each stage write and at the second and third rename
  leaves all targets as before (bytes or absent) and no owned temp; the second-rename case asserts the first
  target was swapped before the failure (spy) and restored after; a target changed on disk after prepare is
  refused by the check step with its path and nothing written; a restore failure and a temp-unlink failure are
  reported after the original cause; a pre-existing foreign `*.pokemap-tmp-*` file is left untouched.
- Mutation evidence (report it): removing the restore loop, removing temp cleanup, and removing the `before`
  check each fail a test.

## Task 2: prepared save + fingerprint, commits use the writer — High (save ownership)

Files: `packages/core/src/write/save.ts`, `packages/core/src/gbc/write/save.ts`, `packages/core/src/write/atomic.ts`
(fingerprint may live here), `packages/core/test/write/noStrayWrites.test.ts`, `packages/cli/src/writeCommands.ts`,
`packages/cli/src/gbcCommands.ts`, new tests in `packages/core/test/write/` and `packages/core/test/gbc/write/`.

- `prepareSave(proj, session)` (GBA) and `prepareGbcSave(proj, session)` (GBC) return the spec D-A entries.
  They never write.
- `planFingerprint(entries): string` per spec D-C (SHA-256; path, `before` with an absent marker, `after`; all
  length-prefixed).
- `commitSave(proj, plan, prepared)` / `commitGbcSave(proj, plan, prepared)`: keep the fresh refusal re-check
  first, then `writeFilesAtomically(prepared, io?)`. Optional `io` for tests. Update both doc comments: the
  non-atomic acceptance is replaced by the D-B guarantee and its stated limits. Update the CLI callers to
  prepare then commit (one process; no fingerprint needed).
- `noStrayWrites`: allow `src/write/atomic.ts`, remove both `save.ts` entries, widen the pattern to
  `writeFileSync|writeFile|renameSync|unlinkSync|rmSync|openSync`.
- Tests: a literal expected-bytes fixture for a GBA replace + append on the same CRLF `scripts.inc`, checked
  against the prepared `after` and the committed file; a GBA commit touching blockdata + `map.json` +
  `scripts.inc` and a GBC commit touching `.blk` + `.asm`, each with an `io` failing the last rename, leave every
  target byte-identical; a GBA commit to a missing blockdata file creates it, and on a failed later rename the
  created file is removed; same session + same disk gives the same non-null fingerprint twice; changing one byte
  of a target on disk (no session change) changes the fingerprint.
- All existing core and CLI save tests pass unchanged.

## Task 3: hub binds commit to the preview — High (hub I/O, save ownership)

Files: `packages/server/src/index.ts`, `packages/server/src/gbcEditRoutes.ts`, server tests (extend each family's
existing edit-route test files).

- `signPlan` (both families) also prepares the save and returns `{ plan, prepared, body }`, with
  `body.fingerprint` (null when the plan has refusals or preparing throws).
- `POST commit` (both families) follows spec D-C's check order exactly and commits the same `prepared` it
  fingerprinted. GBC: the commit route becomes `body: true` and the dispatcher treats an empty body as `{}` for it;
  malformed JSON keeps the existing `{ error }`.
- Keep post-commit behaviour: GBA `pngCache.clear()` and session close after success; GBC `hooks.onCommit()` in
  `finally`, `store.close` only after success.
- Tests, both families: commit with the plan's fingerprint succeeds; plan → stage another edit → commit with the
  old fingerprint → 409 with `notice.code === "PLAN_CHANGED"`, disk unchanged, new non-null fingerprint, then commit
  with it succeeds; GBA plan → outside edit to `map.json` → commit → 409 and the outside edit survives; GBA plan →
  outside edit to blockdata → commit → refused and survives; GBC plan → outside edit to `.asm` → 400 (existing
  guard) and survives; no body, `{}`, non-string → 400 `PLAN_FINGERPRINT_MISSING`; malformed JSON → existing error;
  plan twice → equal non-null fingerprints, `canUndo`/undo depth unchanged, including a map with a linked sign.
- Update existing server tests that POST commit without a body to send the plan's fingerprint (keep their
  assertions).
- Mutation evidence: removing the fingerprint comparison fails a test.

## Task 4: Save dialog sends the fingerprint — Medium (UI, caught by tests)

Files: `packages/ui/src/components/SaveDialog.tsx`, `packages/ui/test/SaveDialog.test.tsx`, plus the `DiffPlan`
validator if it lives elsewhere. Existing SaveDialog fixtures may gain `fingerprint` (R10); keep their assertions.

- Accept `fingerprint: string | null` and an optional `notice` in the plan body validator. Keep the rendered plan's
  fingerprint; POST `{ fingerprint }` as JSON on Save. Linked-sign resolve already reloads the plan; it takes the
  new fingerprint.
- 409 → `setPlan(body)`, show `body.notice` (message + fix) above the changes, dialog stays open. Save enabled when the
  new plan's own `refusals` are empty and `fingerprint` is non-null; the notice clears on the next Save.
- Tests: Save posts the fingerprint from the loaded plan; a 409 re-renders the new changes and shows the
  `PLAN_CHANGED` notice message and fix with Save enabled; a later Save posts the new fingerprint; Save is disabled
  when `fingerprint` is null.

## Task 5: live acceptance + docs — Medium

- Live, real app (hub 5184 via preload, Vite 5183, headless Chromium shell 1248, tooling from
  `docs/superpowers/task-reports/pokemap-plan-10a2-pokemon-indicator/task-6-shots/`): GBA and GBC, a normal
  save works; a second-tab edit after opening Save is refused with the notice and nothing is written; then the
  re-reviewed save goes through. Restore subjects byte-identical (manifest hash before and after).
- Docs: RESUME status row and gate numbers; roadmap line for 10a3; LESSONS only for a new trap. Explicit pathspecs.
