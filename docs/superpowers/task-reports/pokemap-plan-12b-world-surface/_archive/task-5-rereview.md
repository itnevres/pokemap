Verdict: **PASS with one Minor caveat.** No new Critical or Important findings.

I couldn’t save `task-5-rereview.md` because this session permits only filesystem reads. Report content follows. References below use the scoped filenames.

1. **ADDRESSED.** `worldSurfaceAdapter.ts:47,62,79,83,91,108` carries `W` through the hook and callbacks. An extended world exposes typed `verticalLinks` without casts, subject to the status world’s null check. The fake adapter retains two type arguments (`WorldSurface.test.tsx:70`). Minor caveat: `WorldSurface.tsx:60,80` threads `W` but omits its requested default, so explicit two-argument component/props types require a third argument.

2. **ADDRESSED.** `WorldSurface.tsx:144` publishes `fitRef` and `maxZoomRef` in the same layout effect.

3. **ADDRESSED.** `WorldSurface.tsx:136–138,187` stamps successful fits and jumps. Failed fits update no state, so cannot self-loop. The guard at `:155` prevents subsequent world-object changes from refitting. Initial/filter effects precede the jump effect, preserving jump-wins ordering. The filter-clear regression is at `WorldSurface.test.tsx:324`.

4. **ADDRESSED.** `WorldSurface.tsx:246–249` resolves badge colours before the conflict loop.

5. **ADDRESSED.** `WorldSurface.tsx:344` memoises `hiddenCount` with the requested dependencies. At `:337`, inactive spotlight (`null`) produces no entries. An active empty result still produces dimming entries, correctly preserving existing behavior.

6. **ADDRESSED.** Comments restored at `WorldSurface.tsx:245,304,370`.

7. **ADDRESSED.** Lazy ledger initialization is at `WorldSurface.tsx:84`. Existing reveals retain identity at `:186`. Exported `EncounterEntry` is at `worldSurfaceAdapter.ts:40`. The projection test is accurately renamed at `WorldSurface.test.tsx:273`.

8. **ADDRESSED.** `WorldSurface.test.tsx:317–319` captures the log boundary, forces a wheel redraw, and checks the old image within newly recorded draws before replacement loads.

Deferrals remain reasonable. `GbcWorldCanvasContext.test.tsx:290,314` exercises the relevant caps once Task 7 routes through the surface. Task 6’s brief explicitly carries the toast, toolbar-order, dragging-class, and filtered-jump requirements at `:26–27`.

No tests, npm commands, or builds were run. The 40/40 result, clean typecheck, and two failing mutations are conductor-reported evidence.