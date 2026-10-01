# Task C1 coordinator record

**Closed 2026-10-01.** Final code commit `49afdc2` (report `f491e9e`).

## Phase C baseline (measured at `b4e08d3`, quiet machine, output captured to a file)
`npm test` 1,935 pass / 0 fail (118 files); typecheck clean; `vite build` OK. GBA subject `git status
--porcelain`: 6 modified + 1 untracked (the usual NavelRock/fieldmap/layouts set and
`docs/human-tasks-notes.md`), HEAD `718b89f`; `.pokemap/dungeons.json` sha1 `f73f9b76…`, `world.json`
`4983f972…`. PerfPlus: clean, HEAD `81ededb`, no `.pokemap/`.

## Flow
- Spec `task-C1-spec.md` (`5bf61ec`). Facts re-measured live before pinning: at 1280 and 1024 px the
  GBA lens popover covered the `Encounters` toggle (`elementFromPoint` → `.lens-panel__legend-body`);
  no toolbar overflow; GBA coverage 982 empty maps (all placed) / 730 unused species. Self-check caught
  one contradiction before dispatch (a `listFor` state would reopen a list on returning to its lens, but
  the test said closed) → keyed `LensLegendRow`.
- Sonnet implementer `f0a61e8..6330dc4` (report `dfb2691`): gate 1,950 / 0. Existing-test edits exactly
  the spec's table (F11 deleted; `LensPanel.test.tsx` split/fixture edits); every other test file
  additions only (coordinator-checked: `git diff b4e08d3` removed lines = 0 in WorldCanvas/App/GbcApp/
  styles tests).
- Opus spec review ✅ (`8ac538c`): 13/13 spec mutants red; extras X3, X4, X6/X6b, X7/X7b, X12b,
  X14/X14b, X16 survived → SR-F1..F6 (Low test gaps), F7..F9 Info. Sonnet quality review approved, 9
  Minor (QR-1 loading state says "0 maps", QR-4 titles/img shrink, QR-5 unnamed note, QR-6 stale
  comments, QR-9 plurals + 982 disabled entries in the dungeon view…).
- Fix round, same implementer: `4c62196`, `84cc393`, `787d1bb`, `b6e6e50`, `49afdc2`; gate 1,963 / 0,
  typecheck and build clean.
- Coordinator decisions: null `summary` = "Loading coverage…" (QR-1); keep and pin the `!coverageError`
  gate; **dungeon view hides "List them"** rather than 982 disabled entries (SR-F5/QR-9b); plurals;
  `title`s, `img` no-shrink, `aria-label="Coverage lens legend"`; SR-F9 taken (cheap). Skipped: QR-3
  memoisation (no profiling evidence, list is opt-in), QR-8 Escape-to-close / auto-collapse / row
  min-height.
- Existing-test edits beyond the table (named): `LensPanel.test.tsx` "states the finding in plain words
  with a next action" now passes `onJumpToMap={() => {}}` (the hide decision), assertions unchanged; one
  comment there renamed the old summary shape.
- **Known, accepted:** in the dungeon view the empty-maps copy still ends "Click to list them." with no
  list button. The App list-jump test first passed under X14 because GBA's first jump fires on token 0
  (the F1 shape C2 fixes); the implementer re-pinned it (tree-click first, highlight remount).

## Mutation re-run on `49afdc2` (coordinator, node harness: anchor ×1, in-memory restore, byte-compare)
All 16 red; tree clean before/after.

| ID | Change | Red test |
|---|---|---|
| X3 | Hide list never closes | LensPanel "List them toggles a list of exactly the given maps, in order" (+ species) |
| X4 | dungeon canvas gets `onJumpToMap` | App "in Dungeon mode (no jump target) the Empty maps lens offers no List them button" |
| X6 / X6b | row rendered with no lens (GBA / GBC) | "no legend row until a lens is on, and none again once it is turned off" |
| X7 / X7b | `coverageError` gate off | "a coverage failure after a lens was clicked removes the legend row and shows the error" |
| X12b | GBC drops `legendCopy` | GbcWorldCanvas "the level-curve lens row carries GBC's own legend copy" |
| X14 | App list = `setSelected` only | App "clicking an Empty maps list entry … jumps the canvas there, like a tree click" |
| X14b | GbcApp list = `selectMapFromWorld` | GbcApp "clicking an Empty maps list entry in World mode selects that map" |
| X16 | maps list under any lens | LensPanel "the species lens never shows the maps list…" |
| F1 | null summary renders zero counts | LensPanel "a null summary … shows 'Loading coverage…'" |
| F2 / F2b | canvas passes an empty summary while loading | "while coverage is still loading, a lens shows 'Loading coverage…'…" |
| F6 | List them without a jump target | LensPanel "without onJumpToMap there is no List them button" + App dungeon test |
| F8a / F8b | plurals off | LensPanel "singular counts read 'map has' / 'species appears'…" |

## Live verify: criteria 3 and 4, both families
Hub on 5184 (`--import` preload remapping `listen(5174)`), Vite on 5183 (programmatic, `root` via
`fileURLToPath`), `POKEMAP_HOME` scratch; all scripts in the session scratchpad, none in the repo.
**The in-app browser pane was hidden** (`document.hidden`, rAF never ran, a fresh `ResizeObserver` got
no callbacks), so its first jump looked off-screen (stale `viewport` state). Not an app bug: re-run in
the Playwright browser, which renders.

| Check | GBA (subject) | GBC (PerfPlus) |
|---|---|---|
| `elementFromPoint` at `Encounters` centre, lens on, list closed / open, 1280 | toggle / toggle | toggle / toggle |
| same at 1024 | toggle / toggle | toggle / toggle |
| `scrollWidth === clientWidth` 1280 / 1024 | ✓ / ✓ | ✓ / ✓ |
| real click on the toggle with list open | `aria-pressed` true | true |
| List them count | 982 | 266 |
| click the last entry | `TwoIsland_PokemonCenter_2F`: zoom 6%→100%, highlight inside viewport, tree row current | `Route31VioletGate`: 7%→100%, inside, current |
| unused species | 730, "Abomasnow, Accelgor, …", first 12 icons loaded | 70, "Ampharos, Arcanine, …", 12 sprites loaded |

The tree row was current but off-screen in the sidebar (expected: C2).
