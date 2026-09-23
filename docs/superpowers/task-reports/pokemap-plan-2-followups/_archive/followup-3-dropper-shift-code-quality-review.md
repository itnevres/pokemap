# Follow-up 3: dropper + shift wiring — code-quality review

Base: `f47ab5d` → Head: `07297f3` (1 commit). Spec compliance already independently verified (0 issues) — this pass covers code quality only.

### Strengths
- `dragStartRef` rename: doc comment (`MapCanvas.tsx:212-217`) explains dual use (rect corner / shift reference point) and *why* one ref suffices (neither tool paints progressively) — reads clearly to a fresh reader, all 3 downstream comments referencing the old name updated consistently (`MapCanvas.tsx:656`, `:698`, `:762-771`). Grep confirms zero stray `rectStartRef` in `src`.
- Dropper branch (`MapCanvas.tsx:680-690`) always returns (either at `!cell` or at the bottom) — placed before the generic paint-stroke branch, so no shadow risk with it, and it's correctly gated out of the pre-existing `onSelectEvent && !activeTool` branch by `activeTool` being truthy. `onMouseUp` exclusion (`MapCanvas.tsx:832`) mirrors it exactly, with a comment cross-referencing the reasoning.
- Self-found bug (spurious `endStroke()` on dropper click) is real, root-caused correctly (mirrors the existing `onMouseDown` exclusion rather than patching a symptom), independently confirmed by the spec reviewer via live network diffing.
- Shift branch parallels rect's own: same `applyPaint(...).catch(() => {})` → `pendingPaintRef` → `.then(() => endStroke())` sequencing, no divergence.
- Discriminated union widening (`shift`/`dropper` added, `MapCanvas.tsx:75-80`) — `npm run typecheck` clean per both reports; `activeTool.stamp` access inside the `rect` branch is unchanged pre-existing narrowing, not new risk.
- `onDropperPick={setCurrentStamp}` reuses the exact same `useState` setter `MetatilePalette.onSelect` uses (`App.tsx:567` vs `:515`) — same state, so the existing map-switch reset (`App.tsx:339`, `setCurrentStamp(null)` inside the map-select handler) covers a dropper-sourced stamp identically to a palette-sourced one. Dropper pick is fully synchronous (`onMouseDown` → `readBlock` → callback, no async gap), so there's no window for a map-A pick to land after a map-B switch. No leak risk.
- Test mock check: `editSession.beginStroke`/`applyPaint`/`endStroke` are shared `vi.fn()`s exercised elsewhere in the same file (e.g. the pencil test at `MapCanvas.test.tsx:583-584` asserts they **were** called) — proves the mocks are live plumbing, not dead stubs, so the dropper test's "never called" assertions (`:808-810`) are meaningful, not vacuously true.

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
- **No jsdom test for shift's zero-length-drag no-op path.** `MapCanvas.test.tsx:825-860` covers only a positive-direction and a negative-direction drag; neither tests mousedown+mouseup at the same cell. The spec's explicit requirement — "no new client-side special case, rely on the server's own diff-check" — was live-verified manually (implementer + reviewer both did it against the real dev server) but has zero automated coverage. A future refactor could add a client-side `if (dx===0 && dy===0) return` guard (defeating the "no special case" requirement, or silently changing behavior) and nothing in CI would catch it. Trivial to add: same shape as the existing two shift tests, mousedown/mouseup at identical coordinates, assert `applyPaint` called with `{tool:"shift", dx:0, dy:0}`.

#### Minor (Nice to Have)
- `endActiveStroke`'s `shift`/`rect` branches (`MapCanvas.tsx:778-796`) duplicate the same 4-line tail (capture+null `start`, `applyPaint(...).catch(() => {})`, assign `pendingPaintRef`, `.then(() => endStroke())`) with only the `applyPaint` payload differing. Not unclean enough to call unwieldy — still fully parallel and easy to scan — but could collapse to one shared tail keyed on a `payload` computed per-branch. Skip unless this branch grows a third drag-shaped tool.

### Recommendations
Add the one zero-length-drag jsdom test called out above before archiving this task's reports; everything else is ready as-is.

### Assessment
**Ready to merge?** With fixes (the one Important item is small and worth closing before archiving; nothing here blocks merging the feature itself).
**Reasoning:** No correctness or architecture problems found — the self-found bug fix, the rename, and the three-way branch are all clean and consistent with existing patterns. The single gap is test coverage for a behavior the spec explicitly called out (server-side no-op reliance) that only has manual/live verification, not a regression-proof automated test.
