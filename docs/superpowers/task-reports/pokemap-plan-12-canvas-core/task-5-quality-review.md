# Task 5 quality review (Codex gpt-6-astra, read-only)

No Critical or Important findings.

- **Minor — `packages/ui/src/gbc/GbcMapCanvas.tsx:59`: historical comments obscure the wrapper and describe removed implementation.** Lines 59–180 reference nonexistent locals, obsolete line numbers, and orphaned ESLint suppressions. Keep a short delegation note here. Move GBC geometry, time URL, first-block-change policy, and overlay-independent hover rationale beside their adapter fields. Keep lifecycle/selection/encounter rationale beside the corresponding `MapSurface` logic; raster/cache/viewport rationale belongs in `useRasterComposite`, and view/fit/wheel rationale in the stage/view hooks. Cut duplicate explanations already present there; preserve unique postmortem details.

- **Minor — `packages/ui/src/gbc/mapSurface.tsx:179`: transplanted comments misdescribe the adapter.** The geometry comments describe coordinate-conversion functions, including calling `clientToStep`, which the runtime path no longer uses. Lines 194–200 discuss an absent `anyOverlay` local and retain an ineffective ESLint suppression. Replace these with the actual geometry and explicit raster-dependency contracts. Keep `clientToStep` as a compatibility export, but document that role.

- **Minor — `packages/ui/test/gbc/GbcMapSurface.test.tsx:100`: settlement coverage does not prove waiting for end completion.** `endStroke` resolves immediately, so the test would pass if the chain invoked it without awaiting its promise. Use a separately deferred end: resolve apply, flush, assert end was called while settlement remains pending, then resolve end and assert settlement completes. The current test does adequately guard the Task 5 deferred-apply registration requirement.

The memoized merge correctly preserves live blocks/events and remains stable when only session-wrapper identity changes. Raster dependencies cover changing captured inputs; origins are constants. Fresh closures alone do not trigger recomposition. Hover/status builders are pure, generics remain concrete without `any`, and public re-exports are preserved. The pan/time test checks both retained view and fit-call count; the bounded microtask flush makes premature registry settlement observable.

Static review only; no files changed and no tests, builds, or mutations run.

Quality: Approved