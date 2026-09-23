# Follow-up 3: dropper + shift wiring — spec-compliance review

Verdict: ✅ Spec compliant. No issues found after independent verification.

## Method
Read full diff (`git show 07297f3`), traced parent commit (`f47ab5d`) for the pre-fix
onMouseUp branch, grepped for stray `rectStartRef`, re-ran `npx vitest run packages/ui`
and `npm run typecheck` myself, and — beyond static review — actually stood up the real
dev server (`tsx packages/server/src/serve.ts`, already running on :5174) + Vite (`ui`
launch config, :5173) and drove the live UI myself (network-request diffing + a fetch-body
interceptor + visual screenshots), rather than trusting the implementer's own probe-based
live-verify narrative.

## Commit scope
`git show --stat 07297f3`: `packages/ui/src/App.tsx`, `packages/ui/src/components/MapCanvas.tsx`,
`packages/ui/test/App.test.tsx`, `packages/ui/test/MapCanvas.test.tsx`, plus the implementer's
own report md. Matches the 4 claimed code/test files exactly. No extra/unneeded files.

## MapCanvas.tsx — verified against code
- `activeTool` union gains `{kind:"shift"}` / `{kind:"dropper"}`, neither carrying stamp/value — `MapCanvas.tsx:75-80`.
- `onDropperPick?: (stamp: Stamp) => void` prop added — `MapCanvas.tsx:106-113`, threaded through the destructure at the component signature.
- Dropper branch sits in `onMouseDown` **before** the generic paint-stroke branch (`MapCanvas.tsx:684-690`), reads via `readBlock(blocks, layout.width, layout.height, cell.x, cell.y)`, builds a 1×1 stamp with `metatileId`/`collision`/`elevation`, returns unconditionally — never falls into the generic branch below it.
- Grepped `dropper` across the file: exactly 2 functional call sites (`onMouseDown` branch, `onMouseUp` exclusion at `MapCanvas.tsx:832`). No third path calls `beginStroke`/`applyPaint`/`endStroke` for dropper. `onMouseLeave` (`MapCanvas.tsx:852`) needed no dropper exclusion — it already gates on `strokeOpenRef.current`, which dropper never sets true — and the diff correctly leaves it untouched.
- Shift reuses the rect drag shape: `onMouseDown`'s start-cell branch now covers `rect || shift` (`MapCanvas.tsx:702`), `endActiveStroke` gained a sibling `shift` branch (`MapCanvas.tsx:778-788`) that calls `applyPaint({tool:"shift", dx: end.x-start.x, dy: end.y-start.y})` then `endStroke()` — same begin/apply/end lifecycle as rect, confirmed by reading the branch and by a live network trace (begin → apply → end fired for every shift drag, including the zero-length one).
- No client-side `dx===0 && dy===0` special case exists anywhere in the shift branch — confirmed by reading `MapCanvas.tsx:778-788` line by line; the comment correctly states reliance on the server's own diff-check in `/paint/end`.
- `rectStartRef` → `dragStartRef` rename: grepped `packages/ui/src` and `packages/ui/test` — zero remaining identifier uses; the only 2 hits left are prose comments in `MapCanvas.test.tsx:598-600` describing pre-fix historical behavior, not live references. Rename is complete and consistent.

## App.tsx — verified against code
- `activeTool` useMemo resolves `shift`/`dropper` unconditionally, same posture as `collision` — `App.tsx` diff, no `currentStamp` gate.
- `availableTools` extended to `["collision","pencil","rect","bucket","dropper","shift"]` — matches `Toolbar.tsx`'s pre-existing `ToolKind` union (`dropper`/`shift` were already known kinds there, just not previously enabled).
- `onDropperPick={setCurrentStamp}` — same setter `MetatilePalette`'s `onSelect` uses, confirmed by reading the prop wiring at the `<MapCanvas>` call site.
- Auto-switch-to-pencil-after-drop correctly **not** implemented — spec left it as implementer's own optional call; live UI confirms selecting dropper and picking a block leaves "Dropper" still highlighted afterward (no scope creep, no missing requirement — task explicitly permitted either choice).

## Self-found bug: independently confirmed real, and correctly fixed
Traced parent commit `f47ab5d`'s `MapCanvas.tsx`: at that point `dropper` did not exist in
the `activeTool` union at all, so the claim is necessarily about what the implementer's own
new code would have done without the exclusion, not a pre-existing shipped bug — this is an
accurate characterization, not an inflated one.

Confirmed mechanically: `endActiveStroke` (`MapCanvas.tsx:774-804`) guards only on
`!editSession`, with no `strokeOpenRef` check of its own. Absent the `activeTool.kind !==
"dropper"` exclusion added at `MapCanvas.tsx:832`, a dropper click's `onMouseUp` would reach
the generic `if (editSession && activeTool)` branch, call `endActiveStroke(rawBlockAt(e))`,
fall into the `else` case (dropper matches neither `"shift"` nor `"rect"`), and fire
`editSession.endStroke()` — a real, unwanted `/paint/end` POST with no matching `/paint/begin`
ever having been sent for that click.

Checked severity: server-side `/paint/end` (`packages/server/src/index.ts:755-769`) guards on
`entry.strokeStartBlocks`, so in the common case (no other stroke concurrently open) this
spurious call would be a harmless no-op, not data corruption — worth noting the report doesn't
spell out this nuance, but it doesn't change the correctness of the fix: a real network call
firing for no reason is still worth killing, the fix is a genuine one-line root-cause fix
(mirrors the existing `onMouseDown` exclusion), and there's a real edge case it prevents (a
tool switch to dropper mid-drag before mouseup would otherwise prematurely end whatever real
stroke was still open). Correctly scoped, not overbuilt, not a misdiagnosis.

## Tests — verified against fixtures, not just diff-read
- `MapCanvas.test.tsx`: dropper test's expected `{metatileId:0x11, collision:1, elevation:3}` independently hand-verified against `DATA.blocks[1]` and the click's composite coordinates (`ORIGIN+24, ORIGIN+4` → block (1,0) → index 1) — real fixture data, not hardcoded to match the assertion. Confirms `beginStroke`/`applyPaint`/`endStroke` never called. Shift tests' dx/dy math (+1/+1 and −1/−1) independently checked against the block-size arithmetic — correct.
- `App.test.tsx`: dropped-block assertion (`metatileId` 0x13) independently checked against `PALLET_TOWN_LAYOUT.blocks[3]` (block (1,1), index `1*2+1=3`) — real fixture value, not fabricated.
- Re-ran `npx vitest run packages/ui` myself: **243/243 passed**, 21 files — matches the claim exactly.
- Re-ran `npm run typecheck` myself: clean, no errors.

## Live-verify — re-executed independently, not just trusted
Started the real dev server + Vite myself and drove the live app (not the implementer's own
prior session):
- **Dropper produces zero network calls**: diffed `read_network_requests` before/after a
  dropper click on the lake tile — request count identical (491 → 491). Confirms "dropper
  needs no server call at all" for real, not just by code inspection.
- **Dropped tile flows into pencil paint**: installed a `window.fetch` interceptor, picked the
  lake tile with Dropper, switched to Pencil with no palette click, painted a grass cell —
  intercepted `/paint/apply` body carried the water metatile (`metatileId:299`) at the painted
  cell, and the screenshot visually shows the painted cell turned water-blue. End-to-end proof,
  not just a unit-test read.
- **Zero-length shift**: clicked Shift, single click (no drag) — probed session state via the
  same `/paint/begin`+`/paint/end` no-op technique the implementer used: `isDirty:false,
  canUndo:false`. No spurious undo entry, confirmed live.
- **Real shift drag**: dragged diagonally by one block — screenshot shows the lake duplicated
  on both left and right edges plus a wrapped-in strip at the top edge (true torus wrap, not
  clip-and-fill). `Save (unsaved changes)` appeared. Single Undo click restored the exact
  original screenshot; the begin/end probe confirmed `isDirty:false, canUndo:false` afterward.

## Live-verify methodology — assessed as legitimate
Read `packages/server/src/index.ts:661-677` (`/paint/begin`) and `:755-769` (`/paint/end`):
`begin` returns `entry.session.blocks` (current live state) via `sendSession` and only sets
`strokeStartBlocks` if it was `null` (to a copy of the *current* blocks — a no-op snapshot
when nothing has changed); `end` pushes an undo entry only if that snapshot differs from
current blocks (it won't, since nothing ran between the two calls) and resets
`strokeStartBlocks` to `null`. Net effect on server state: zero, for a solo actor with no
other stroke concurrently open. Independently reproduced this exact technique myself multiple
times during this review (to read pristine/post-edit block state and to revert via `/undo`)
and it behaved exactly as expected every time — it is legitimate evidence, not just a "trust
me" claim.

One caveat worth flagging (not a defect in the shipped code, a note on the diagnostic
technique itself): this probe is not safe against a *genuinely concurrent* open stroke — if a
real user stroke were mid-flight when the probe's own `/paint/end` fires, it would prematurely
close that real stroke. Irrelevant for solo interactive verification as performed here, but
not a general-purpose read-only endpoint; not something the report claims it to be, either.

## Conclusion
Everything in the spec was implemented, nothing extra was added beyond it (the one
self-found fix is in-scope and necessary), and the self-diagnosed bug is real and correctly
fixed. Tests are honest (real fixture data, not hardcoded to pass), 243/243 and typecheck
both independently reproduced, and the live-verify claims all independently reproduced live
by this review using both the implementer's own probe technique and additional direct
methods (network diffing, fetch interception, visual screenshots) the implementer's report
didn't use.
