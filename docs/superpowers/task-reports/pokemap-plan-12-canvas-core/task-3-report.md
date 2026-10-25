# Task 3 report: stage hook (High)

Hop: Codex `gpt-6.1-sol` (thread `01a171e2-32a8-7780-9087-06b5f60ab5f0`), first try. Free Aider hops skipped: 4 files (delegate §2 >3-files rule); both free Opus-tier models also failed Task 2.
Files: new `canvas/useStage.ts`, `test/canvas/useStage.test.tsx`; `shared/useCanvasView.ts` now delegates (exports and signatures unchanged); `shared/MapCanvasViewport.tsx` gains optional pointer props and `onImgError`. Removed comment lines: one `eslint-disable` moved with its effect into `useStageAutoFit`.
Focused tests (canvas, map canvases, GBC view, context edit): 200 pass, no existing test changed.
Mutations (coordinator): release-ownership order RED; `onCancel` dropped RED; leave ignoring capture RED; auto-fit once-per-map guard RED; controlled double report RED. SURVIVED: `startPan` re-entry guard; spec reviewer ruled it defensive, not required (pointerdown never starts a pan).
Reviews (Codex astra): spec PASS; quality Approved with 2 minors, deferred to Task 4: (1) `useStage`'s own fit duplicates `useStageFit` → Task 4 keeps one fit entry when MapSurface adopts `useStage`; (2) the wheel-listener unmount test can pass on an earlier cleanup → tighten in Task 4.
Gate: 3,586 pass / 0 fail / 222 files; typecheck and UI build pass.
