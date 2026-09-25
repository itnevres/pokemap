# Follow-up 4: event elevation persistence — code-quality review

Verdict: Ready to merge. 0 critical, 0 important, 4 minor/nice-to-have.

Range reviewed: `220e1d4..c33eacf` (single commit `c33eacf`, `git show c33eacf` read in full). Spec compliance already independently verified (0 issues) — this pass is quality-only.

## Strengths

- **`moveEvent` extension (`packages/core/src/edit/events.ts:24-35`)**: clean optional-param threading. `elevation !== undefined` gate applied identically in both the `jsonEdits` push and the returned-map spread; omitted case is byte-for-byte the old behavior (verified by reading the negative test, `events.test.ts:19-32`, which explicitly pins `elevation` untouched, not just "doesn't crash").
- **Type safety across all 4 layers**: `elevation?: number` (core) → `elevation?: unknown` validated then cast (server, `index.ts:839,846-848,851`) → `elevation?: number` (client hook, `useEditSession.ts` type + impl) → `elevation: number` required in the Inspector's own callback type (`App.tsx:147`, `EventInspector.tsx:41`). Exactly one validation gate, at the server route — the only boundary untrusted/network input crosses. No redundant/missing validation elsewhere.
- **Doc comments genuinely rewritten**, not minimally patched: `events.ts:17-23`, `App.tsx:140-146`, `EventInspector.tsx:35-40` all describe the new real persisted behavior in their own terms, no stale "gap" language left over from the old comments (confirmed by diff — old text fully replaced, not edited in place).
- **`JSON.stringify`-drops-`undefined` claim (`useEditSession.ts:67-69`) verified, not just asserted**: traced `callEvent` (`useEditSession.ts:252`) — a single `fetch(..., { body: JSON.stringify(body) })` call, no alternate serialization path exists in this codebase for event ops. No divergence risk; explicit-`undefined`-vs-omitted is structurally identical here since `next.elevation` is either a real number (Inspector) or the 5th arg is never passed at all (canvas drag, `App.tsx:130-132`).
- **Server test's delta-based assertion (`eventRoutes.test.ts:59-77`) is a reasoned, correct choice, not a fragile shortcut**: traced `opCount = session.jsonEdits.length + session.insertOps.length + session.removeOps.length` (`save.ts:158`) myself — the "field edit" count genuinely conflates jsonEdits/insertOps/removeOps, so an absolute count against a shared `NewBarkTown_Lab` session really would be polluted by the earlier warp-delete test's staged `removeOp` (confirmed that test exists at `eventRoutes.test.ts:41-46` and touches the same map). The delta is computed by sandwiching exactly one op (the move) between two `/plan` reads within the same `it`; since this repo's `vitest.config.ts` has no `sequence.shuffle`/`.concurrent` usage, execution is strictly sequential and nothing else can land a jsonEdit between those two reads regardless of what surrounding tests do or how they're reordered. This is arguably *more* robust to reordering than a fixed-baseline absolute count would have been, not less.
- **Flagged pre-existing bug (`applyJsonOps` jsonEdits-before-insertOps ordering, `save.ts:247-268`) is coherent and correctly out-of-scope**: matches the project's established "flag, don't silently fix" discipline (a `docs/superpowers/task-reports/.../_archive/` convention is already in use in both followups and editing directories, i.e. this project's flagging pipeline is a real, exercised pattern, not novel to this report). The spec review independently re-traced the same bug in `save.ts` and reached the same conclusion. I have no tooling in this session to look up task_931bc8bc directly, but the report's own description of the bug is internally consistent and reproducible from the code as described.
- **Scope discipline confirmed by direct diff read**: `onCanvasMoveEvent` (`App.tsx:130-138`) has zero changed lines in its own body — the only hit is inside a comment string in the neighboring doc block. No file outside the stated 8 source/test files (+ implementer report) touched.

## Issues

### Critical (Must Fix)
None.

### Important (Should Fix)
None.

### Minor (Nice to Have)

1. **`eventRoutes.test.ts:57` — directional inaccuracy in comment.** The comment reads "the warp-delete test below leaves its own removeOp staged" — but that test (`eventRoutes.test.ts:41-46`) is written *before* (above) the elevation test in file order, not below. Harmless (doesn't affect what the comment is explaining, just which direction), but worth a one-word fix (`above`) if anyone touches this file again.
2. **`EventInspector.tsx:123-131` (`commit`) — every blur now stages 3 jsonEdits, not just the field touched.** Blurring the X input alone calls `commit()` with no `over`, so `elevation: over.elevation ?? draft.elevation` always resolves to the current (unchanged) value and gets sent as a real argument to `moveEvent`. Since `moveEvent` doesn't diff against the previous value, this means an X-only edit now writes an elevation jsonEdit too (same value, idempotent, no functional bug) where it previously wrote none. This is a continuation of the pre-existing "commit always coalesces x+y" design (not introduced by this task, and not something the task was asked to change), but it does mean the per-field "surgical splice" framing in `moveEvent`'s own doc comment is truer of the core function in isolation than of the UI's actual call pattern. Not worth blocking on.
3. **`events.test.ts:34-42` — positive elevation case doesn't re-assert field/identity preservation.** The negative case (line 19-32) checks `script` and `warpEvents` are untouched; the positive case only checks the 3 jsonEdits and the elevation value, not that `script`/other arrays are still intact under the new 3-key spread. Low value to add since it's the same spread expression already covered by the negative case, but it's the more "point-in-time real" case (elevation actually written) and would be the one to catch a future spread-ordering regression.
4. **No test for `elevation: null` specifically.** The server's validation (`typeof parsed.elevation !== "number"`) already rejects `null` correctly (verified by inspection: `typeof null === "object"`), so behavior is correct — just untested. The existing `"not-a-number"` string case is the only type-mismatch variant pinned, consistent with this file's existing one-variant-per-field convention for `kind`/`index`/`x`/`y`, so this isn't a new gap unique to this feature, just one that was trivially available to close.

## Recommendations

- Optional: fix the "below" → "above" wording in `eventRoutes.test.ts:57` next time the file is touched.
- Optional: add one line to the positive `moveEvent` test asserting `map.objectEvents[0].script` is preserved, mirroring the negative case.
- Optional: add a 5-line `elevation: null` 400 case alongside the existing "not-a-number" test if this route gets touched again.
- None of the above block merge.

## Assessment

**Ready to merge?** Yes

**Reasoning:** Faithful, minimal implementation — no scope creep, optional-param extension is idiomatic, exactly one validation boundary at the server route, doc comments genuinely rewritten to reflect new behavior, and the one test-design choice flagged for scrutiny (delta-based field-edit-count assertion) holds up under independent tracing of `opCount`'s actual computation and this repo's (non-concurrent) test execution model. The pre-existing `applyJsonOps` ordering bug found during live-verify was correctly left unfixed and flagged separately rather than silently worked around, matching this project's established discipline. All findings here are cosmetic or defensive-test-coverage nice-to-haves with no functional impact.
