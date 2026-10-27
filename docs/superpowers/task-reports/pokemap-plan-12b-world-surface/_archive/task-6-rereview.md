**PASS — scoped fix-round-2 review.** No new Critical or Important findings found.

1. **ADDRESSED.** `WorldSurface.tsx:422` gathers group members without `inScope`. Hit-testing still uses `drawn` at line 416, filtered by scope at line 226. The GBC pruning policy exists at lines 192–195, matching `GbcWorldCanvas.tsx:510`: excluded selections clear; included selections remain. Regression: `WorldSurfaceInteraction.test.tsx:307` checks hidden A and visible B both move and POST, followed by one reload.

2. **ADDRESSED.** `WorldSurface.tsx:731` renders the marquee without `aria-hidden`. The regression assertion is at `WorldSurfaceInteraction.test.tsx:261`.

3. **ADDRESSED.** `useWorldDrag.ts:276` publishes `cancelRef` in a layout effect. Unmount cleanup remains at line 279. `useWorldDrag.test.tsx` has no diff. The suspended-render regression at `WorldSurfaceInteraction.test.tsx:411` checks that unmount settles the version without calling the uncommitted callback. The corrected `toolbarExtras` placement is present at line 437.

4. **ADDRESSED.** `WorldSurfaceInteraction.test.tsx` covers:
   - Resolution and rejection after unmount, including direct detection of late setter calls: line 631.
   - StrictMode fetch deduplication and stale results after remount: line 655.
   - Older POST rejection and reload while a newer drag remains pending: line 390.
   - Every group member failing, with one reload and no saved callback: line 332.

Production request guards and cleanup remain at `WorldSurface.tsx:492–509`. Per-version settlement and one reload after all outcomes remain at lines 396–412. No regression found in the scoped changes.

No tests or builds ran. `git diff --check` passed. Canvas **233/233**, clean typecheck, and the listed red mutations are conductor-supplied evidence.

Report provided here because this session’s read-only filesystem restriction prevents saving an output file.