# Plan 10a3: save integrity (all-or-nothing save, preview-bound commit)

Date 2026-10-19. Branch `plan-10a3-save-integrity`, cut from `plan-10a2-pokemon-indicator` at `878d5a2`
because 10a2 changes `SaveDialog.tsx` (plan refusals). Merge 10a2 first.

## Why

The Plan 10a2 final review (`.superpowers/sdd/2026-10-17-pokemap-plan-10a2-pokemon-indicator/final-review.md`,
I1 and I2) found two inherited gaps in the save path. Both are present on `master`. Nothing has bitten the
user yet; this is preemptive (user, 2026-10-19). Approved by the user in chat on 2026-10-19 ("build it").
Revised the same day after a Codex gpt-6-astra builder review (10 findings, all verified; rulings R1-R10 below).

- **I1, partial write.** GBA `commitSave` (`packages/core/src/write/save.ts`) writes blockdata, border,
  `map.json`, script replaces, then script appends, one `writeFileSync` at a time. GBC `commitGbcSave`
  (`packages/core/src/gbc/write/save.ts`) writes `.blk` then `.asm`. An I/O error after the first write
  leaves the subject half-saved, for example an Indicator object in `map.json` whose script never landed.
  Both doc comments call this an accepted risk. This plan supersedes that acceptance.
- **I2, commit not bound to the preview.** `POST /api/edit/:map/commit` (GBA `packages/server/src/index.ts`,
  GBC `packages/server/src/gbcEditRoutes.ts`) re-plans from the live session. An edit staged after the Save
  dialog loaded its plan (a second tab on the same session) is committed without having been shown.

## Goals

- **G1. All or nothing.** A save either writes every planned file or leaves every subject file as it was
  before the save began: byte-identical content, line endings and final-newline state, and a file that did not
  exist still does not exist. Temp files it creates are removed (best effort; any it cannot remove are named).
- **G2. Commit writes exactly what the preview showed.** The commit refuses, writing nothing, when the files it
  would write, or any of those files' current contents on disk, differ from what the Save dialog previewed.
- **G3. Honest failure.** A failed save says which files were restored. If a restore or cleanup fails, it names
  each affected file and gives a fix. It is never a silent 200.

## Non-goals

- Undo history for saves, backups kept after a successful save, or any change to the save format.
- Durability against power loss or a process kill in the middle of the swap. A crash then can leave some files
  swapped and temp files (`*.pokemap-tmp-*`) on disk.
- Protection against another program writing a target during the few milliseconds between the final
  on-disk check and its rename (see D-B step 3). That window is accepted.
- Ledger finding F-5 (GBA event move after a pending deletion uses the current index). It needs its own plan.
- Plan 10b, the Sign tool minors, and the CLI commands for Indicators.

## Anti-goals

- A temp file left in a subject repo after a successful save or a handled failure, unless the failure report
  names it.
- Any change to the bytes a successful save writes. Every existing save golden and corpus test passes
  unchanged. Existing behaviour such as creating a missing GBA blockdata/border file is kept.
- A fingerprint check that refuses a save nobody changed. Planning twice from an unchanged session and
  unchanged disk must give the same fingerprint.

## Design (decided)

### D-A. Prepared save: inputs and outputs, computed once (core)

Each family gets a `prepare…Save(proj, session)` step that performs no writes and returns a **prepared save**:
for every file the commit will write, in a stable order, `{ path, before: Buffer | null, after: Buffer }`.
`before` is the target's bytes on disk when prepared (`null` if the file does not exist); `after` is the
complete final bytes.

- GBA: blockdata, border (each only if it differs from disk, the current rule; a missing file is allowed and
  is `before: null`, as `binary.ts` already permits), `map.json` (only if the text changed), then one entry per
  script path. When the same path has a replace and appends, `after` is the replace's `after` with that path's
  appends applied in their current order, which is what today's sequential writes produce. Each path appears
  once; order is first appearance across replaces then appends.
- GBC: `.blk` (only if any block changed; patched from `before` exactly as today), then the events `.asm`
  (only if the text changed).
- Text is encoded as UTF-8, exactly as `writeFileSync(path, string)` does today.

`commitSave` / `commitGbcSave` take a prepared save. They keep their fresh refusal re-check against the live
session (the save gate), then hand the prepared entries to the writer. They never recompute `after` from disk
after the fingerprint was checked (R2). The CLI calls prepare then commit in one process, so it gets G1 too.

### D-B. One shared all-or-nothing writer (core)

`packages/core/src/write/atomic.ts` exports `writeFilesAtomically(entries, io?)`. `io` is an optional
injectable seam over the file calls it makes (default `node:fs`), so tests can fail any step, including after a
partial write.

1. **Stage.** For each entry, pick a temp path `<path>.pokemap-tmp-<pid>-<random>`, record it as owned
   **before** writing, and create it exclusively (`wx` flag) with `after`. A name collision picks a new name.
   If any stage write fails, remove every owned temp and throw.
2. **Check.** Re-read each target and compare with `before` (`null` = must still be absent). If any differs,
   remove the owned temps and throw a located refusal: the file changed on disk since preview. No target has
   been touched.
3. **Swap.** Rename each temp over its target, in entry order (Node's `renameSync` replaces an existing file on
   Windows too). If a rename fails (on Windows an editor or antivirus holding the file can cause
   `EPERM`/`EBUSY`), stop. Never fall back to unlink-and-retry. Restore each already-swapped target: write its
   `before` back, or delete it if `before` was `null`. Then remove the remaining owned temps and throw.
4. **Cleanup and report.** Cleanup is best effort: it continues past an individual unlink failure. The thrown
   error keeps the original cause first, then lists restored files, files whose restore failed, and temp files
   it could not remove, each with the fix "restore it from version control or your editor's copy" (for a
   target) or "delete it" (for a temp). Cleanup failures never replace the original error.

`noStrayWrites.test.ts`: allow `src/write/atomic.ts`, **remove** the two `save.ts` files from the allowed set,
and widen the pattern to `writeFileSync|writeFile|renameSync|unlinkSync|rmSync|openSync` (R9). The sidecar
writers stay allowed.

### D-C. Plan fingerprint (core + hub)

- Core exports `planFingerprint(prepared)`: SHA-256 hex over each entry's path, `before` (with an explicit
  absent marker for `null`) and `after`, in order, every field length-prefixed. It covers the target's current
  disk bytes, so an outside edit to **any** planned target changes it, not only targets whose output reads disk
  (R1). An empty prepared save has a fixed fingerprint.
- `GET /api/edit/:map/plan` adds `fingerprint` to its body, both families, computed from the prepared save of the
  same plan, after the linked-sign refresh the route already runs. When the plan has refusals or preparing
  fails, `fingerprint` is `null`.
- `POST /api/edit/:map/commit` takes JSON `{ "fingerprint": "<hex>" }`. Order of checks (R5):
  1. No body, `{}`, or a non-string `fingerprint` → 400, `refusals` = one refusal `PLAN_FINGERPRINT_MISSING`
     (subject the map, fix "Reopen Save and try again"). Malformed JSON or a non-object body keeps each family's
     existing malformed-body 400 `{ error }`. In the GBC dispatcher, the commit route must treat an empty body
     as `{}` (R7).
  2. Re-plan and prepare. Existing refusals → 400 with the plan body (unchanged behaviour; this already catches
     some outside edits, for example GBC `.asm` drift and GBA script-source drift).
  3. Fresh fingerprint differs → **409** with the fresh plan body (its own `refusals` untouched, new
     `fingerprint`) plus a separate `notice`: `{ code: "PLAN_CHANGED", subject: <map>, message: "Changes were
     made since you opened Save", fix: "Review the updated changes and save again" }`. `notice` is kept apart
     from `refusals` because it does not block the new plan.
  4. Commit **the same prepared save** that was fingerprinted. The writer's step-2 check covers anything that
     changed between steps 3 and 4.
  Nothing is written on 400 or 409. A writer throw → 500 `{ error }` with its message, as today; the session
  stays open for a retry or discard. Post-commit behaviour is unchanged: GBA clears the PNG cache and closes the
  session after success; GBC runs its cache hook even on failure and closes the session only after success.
- The linked-sign refresh functions return session copies and write nothing, so planning twice has no side
  effects (verified in the builder review).

### D-D. Save dialog (UI)

`SaveDialog.tsx` keeps the fingerprint from the plan it rendered and POSTs it as JSON on Save. On 409 it
re-renders the changes list from the returned body, shows the `notice` (message and fix) above the list, and
keeps Save enabled when the new plan's own `refusals` are empty. The notice clears on the next Save.
Linked-sign refresh/unlink, which already reloads the plan, also takes the new fingerprint. Save is disabled
while `fingerprint` is null.

## Constraints (binding, carried from earlier plans)

- Nothing reaches disk except through the Save commit. The commit writes exactly what the plan showed (G2).
- No git dependency anywhere.
- Preserve each file's line endings, final-newline state and tab indentation byte-for-byte. The writer handles
  bytes (`Buffer`), never re-encodes.
- Every guard is a located refusal (file, line where known, fix).
- Both families behave the same (unified UI goal).

## Left to the builder

- Function names beyond `writeFilesAtomically` and `planFingerprint`, the `io` seam's shape, and the prepared
  save's type name.
- How the hub carries the prepared save from step 2 to step 4 (one request; no cross-request caching).

## Builder-review rulings (2026-10-19)

- R1. Fingerprint covers each target's `before` bytes, not only outputs.
- R2. Commit writes the exact prepared buffers that were fingerprinted; the writer re-checks `before` right
  before swapping.
- R3. Temps are recorded as owned before their write; cleanup is best effort and reports leftovers without
  masking the cause.
- R4. Temp names are per transaction (`<path>.pokemap-tmp-<pid>-<random>`, exclusive create); cleanup removes
  only owned temps; no unlink-and-retry on a failed rename.
- R5. Refusals (400) take precedence over the fingerprint (409); criterion 6 accepts either.
- R6. Originally absent targets stay supported (GBA blockdata/border); rollback deletes them.
- R7. Missing/`{}`/non-string fingerprint is `PLAN_FINGERPRINT_MISSING`; malformed JSON keeps the existing error;
  the GBC dispatcher accepts an empty commit body.
- R8. Rollback tests use at least two distinct changed files and prove an earlier swap happened; fingerprint
  tests assert non-null values for non-empty saves; a mutation check covers the fingerprint comparison.
- R9. `noStrayWrites` stops exempting both `save.ts` files.
- R10. Existing UI SaveDialog fixtures may gain a `fingerprint` field; their assertions stay.

## Acceptance criteria

1. A writer failure injected at any stage write (including one that writes partially and then throws) or any
   rename leaves every target as it was (bytes, or absent) and no owned temp behind. With two or more changed
   files, a failure on the second rename proves the first was swapped and then restored. The error names the
   failing path and the restored files.
2. A restore or cleanup failure is reported with the affected path and a fix, after the original cause.
3. A target changed on disk between prepare and swap makes the writer refuse with the path, writing nothing.
4. Successful saves write the same bytes as before: all existing save, golden and corpus tests pass unchanged,
   in both families, CRLF and LF subjects alike, including creating a missing GBA blockdata/border file.
5. A GBA save with a script replace and an append on the same `scripts.inc` gives the same bytes as the old
   sequential writes, checked against a literal expected fixture.
6. Hub, both families: plan, stage another edit, commit with the old fingerprint → 409 `PLAN_CHANGED`, disk
   unchanged, body carries the new non-null fingerprint; committing with it succeeds.
7. Hub, both families: plan, change a planned target on disk, commit → 400 (an existing guard) or 409, and the
   file keeps the outside change. GBA `map.json` and GBA blockdata are each tested this way.
8. Hub: no body, `{}`, and a non-string fingerprint each give 400 `PLAN_FINGERPRINT_MISSING`; malformed JSON
   gives the existing error; nothing written.
9. Planning twice with nothing changed gives the same non-null fingerprint and leaves the session's undo state
   unchanged, including with a linked sign.
10. UI: Save posts the fingerprint; a 409 re-renders the plan, shows the notice, keeps Save enabled; the next Save
    posts the new fingerprint (tests). Live check in the real app, GBA and GBC: a normal save works, and a
    second-tab edit after the preview is refused with the notice, then the re-reviewed save goes through.
11. Mutation checks: skipping the restore, skipping temp cleanup, skipping the writer's `before` check, and
    skipping the hub's fingerprint comparison each make a test fail.
