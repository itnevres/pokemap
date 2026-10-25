Read-only review. No files changed; tests/builds were not run. The existing measurement script reports **167 aligned map lines** and **189 aligned world lines**.

## Critical

None identified.

## Important

### I1 — The shared paint-version policy has two incompatible existing oracles

**Claim:** Spec lines 87–89 assign paint-version debounce to MapSurface; P12-4h changes only when `&v=` appears.

**Evidence:** `packages/ui/src/components/MapCanvas.tsx:303–338` skips the first changed blocks reference after mount/map switch. `packages/ui/src/gbc/GbcMapCanvas.tsx:373–386` schedules a bump on the first same-map blocks change with a session. These differences are explicitly tested:

- `packages/ui/test/MapCanvas.test.tsx:427–441`: first change must remain unbumped after the debounce window.
- `packages/ui/test/gbc/GbcMapCanvasEdit.test.tsx:206–215`: first change must produce `&v=1`.

**Suggested fix:** Specify the shared reseed-versus-edit policy and identify the affected oracle explicitly. Also require pending-timer cancellation on map switch/unmount and monotonic version retention. P12-4h alone does not authorize changing which block updates count as paint bumps.

### I2 — Pointer capture lacks a termination contract when capture fails or is cancelled

**Claim:** P12-4a says capture is guarded and leave clears hover only.

**Evidence:** `packages/ui/src/components/WorldCanvas.tsx:1775–1800` deliberately pairs guarded capture with **commit-on-leave fallback**. Both map canvases close strokes on leave; GBA additionally abandons unfinished rect/shift operations at `MapCanvas.tsx:726–740`. Tests pin stroke closure at `packages/ui/test/MapCanvas.test.tsx:656–675`.

Removing that fallback while swallowing capture failure can leave a stroke open after release outside the canvas. Capture-call assertions do not prove termination.

**Suggested fix:** Define successful capture, failed capture, `pointercancel`, unexpected `lostpointercapture`, and unmount/map-switch outcomes. Require exactly-once stroke closure, no unintended rect/shift application on cancellation, and explicit event/map-drag commit policy. Add real-browser outside-release coverage; retain equivalent failure-path coverage when replacing leave tests.

### I3 — The hover adapter omits GBC’s independent 16-pixel hover resolution

**Claim:** The engine-facts table describes GBC hover as “metatile and four quadrant collisions”; the adapter exposes `hoverAt(cell)` without specifying that cell’s coordinate space.

**Evidence:** `packages/ui/src/gbc/GbcMapCanvas.tsx:511–518` computes hover from **16-pixel steps**, despite 32-pixel paint cells. Its status includes step coordinates, active-quadrant emphasis, border-substitution information and events (`:734–740`). `packages/ui/test/gbc/GbcMapCanvas.test.tsx:365–402` distinguishes quadrants and step-specific events.

Passing only the paint cell loses information needed to reproduce this behavior.

**Suggested fix:** Specify hover coordinates independently of paint coordinates—source position or event-step coordinates—and list the omitted readouts. Preserve GBA’s ID-change-driven hover callback and acknowledge GBC’s direct per-move callback behavior (`MapCanvas.tsx:354–360`; `GbcMapCanvas.tsx:518`) when choosing one shared notification policy.

### I4 — GBC time is an encounter-display input, not merely a render-URL parameter

**Claim:** The adapter description lists the URL builder, encounter-summary family key, border side and band, but omits time-dependent encounter presentation.

**Evidence:** `packages/ui/src/gbc/GbcMapCanvas.tsx:711` renders time-specific legend text; `:724` passes `time` to `EncounterBorder`. The world canvas also passes it at `packages/ui/src/gbc/GbcWorldCanvas.tsx:1300`. `packages/ui/test/gbc/GbcMapCanvas.test.tsx:613` requires a time switch to re-dim sprites without refetching.

**Suggested fix:** List time-dependent encounter presentation as an engine fact and adapter input. Require time changes to update dimming/legend without refetching encounter summaries or refitting the map. Otherwise a builder following the enumerated adapter can preserve tile colors while losing encounter behavior.

### I5 — World fit and jump policies remain different outside the approved initial-fit change

**Claim:** WorldSurface shares fit behavior, while only engine facts may remain family-specific.

**Evidence:**

- GBA manual Fit excludes singleton landmasses and treats filtered dungeons specially: `packages/ui/src/components/WorldCanvas.tsx:667–719`.
- GBC manual Fit includes all scoped placements: `packages/ui/src/gbc/GbcWorldCanvas.tsx:612–617`.
- GBC jump uses a 60% fit, explicitly contrasted with GBA’s 100% fit: `GbcWorldCanvas.tsx:161–164`.
- Existing tests pin GBA’s singleton exclusion (`packages/ui/test/WorldCanvas.test.tsx:537`) and GBC’s all-placement fit (`packages/ui/test/gbc/GbcWorldCanvas.test.tsx:1323–1342`).

P12-4e settles **initial load**, not these manual-fit and jump differences.

**Suggested fix:** Document the remaining policies and their intended common behavior before 12b. Include singleton-only fallback and empty-world readiness: literal “singleton components excluded” is insufficient where no qualifying cluster exists.

### I6 — “Clamped” cell lookup can authorize painting the wrong cell

**Claim:** Foundation and acceptance specify “clamped and raw” cell lookup.

**Evidence:** The current bounded lookup **rejects** outside cells; it does not clamp them to an edge:

- `packages/ui/src/components/MapCanvas.tsx:594–600`
- `packages/ui/src/gbc/GbcMapCanvas.tsx:529–532`

Conversely, rect/shift endpoints and event-drag releases intentionally use raw coordinates (`MapCanvas.tsx:729–770`; `GbcMapCanvas.tsx:632–658`).

**Suggested fix:** Name three distinct operations where needed: raw lookup, bounds-checked lookup returning null, and numerical clamping. Require outside pencil/bucket/dropper/sign clicks to perform no edit, while preserving raw rect/shift endpoints and event-release semantics. A conventional clamp implementation could satisfy the present wording and paint an edge cell incorrectly.

### I7 — The raster contract omits dependency stability and cached-image readiness

**Claim:** Adapters are built per render, supply raster-layer lists, and `useRasterComposite` increments `compositeVersion`; acceptance requires recomposition “on input change.”

**Evidence:** Current effects depend on actual raster inputs, excluding DOM-only encounter state (`packages/ui/src/gbc/GbcMapCanvas.tsx:464–472`). Tests expressly prohibit recomposition when Encounters toggles with Grid enabled (`packages/ui/test/MapCanvas.test.tsx:1089–1098`).

Depending on a freshly allocated layer array or drawer closure would recompose on unrelated renders—and can loop when recomposition itself increments state. Separately, GBC checks `complete && naturalWidth > 0` before relying on load events (`GbcMapCanvas.tsx:407–413`); cached mount/reentry is tested under StrictMode (`packages/ui/test/gbc/GbcMapCanvasView.test.tsx:199–232`).

**Suggested fix:** Define semantic raster invalidation independently of adapter identity. Require no recomposition for pan, hover, encounter-only changes or unchanged parent rerenders. Explicitly preserve cached-image readiness, failed-image rejection and early-load ordering alongside stale-URL protection.

### I8 — Shared zoom math needs an explicit rounding contract

**Claim:** One `zoomAboutPivot` supports stepped and continuous policies, without specifying pan rounding.

**Evidence:** Map zoom deliberately rounds pan to integer stage pixels (`packages/ui/src/components/mapView.ts:24–28`). GBC continuous world zoom preserves fractional pan (`packages/ui/src/gbc/GbcWorldCanvas.tsx:198–209`); GBA does likewise at `packages/ui/src/components/WorldCanvas.tsx:1450–1453`.

A shared implementation that copies either policy universally changes the other surface. A generic “screen/source round trip” test does not catch this distinction.

**Suggested fix:** Specify rounding per surface and preserve no-op object identity. Pin fractional pivots, exact controlled-view callback counts under StrictMode, initial map zoom 1, and continuous world pan precision.

## Minor

### M1 — The GBA world-data hook description is factually wrong

**Claim:** Engine-facts table line 72 describes GBA world data as “`useWorld` family hooks.”

**Evidence:** `packages/ui/src/components/WorldCanvas.tsx:509–567` owns fetch/reconciliation inline. GBC actually calls `useGbcWorld` at `packages/ui/src/gbc/GbcWorldCanvas.tsx:480`.

**Suggested fix:** Describe the current inline GBA lifecycle accurately. Identify extracting it behind the adapter as new work, including preserving snapshot capture before React state updaters (`WorldCanvas.tsx:535–539`).

### M2 — 12a’s unchanged-test exception list contradicts its pointer ruling

**Claim:** Acceptance 12a.2 permits changes only under P12-4b/f/g/h.

**Evidence:** P12-4a explicitly changes end-on-leave behavior, which existing map tests assert (`packages/ui/test/MapCanvas.test.tsx:656–675`; `packages/ui/test/gbc/GbcMapCanvasEdit.test.tsx:123`). P12-4k also permits named presentation changes.

**Suggested fix:** Include P12-4a/k in the exception list, with replacement assertions preserving lifecycle guarantees rather than simply deleting failing expectations.

### M3 — The ≤30-line target is plausible, but its measurement procedure is incomplete

**Claim:** Measure “wrapper plus adapter per family,” allowing adapters in separate modules.

**Evidence:** `docs/superpowers/task-reports/pokemap-plan-11-canvas-leaf/measure.py:9–12` accepts exactly two files and counts only matching runs of at least three normalized lines. It neither aggregates wrapper-plus-adapter inputs nor detects renamed/reordered duplication.

**Suggested fix:** Define deterministic aggregation of all family-owned wrapper/adapter files and preserve source attribution. Require independent inspection of excluded or fragmented runs. The target is plausible after moving orchestration, but the current procedure can pass merely by splitting files.

### M4 — Re-export deletion is not tied to all remaining consumers

**Claim:** Re-exports may disappear by the end of 12b.

**Evidence:** Consumers extend beyond the four canvas wrappers: `packages/ui/src/world/contextView.ts:1`, `packages/ui/src/shared/useWorldContext.ts:3`, `packages/ui/src/shared/CanvasZoomBar.tsx:1`, and direct test imports such as `packages/ui/test/MapCanvas.test.tsx:5`.

**Suggested fix:** Require a complete source-and-test import inventory before deletion, preserving exported helper/type contracts. Migrating both surfaces alone does not establish that compatibility modules are unused.

**Verdict: Needs rework**