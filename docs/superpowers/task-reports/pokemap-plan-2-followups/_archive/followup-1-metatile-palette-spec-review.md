# Spec review: Follow-up 1 -- mount MetatilePalette, wire real stamps

Reviewed commit: `70b091d`. Verdict: **SPEC COMPLIANT. 0 issues.**

All claims in `followup-1-metatile-palette-implementer.md` independently verified against
real code, real tests, and a real dev server + real browser session (not jsdom). Nothing in
the implementer's report was taken on trust.

## Requirement-by-requirement

| # | Requirement | Verified how | Result |
|---|---|---|---|
| 1 | `/api/map/:name` returns `primaryCount`/`secondaryCount`, reusing existing `primary`/`secondary` objects | Read `packages/server/src/index.ts:222` diff; no new resolution, just `primary.metatileCount`/`secondary.metatileCount` appended to existing `send(200, ...)` | ✅ |
| 2 | `MapLayoutData` gains `primaryCount: number; secondaryCount: number` | Read `packages/ui/src/hooks/useMapLayout.ts` diff | ✅ |
| 3a | `currentStamp` state, `Stamp \| null`, reset to `null` on `selectMap` | Read `App.tsx:246,320-326` -- `setCurrentStamp(null)` sits directly beside the existing `setSelectedEvent(null)` inside `selectMap` | ✅ |
| 3b | `activeTool` useMemo: pencil/rect/bucket resolve to `{kind, stamp}` once `currentStamp` non-null, else `null` | Read `App.tsx:280-286` | ✅ |
| 3c | `availableTools` = `["collision","pencil","rect","bucket"]`, dropper/shift excluded | Read `App.tsx:490` diff + live DOM check (see below) | ✅ |
| 3d | `MetatilePalette` mounted conditionally, correct props | Read `App.tsx:497-507` -- `layoutName={layout.data.layout.name}`, `split={layout.data.split}`, `primaryCount`/`secondaryCount`, `onSelect={setCurrentStamp}`, gated inside the existing non-null `layout.data ?` branch | ✅ |
| 4 | `.app__metatile-strip` CSS, bounded height + scroll | Read `styles.css:253-269` -- `max-height: 240px; overflow-y: auto`; live-verified the strip scrolls independently while canvas stays visible | ✅ |
| 5 | Tests: real `primaryCount`/`secondaryCount` pin; real id flows through paint; map-switch resets stamp | See "Test verification" below | ✅ |
| 6 | Live-verify against real dev server/browser | Done independently, see below | ✅ |
| 7 | Out of scope: dropper/shift untouched, `MetatilePalette.tsx`/`Toolbar.tsx`/`MapCanvas.tsx` internals untouched | `git show --stat 70b091d` lists 7 files, none of the three named components; dropper/shift confirmed still disabled live | ✅ |

## Independent verification detail

**Tileset counts** (not trusted from the report): wrote a standalone script calling
`openProject("C:/Programming Projects/Pokemon Game/game").tileset(...)` directly, outside
the test suite:
```
layout: NewBarkTown_Layout gTileset_Johto_General gTileset_NewBarkTown
primary.metatileCount: 640
secondary.metatileCount: 144
split.metatiles: 640 split.version: hns
```
Matches `packages/server/test/api.test.ts`'s pinned `640`/`144` exactly. Script deleted after
use, `git status` confirmed clean (no stray files from this review).

**Test suite**: `npx vitest run packages/ui packages/server` → 308/308 pass (own run, not
copied from the report). `npx tsc --noEmit -p tsconfig.base.json` and
`-p packages/ui/tsconfig.json` → both exit 0, clean.

**WorldCanvas flake claim**: ran `npx vitest run packages/ui/test/WorldCanvas.test.tsx` in
isolation → 55/55, including the named fade-timer test. Ran the full whole-repo suite
(`npx vitest run`, no filter) **twice** → 675/675 both times, flake did not reproduce either
run. Commit `70b091d` touches no file WorldCanvas.tsx or its test reads (`git show --stat`
confirms the 7-file list above), and the named test concerns a `setTimeout`-driven fade timer
on map drag -- no code path connects it to metatile-palette/stamp state. Conclusion: ordinary
timing jitter under parallel load, not a regression from this change. The report's "flaky,
unrelated" framing holds.

**Commit hygiene**: `git show --stat 70b091d` -- exactly 7 files (`server/src/index.ts`,
`server/test/api.test.ts`, `ui/src/App.tsx`, `ui/src/hooks/useMapLayout.ts`,
`ui/src/styles.css`, `ui/test/App.test.tsx`, `ui/test/MapCanvas.test.tsx`). No stray files, no
`git add -A` residue.

**Live verify (real dev server on :5174, real Vite dev server, real browser)**, done myself,
independent of the implementer's own live-verify pass:
- `GET /api/map/NewBarkTown` over the wire → `primaryCount:640, secondaryCount:144`.
- Opened NewBarkTown, clicked Pencil → `MetatilePalette` mounted as a bounded scrollable grid
  (full 640+144-cell real palette, not a stub).
- Pencil: clicked metatile `0x2` (via exact element ref, not coordinate-approximation --  an
  earlier coordinate-based click picked the wrong adjacent cell, corrected by using `find` +
  ref-based clicks), painted → captured real `POST /paint/apply` body:
  `stamp.cells[0].metatileId === 2`. Exact match.
- Rect: clicked `0x9`, dragged a rectangle → body: `tool:"rect", stamp.cells[0].metatileId:9`.
  Exact match.
- Bucket: clicked `0xC`, clicked canvas → body: `tool:"bucket", replacement.metatileId:12`.
  Exact match.
- Map switch: painted (dirty session), overrode `window.confirm` to accept the dirty-switch
  guard, switched NewBarkTown → CherrygroveCity. `MetatilePalette` remounted for the new map.
  Clicked the canvas again (still on Bucket, no fresh stamp picked) -- a `window.fetch` wrapper
  counter stayed at 4 (unchanged) and `read_network_requests` showed zero new `/paint/*`
  requests. Reset confirmed genuinely working, not just in test mocks.
- `dropper`/`shift`: read live DOM (`.toolbar__tool-btn` `disabled`/`title` attributes) --
  both `disabled: true, title: "Not yet available"`. Untouched, as claimed.

## Selection-highlight gap -- own verdict

Confirmed accurate by reading `packages/ui/src/components/MetatilePalette.tsx` in full: no
`selectedId` prop (`MetatilePaletteProps` at line 5-25 has no such field), no `aria-pressed`
on the cell `<button>` (line 134-159, only `aria-label`/`disabled`/`className` are set), no
CSS class keyed to a selected state. Live-verified independently: clicked a cell, zero visual
change to that cell.

**Verdict: acceptable, correctly-scoped omission -- not a spec-compliance defect for *this*
task.** Reasoning:
- Fixing it requires modifying `MetatilePalette.tsx` (adding `selectedId` state/prop, wiring
  it through), which the task explicitly walls off ("any change to
  `MetatilePalette.tsx`/`Toolbar.tsx`/`MapCanvas.tsx` internals" is out of scope).
- The task's own mount-snippet -- which the task instructs to follow -- lists only
  `layoutName, split, primaryCount, secondaryCount, onSelect`; no selection-tracking prop.
- The implementer read the component fully, confirmed the gap, and flagged it explicitly
  rather than silently fixing (scope creep) or silently ignoring (hiding a real UX gap) --
  exactly the right call under an ambiguous instruction.
- This is a genuine internal inconsistency in the task spec (step 6's live-verify checklist
  asks to "confirm it visually highlights as selected" against a component the task's own
  scope boundary forbids changing to add that feature) -- not an implementer misjudgment.

Real UX consequence, though: a user clicks a metatile, sees no feedback, may not realize the
pick registered. Worth its own scoped follow-up task against `MetatilePalette.tsx` (add
`selectedId`/`aria-pressed`/a CSS class, threaded from `App.tsx`'s `currentStamp`) -- flagged
separately, not blocking this task's sign-off.

## Extra/unneeded work

None beyond the necessary `MapCanvas.test.tsx` 2-line fixture fix (type-only fallout from
`MapLayoutData` gaining two required fields, confirmed via `tsc`, not a guess -- verified this
claim myself by reading the diff and re-running typecheck clean).

## Summary

No missing requirements, no scope violations, no misunderstandings. `dropper`/`shift`
genuinely untouched. Test claims and live-verify claims both hold up under independent
re-derivation. The one self-flagged gap (no selection highlight) is correctly scoped out of
this task and correctly disclosed rather than hidden.
