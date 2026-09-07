# World view usability — Design Spec

**Date:** 2026-09-07
**Status:** Approved
**Target repo:** `C:\Programming Projects\PokeMap`
**Builds on:** Plan 1 (merged to `master`), specifically `WorldCanvas.tsx`, `MapTree.tsx`,
`SpeciesSpotlight.tsx`, and the `/api/world/placement` and `/api/coverage` routes.

---

## 1. Goal

Three independent usability additions to the world view, requested after using Plan 1's
finished tool:

1. **Multi-select move** — select more than one map and drag them together, instead of
   repositioning dungeon floors one at a time.
2. **Map-list jump in World mode** — the map list already visible in the sidebar (shared
   with Map mode, already filterable) currently does nothing when you click a name while
   in World mode. Clicking should pan/zoom to that map.
3. **Species type-ahead** — the existing species search box becomes a real autocomplete:
   type a prefix, get a dropdown of matching species, click one to search it.

None of these touch the decomp (invariant I8 still holds — all three read/write only through
existing PokeMap-owned surfaces: the world canvas, the sidecar file, and a new read-only
species-list endpoint).

A fourth idea (named layout snapshots — save/load whole arrangements as presets, on top of
the single live sidecar that exists today) was raised and explicitly parked for a later
spec. Not designed here.

---

## 2. Feature 1: Multi-select move

### 2.1 Interaction model

`WorldCanvas.tsx` currently claims both drag gestures on the canvas: a plain drag pans the
view, and Shift+drag on a placed map moves that one map (persisted via
`POST /api/world/placement`, fixed for pointer-capture correctness during Plan 1's Task 25
review). This feature adds selection on top without changing either existing gesture's
baseline meaning.

| Input | Effect |
|---|---|
| Plain click on a map | Select only that map, clearing any existing selection |
| Plain click on empty canvas | Clear the selection |
| Ctrl/Cmd+click on a map | Toggle that map in/out of the current selection |
| Ctrl/Cmd+drag starting on empty canvas | Draw a marquee rectangle |
| Shift+drag starting on a *selected* map | Move the whole selection together |
| Plain drag (anywhere, nothing selected or not) | Pans the view — unchanged |

**Marquee direction sensitivity** (a standard CAD/diagramming convconvention, requested
explicitly): on release, the marquee's effect depends on which way it was dragged, compared
by screen-space x-coordinate of the drag's start vs. end point:

- **Dragged right** (end.x > start.x): select only maps whose placement rectangle is
  **fully enclosed** by the marquee ("containment" selection).
- **Dragged left** (end.x < start.x): select every map the marquee **touches at all**, even
  partially ("crossing" selection).

A Ctrl+drag replaces the current selection with the marquee result (it does not add to an
existing selection — keeping the input model to two clearly distinct primitives: click-based
toggling for precise adjustment, marquee for bulk selection). If this feels wrong once built
(e.g. "I wanted to marquee-add to what I'd already ctrl-clicked"), that's a one-line change
to make later — not blocking the initial design.

### 2.2 Moving the selection

Shift+drag already exists for a single map; it is extended so that when the drag starts on
a map that is part of a selection of 2 or more, every selected map moves together, each
preserving its offset from the map that was actually grabbed. If the drag starts on a map
that is *not* part of the current selection, only that one map moves (matching today's
behavior exactly — selection state does not change).

On drag end, one `POST /api/world/placement` fires per moved map (`Promise.all`, matching
this codebase's existing "no cross-cutting transactions, small independent things" pattern —
see the same reasoning already applied to the two existing placement/dungeon-toggle POST
routes). If some succeed and some fail, the ones that succeeded stay moved and the existing
`saveError` toast (added during Plan 1's Task 29 review) reports the failure — no rollback
of the partial move. This mirrors how a single failed move already behaves; multi-select
does not need a new failure story.

### 2.3 Visuals

- Selected maps: a distinct outline (new CSS token, not reusing conflict/dive-emerge/
  encounter-gutter colors — same "each overlay kind keeps one hue" rule as every other
  overlay in `DESIGN.md`).
- Marquee: a live rectangle drawn during the Ctrl+drag, cleared on release. A single style
  is enough for v1 — the selection outline appearing on release is sufficient feedback that
  something was selected. Visually distinguishing the two drag directions *while dragging*
  (e.g. dashed vs. solid) is a deferred nicety, not required now.

### 2.4 Edge cases

- Marquee entirely over empty space: selects nothing, clears any prior selection (consistent
  with "Ctrl+drag replaces the selection").
- Selecting a map that's part of `unplacedMapNames` (dungeon-auto-layout off, shown in the
  side rail rather than the canvas): out of scope — the rail's own drag-on mechanism is
  unrelated to on-canvas multi-select and is not changed by this feature.
- Escape key clears the selection (standard convention, cheap to add, not asked for
  explicitly but consistent with existing keyboard affordances in the codebase).

---

## 3. Feature 2: Map-list jump in World mode

### 3.1 Current state

`App.tsx` already renders `MapTree` (with its existing filter box) unconditionally in both
Map and World mode, sharing one `selected` state. In Map mode, `selected` drives
`MapCanvas`. In World mode, `selected` is set by clicking a name but nothing currently reads
it — the click has no visible effect.

### 3.2 Change

Pass `selected` into `WorldCanvas` as a prop. When it changes while `WorldCanvas` is
mounted (i.e. while in World mode), pan/zoom the canvas to center that map — reusing the
fit/pan math already built for "Fit world" and the empty-maps lens's "List them" action
(both already compute a target rect and animate/set pan+zoom to it).

No new UI is added. The existing filter box narrows the same list in both modes; typing in
it and clicking a result is the only interaction, in both modes — just what the click *does*
differs by mode (select-and-show vs. pan-and-highlight).

### 3.3 Visuals

Briefly outline the jumped-to map on arrival, reusing the exact same outline token feature 1
introduces for selection — one visual language for "this is the map I'm pointing at," not
two. Fades out after a couple of seconds, or on the next interaction, whichever comes first.

### 3.4 Edge cases

- Clicking a map name that's currently in the unplaced side rail (dungeon-auto-layout off):
  pan to where it *would* be if placed is meaningless since it has no placement. Simplest
  correct behavior: if the selected map has no current placement, do nothing (no crash, no
  pan) — arguably a smaller follow-up could scroll the side rail to it instead, not required
  for v1.

---

## 4. Feature 3: Species type-ahead

### 4.1 Data source

New route: `GET /api/species` — returns the full sorted list of `SPECIES_X` names the
project has art for. This is `allSpecies()` from `packages/core/src/analyse/coverage.ts`,
already implemented and already used internally by `coverage()`'s `unusedSpecies`
computation, just not exposed on its own until now. No new core logic — one new thin route,
cached the same way `/api/coverage` already is (the list can't change for the lifetime of a
read-only-decomp server process).

The full roster is used (not just species that appear in some encounter table) — the whole
point of a type-ahead is discovery, and a species search that returns "appears in no
encounter table" is itself useful information the existing empty-state message already
provides. Restricting the dropdown to only "has encounter data" would hide legitimate
searches (gift/static/trade-only species, or species a level designer is checking *because*
they suspect it's missing).

### 4.2 Behavior

- List fetched once, on mount (a few hundred to ~1,000 short strings — cheap).
- Filtering happens client-side: as the user types, the dropdown shows species whose name
  starts with the typed text (case-insensitive), computed locally — no network call per
  keystroke, unlike the existing search-and-highlight flow which does debounce a real fetch.
- Dropdown appears once at least 1 character is typed; hides on empty input, on blur, or
  once a selection is made.
- Long match lists scroll inside a max-height panel (same pattern as the existing unplaced-
  maps side rail, which already handles up to ~1,028 entries this way).
- Keyboard: ArrowDown/ArrowUp move a highlighted entry, Enter selects the highlighted entry
  (or submits the typed text as-is if nothing is highlighted, matching today's plain-search
  behavior), Escape closes the dropdown without clearing the typed text.
- Clicking a dropdown entry: fills the input with that full species name and immediately
  fires the existing search path (the `/api/where/:species` fetch that dims/highlights the
  world) — skipping the 250ms debounce, since a click is already a complete, deliberate
  choice, not an in-progress keystroke.

### 4.3 Error handling

If `/api/species` fails to load, the type-ahead dropdown simply never appears — the
existing free-text search (type a full name, press through) still works unaffected, since
it doesn't depend on this list at all. No new error UI needed; this degrades to exactly
today's behavior.

---

## 5. Testing

Per this project's established TDD practice and Plan 0 §7's test-design rules:

- **Multi-select**: unit tests for the selection-state reducer (toggle, clear, marquee
  containment vs. crossing — both directions, both with concrete fixture rectangles that
  discriminate the two modes, not just "some maps selected"), and a test that a group-move
  posts one placement update per selected map with each map's correct new coordinates
  (not all moved to the same point — the classic "aliased fixture" trap this project has
  hit before).
- **Map jump**: a test that clicking a filtered map name in World mode calls the pan/zoom
  function with that map's actual placement rect, not a hardcoded one.
- **Species type-ahead**: a test that typing "M" filters to only species starting with M
  (case-insensitive) against a fixture list chosen to include a near-miss (e.g. a species
  containing "m" but not starting with it) so the test can't pass on a substring-match bug;
  a test that clicking an entry fires the same search path as typing the full name and
  submitting; a test for the empty-list/fetch-failure degrade path.
- All three ship with real `WorldCanvas`/`SpeciesSpotlight`/`MapTree` integration tests, not
  just isolated logic tests — this codebase's review history (Plan 1, Tasks 25/28/29) found
  real bugs only visible when driving the actual mounted component, and expects the same
  discipline here.

---

## 6. Out of scope

- Named layout snapshots (parked, per §1).
- Multi-select for anything other than on-canvas placed maps (e.g. multi-selecting entries
  in the unplaced side rail) — not requested, not designed.
- Server-side species-name filtering/pagination — the roster is small enough that client-side
  filtering of the full list is simpler and sufficient; revisit only if the real species
  count grows enough to make that untrue (it won't, for any pokeemerald-family project).
