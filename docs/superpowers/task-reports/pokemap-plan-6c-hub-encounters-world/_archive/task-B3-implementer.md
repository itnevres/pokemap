# Task B3 implementer report

**Status: DONE_WITH_CONCERNS** (concerns = deviations below; none block). Base `e9457e0`.

## Commits
| sha | what |
|---|---|
| 704f6ad | EncounterBorder.tsx + 39 tests + `encounter-border*` CSS (added; old CSS still present) |
| 755d4ab | `encounters/guards.ts` (`isGbaEncountersPayload`) + 5 tests; GBA WorldCanvas wiring; 4 new canvas tests; `makeFetchMock` /api/encounters route |
| 79fd8bd | GBC wiring; named GbcWorldCanvas test edit; 2 new GBC canvas tests |
| ef7e73a | delete 2 gutters + 2 test files + dead CSS; stale-comment retargets; DESIGN.md "Encounter border" section |
(report commit follows by pathspec.) A rate-limit cut-off happened after 755d4ab; tree verified clean, touched tests re-run green before resuming.

## Counts
Before 1,857 -> after **1,873** (116 files). Deleted 34 (16 + 3 + 15), added 50 (EncounterBorder 39, guards 5, WorldCanvas 4, GbcWorldCanvas 2), 1 renamed/edited. 1857-34+50 = 1873.

## Gate
- `npm test`: 1873/1873 pass (one full-run flake earlier, `GbcApp.test.tsx` "palette highlight resets…"; rerun alone 22/22 pass).
- `npm run typecheck`: clean. `npx vite build packages/ui`: ok (css 40.8 kB, js 310.8 kB).
- `styles.test.ts`: pass.

## Old -> new test table
### `EncounterGutter.test.tsx` (16)
| old | pinned | new home (EncounterBorder.test.tsx unless noted) |
|---|---|---|
| is off by default… | toggle unpressed, nothing else | "is off by default: …" |
| turning the toggle on opens the legend and shows the strip, grouped by method | legend on; strip shown | "on: pressed, the legend appears…"; sprites in "sprites are spritePx square", "gives each of several maps its own strip". "grouped by method": no longer applies (one sprite per species, not method rows) |
| groups icons under separate method rows | per-method rows | no longer applies: per-method rows replaced by per-species sprites; methods live in tooltip lines (tooltipLines POLIWAG) |
| hover reports species, level band, true percentage, never slot count | tooltip text | "hover shows the tooltip with the species' lines…" + tooltipLines "a GBA row" (`Land 37.5% Lv 2-4`, no `slot`) |
| focus reveals same tooltip | keyboard path | "focus (not just hover) shows it…; blur hides it" |
| tooltip sibling of legend, not in strip | stacking-context fix | "is a top-level sibling of the strips…" |
| toggling off clears open tooltip | review fix (3) | "toggling off clears an open tooltip (and it does not come back…)" |
| zooming past collapse threshold clears tooltip | review fix (2) | "zooming across the LOD threshold clears an open tooltip" |
| zooming w/o crossing clears stale tooltip | review fix (1) | "zooming without crossing the threshold still clears…" |
| collapses to count badge below threshold | LOD | "at lodZoom-1 a single badge replaces the strip; at lodZoom the sprites are back" |
| names its map in badge's visible text, no title | badge fix | "the badge names its map in visible text… no dead title attribute" |
| full icon detail again above threshold | LOD reverse | same LOD test (rerender zoom 3 -> 4) |
| nothing for a map with no table | `[]` | "renders nothing for a map still loading … and for a map with none" |
| does not crash while loading | `undefined` | same test (`summaries: undefined`) |
| each of several maps own strip at own rect | multi-map | "gives each of several maps its own strip, at its own rect" (exact px) |
| fishing as three separate rod rows | rods labelled, never Old-only | rows as rows: no longer applies. Rods now in tooltip: tooltipLines POLIWAG pins `Fish · Old Rod…`, `Good Rod · day/nite`, `Super Rod · day/nite`; GBA rod labels pinned in B1 `summary.test.ts` |

### `GbcEncounterGutter.test.tsx` (18)
| old | pinned | new home |
|---|---|---|
| chipText: spec example shape | `Name 30% Lv 3-5` | tooltipLines POLIWAG / "time word stays in the row label" (name + pct + Lv) |
| chipText: `+` for grass/water only (mut #7) | level buff | "the + note appears iff some row carries levelBuff" + POLIWAG lines (`+` on grass/surf, none on fish) + B1 buff rows |
| chipText: rounds percent | chip rounding | no longer applies: tooltip uses one decimal (`fmtPct`), pinned `64.8%`, `14.8%` |
| is off by default | | "is off by default…" |
| legend on toggle | | "on: pressed, the legend appears…" + GBC-only legend lines test |
| only time-matching rows, method order, exact labels (Morn) | time filter | no longer applies: time filter replaced by dimming. Dimming: "morn: ZUBAT dimmed…", "a dimmed species still renders"; labels in tooltip lines |
| switching time changes rows (Day) | time switch | no longer applies (filter). Replaced: "nite: CATERPIE dimmed…", "a changed time clears an open tooltip", GbcWorldCanvas "at time=morn … time switch flips it without a refetch" |
| swarm vs non-swarm same-tag key collision | dup React keys / stale row on time switch | no longer applies: sprites are keyed by species, which `summarise` makes unique by construction; swarm label disclosure stays pinned by B1 `rowLabel` "appends ' · swarm'" |
| ordered label list at Morn / Day / Nite (3) | row order + labels | no longer applies (per-method rows). Row order within a species + `Good Rod · day`/`nite` labels: tooltipLines POLIWAG; ordering: B1 summary test |
| LOD at zoom 7 vs 8 (mut R2/R3) | threshold edge | "at lodZoom-1 a single badge…; at lodZoom the sprites" (generic 3/4; mutation `<=` verified red). GBC value 8 is the imported `GBC_LOD_ZOOM_THRESHOLD`, not a literal in a test |
| chips capped at 6 with `+N more` | CHIP_CAP | no longer applies: replaced by per-side capacity k -> "left side, height 60… 2 sprites and '+3'", "k+1 shows k-1 and '+2'", "k is at least 1" |
| exactly 6 chances, no overflow (R5) | `>` vs `>=` | "exactly k species show all k sprites and no chip" |
| species-count badge below LOD | count | "the badge count is every species, dimmed or not" (13 on Route30) |
| nothing while loading | | "nothing for loading / none" |
| nothing for empty sources | | same |
| chip tooltip on hover, full precision | | "hover shows the tooltip…" + tooltipLines exact strings |

Behaviours carried over with new tests (spec list): off by default; legend only while on; hover and focus; sibling; toggle-off; LOD cross; zoom w/o cross; badge names map; nothing for loading/empty; several maps own rect; broken image hidden ("hides a sprite whose icon 404s"). Extra: hide-only-own-key; time change and `entries` change clear tooltip; capacity; spritePx cap 32; all four strip rects; dimming incl. GBA/no-time; guard tests.

## Named canvas-test edits
| file | edit | reason |
|---|---|---|
| `gbc/GbcWorldCanvas.test.tsx` | "the Encounters toggle shows a species chip…" -> "…species sprite…": text chip assertion replaced by `button[aria-label="Geodude"]` + `img[src="/api/species/GEODUDE/icon.png"]` | spec-named; 2 lines removed, rest additions |
| `WorldCanvas.test.tsx` | **`makeFetchMock` gains an `/api/encounters/` route** (`{mapName,mapId:1,methods:[]}`), 8 lines + comment | NOT a named test edit; see Deviations 1 |
| both | additions only (4 GBA tests, 2 GBC tests) | spec-required |
GBC F3 test untouched (reads lens tint DOM). Its comment still mentions `gutterEntries` (stale; left per U1).

`git diff e9457e0 --stat -- packages/ui/test`:
```
 EncounterGutter.test.tsx          | 306 ---  (deleted)
 WorldCanvas.test.tsx              |  89 +++ (additions only)
 encounters/EncounterBorder.test.tsx | 428 +++ (new)
 encounters/guards.test.ts         |  33 +++ (new)
 gbc/GbcEncounterGutter.test.tsx   | 253 ---  (deleted)
 gbc/GbcWorldCanvas.test.tsx       |  36 +-   (2 removed lines = named edit)
 6 files changed, 584 insertions(+), 561 deletions(-)
```
Removed lines in the two canvas files: exactly the named test's two lines.

## Mutations run (all killed, tree reverted)
| mutation | red |
|---|---|
| dimming `includes` not `!includes` | 4 EncounterBorder tests |
| LOD `<=` | 1 |
| tooltip row label drops time | 3 |
| GBA sideByMap over `visible` instead of drawn set | 1 (off-screen Blocker test) |
| GBA cache placeholder removed (`if (false) continue`) | 2 (fetch-once, unavailable no-retry) |
| GBC cache placeholder removed | 1 (F3 test) |
| side order swap | not run separately; side asserted exact (`top`/`left`) in GBA + GBC canvas tests |
`sideByMap` deps: GBA `[drawnPlacements, sizeByMap]`, GBC `[world]`; no pan/zoom (read in code).

## Deviations / concerns
1. **`makeFetchMock` edit (WorldCanvas.test.tsx).** Spec wants failures counted and shown as `role="alert"`, and "no other existing test may change". Unanswered `/api/encounters/` in that shared mock would raise an alert in every test and break the `findByRole("alert")` ones (placement POST, coverage, dungeon POST). Added the route (same precedent as the `/api/coverage` route there); no test body changed. Reviewer: confirm acceptable.
2. **No `summaryByMap` memo.** Spec said memo keyed on `[encounterVersion]`; instead `entry.summaries = summariseGba/Gbc(...)` once on arrival and `borderEntries` reads it. Same output, avoids re-summarising every cached map on each fetch arrival (~500 maps at full zoom-out). Time-independent, so GBC still one fetch/map.
3. `tooltipLines(s, time?)`: spec signature is `(s)`, but its "Not encountered at <time>" line needs time; optional 2nd arg, single-arg call behaves as spec'd (no dimmed line).
4. `drawnPlacements` refactor: `visible` now culls `drawnPlacements` (same filters, same order). Neighbours passed to `pickBorderSide` include the map itself (B2 doc: blocks nothing), no per-map filtered copy.
5. Legend GBC-only lines (dimmed/dashed, `+0-4`) render only when `time` is given (GBA never dims).
6. Sprite tile (raised bg + border) applied to all sprites, not just GBC (harmless behind transparent GBA icons).
7. `+N` chip has no tooltip listing hidden species (not in spec).
8. Badge geometry: outer div = exact band rect, inner pill overflows; left side right-aligned so text extends away from the map.
9. Stale-comment retargets (LensPanel, SpeciesSpotlight, summary.ts, gbc/guards.ts, gbc/time.ts, styles.css, DESIGN.md) comment-only. Test-file comments mentioning EncounterGutter left (U1).
10. Untracked `task-B4-spec.md` in the report dir is the coordinator's; not touched.
11. Not visually checked in a browser (no dev server run); layout is CSS-only reasoning + jsdom geometry tests.

## Fix round (SR-F1..F5, QR-1..10)
Commits: `316ca1f` (item 1+2, tests only), `3c6b2ef` (items 3-8), `c934eeb` (items 9-10, comments/docs). Counts 1,873 -> **1,880** (+7). Gate: `npm test` 116 files / 1880 pass (no flake this run), typecheck clean, `npx vite build packages/ui` ok.

| item | commit | change / proving test |
|---|---|---|
| 1 SR-F1/F5 | 316ca1f | GbcWorldCanvas "wheeling out from the fit zoom: sprites at >= 8, a badge below 8, sprites again after wheeling back; band thickness = BORDER_BAND.gbc * zoom" (zoom 10 -> 8.33 -> 6.94 -> 8.33, waits on the zoom readout each step; strip width = 2*zoom). GBA "wheeling in from zoom 1: a badge below the LOD threshold (4), sprites from 4 (not only from 8)" (7 wheels = 3.58 badge, 8th = 4.30 sprites, band 4 tiles). |
| 2 SR-F4/QR-5 | 316ca1f | New GBA tests: `zoomIn` helper waits for the zoom readout to change then `await act(async () => {})`, then counts calls (no timers). GBC time-switch test now asserts 2 encounter fetches before and after the switch. Edited only my own B3 tests. |
| 3 QR-1 | 3c6b2ef | `+N` is `<button class="encounter-border__more" aria-label="N more species">`; hover/focus tooltip lists hidden names. Tests: "the '+N' chip is a focusable button…", "the chip carrying the full count (k = 1) lists every species". |
| 4 QR-2 | 3c6b2ef | `showTooltip(e, key, summary \| hiddenSummaries)` builds lines at event time; no per-sprite `tooltipLines` per render. Covered by all tooltip tests. |
| 5 QR-6 | 3c6b2ef | "anchors at the sprite's top-centre relative to the root…" with stubbed sprite/root rects (`108px`/`50px`). Dropping the left subtraction and the top subtraction each: 1 red. |
| 6 QR-7 | 3c6b2ef | CSS: opacity moved to `.encounter-border__sprite--dimmed img`; dashed outline stays on the button. Test "dimming CSS" reads the rules from styles.css (jsdom loads no CSS); renaming the img rule: red. |
| 7 QR-8 | 3c6b2ef | dimmed `aria-label` = `"<name>, not encountered at <time>"`; test "a dimmed sprite's accessible name says so…". Reverting to plain name: red (EncounterBorder + GBC canvas). Test helper `sprite()` and the GBC dimming test match the name by prefix (my own tests). |
| 8 QR-9 | 3c6b2ef | `GbcTimeOfDay` from `gbc/time.ts`; redundant `time !== undefined &&` dropped. |
| 9 SR-F3/QR-3/4/10 | c934eeb | DESIGN.md: single-map claim dropped (+ `+N` button / img dimming text); GbcWorldCanvas `borderEntries` comment; WorldCanvas "Culling:" + dungeon paragraphs now describe `drawnPlacements`/`visible`. Src comments only, no test-file comments touched. |
| 10 SR-F2 | c934eeb | `pickBorderSide` doc: `neighbours` may include `rect` itself. |

Mutants re-run (all red now): M10 `lodZoom={4}` (GBC) 1 red; M15 `band={BORDER_BAND.gba}` (GBC) 1 red; M20 `lodZoom={8}` (GBA) 1 red; M5a (GBA placeholder removed) 2 red (fetch-once + unavailable-no-retry, now with real evidence before the count). Also: anchor left/top drop, aria-label revert, img-rule rename each 1 red.

Canvas-test diff vs `e9457e0` (`WorldCanvas.test.tsx`, `gbc/GbcWorldCanvas.test.tsx`): removed lines = only the 2 lines of the named GBC chip test; additions otherwise. `makeFetchMock` route unchanged since the first round.
Note: a mutant-restore `git checkout` wiped my uncommitted EncounterBorder.tsx edits once mid-round; re-applied from the script and re-verified before committing.
Not done (per brief): SR-F6, SR-F7.
