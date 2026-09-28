# Plan 6b Task 5: code-quality review

Reviewed `git diff 5dbab43..54fb6f8` (single commit `54fb6f8`, plus the two
follow-up docs/screenshot commits `1cdc31d`/`37b6cab` which touch no source)
against `task-5-spec.md`, `task-5-implementer.md`, `packages/ui/DESIGN.md`,
and `_archive/task-4-quality-review.md`'s forward-looking notes. Read-only
review; no files modified, no tests/servers run.

## Verdict: **approve-with-fixes**

The implementation matches the spec closely: `computeFit`'s `zoomBounds`
parameter and the `drawDiamond` export are genuinely minimal and additive
(verified byte-for-byte against the diff, no existing call site or test
touched); `GbcWorldCanvas` reproduces exactly the pan/zoom/viewport/culling/
LOD/conflict-badge/jump mechanics the spec calls for and nothing beyond that
(no drag-to-place, multi-select, dungeon or warp logic leaked in); it reuses
`WorldCanvas.tsx`'s own `world-canvas__*` CSS classes verbatim rather than
inventing new styles, which for free inherits the `min-width: 0` hardening
Task 4's review asked for; `GbcMapCanvas`'s stepped `zoomAboutPivot` is
correctly NOT reused (a new, justified `zoomWorldAboutPivot` for continuous
zoom instead), and `parseColorToken`/`hex()` are correctly NOT re-implemented
because this file never needs to decompose a CSS colour into RGBA (it only
ever passes color strings straight through to `ctx.fillStyle`/`drawDiamond`,
mirroring `WorldCanvas.tsx`'s own `getComputedStyle(...).trim() || "#eeff"`
pattern exactly, fallback literal included). Task 4's two forward-looking
notes are honoured: `GbcTimeOfDay` is imported from the new shared
`gbc/time.ts` (not redeclared a third time), and no new `hex()` copy was
added (none was needed). Tests are strong: no jest-dom matchers, real pure-
helper tests for every piece of math (`zoomWorldAboutPivot`,
`initialFitBounds`, `fitAllBounds`, `conflictTooltipText`, `shouldUseLod`,
`jumpFit`), discriminating fixtures (distinct Route16/17/18 names so a
dx/dy or via-A/via-B swap is visible), and a real `<StrictMode>` regression
test for the wheel-zoom path.

The one substantive issue (Important #1) is that this file's own header
comment — which exists specifically to tell a future reader (starting with
Task 6, which edits this exact neighbourhood of `WorldCanvas.tsx` next) where
to find the mechanics being mirrored — cites `WorldCanvas.tsx` line ranges
that are wrong throughout, not just stale. Nothing here is a behavioural bug;
every mutation check and live-verify claim in the implementer's report holds
up. Fix the citations (or lean on `grep` instead of hand-counted ranges) and
this is a clean approve.

## Findings

### Important

**1. Every hand-counted `WorldCanvas.tsx` line-range citation in `GbcWorldCanvas.tsx`'s header comment (lines 8-60) is wrong, several by 12-20 lines, pointing at unrelated code.** No commit between `54fb6f8` and `HEAD` touches `WorldCanvas.tsx`, so this isn't drift — the ranges were wrong the day they were written. Checked every one:

| Citation in `GbcWorldCanvas.tsx` | Claims | Actually at |
|---|---|---|
| `:14` `WorldCanvas.tsx:410-422` (viewport-in-deps postmortem) | the "measure the viewport" effect + Task 21 comment | `423-438` (410-422 is the unrelated `coverageError` doc comment) |
| `:18` `WorldCanvas.tsx:220-222` (`intersects`) | the AABB predicate | **correct**, exact match |
| `:23` `WorldCanvas.tsx:845-868` (image loading + LOD buffer) | the per-visible-placement image-load effect | `857-884` (845-856 is the unrelated `hiddenCount` memo; the cited range also cuts the effect off before its `img.src=...` close) |
| `:28` `WorldCanvas.tsx:1328-1346` (conflict badge + hit-rect) | the conflict-drawing loop | `1344-1361` (1328-1343 is the dive/emerge vertical-links loop, a different feature; the actual conflict comment/loop starts at 1344) |
| `:30` `WorldCanvas.tsx:616-694` (jump + 2s fade, "jumpHighlight" pattern) | both jump effects together | jump effect is `655-683`, the separate fade effect is `706-710`; 616-654 is `fitWorld`'s own bounds computation + an unrelated comment, and the range as given misses the fade effect (685-705) it claims to cover |
| `:42` `WorldCanvas.tsx:1368` (`WHEEL_FACTOR`-multiplied mechanic) | where the continuous zoom math lives | `1384` (`Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, ... * WHEEL_FACTOR))`); 1368 is mid-comment ("React attaches wheel listeners as passive...") |
| `:597` (inline, jump-highlight key comment) `WorldCanvas.tsx:1838-1851` | the "keyed on jumpToken" review-fix comment | `1853-1866` (1838-1851 is the unrelated multi-select outline block just above it) |

The one citation borrowed verbatim from the spec itself (`"a native wheel
listener... WorldCanvas.tsx's comment near l. 1361"`, spec §3) is close (real
range `1367-1390`) — the spec's own "near" hedge was honest. The others were
authored fresh for this file's header and are off by a consistent
mid-teens amount, as if counted against an unsaved or differently-scrolled
view of the file rather than the committed one.

**Why it matters beyond nitpicking:** this header comment's whole purpose is
to be the map a future implementer follows instead of re-deriving the
mechanics from scratch — Task 6's own spec explicitly tells its implementer
to go read `WorldCanvas.tsx` by line range for the encounter-cache/lens-tint
code it must mirror next (`task-6-spec.md` "Read first", `l. 880-1110` — that
one, independently checked, lands close to the real encounter-cache/
lens-tint/spotlight code at `886-1130ish`, so it's usable). A citation in
`GbcWorldCanvas.tsx` sending a reader to the wrong feature entirely (e.g.
"1328-1346" landing on dive/emerge instead of conflicts) costs real time and,
worse, is easy to trust silently since the prose reads confidently.

**Fix:** correct the seven ranges above (or, better, replace hand-counted
ranges with a named anchor a `grep` can still find after the file moves
again, e.g. "the `// Measure the viewport` comment" instead of a line number,
since `WorldCanvas.tsx` is exactly the file Task 6 is about to edit next).

### Minor

**2. `gbc-world-canvas` (the second class on the root `<section>`, `GbcWorldCanvas.tsx:553`) has no matching CSS rule anywhere in the diff or `styles.css`.** It's a harmless, presumably forward-looking hook (a GBC-only override point), but as committed it's dead — grep confirms zero `.gbc-world-canvas` selectors. Either wire an actual rule that needs it, drop it until Task 6/7 does, or add a one-line comment saying it's an intentional hook (the file's other additive decisions are all commented; this one isn't).

**3. The canvas has no keyboard path to the select/open interactions it exposes** (`onClick`/`onDoubleClick` only, no `tabIndex`, no `onKeyDown`). This is not a regression — `WorldCanvas.tsx`'s own canvas is in the same position for its own click-to-select path (its `tabIndex={0}`/`onKeyDown` pair only implements `Escape`-clears-multi-select, which has no GBC analogue since GBC has no multi-select) — but DESIGN.md's accessibility baseline is explicit ("every interactive control reachable by keyboard"), and this is the second canvas in the app to ship that gap rather than the first. Worth a tracked follow-up rather than silently accepting a second instance of the same gap; not blocking for Task 5 given the precedent.

### Nit

**4.** `GbcWorldCanvas.test.tsx` at 570 lines is not padded — the pure-helper tests (`zoomWorldAboutPivot`/`initialFitBounds`/`fitAllBounds`/`conflictTooltipText`/`shouldUseLod`/`jumpFit`, ~150 lines) are genuinely pure and fast, and the component-level tests each cover a distinct interaction path (plain click vs. drag-then-click vs. double-click vs. double-click-on-empty are four different code paths, not one scenario copy-pasted three times). No action needed; flagged only because the brief asked for a redundancy check.

**5.** The `jumpFit`/`initialFitBounds`/`fitAllBounds` JSDoc comments compare themselves to GBA's `worldBoundsOf`/map-list jump favourably and accurately (re-checked their claims about GBC not needing a `sizeByMap` reconstruction, since every GBC `Placement` already carries its own `width`/`height` — true, per `wire.ts`'s `GbcWorldPayload` shape). Called out only because Important #1 might otherwise make every comment in this file suspect; the *prose* claims (as opposed to the *line-number* claims) all checked out under direct re-derivation.

## What checked out cleanly (no issues)

- **`computeFit`/`drawDiamond` additive changes** (`WorldCanvas.tsx`): the
  `zoomBounds?` parameter defaults to exactly `MIN_ZOOM`/`MAX_ZOOM` when
  omitted (confirmed no existing call site passes a third argument), the new
  `WorldCanvas.test.tsx` test pins both the old default and the new override
  without touching the pre-existing `computeFit` test, and `drawDiamond` is
  exported with a doc comment correctly explaining why `drawTriangle`
  (dive/emerge, no GBC equivalent) is deliberately not.
- **`isGbcWorldPayload`/`useGbcWorld`**: every guard clause from the spec is
  present (`family`, exact `blockPx === 32`, placement numeric fields,
  `components`/`conflicts` as arrays), matches `isGbcMapPayload`'s established
  "trust the rest, guard what you index by" posture, and `guards.test.ts`
  covers every clause plus the mutation-check's own named case (`rejects
  blockPx !== 32 (mutation check #6...)`).
- **Duplication scope**: nothing beyond the spec's explicitly-listed
  pan/zoom/viewport/culling/LOD/conflict-badge/jump mechanics is duplicated —
  read the full 631-line file; no selection-set, drag-to-place, dungeon
  auto-layout or warp-marker logic leaked in from `WorldCanvas.tsx`. The one
  local copy (`intersects`, a 3-line AABB predicate) is deliberate and
  commented (not worth a second additive export for four lines).
- **GBC-specific behaviour**: image URL/cache-key-by-map/whole-cache-clear-
  on-time-change all match the spec and are each independently tested,
  including the "already-loaded entries get dropped too" case (mutation
  check #2's test explicitly resolves the images before switching time, so
  it isn't fooled by cache entries that were never populated in the first
  place). `conflictTooltipText` is pinned against two real corpus fixtures
  (Route17 and Route18) plus a synthetic dx/dy-inversion mutation case.
- **`GbcApp` wiring**: `selectMap` (tree click) bumps `selectVersion`;
  `selectMapFromWorld` (canvas single-click) does not — matching the spec's
  "tree clicks jump, canvas clicks don't" distinction exactly, and covered by
  a real integration test that asserts the jump-highlight DOM node appears
  only via the tree-click path.
- **CSS**: no new rules were needed or added; every class `GbcWorldCanvas`
  renders (`world-canvas`, `world-canvas__toolbar`, `__viewport`, `__stage`,
  `__status`, `__tooltip`, `__selection[-outline]`, `__jump-highlight`,
  `map-canvas__btn`) already exists in `styles.css` with real DESIGN.md
  tokens, BEM naming, and (per Task 4's review) `min-width: 0` on
  `.world-canvas__viewport` and its toolbar's grow group — inherited for
  free rather than re-solved.
- **Accessibility (besides Minor #3)**: `aria-label="World canvas"` on the
  section matches `WorldCanvas.tsx`'s own exact pattern; the "Fit all"
  button is a real labelled `<button>`; the tooltip uses `role="tooltip"`,
  matching the GBA convention precisely (including the same lack of
  `aria-describedby`, so no regression either way).
- **Comment accuracy (prose, not line numbers)**: spot-checked the
  `initialFitBounds`/`fitAllBounds`/`conflictTooltipText`/`shouldUseLod`
  JSDoc claims against the code and the spec's own corpus facts (Route17 via
  Route16/Route18 fixture, `blockPx=32`, `LOD_SCALE=0.25` giving threshold 8)
  — all accurate. See Important #1 for the one class of comment (line-number
  citations into `WorldCanvas.tsx`) that isn't.
- **Test quality**: no `@testing-library/jest-dom` matchers anywhere in the
  diff (confirmed by reading every assertion); fixtures use distinct,
  discriminating values (Route17/18's real via-A/via-B coordinates, not
  interchangeable placeholders); a genuine `<StrictMode>` test pins the
  single-application wheel-zoom pan, addressing Task 4's binding lesson head
  on, using a mirrored-but-adapted (continuous, not stepped) version of
  `GbcMapCanvas`'s own fix rather than a copy-paste of the stepped one.

## Risk for Task 6

Beyond Important #1 (which directly affects Task 6, since its own spec
points a future implementer at this exact stretch of `WorldCanvas.tsx`):

**The image-cache-clear-on-time-change effect (`GbcWorldCanvas.tsx:364-367`)
sits directly next to where Task 6's encounter cache will want to live, and
copying its shape would be wrong.** Task 6's spec is explicit that the
encounter cache must be "time-independent... one fetch per map ever" (client-
side filtering handles time), unlike the image cache, which is deliberately
and correctly time-keyed and fully dropped on every time switch (this
task's own mutation check #2). A `GbcEncounterGutter` integration that
mirrors the *image*-cache pattern by habit (same `useRef<Map>`, same
`useEffect(() => { cache.clear(); ...}, [time])` shape one function up)
would silently break the "fetch once ever" requirement and start refetching
every map's encounters on every Morn/Day/Nite toggle. Worth calling out
explicitly in the Task 6 dispatch, since the two caches sit a few lines
apart and look superficially identical in shape.

**No screen-space-rect memo exists yet, independent of the imperative draw
effect.** `WorldCanvas.tsx` keeps a separate `encounterEntries`/`lensOverlay`-
style memo (`dx/dy/dw/dh` recomputed from `visible`+`pan`+`zoom`, deliberately
duplicating the draw effect's own formula rather than trying to share it —
see its own comment on why) so `EncounterGutter`/`LensPanel`'s DOM overlays
can be positioned without hooking into canvas internals. `GbcWorldCanvas`
currently computes its placement rects only inline inside the draw effect
(`GbcWorldCanvas.tsx:412-413`); Task 6 will need to add an equivalent
memo of its own. Not a defect (this mirrors the accepted GBA duplication
convention exactly), just flagging that Task 6 has to add this hook point
from scratch rather than finding it half-built.

**The toolbar has one plain `.world-canvas__toolbar-group` and no
`--grow` group yet.** `WorldCanvas.tsx` mounts `SpeciesSpotlight` and
`LensPanel` inside a `.world-canvas__toolbar-group--grow` div
(`WorldCanvas.tsx:1766-1790`) sitting between its feature toggles and the
zoom readout. `GbcWorldCanvas`'s toolbar (`:554-560`) has no such slot; Task
6 will add one. Trivial, but worth doing consistently with the GBA layout
(a `--grow` group, not a bespoke width) since the class already exists and
is themed.
