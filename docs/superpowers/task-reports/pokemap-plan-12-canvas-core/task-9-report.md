# Task 9 report: final review and handoff docs (High, review only)

Review: whole branch `d3bf280..HEAD -- packages`. Codex `gpt-6-astra` unavailable (usage limit until 4:32 PM PDT) → Claude Opus subagent (fallback logged). Brief `task-9-review-brief.md`, report `task-9-final-review.md`: Changes requested, 1 Important, 4 Minor.

## Dispositions

- **I1 (rect/shift/event drag released outside applies nothing in Chromium): refuted live, test added.** The reviewer predicted Chromium sends `mouseleave` between `pointerup` and `mouseup`. Measured on the real app with capture-phase listeners on the stage canvas (`task-8-shots/outside.mjs`, results `gba-outside.json`, `gbc-outside.json`), both families, Map view at 4×: the order is `pointerdown mousedown pointerup mouseup lostpointercapture mouseleave`. The mouseup ends the gesture before the leave. Rect released 30 px above the canvas: 1 apply with the raw outside end (GBA `(35,15)-(35,9)`, GBC `(15,4)-(15,1)`), 1 end. Event drag released outside: 1 `event/move`. No code change. New test `MapSurface.test.tsx` "a release outside in Chromium's event order applies rect once and moves the event once" pins the measured order (rect: one raw-end apply, one end; event: one move). Mutation: `onMouseUp` returns early without capture (the I1 failure shape) → RED (`expected [] to deeply equal [[{ tool: 'rect', … }]]`); source restored byte for byte.
- **M1 (dangling comment references outside the diff): fixed**, comment only: `gbc/GbcWorldCanvas.tsx:43` (now cites the shared `canvas/` foundation), `hooks/useMapEditing.ts:18`, `:44-45`, `:90` (`gba/mapSurface.tsx`'s `map` local; `shared/useStrokeChain.ts` catches paint calls), `hooks/useEditSession.ts:108`, `:188` (`gba/mapSurface.tsx`'s `blocks`), `components/CollisionPalette.tsx:20` (`shared/OverlayToggleGroup.tsx`). References to `MapCanvas` the component and to `MapCanvasProps` (still in `components/MapCanvas.tsx`) are correct and left alone.
- **M2 (GBA skip consumed differently when `blocks` changes in the switch render): recorded** in the spec's review record under P12-8, with the Task 6 note (no bump without a session). No code change.
- **M3 (P12-4g guard defends only a retained handler): deferred**, not a regression (same as the GBC base, the ruled target). Optional hardening (`complete && naturalWidth > 0`) is a Plan 12b candidate.
- **M4 (`useStage`'s `captured` state re-renders twice per click, no production reader): deferred** to Plan 12b, which decides whether WorldSurface renders from it.
- Task 7 items, ruled by the reviewer: `shared/useCanvasView.ts` stays until 12b (spec keeps the re-exports); 12b's first task deletes it and repoints `test/canvas/useStage.test.tsx:5`. `canvas/MapSurface.tsx`'s imports from `components/` move under `canvas/` or `shared/` in 12b.

Re-review (Claude Opus subagent, `task-9-rereview.md`): Approved. One optional comment nit left for 12b (`gbc/GbcWorldCanvas.tsx:93-137` still describes the deleted GBC map canvas's stepped zoom history).

## Gate

Full gate: 3,634 pass / 0 fail / 226 files (+1, the new Chromium-order test); typecheck and UI build pass.
