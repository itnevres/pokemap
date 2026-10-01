# Task B3 spec-compliance review

**Verdict: ❌**, 1 blocking (SR-F1, a lost U1 pin, ~10-line test fix), 4 minor, 3 info. Everything else matches the spec.
Reviewed `e9457e0..6342808` (704f6ad, 755d4ab, 79fd8bd, ef7e73a). Read independently: the full diff, B1 `summary.ts`, B2 `borderSide.ts`, both deleted gutters and their tests.

## Gate (re-run by reviewer)
- Touched files: EncounterBorder 39, guards 5, borderSide 34, summary 25, WorldCanvas 63, GbcWorldCanvas 82, styles: all pass (252).
- `npm test`: 116 files, 1873/1873 pass. `npm run typecheck`: clean. `npx vite build packages/ui`: ok (css 40.83 kB, js 310.77 kB).
- Live check skipped: :5173 is held by a leftover server (pid 9676), not killed. Coordinator checks after B4.

## Findings
| id | sev | where | evidence |
|---|---|---|---|
| SR-F1 | **blocking** | `gbc/GbcWorldCanvas.tsx:1015` (`lodZoom={GBC_LOD_ZOOM_THRESHOLD}`); U1 table row "LOD at zoom 7 vs 8 (mut R2/R3)" | Old `GbcEncounterGutter.test` "collapses to a badge at zoom 7 … full strip at zoom 8" killed R2 (threshold 8→5). The claimed new home (component LOD test, generic 3/4, plus "GBC value 8 is the imported constant") does not pin it: mutant M10 `lodZoom={4}` **survives** all 82 GbcWorldCanvas tests (and EncounterBorder never sees the GBC value). `GBC_LOD_ZOOM_THRESHOLD === 8` is pinned (test:143), but the wiring's use of it is not. Fix: one GbcWorldCanvas test that wheels from fit zoom 10 out to below 8 (10/1.2² ≈ 6.94 → badge) and back to ≥8 (sprites). GBA analog M20 `lodZoom={8}` also survives. The old GBA tests (zoom 1 vs 16) would not have caught 8 either, so this is not a regression; folding a GBA zoom in [4,8) check into the same fix is optional. |
| SR-F2 | minor | `WorldCanvas.tsx:999`, `GbcWorldCanvas.tsx:627` | Neighbours include the map's own rect. The spec says `others`, and B2's doc says "The caller excludes the map itself". It is semantically equivalent: a band lies strictly outside its rect, so `overlapArea` = 0. Equivalence probes M6a/M6b (excluding self) stay green. Accept and reword B2's doc ("may include"), or filter. Implementer's Deviation 4 discloses it. |
| SR-F3 | minor | `packages/ui/DESIGN.md:326` | "is the one component the single-map views mount too": false at B3. Only WorldCanvas and GbcWorldCanvas mount it; the map views are B4. Reword to future tense or drop until B4. |
| SR-F4 | minor | report "Mutations run"; `test/gbc/GbcWorldCanvas.test.tsx:1120` | The report says the GBC placeholder mutant is killed by "(F3 test)". Re-run shows the red test is "a GBA-shaped encounters payload … not retried in a loop"; F3 (:1044, untouched) stays green. F3 asserts the count only before its wheel, so zoom refetch of *successful* GBC maps is unpinned. That was already true at base, so not a B3 regression. The new GBC test's name says "flips it without a refetch" but it asserts no fetch count. Rename it or add `expect(calls)`. |
| SR-F5 | info | `GbcWorldCanvas.tsx:1015` `band={BORDER_BAND.gbc}` | M15 (`.gba`) survives: no GBC canvas test asserts strip geometry. The spec does not require it, and the band value is pinned via B2's const. |
| SR-F6 | info | `encounters/guards.ts` | M8 (guard accepts GBC shape) stays green in WorldCanvas.test: `summariseGba(undefined)` throws inside `.then`, so the reply is still counted as failed. The guard is pinned by `guards.test.ts` (2 red). Behaviour is right either way. |
| SR-F7 | info | `EncounterBorder.tsx:227` | M19 (dropping `enabled &&` from the tooltip render guard) survives. It is belt-and-braces beside the layout-effect clear, as its own comment says. |

## Requirement walk (✓ = verified in code/test)
- Props/exports ✓ (`tooltipLines(s, time?)` adds an optional 2nd arg; single-arg use matches the spec. Deviation 3 accepted: the spec's step-4 line needs time.)
- Toggle `Encounters` with `aria-pressed`, off by default, nothing renders when off ✓. Legend `role="note"`: one sprite/species, free side, count when zoomed out ✓. Dimmed + dashed and `+0-4` lines show only when `time` is given (GBC), Deviation 5, accepted.
- Strip `bandRect(rect, side, bandPx)` in screen px ✓ (all 4 sides pinned with exact px). `spritePx = min(32, band*zoom)` ✓ (M12 killed).
- Capacity: `k = max(1, floor(sideLen/spritePx))`, `k-1` + `+N` ✓; `k===1` → `+N` with full count ✓. M7a/b/c all killed.
- LOD `<` ✓ (M4 killed). Badge `"{map} · {n} species"`, all species, in the band rect ✓.
- Dimming rule `time!==undefined && availableAt!==undefined && !includes(time)` ✓ (M2 killed). CSS sets `opacity: 0.4` **and** `outline: 1px dashed var(--text-muted)` ✓. All 17 `var(--*)` tokens in the block are defined in `:root`.
- `tooltipLines` hand re-derivation of POLIWAG from the Route30 fixture: grass nite 20, 4-8, buff, rate 9.765625→`9.8%`; surf 75, 15-24+, 1.953125→`2%`; old rod 14.84375→`14.8%`, `Lv 10` (equal), bite 50; good day/nite 64.84375→`64.8%` `Lv 20`; super 79.6875→`79.7%` `Lv 40`; then the `+` note. These match the test exactly, and the row order follows METHOD_ORDER with input order kept. GBA `Land 37.5% Lv 2-4`, `Lv 3`, headbutt `Headbutt · rare 30% Lv 10` ✓. M3 (drop time), M16 (drop +) and M17 (integer pct) all killed.
- Tooltip mechanics ✓: top-level sibling (parent = root, test), hover and focus, `hideTooltip(key)` key-scoped (M14 killed), `useLayoutEffect` deps `[enabled, collapsed, zoom, entries, time]` (M13 killed), render guard `enabled && !collapsed && tooltip`. Both "Review fix" comments carried over, condensed.
- `pointer-events` ✓: none on root, strip, badge and tooltip; auto on control, sprite and `+N`.
- Sprite card ✓: `--bg-panel-raised`, 1px `--border`, radius 4, `image-rendering: pixelated`. Broken image is hidden ✓.
- GBA ✓: `fetchGuarded(url, isGbaEncountersPayload, url)`. The guard rejects `{family:"gbc",sources}`. Failures are counted, and the alert markup is identical to GBC's (`world-canvas__toolbar-group` > `span.world-canvas__toolbar-error[role=alert]`). One fetch per map, ever (M5a killed).
- Memo deps: `drawnPlacements` `[world, sizeByMap, revealedMaps, mapFilter]` (the old `visible` deps minus pan/zoom/viewport). `sideByMap` GBA `[drawnPlacements, sizeByMap]`, GBC `[world]`. No pan/zoom anywhere ✓. Sides are computed over the drawn set, not the culled one (M11 killed by the off-screen Blocker test). `ponytail:` O(n²) comment present in both canvases ✓.
- No `summaryByMap` memo (Deviation 2): summaries are built once per map on arrival into the cache entry, and `borderEntries` reads them on `encounterVersion`. Output is equivalent and avoids re-summarising. Accepted.
- GBC wiring ✓: `summariseGbc`, `lodZoom={GBC_LOD_ZOOM_THRESHOLD}`, `band={BORDER_BAND.gbc}`, `time`. `fetchGuarded`/`encounterFailedCount` unchanged (M9b killed).
- Deletions ✓: both gutters, both tests, `chipText`. Grep of `encounter-gutter`/`EncounterGutter`/`gutterEntries` in src/CSS/DESIGN finds only historical "former/old/since-deleted" comments and no selectors. DESIGN.md has the new section (see SR-F3). `styles.test.ts` passes.

## U1 old→new audit
- Old `it`s: GBA 16, GBC `chipText` 3 + component 15 = 34. All 34 have a row in the report (GBC's 3 ordered-label tests share one row).
- Claimed new homes were spot-checked against `EncounterBorder.test.tsx` and both canvas tests. All exist and pin what they claim, **except** the GBC "zoom 7 vs 8" row (SR-F1).
- "No longer applies" rows: method rows, rod rows as rows (rods pinned in POLIWAG tooltip lines), CAP 6 / `+N more`, `chipText` rounding, time filter (dimmed-still-renders is pinned) are all in the spec's allowed list. One extra, the "swarm vs non-swarm key collision" row, is justified: sprites are keyed by species, which `summarise` makes unique per map, and the swarm label is pinned by B1 `rowLabel`. Accepted.
- Canvas-test diff (`git diff e9457e0 6342808` on both files): GBC shows only additions plus the spec-named Geodude edit (2 lines out, sprite and img src in). GBA shows additions only plus the `makeFetchMock` `/api/encounters/` route. That route is **necessary**: the old fallthrough was the catch-all reject, which the new counted fetch would turn into a `role="alert"` in every test, colliding with the existing `findByRole("alert")` tests. It is **harmless**: it returns `methods: []`, which renders the same as the old silent failure (no border data, no method tint). No existing test reads encounter calls or responses, the new describe layers its own route ahead of it, and the full suite is green. Nothing else changed.

## Mutations
Method: a node script per mutant asserted each literal anchor matched exactly once, wrote the mutant, ran the narrowest file(s), restored from the bytes read at start and byte-compared them. All 28 IDs printed a result, there were no restore mismatches, and `git status` was identical before and after.

| ID | mutant | result | red test(s) |
|---|---|---|---|
| M1a | `SIDE_ORDER` right-first (borderSide.ts) | killed | GBA "puts the border on the side pickBorderSide gives…"; GBC "puts each map's border on the side…" |
| M1b | GBA wiring `side: "right"` | killed | GBA side test |
| M1c | GBC wiring `side: "right"` | killed | GBC side test |
| M2 | dim `includes` (available dimmed) | killed | 4 EncounterBorder (morn/nite dimming, Not-encountered, dimmed tooltip) + GBC "at time=morn a nite-only species renders dimmed…" |
| M3 | rowLine strips ` · morn/day/nite` | killed | POLIWAG; "time word stays"; dimmed tooltip |
| M4 | LOD `<=` | killed | "at lodZoom-1 a single badge…" |
| M5a | GBA `has()` placeholder check off | killed | GBA "fetches … once per visible map…"; "GBC-shaped payload … not retried" |
| M5b | GBC `has()` placeholder check off | killed | GBC "a GBA-shaped encounters payload … not retried in a loop" (not F3, see SR-F4) |
| M6a/b | neighbours **exclude** self (GBA/GBC) | survived, equivalent | (SR-F2) |
| M7a | `k+1` | killed | "left side … k 3: 2 sprites and '+3'"; "exactly k …" |
| M7b | `slice(0,k)` | killed | the same 2, plus "k is at least 1" |
| M7c | overflow `>=` | killed | "exactly k …"; "top/bottom use the width …" |
| M8 | GBA guard accepts missing `methods` (GBC shape) | killed | guards "rejects the GBC shape…", "rejects non-records…" (canvas stays green, SR-F6) |
| M9a | GBA failed count not incremented | killed | GBA "GBC-shaped payload…"; "non-OK … counted too" |
| M9b | GBC failed count not incremented | killed | GBC "GBA-shaped … not retried" |
| M10 | GBC `lodZoom={4}` | **survived** | **SR-F1** |
| M11 | GBA sideByMap over `visible` | killed | GBA side test (off-screen Blocker) |
| M12 | spritePx uncapped | killed | "sprites are spritePx square … capped at 32" |
| M13 | layout-effect deps drop `time` | killed | "a changed time clears an open tooltip" |
| M14 | hideTooltip clears any key | killed | "leaving a different sprite does not clear…" |
| M15 | GBC band = gba | survived | (SR-F5, not spec-required) |
| M16 | `+` buff dropped | killed | POLIWAG; time-word; dimmed tooltip |
| M17 | fmtPct integer | killed | 7 tooltip tests |
| M18 | GBA alert not rendered | killed | GBA "GBC-shaped payload…"; "non-OK…" |
| M19 | tooltip guard drops `enabled &&` | survived, equivalent | (SR-F7) |
| M20 | GBA `lodZoom={8}` | survived | (SR-F1 note) |
| M21 | GBA `lodZoom={1}` | killed | GBA side test |

Read-only check, "sideByMap depends on pan": it does not (deps listed above).
