Reviewer: Nemotron 3 Ultra via `ask.py` (free tier first, user 2026-10-27; Codex at its usage limit, Opus fallback not needed). Inputs: brief, `git diff ec63e49..9e29a87 -- packages docs/superpowers/plans`, both Task 8 reviews, `task-8-report.md`, the spec, `WorldCanvas.test.tsx`, `canvas/worldView.test.ts`. A first run replied with a status line only and was re-run asking for evidence per check.

Conductor 12 check: the derivations in checks 2 and 3 were re-read against the brief's numbers (filter fit 30x10 at 10/3; Frame fit z1 pan0, badge (0,10); GbcApp fit 100/7 = 45%, jump z20 = 63%; 668/18 x 0.6 = 22.267) and agree. The mutation A/B results are conductor 11's runs (`task-8-report.md`). The reviewer's note on "60%" in plan Task 5 steps is the historical step text; the amendment note sits beside it (conductor 11). No open findings.

Verdict: **Approved**.

## Reviewer report (verbatim)

# Task 8 Re-review Report

## Check 1: Each finding fixed as claimed

**Evidence from diff and reports:**

- **I1 (vacuous tests)**: Fixed. `WorldCanvas.test.tsx:1849` mapFilter test: `fourMapsWorld({ x: 10, y: 0 })` moves OutsideDungeon to (10,0), inside the filter fit's view ([0,30)×[-10,20)) but outside the filter. `WorldCanvas.test.tsx:2587` badge test: adds Frame at (90,90,10,10) making all-placement fit 100x100 at z1/pan0, badge at (0,10) off both bodies. Mutations confirmed: dropping `inScope` from `drawn` → 1 red (mapFilter test); dropping `badge?.map` → 1 red (badge test); both green on pre-fix file (vacuity confirmed). *task-8-report.md: "Mutations, each red after the fix and green on the pre-fix WorldCanvas.test.tsx (vacuity confirmed)"*

- **M1 (stale derivations)**: Fixed. `WorldCanvas.test.tsx:497-511` drag pan comment rewritten for z10/pan0; `WorldCanvas.test.tsx:522-531` wheel pivot comment rewritten for z10→12. Derivations correct (pan delta screen-px invariant; pivot pan = 50 - 5*12 = -10).

- **M2 (stale comment)**: Fixed. `AppWorldContextMenu.test.tsx:93` old "Fresh World view… zoom 1, pan 0" comment deleted.

- **M3 (missing P12-4c citation)**: Fixed. `WorldCanvas.test.tsx:2662` comment now reads "// P12-4c: Ctrl+double-click is suppressed and a plain one opens Map view (no Edit here without onEditHere). // P12-4e fixture fits at z1/pan0..."

- **M4 (missing 0.6 scale-before-clamp)**: Fixed. `canvas/worldView.test.ts:163-165` added explicit fraction 0.6 assertion with derivation: `37.111*0.6 = 22.267` vs clamp-first `32*0.6 = 19.2`. Test retitled.

- **M5/Q1 ("60%" text)**: Fixed. `WorldSurface.tsx:202` "the 60% fit waits" → "the jump fit waits". Plan status notes amendment.

- **M6/Q4 (GbcApp hit-order reliance)**: Fixed. `GbcApp.test.tsx:757-798` Port moved to x11 (was x9), viewport 300x200. Derivation: initial fit 21x10 → zoom 100/7 (45%), Port screen [157,300); jump z20 (63%), Port [50,250), City's jump leaves Port at [270,470) clickable. No overlap.

- **M7 (NO_LEVELS)**: Fixed. `gba/worldSurface.tsx:162-164` stable `const NO_LEVELS: never[] = []` used in `useGbaSurfaceCoverage`.

- **M8 (isWarpsPayload comment)**: Fixed. `gba/worldSurface.tsx:152` "GBA does not validate the optional `mapName`, as before".

- **M10/Q5 (evidence bookkeeping)**: Fixed. Notes/report duplicate rows and "B 255,50" corrected per conductor.

- **Q2 (worldColours.ts JSDoc)**: Fixed. Header rewritten, `levelColorMap` JSDoc moved above function, trimmed of obsolete references.

- **Q3 (compat re-exports)**: Kept with note. `WorldCanvas.tsx:7` "// Compat re-exports (plan Task 8); Task 9's re-export inventory deletes any without a consumer."

- **M9 (toggle-before-load no-op)**: Left as-is. Surface behaviour from Task 6, unreachable in practice, reads as fix. Sound.

**Verdict**: All findings addressed correctly.

---

## Check 2: I1 rebased tests discriminate; sweep for other vacuous tests

### (a) mapFilter test — hand derivation
**Fixture**: `fourMapsWorld({ x: 10, y: 0 })` → InDungeon1 (0,0,10,10), InDungeon2 (20,0,10,10), OutsideDungeon (10,0,10,10), Far (500,500,10,10). Filter = {InDungeon1, InDungeon2}. Viewport 100x100.

**Filter fit bounds**: union of InDungeon1+2 = x[0,30) y[0,10) → 30×10.  
**Zoom** = min(100/30, 100/10) = 10/3 ≈ 3.33.  
**Pan**: center viewport (50,50) → world center (15,5). pan.x = 50 - 15×10/3 = 0; pan.y = 50 - 5×10/3 = 100/3 ≈ 33.33.  
**View shows world**: screen [0,100)×[0,100) → world x = screen.x / (10/3) ∈ [0,30); world y = (screen.y - 100/3)×0.3 ∈ [-10, 20).  
**OutsideDungeon** at (10,0,10,10) → world [10,20)×[0,10) ⊂ view, ∉ filter → **unfetched only by mapFilter**. At old (0,20) it would be at y∈[20,30) outside view (culled anyway). **Discriminates.**

### (b) Badge test — hand derivation
**Fixture**: Tiny (0,0,10,10), Frame (90,90,10,10). Viewport 100x100.  
**All-placement bounds**: [0,100)×[0,100) → 100×100.  
**Zoom** = min(100/100, 100/100) = 1. **Pan** = (0,0).  
**Tiny screen rect**: [0,10)×[0,10). **Badge center** = (right - BADGE_SIZE, top + BADGE_SIZE) = (10-10, 0+10) = (0,10).  
(0,10) ∉ Tiny ([0,10)×[0,10) half-open), ∉ Frame ([90,100)×[90,100)). Right-click at (0,10) hits badge not body → **targets Tiny via badge?.map**. **Discriminates.**

### Sweep for other unchanged GBA tests
Spec review and conductor sweep checked all "zoom 1 / pan 0 / default view / offscreen / culled" premises:
- `WorldCanvas.test.tsx:500` drag pan — **zoom-invariant** (pan delta in screen px). Comment rewritten.
- `WorldCanvas.test.tsx:529` wheel pivot — **zoom-invariant** (pivot at origin, pan=0 → newPan = -10 at any zoom). Comment rewritten.
- Warp-marker tests (`:1709-1802`), badge-key test (`:1054`), encounter-border tests (`:2310-2324`) — **use P12-4e anchors** making fit z1/pan0; assertions pin 1.2ⁿ zoom from 1 and would fail otherwise.
- No other tests assume default view without anchors or zoom-invariance.

**Mutations A/B** (above) each red only the two fixed tests — confirms no other vacuous tests.

**Verdict**: Sweep complete; no missed vacuous tests.

---

## Check 3: Every new/changed literal has correct adjacent derivation

### (a) `GbcApp.test.tsx` "entering World centres on the selection" — hand derivation
**Fixture**: OlivineCity (0,0,10,10), OlivinePort (11,0,10,10). Viewport 300×200. Native 32 px/block.  
**Initial fit** (all placements): bounds 21×10. zoom = min(300/21, 200/10) = 100/7 ≈ 14.286. Readout = round((100/7)/32×100) = round(44.64) = **45%**. Pan: center (150,100) → world (10.5,5). pan.x = 150 - 10.5×100/7 = 0; pan.y = 100 - 5×100/7 = 200/7. Port screen x = 11×100/7 ≈ 157 → **[157, 300)**.  
**Jump** (Port 10×10): zoom = min(300/10, 200/10) = 20. Readout = round(20/32×100) = **63%**. Port centered: pan.x = 150 - 16×20 = -170 → Port screen [50, 250). City jump: pan.x = 150 - 5×20 = 50 → City [50, 250), Port [270, 470) → Port left edge 270 clickable.  
**Click points**: tree-click City → wait 63% → click Port at (285,100) ∈ [270,470); world-click Port at (230,100) ∈ [157,300); re-jump click center (150,100) ∈ [50,250). All match diff `fireEvent.click` coordinates.

### (b) `canvas/worldView.test.ts` 0.6 assertion — hand derivation
**Fixture**: 20×18 at (10,20) in 1000×668. GBC bounds {min:1/64, max:32}.  
**Raw zoom** = min(1000/20, 668/18) = min(50, 37.111…) = 37.111….  
**Fraction 0.6, scale-before-clamp**: 37.111… × 0.6 = 22.267. Clamp-first would give 32 × 0.6 = 19.2.  
**Assertion**: `expect(jumpFit(..., 0.6).zoom).toBeCloseTo((668/18)*0.6, 6)` → (668/18)=37.111… × 0.6 = 22.267. **Correct.**

### (c) Rewritten comments in `WorldCanvas.test.tsx` — verified in Check 1
All derivations adjacent to changed literals (drag pan, wheel pivot, Fit world, drag-place, plain-drag, leave-canvas-drag, conflict badges, multi-select, jump, population filter, warp toggle, mapFilter, connection lines, encounter border, lens, onSelectMap, context menu) match hand-computed fits under P12-4e. No derivation errors found.

**Verdict**: All derivations correct.

---

## Check 4: No assertion deleted/loosened; no src behaviour change beyond allowed

- **Assertions**: `expect(` line count balanced in all changed test files except `WorldCanvas.test.tsx` (+2 for P12-4c Map-view assertions — *task-8-report.md*). No `expect` removed; matchers unchanged or tightened (e.g., `AppWorldContextMenu` `toBeTruthy` → exact `"63%"`).
- **Source behaviour**:
  - `WorldCanvas.tsx`: Only added compat re-exports with Task 9 note. No logic change.
  - `WorldSurface.tsx:202`: Comment only ("60% fit" → "jump fit").
  - `worldColours.ts`: Comments restructured; `drawTriangle` export note removed (now private to GBA); `levelColorMap` JSDoc moved. **Zero code changes** to `drawDiamond`, `lerpColor`, `themedLevelColorMap`, `levelColorMap`.
  - `gba/worldSurface.tsx`: `NO_LEVELS` constant (stable `never[]`) replaces inline `[]` — **performance only**, same semantics. `isWarpsPayload` comment fixed. No logic change.
  - `canvas/worldView.ts`: `JUMP_FILL_FRACTION = 1` (amended P12-4m) — already in spec, not a new change.

**Verdict**: No assertion deleted/loosened; no behavioural src changes beyond comments, `NO_LEVELS`, and comment move.

---

## Check 5: CRLF throughout, no line > 140 chars

- Quality review: "All touched files are CRLF throughout, no added line is over 140 characters" (*task-8-quality-review.md*). Conductor fix round edited same files. No evidence of regression.

**Verdict**: Style compliant.

---

## Verdict: **Approved**

All five checks pass. The fix round correctly resolves every finding from both reviews, the two previously vacuous tests now discriminate with hand-verified fixtures, all new/changed literals have correct derivations, no assertions were weakened, and style constraints hold.

---

## Findings

### Critical
None.

### Important
None.

### Minor
None.

All Minor findings from the two reviews have been fixed in this round. The `NO_LEVELS` constant uses `never[]` which is a valid subtype for the expected `readonly { mapName?: string | null; averageLevel: number }[]` — no type risk. The plan document retains "60%" in two step checkboxes (Task 5 Step 1, Step 3) but these are documentation, not code; the code comments and spec are updated.
