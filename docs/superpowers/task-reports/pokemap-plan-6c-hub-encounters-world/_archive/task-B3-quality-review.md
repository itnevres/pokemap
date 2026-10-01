# Task B3 quality review

**Verdict: APPROVED** (0 Important, 6 Minor, 4 Nit). Scope `git diff e9457e0 6342808 -- packages/`. Read-only; no tests/mutations run (read via `git show`). Line numbers are blob lines at 6342808.

## Checked, clean
| rule | result |
|---|---|
| setter-in-updater | none; `hideTooltip` updater is pure, `setEncounterVersion`/`setEncounterFailedCount` sequential |
| fetch discipline | GBA now `fetchGuarded`+`isGbaEncountersPayload`+counted `role="alert"`+`.catch`; server 200s `methods: []` for no-encounter maps (index.ts ~446), so no false alerts in normal use |
| memo deps | `drawnPlacements` `[world,sizeByMap,revealedMaps,mapFilter]`; GBA `sideByMap` `[drawnPlacements,sizeByMap]`; GBC `[world]`; no pan/zoom, O(n^2) off pan path; `ponytail:` comments present. `borderEntries` deps match reads (`encounterVersion` for the ref) |
| stale refs/closures | none; `showTooltip` reads rects at event time |
| keys | strip `entry.map` unique (Map-keyed), sprite `s.species` unique per strip (`summarise` Map), tooltip hover key `map:species` |
| CSS | all tokens exist in `:root`; no `.btn`; `image-rendering: pixelated`; `pointer-events` layering root none / control,sprite,more auto; dimmed = opacity + dashed outline; focus-visible rule beats dimmed outline on specificity; no `*/` in comments |
| dead code | grep `encounter-gutter`/`chipText`/`EncounterGutterRow`: only comment hits (QR-3/4); no dead CSS (every `encounter-border__*` class is used) |
| tests | exact values, can-fail, no jest-dom; sprite/ tooltip/ dimming/ LOD/ capacity/ geometry all pinned exactly |
| `makeFetchMock` edit | harmless: adds only an `/api/encounters/` route (`methods: []`), same precedent as `/api/coverage`; justified (else every test gets a stray `role="alert"`) |

## Findings
| id | sev | where | issue / failure scenario | fix |
|---|---|---|---|---|
| QR-1 | Minor | `EncounterBorder.tsx:215` | `+N` chip is a non-focusable `<span>` with no tooltip and no name beyond "+3". GBA zoom 4: band 16 px, 80 px side -> k=5, a 13-species map shows 4 sprites, 9 species unreachable by hover, focus or AT. (Spec'd, deviation 7, but a real info gap.) | `aria-label`/`title` "N more species" at least; ideally make it a button whose tooltip lists the hidden names |
| QR-2 | Minor | `EncounterBorder.tsx:184` | `tooltipLines(s, time)` plus 4 closures built for every sprite on every render; `entries` changes each pan frame, so ~300 tooltip arrays/frame at 50 maps x 6 sprites, only one ever shown | pass `s` to `showTooltip`/handlers and call `tooltipLines` there |
| QR-3 | Minor | `DESIGN.md:326` | Claims EncounterBorder "is the one component the single-map views mount too"; grep shows only the two world canvases mount it | drop the clause (or reword as B4 future) |
| QR-4 | Minor | `GbcWorldCanvas.tsx:649` | Comment says "its own encounterEntries memo": the GBA memo was renamed `borderEntries` in this change; src comment missed by the retarget pass | `borderEntries` |
| QR-5 | Minor | `WorldCanvas.test.tsx:2162,2172` | Negative assertions ("not refetched on zoom", "no second failure") sit behind a real `setTimeout(r, 20)` and never assert the wheel actually changed anything; vacuous pass if the wheel is a no-op or the machine is slow (opposite of the 46bfed0 flake class: cannot false-fail, can false-pass) | after the wheel assert positive evidence (e.g. the Target badge rect/zoom changed, or badge -> strip) via `waitFor`, then assert `calls`; or `await act(async () => {})` instead of a timer |
| QR-6 | Minor | `EncounterBorder.test.tsx` (tooltip block) | Tooltip anchor math in `showTooltip` (`spriteRect.left - containerRect.left + w/2`) is never asserted (jsdom rects are 0): dropping the container-offset subtraction passes all tests | stub `getBoundingClientRect` on the sprite and root, assert `style.left/top` |
| QR-7 | Nit | `styles.css:1230` | Dimmed sprite's `opacity: 0.4` also fades its own focus ring (outline 2 px `--focus-ring` inherits opacity) -> weak keyboard-focus indicator on exactly the dimmed sprites | `.sprite--dimmed:focus-visible { opacity: 1 }` or dim only the `img` |
| QR-8 | Nit | `EncounterBorder.tsx:228,191` | `role="tooltip"` is not tied to the trigger (no `aria-describedby`), and "dimmed / not encountered at <time>" is not in the sprite's accessible name; SR users get the species name only | `aria-describedby` on the focused sprite, or add the "not at <time>" text to `aria-label` when dimmed |
| QR-9 | Nit | `EncounterBorder.tsx:5,55` / `gbc/time.ts:6` | Local `type TimeOfDay` duplicates `GbcTimeOfDay` (which `summary.ts` already imports), while the new `time.ts` comment claims EncounterBorder uses "the identical type"; `time !== undefined &&` at :55 is redundant with `isDimmed` | import `GbcTimeOfDay`; drop the redundant guard |
| QR-10 | Nit | stale pointers | `WorldCanvas.tsx:780` "Culling:" paragraph + dungeon-mode "culled against ITS OWN viewport" now sit above `drawnPlacements`, which does not cull; `CollisionPalette.test.tsx:33`, `MetatilePalette.test.tsx:37` point at the deleted `EncounterGutter.test.tsx`; `GbcWorldCanvas.test.tsx:1084` says `gutterEntries` (U1-exempt) | move/retarget in a later comment sweep |

## Not an issue / considered
- Tooltip not clamped to the viewport (right/top edge clip): same posture as the old gutter, not a regression.
- Tooltip clears on every `entries` change incl. unrelated map fetch arrival: carried-over behaviour, pinned by test.
- Duplicate failure-alert JSX in the two canvases: mirrors existing GBC markup, 5 lines, not worth a component.
- No browser check (implementer concern 11): CSS read carefully; badge overflow geometry on top/bottom sides at low zoom (pill taller than a 4-8 px band centres across it and overlaps the map) is spec-accepted.
