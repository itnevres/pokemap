All nine findings are **resolved in the revised design/plan**.

References: [Spec](</C:/Programming Projects/PokeMap/docs/superpowers/specs/2026-10-24-pokemap-plan-12-shared-canvas-core-design.md>) (S), [Plan](</C:/Programming Projects/PokeMap/docs/superpowers/plans/2026-10-24-pokemap-plan-12a-canvas-foundation-map-surface.md>) (P). Code paths below are relative to `packages/ui/`.

| Finding | Status | Evidence |
|---|---|---|
| PR-I1 | Resolved | S:35,118 and P:116,122 explicitly change `"0"` to absent `v`, retaining the delayed no-bump assertion in `test/MapCanvas.test.tsx:427–441`. GBC’s first-change oracle remains unchanged (`test/gbc/GbcMapCanvasEdit.test.tsx:206–215`). |
| PR-I2 | Resolved | S:20 and P:76–82 retain mouse-driven gestures and add capture/cancellation pointer props plus a duplicate-start test. This accommodates the mouse-only viewport (`src/shared/MapCanvasViewport.tsx:11–14,29–32`) and existing mouse-event tests. |
| PR-I3 | Resolved | S:98,119–120 and P:92–96,108,118–120 require registration, cleanup, real-wrapper settlement tests and registration mutations. These preserve `src/components/MapCanvas.tsx:258–261` and `src/gbc/GbcMapCanvas.tsx:311–314`; existing registry tests alone use synthetic chains (`test/shared/useStrokeChainRegistry.test.tsx:17`). |
| PR-I4 | Resolved | P:54–56 assigns fit fixtures and band mutation; P:108 requires pan → time switch → image load → unchanged view. These cover `src/shared/useCanvasView.ts:73–81,101`, beyond the dimming-only test at `test/gbc/GbcMapCanvas.test.tsx:613`. |
| PR-I5 | Resolved | S:93 and P:65–68 explicitly invalidate on ordered keys/membership, test post-mount reorder/replacement, and mutate key-order comparison. This preserves ordering embodied by `src/gbc/GbcMapCanvas.tsx:446–461`, while retaining encounter non-invalidation (`test/MapCanvas.test.tsx:1089–1098`). |
| PR-I6 | Resolved | S:122 and P:139,145 make interception mandatory before page load and require no matching hub requests. The routes match actual writes: `src/components/SaveDialog.tsx:104`, `src/components/WorldCanvas.tsx:582,1473`, and `src/gbc/GbcWorldCanvas.tsx:974,994`. |
| PR-M1 | Resolved | S:117 and P:36,54 now specify bounded lookup returning `null`, matching `src/components/MapCanvas.tsx:594–600`. |
| PR-M2 | Resolved | P:117–118 explicitly names the GBA props `Pick`, `canvasProps`, context spread and both banner tests. Verified against `src/components/MapEditingWorkspace.tsx:19–22,79–93` and `src/gba/adapter.tsx:99`. |
| PR-M3 | Resolved | P:135 now uses recursive `rg` over `packages/ui/src/canvas`, inspects matches, and requires semantic review for indirect branching. |

**New Critical/Important issues:** None identified.

Read-only review; no files changed or tests/builds run.

Spec: Approved  
Plan: Approved