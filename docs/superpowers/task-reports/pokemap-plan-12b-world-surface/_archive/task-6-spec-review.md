Needs rework.

Critical: None.

Important: [WorldSurface.tsx:421](</C:/Programming Projects/PokeMap/packages/ui/src/canvas/WorldSurface.tsx:421>) silently changes GBA’s filtered group-drag behavior. Select A and B, apply a filter containing only B, then Shift-drag B. GBA retains both selections and moves/posts both maps (`WorldCanvas.tsx:1503–1505`); the new `inScope` guard excludes A. The adapter preserves selection retention but cannot preserve group membership. Keep this difference adapter-owned and add that regression scenario.

Minor: [WorldSurface.tsx:733](</C:/Programming Projects/PokeMap/packages/ui/src/canvas/WorldSurface.tsx:733>) adds `aria-hidden="true"` to GBA’s existing marquee. Its original DOM (`WorldCanvas.tsx:1929`) lacks that attribute. During a marquee gesture this violates the explicit unchanged-ARIA constraint; no ruling authorizes changing GBA’s marquee attributes.

The remaining Task 6 behavior and Step 1 scenarios have corresponding implementation and tests: selection, capture/cancel, ledger ordering, deferred group settlement, drop, dungeon toggles, warp suppression/popup/errors/retry/scope, keyboard/context menu, jump/reveal, context rail, tooltip clamps, and hover. Save-error policies and the toolbar/toast/cursor carry-forwards are represented as adapter facts. No family branch, Task 7/8 migration, or existing-test edit was found.

Independently checked numeric expectations in `WorldSurfaceInteraction.test.tsx`:

- Line 270: zoom 5 makes a `(10,5)` pixel drag a `(2,1)` world delta: A `(12,11)`, B `(22,11)`, C `(32,21)`.
- Line 392: drop `(100,50)` becomes world `(30,20)`; subtracting half-size gives `(25,15)`.
- Line 438: half-unit warp points `(12,13)` and `(21,12)`, at zoom 12 and pan `(-128,-130)`, give `(16,26)` and `(124,14)`.
- Line 527: zoom 10 and pan `(-100,-100)` project `(12,13)` and `(1004,1005)` to `(20,30)` and `(9940,9950)`.
- Line 576: centre-pivot zoom 5→6 produces pan `(-80,-70)` and A’s rectangle `(-20,-10,60,60)`.
- Line 792: B-only fit has pan `(-150,-100)` and zoom 10; the centred drop is `(20,10)`.

Shelving `Far` preserves the endpoint test’s role. It excludes Far from the anchored fit while retaining its placement and exact warp endpoint; the added no-tile-request assertion verifies that it remains offscreen.

No files edited or tests/builds run. The 226/226 canvas passes and clean typecheck are conductor evidence; mutation and full-gate results were not independently verified.