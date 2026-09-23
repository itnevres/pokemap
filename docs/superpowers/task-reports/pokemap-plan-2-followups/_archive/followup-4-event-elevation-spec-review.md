# Follow-up 4: event elevation persistence — spec review

Verdict: ✅ Spec compliant. No issues found.

## Verification performed (independent, not copied from implementer report)

### 1. `packages/core/src/edit/events.ts` (`moveEvent`)
`git show c33eacf -- packages/core/src/edit/events.ts` read directly.
- Signature: `moveEvent(map, kind, index, x, y, elevation?: number)`. Confirmed 5th optional param.
- `elevation !== undefined` gate: pushes 3rd jsonEdit `{path:[arrayKey,index,"elevation"], value:elevation}` only when passed. Omitted → only x/y jsonEdits, matches old behavior exactly.
- Returned map: `{...e, x, y, ...(elevation!==undefined?{elevation}:{})}` — elevation field untouched when omitted (spread doesn't overwrite).
- Doc comment rewritten to describe new behavior. Accurate.

### 2. `packages/core/test/edit/events.test.ts`
Read directly (events.test.ts:19-45).
- Negative case (line 19-32): `moveEvent(BASE_MAP,"object",0,9,10)` (elevation omitted) → asserts jsonEdits is exactly x/y (2 entries, no elevation path), AND explicitly asserts `map.objectEvents[0].elevation === BASE_MAP...elevation` (untouched). This is a real discriminating assertion, not just "doesn't crash."
- Positive case (line 34-42): `moveEvent(BASE_MAP,"object",0,9,10,3)` → asserts jsonEdits has 3 entries including `["object_events",0,"elevation"]:3`, and `map.objectEvents[0].elevation===3`.
- Ran `npx vitest run packages/core/test/edit/events.test.ts` myself → 12/12 pass. Matches claim.

### 3. `packages/server/src/index.ts` `/event/move` route
Read directly (index.ts:829-853).
- Body type gains `elevation?: unknown`.
- Validation: `parsed.elevation !== undefined && typeof parsed.elevation !== "number"` → 400 with message `"elevation" must be a number when present, got ${JSON.stringify(...)}`. Style matches existing `"kind" must be...` / `expected {...}` messages in same file (same file, same `send(400,{error:...})` shape, same `JSON.stringify` interpolation pattern).
- `moveEvent(...)` called with `parsed.elevation as number | undefined`, jsonEdits from result concatenated onto `entry.session.jsonEdits` (real server-side session mutation, not local-only).

### 4. `packages/server/test/eventRoutes.test.ts`
Read directly (eventRoutes.test.ts:13-92).
- Pre-existing test (line 13-24, unmodified): sends `{kind,index,x,y}` with **no** elevation key → still exercises the x/y-only path. This is the negative/regression case the report claims is already covered; confirmed by direct read, not copied.
- New positive test (line 48-82): moves `NewBarkTown_Lab` object index 0 with a real `elevation` value.
  - Asserts response `moved.map.objectEvents[index].elevation === newElevation`.
  - **Persistence proof traced independently**: `GET /api/edit/{map}/plan` → server route calls `planSave(project, entry.session)` (index.ts:798/807) → `packages/core/src/write/save.ts:158` computes `opCount = session.jsonEdits.length + session.insertOps.length + session.removeOps.length` and embeds it in the `"N field edit"` summary string. The test takes a before/after delta of this count around the move (avoiding cross-test pollution from a `removeOp` left staged by an earlier test in the same file, confirmed present at eventRoutes.test.ts:42-46) and asserts the delta is exactly `3`. Since `planSave` reads `entry.session.jsonEdits` directly (in-memory server session state, not the HTTP response body), a delta of 3 can only occur if all 3 jsonEdits (x, y, elevation) were actually appended to `session.jsonEdits` server-side. This genuinely discriminates "staged" from "response-body-only" — if the route only updated `result.map` without pushing to `entry.session.jsonEdits`, the delta would be 0 (or 2, if x/y alone leaked through some other path). Claim confirmed correct, not just plausible.
  - Undo round-trip confirms elevation reverts.
- New negative-type test (line 84-87): `elevation:"not-a-number"` → 400. Confirmed.
- Ran `npx vitest run packages/server/test/eventRoutes.test.ts` myself → 7/7 pass (5 original + 2 new). Matches claim.

### 5. `packages/ui/src/hooks/useEditSession.ts`
Read directly (useEditSession.ts:59-74, 277-284 in new file).
- `UseEditSessionResult.moveEvent` signature gains `elevation?: number`.
- Client `moveEvent` callback: `callEvent("/event/move", {kind,index,x,y,elevation})` — relies on `JSON.stringify` dropping `undefined` keys, no extra branching, as claimed.
- Doc comments updated to describe real persistence.

### 6. `packages/ui/test/useEditSession.test.tsx`
Read directly (line 129-149 new file).
- New test: `moveEvent("object",0,5,5,3)` → asserts `fetchMock` called with `body: JSON.stringify({kind:"object",index:0,x:5,y:5,elevation:3})`. Confirms elevation forwarded into the real POST body.
- Negative case not duplicated; comment (line 145-148) points at the pre-existing x/y-only test above, whose own `toHaveBeenCalledWith` body assertion has no `elevation` key — verified this pre-existing test still exists unmodified and still makes that assertion.
- Ran `npx vitest run packages/ui/test/useEditSession.test.tsx` myself → 13/13 pass (12 + 1 new). Matches claim.

### 7. `packages/ui/src/App.tsx`
Read full diff (`git show c33eacf -- packages/ui/src/App.tsx`).
- `onMoveEventFromInspector` now calls `editSession.moveEvent(next.kind, next.index, next.x, next.y, next.elevation)`. Confirmed — this is the only functional line changed in this hunk (plus its doc comment, rewritten to describe the closed gap accurately, no more stale "elevation is local-only" language).
- **`onCanvasMoveEvent` genuinely untouched**: grepped `onCanvasMoveEvent` in both the diff hunk and the current file. It appears in the diff only inside a *comment string* ("onCanvasMoveEvent above stays x/y-only on purpose") added to the neighboring doc block — its own function body (App.tsx:130, `const onCanvasMoveEvent = (next: {kind,index,x,y}) => {...}`) has zero diff lines. Confirmed via `git diff c33eacf~1 c33eacf -- packages/ui/src/App.tsx | grep onCanvasMoveEvent` → only the comment-string hit, no `+`/`-` on the function itself.

### 8. `packages/ui/src/components/EventInspector.tsx`
Read diff. `onMove` prop's doc comment rewritten from "core's moveEvent only ever writes x/y... no persisted way to move elevation" to describing the new genuine write. No functional change (prop type signature identical, still `{kind,index,x,y,elevation}`). Accurate.

### 9. `App.test.tsx` "no existing coverage" claim
Grepped `App.test.tsx` myself for `EventInspector|onMoveEventFromInspector|[Ee]levation`. Only 4 hits, all unrelated block-metatile `elevation` fields in test fixture data (`{metatileId:0x10,collision:0,elevation:3,behavior:0}`), nothing about events or the inspector. `git show c33eacf --stat` confirms `App.test.tsx` is not in the commit's file list at all. Claim verified true.

### 10. Pre-existing `applyJsonOps` ordering bug (claimed, not fixed)
Traced independently in `packages/core/src/write/save.ts:247-268` (`applyJsonOps`, untouched by this commit — not in the diff's file list).
- Line 254-257: `text = session.originalMapJson` (pre-insert on-disk snapshot) → `jsonEdits` applied first via `editJson(text, session.jsonEdits)` → **then** `insertOps` applied via `insertArrayElement`.
- `editJson`'s underlying array-index lookup (`packages/core/src/write/jsonEdit.ts:102,162`) throws `index N is not present` when the target index doesn't exist in the text being edited.
- Failure mode is real: if `addEvent` stages an `insertOp` for a new index N in the same session, and a subsequent `moveEvent` on that same freshly-added index N stages a jsonEdit targeting `[arrayKey, N, ...]`, then at save time `editJson` runs against `originalMapJson` — which doesn't yet contain index N (the insert hasn't applied) — and throws. This reproduces for x/y moves too, not just elevation; it's a general same-session insert+move ordering bug, independent of this task's change. Correctly out of scope (fixing requires an op-ordering or same-session-index-remapping design decision), correctly not touched (`save.ts` absent from the commit diff), correctly flagged separately rather than silently left undocumented.

### 11. Test suite / typecheck (re-run myself, not copied)
- `npx vitest run packages/core/test/edit/events.test.ts` → 12/12 pass.
- `npx vitest run packages/server/test/eventRoutes.test.ts` → 7/7 pass.
- `npx vitest run packages/ui/test/useEditSession.test.tsx` → 13/13 pass.
- `npx vitest run packages/core packages/server packages/ui` → **67 files, 655 tests, all pass**. Matches claim exactly.
- `npm run typecheck` → both `tsc --noEmit` invocations exit clean, no errors.

### 12. Commit scope
`git show --stat c33eacf`: 9 files changed — `core/src/edit/events.ts`, `core/test/edit/events.test.ts`, `server/src/index.ts`, `server/test/eventRoutes.test.ts`, `ui/src/App.tsx`, `ui/src/components/EventInspector.tsx`, `ui/src/hooks/useEditSession.ts`, `ui/test/useEditSession.test.tsx`, plus the implementer's own report `.md`. No file outside the task's stated scope. Matches claim.

### 13. Live-verify / subject decomp baseline (re-verified NOW, independently)
- `cd "C:/Programming Projects/Pokemon Game/game" && git status --porcelain` (run just now):
  ```
   M data/layouts/NavelRockZygardeChamber/map.bin
   M data/layouts/NavelRock_Fork/map.bin
   M data/layouts/layouts.json
   M data/maps/NavelRock_Fork/map.json
   M data/maps/NavelRock_ZygardeChamber/map.json
   M include/fieldmap.h
  ?? docs/human-tasks-notes.md
  ```
  This is **6 modified + 1 untracked**, not "5 modified + 1 untracked" as the implementer report and the review-task prompt both phrase it (report text groups "NavelRock map.bin/map.json x2" ambiguously, undercounting by one — `fieldmap.h` is a 6th distinct modified file). Minor documentation imprecision, not a substantive finding: this exact 6-file/1-untracked set is the long-established pre-existing baseline from earlier plan-2-editing tasks (task-18/task-19, which also touch NavelRock — confirmed via `grep -rl NavelRock docs/superpowers/task-reports`), not something this task introduced.
  - Confirmed no leftover from **this task's own** live-verify: `git diff -- data/maps/Route29/map.json` (the file the implementer's live-verify actually wrote to and reverted) → **empty diff**, `git status --porcelain -- data/maps/Route29/` → empty. Route29 is genuinely clean; the elevation write was fully reverted.
  - Net: decomp is at the same pre-existing baseline state before and after this task's live-verify. No new uncommitted change was left behind by this task.

## Missing requirements
None. All 5 numbered spec items implemented and independently verified.

## Extra/unneeded work
None. `onCanvasMoveEvent` confirmed untouched. No file outside the 8 source/test files + report touched.

## Misunderstandings
None found. Implementation targets the right problem (persist elevation end-to-end) the right way (optional param threaded through all 4 layers, `undefined`-drops-JSON-key idiom reused rather than reinvented, negative cases pinned explicitly rather than assumed).

## Minor note (non-blocking)
Implementer report's decomp baseline description ("5 modified") undercounts by one file relative to actual `git status --porcelain` output (6 modified: 2× map.bin, 2× map.json, layouts.json, fieldmap.h). Does not affect correctness of the task or the live-verify's validity — independently confirmed the decomp is at the same state before/after, and Route29 (the file actually touched) is clean.
