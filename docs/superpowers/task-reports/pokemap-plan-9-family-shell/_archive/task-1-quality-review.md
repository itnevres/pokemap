### Strengths
- Step 3 port is sound after the ruling. No hard-coded GBC fit values. The oracle is the real canvas: rename refit is compared to the `fitPosition`/`fitZoom` captured after an explicit "Fit world". Membership refit is compared to a fresh explicit "Fit world" click. A pan precedes each structural change and is asserted `not.toEqual(fit)`, so kept-pan and refit differ. The test cannot pass if the refit is skipped (the `waitFor` would time out).
- Prototype `clientWidth`/`clientHeight` descriptors are restored in `finally`. Both the own-descriptor and the delete branch are handled, and there is a post-`finally` equality check. No leak.
- `waitFor` is used only for async effects (PATCH, refit). Synchronous reads are not wrapped in it. No timers and no sleeps, so no flake source.
- The GBC tests use the existing `mockFetch`, `openCity` and `paintOnce` helpers. The extra `onEditHere` button on the mocked `GbcWorldCanvas` is additive.
- Each characterisation names its source line and its intent ("FamilyApp must keep that"). The reported mutations fail with specific messages.
- The assertions use only DOM roles and names, with no shell internals. They survive the Task 5-8 render swap, except the "pencil" rename.
- The suites already unstub globals in a global `afterEach` (`App.test.tsx:110`, GBC files restore mocks), so a `vi.stubGlobal` failure does not leak.

### Issues
**Critical:** none.

**Important:** none.

**Minor**
1. `App.test.tsx` (re-click test, about lines 31-49) and the round-trip test: `confirmSpy.mockRestore()` and the trailing `vi.unstubAllGlobals()` are not in `finally`. `App.test.tsx`'s global `afterEach` only unstubs globals; it does not call `vi.restoreAllMocks`. A failing assertion therefore leaves the `window.confirm` spy active for later tests in that file. The existing tests in the file follow the same pattern, so this is consistent, but it is a leak-on-failure. Fix: add `restoreAllMocks()` to the `afterEach` at line 110, or use try/finally.
2. `App.test.tsx` dungeon test: the pan gesture (mouseDown, mouseMove, mouseUp) is pasted three times. The test is about 70 lines. Fix: a local `pan()` helper, and perhaps a `fitReadout()` helper that returns `[position, zoom]`.
3. `App.test.tsx` dungeon test: the selectors `.world-canvas__*` are canvas class names. They survive the shell swap only because the GBA canvas stays. If Task 8 touches those classes, update them in one place. A `const q = (s) => container.querySelector(s)` helper would give that single place.
4. `App.test.tsx` dungeon test: `waitFor(position() not.toEqual(panBeforeMembershipChange))` could be satisfied by any position change, such as a selection shift. The final comparison against the explicit "Fit world" tightens this and covers the gap. No change needed; noted only.
5. The `clientWidth`/`clientHeight` stub of 100 applies to every `HTMLElement`. It is acceptable and restored, but a short comment on why would help the next reader.

### Assessment
Task quality: Approved
