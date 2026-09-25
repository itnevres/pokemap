# Follow-up 1: mount MetatilePalette, wire real stamps into pencil/rect/bucket

Status: DONE

Commit: `70b091d feat(ui): mount MetatilePalette, wire real stamps into pencil/rect/bucket`

## What changed

1. **`packages/server/src/index.ts`** (`/api/map/:name` handler) -- response now
   includes `primaryCount: primary.metatileCount, secondaryCount:
   secondary.metatileCount`, reusing the `primary`/`secondary` tilesets already
   resolved above for `behaviorFor`'s own `owner.metatileCount` check. No new
   computation, just returning numbers that already existed server-side.

2. **`packages/ui/src/hooks/useMapLayout.ts`** -- `MapLayoutData` gained
   `primaryCount: number; secondaryCount: number`. No other change; the hook
   already JSON-parses the whole response body into this type.

3. **`packages/ui/src/App.tsx`**:
   - Imported `MetatilePalette` and `type Stamp`.
   - Added `currentStamp` state (`Stamp | null`, starts null).
   - `selectMap` now also calls `setCurrentStamp(null)` alongside the existing
     `setSelectedEvent(null)` -- a stamp is meaningless (and potentially
     out-of-range) against a different layout's tileset.
   - `activeTool` useMemo extended: pencil/rect/bucket now resolve to
     `{ kind, stamp: currentStamp }` once a stamp exists, still `null`
     otherwise (same null-until-configured posture as before). Updated the
     stale comment above it that said "no MetatilePalette is mounted
     anywhere in App.tsx."
   - `Toolbar`'s `availableTools` extended from `["collision"]` to
     `["collision", "pencil", "rect", "bucket"]`. `dropper`/`shift` were
     deliberately left out -- untouched, still disabled with "Not yet
     available," per the task's explicit scope boundary.
   - Mounted `MetatilePalette` in a new `.app__metatile-strip` div, sibling to
     the existing collision-strip block, conditional on
     `activeToolKind === "pencil" | "rect" | "bucket"`, passing
     `layout.data.layout.name` / `.split` / `.primaryCount` / `.secondaryCount`
     and `onSelect={setCurrentStamp}`. `layout.data` is non-null in this
     branch already (existing ternary), so no extra guard was added.

4. **`packages/ui/src/styles.css`** -- new `.app__metatile-strip` rule,
   mirroring `.app__collision-strip` (`flex: 0 0 auto`, same padding/bg/
   border), plus `max-height: 240px; overflow-y: auto`. Judgment call: a real
   layout's palette can run 60+ rows (500+ metatiles at 8 columns per row);
   unconstrained, mounting it would push the canvas off-screen or force
   page-level scrolling to reach it. 240px keeps the strip well under
   `.app__body`'s typical available height on a normal window while still
   showing several rows before it needs its own scroll.
   `.metatile-palette` (the component's own CSS, from Plan 2) already carries
   `overflow-y: auto` but no bound of its own -- this wrapper is what actually
   gives it something to scroll inside. Confirmed live (see below): the strip
   scrolls independently and the canvas + EventInspector stay fully visible
   underneath it.

## Real values used (not guessed)

Verified via a one-off script calling `openProject(...).tileset(...)
.metatileCount` directly against the real corpus (not derived from the test
expectations, checked independently first):

- `NewBarkTown` (`NewBarkTown_Layout`): primary `gTileset_Johto_General` = 640,
  secondary `gTileset_NewBarkTown` = 144, `split.metatiles` = 640.
- `PetalburgCity` (for reference, not pinned in the new server test):
  primary `gTileset_General` = 512, secondary `gTileset_Petalburg` = 144.

`packages/server/test/api.test.ts`'s existing "returns a map's header, split
and layout metadata" test (NewBarkTown) now also asserts
`body.primaryCount === 640` and `body.secondaryCount === 144`.

## Tests

TDD throughout: each new assertion was run red (confirmed failing against
pre-change code) before the corresponding implementation landed.

- **`packages/server/test/api.test.ts`**: extended the existing NewBarkTown
  test with the two new field assertions above. 26/26 tests pass (whole file).
- **`packages/ui/test/App.test.tsx`**: new `describe("App -- metatile palette
  wiring")` block, two tests:
  1. Selects PalletTown, clicks "pencil," confirms `MetatilePalette` mounted
     (its search input, same query `MetatilePalette.test.tsx` itself uses),
     clicks metatile `0x1`, paints via a real mousedown/mouseup on the canvas,
     and asserts the captured `/paint/apply` request body's
     `stamp.cells[0].metatileId === 1` -- a real, non-hardcoded id picked
     from the palette, not a placeholder.
  2. Same setup, then switches to Route1 (session clean, so `selectMap`'s
     `confirm()` guard never fires), confirms `MetatilePalette` remounted for
     Route1, then confirms a subsequent stroke fires **zero** new fetch
     calls -- `activeTool` resolved to `null` because `currentStamp` was
     reset on the switch, pinning the actual reset behavior rather than just
     trusting the code.
  - `makeEditFetchMock` gained an optional `paintApplyBodies` param that
    captures each `/paint/apply` request body (JSON-parsed) for inspection.
  - `PALLET_TOWN_LAYOUT` (and its `ROUTE1_LAYOUT` derivative) fixture gained
    `primaryCount: 4, secondaryCount: 2` -- deliberately small, matching
    `MetatilePalette.test.tsx`'s own fixture convention, so the suite doesn't
    pay to render hundreds of thumbnail buttons per case.
  - All 9 tests in the file pass (7 pre-existing + 2 new).
- **`packages/ui/test/MapCanvas.test.tsx`**: not in the original file list,
  but its own `DATA: MapLayoutData` fixture broke under `tsc` once the
  interface gained two required fields (`error TS2739: ... missing ...
  primaryCount, secondaryCount`). Added `primaryCount: 512, secondaryCount:
  144` to that fixture (MetatilePalette is never rendered by this file, so
  the exact numbers don't matter, just type-validity). All 22 tests in the
  file still pass.

**Full run**: `packages/ui` + `packages/server` -- 29 files, 308/308 tests
pass. `npm run typecheck` (both `tsconfig.base.json` and
`packages/ui/tsconfig.json`) -- clean, zero errors.

**Whole-repo run** (`npx vitest run`, no path filter): 674/675 pass, one
failure in `packages/ui/test/WorldCanvas.test.tsx` ("keeps the fade timer
alive across a map drag within the fade window") -- a file this task never
touched. Re-ran that file alone: 55/55 pass, including that exact test. Timing
-sensitive test flaking under full-suite parallel load, not a regression from
this change.

## Live-verify (real dev server + real browser, not jsdom)

Ran `npx tsx packages/server/src/serve.ts` (API on :5174, the real subject
project) and Vite's dev server (proxying `/api` to :5174) via the browser
preview tool, then drove the actual app:

1. Confirmed `GET /api/map/NewBarkTown` returns
   `{"primaryCount":640,"secondaryCount":144,...}` -- matches the
   independently-verified real numbers exactly, over the wire, not just in a
   test.
2. Opened `VioletCity`, clicked **Pencil** -- `MetatilePalette` appeared below
   the toolbar as a bounded, independently-scrollable strip; canvas +
   EventInspector stayed fully visible beneath it (no page-level scroll
   needed to reach the canvas).
3. Clicked metatile `0xA` (id 10), clicked the canvas. Captured the real
   `POST /api/edit/VioletCity/paint/apply` request body via a `window.fetch`
   wrapper (network-tab inspection tools here only exposed response bodies,
   not request bodies) -- `stamp.cells[0].metatileId === 10`, matching the
   clicked cell exactly.
4. Switched to **Rect**, picked metatile `0x5`, dragged a small rectangle --
   `stamp.cells[0].metatileId === 5`, `tool: "rect"`.
5. Switched to **Bucket**, picked metatile `0x9`, clicked the canvas --
   `{"tool":"bucket","replacement":{"metatileId":9}}`, matching the clicked
   cell.
6. Reloaded fresh, selected `NewBarkTown`, clicked Pencil, picked metatile
   `0x7` (deliberately did NOT paint, keeping the session clean so the
   dirty-switch `confirm()` guard -- pre-existing, unrelated to this task --
   wouldn't block an automated switch), then selected `CherrygroveCity`.
   `MetatilePalette` remounted for the new map; clicked the canvas once more
   and confirmed **zero** new `/paint/*` requests fired at all (checked via
   the same fetch-wrapper counter) -- `currentStamp` was genuinely reset, not
   just visually.

## Self-review / concerns

- **No visual "selected" highlight on the clicked metatile cell.** The task's
  step 6 (live-verify) asks to "confirm it visually highlights as selected."
  I read `MetatilePalette.tsx` in full before starting (as instructed) and
  confirmed it: the component has **no** notion of a currently-selected cell
  at all -- no `selectedId` prop, no `aria-pressed`, no CSS class for it.
  Live-verified this directly: clicking a cell produces no visible change to
  that cell. This is a real drift between the task's step-6 expectation and
  the actual current source, but:
  - `MetatilePalette.tsx` is not in the task's own "Files to touch" list.
  - Step 3's own mount snippet (which the task says to follow) passes only
    `layoutName, split, primaryCount, secondaryCount, onSelect` -- no
    selection-tracking prop at all.
  - Adding selection-highlight state would mean modifying a component the
    task explicitly didn't scope in, on my own judgment call, which risks
    exactly the kind of scope creep the task's own "Self-review" step warns
    against.
  I judged this a minor inaccuracy in the live-verify checklist's wording
  (likely written before `MetatilePalette.tsx`'s final shape settled) rather
  than a blocking ambiguity in the actual required changes -- the core
  deliverable (mount it, wire real stamps, reset on switch) is unambiguous
  and works correctly end-to-end, confirmed live. Flagging this explicitly
  rather than silently ignoring it or silently fixing it out-of-scope.
- Did not touch `dropper`/`shift` -- confirmed still disabled ("Not yet
  available") in both the diff and the live screenshot.
- Did not touch `MetatilePalette.tsx`, `Toolbar.tsx`'s own internals, or
  `MapCanvas.tsx` -- all three were already fully wired/correct for this task
  from Plan 2; only the App.tsx-level mounting/state gap needed closing.
- `packages/ui/test/MapCanvas.test.tsx` was edited even though it wasn't in
  the task's file list -- necessary fallout from `MapLayoutData` gaining two
  required fields (confirmed via `tsc`, not a guess), a two-line fixture
  addition with no behavioral change to that file's own tests.

## Post-review fix (commit `1357013`)

Code-quality review (`followup-1-metatile-palette-code-quality-review.md`)
flagged one Important finding: `currentStamp` never resets on a tool switch
(only a map switch) -- picking metatile 0x5 on pencil then switching to
bucket arms bucket with 0x5 immediately, no re-pick.

Coordinator's call: this is correct, intended behavior, not a bug --
Porymap (and every metatile-based map editor this project targets parity
with) shares one picked tile across pencil/rect/bucket; forcing a re-pick on
every tool switch would be a real UX regression (breaks the normal
pencil-a-detail-then-bucket-fill-the-rest workflow). Declined the reset,
per the reviewer's own stated alternative:

- Added a comment at `currentStamp`'s declaration (`packages/ui/src/App.tsx`)
  spelling out explicitly that pencil/rect/bucket deliberately share one
  stamp, that a tool switch does NOT clear it (only a map switch does, since
  a stamp is tied to one layout's tileset ids), and why (Porymap-parity,
  avoids an annoying re-pick).
- Added a regression test in `App.test.tsx`: pick metatile `0x1` on pencil,
  switch straight to bucket with no fresh pick, paint, and assert the
  captured `/paint/apply` body is `{tool: "bucket", replacement:
  {metatileId: 1}}` -- pins the shared-stamp behavior itself, in either
  direction, against a future accidental change.

Verification: `packages/ui/test/App.test.tsx` 10/10 pass (9 previous + 1
new). Full `packages/ui` + `packages/server` run: 29 files, 309/309 pass.
`npm run typecheck`: clean. Committed as
`1357013 docs(ui): document pencil/rect/bucket's intentional shared stamp, add regression test`,
staging only `packages/ui/src/App.tsx` and `packages/ui/test/App.test.tsx`
(the only two files that actually changed). The two Minor findings from the
same review (bucket/rect payload shape only indirectly exercised; App.tsx
line growth) were left as-is per the reviewer's own non-blocking call.
