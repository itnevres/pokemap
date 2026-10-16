# Task 7 code-quality review (17be80b..e42cc2f)

### Strengths
- Rail is one rule set for both families; GBC's `.gbc-map-editing__rail` wrapper div and both GBA strips are gone. No orphaned selectors for the removed classes in src or tests (grep clean; only the plan doc and negative assertions mention them).
- CSS holds at 1024: `.app__body` (flex row) = sidebar 280 + `.app__canvas` min-width 480 + rail 260 = 1020. Rail is `flex: 0 0 auto; min-width: 0; min-height: 0`; metatile palette is `flex: 1 1 0; min-height: 0` with its own `overflow-y: auto` (styles.css:2073), inspector is `max-height: 50%` with its own `overflow-y: auto` (2600). Scrolling flex children all carry min-height 0 / overflow, and `.map-canvas` already has `min-width: 0` (line 504), so the canvas shrinks, not the rail.
- Remount risk is handled: `{canvas}{active && side ? <div class="edit-rail"> : null}` keeps the canvas at child index 0 of the same `.app__map-editing-body`; the rail is a trailing sibling only. The new AppContextEdit test asserts same canvas node, same body node, and no `/api/world` refetch, which would fail on a remount.
- Rail-order test (`railOrder`) fails if order, the Collision-only gating, or the always-mounted palette changes. "No paint tool still shows palette; pick only sets stamp" fails if the old tool gate returns (button absent) or a tool switch gets wired in.
- Comment on the new CSS block states the why (LESSONS min-width: 0), and EditingWorkspace's `side` doc is updated.

### Issues
**Critical:** none.

**Important:** none.

**Minor**
1. styles.css:~235-247, 258-262, ~268 (comments): stale prose. `.app__map-editing` comment still says "(+ the collision value strip, while that tool is active)", the `.app__map-editing-body` comment says "EventInspector takes a fixed width alongside it", and the `.app__event-op-error` comment says "below the toolbar/collision strip, above the canvas+inspector row". Reword to "rail". Not dead rules, just misleading comments.
2. styles.css `.edit-rail > .gbc-metatile-palette` and `.edit-rail > .event-inspector` (and `.edit-rail > .metatile-palette`) repeat `width:auto / min-width:0 / border-left:none` per class. `.edit-rail > .metatile-palette` omits `width:auto`/`border-left:none` (fine today because `.metatile-palette` has neither). Acceptable; a single `.edit-rail > * { min-width: 0; width: auto; border-left: none }` would remove the repetition and guarantee the min-width contract for any future rail child. Optional.
3. `.edit-rail > .collision-palette` is `flex: 0 0 auto` with no cap. The collision strip wraps in 260 px, and on a short window it plus the 50 % inspector can squeeze the metatile palette (min-height 0) to nothing. Consider `max-height` or `flex-shrink: 1; overflow-y: auto`. Plan-mandated layout, so low priority.
4. test/stylesContext.test.ts:new case is a text-regex contract (ruleBody on the CSS string). It would catch deletion or edit of those declarations, but proves nothing about layout. It also does not assert `min-height: 0` on `.edit-rail` or the palette, nor `flex: 1 1 0` on the metatile palette, which are the actual overflow guards. Add those two regexes (cheap) and accept it is still a text check; real layout is only verifiable in a browser (Playwright at 1024).
5. test/AppContextEdit.test.tsx:362-392: the new test is the previous in-context test copied wholesale; the trailing 8 assertions (overlay, context bar, tree, World pressed, chromeless canvas) duplicate the test directly above. Also `.event-inspector` not-null is asserted twice (lines 378 and 380). Trim to the rail + no-remount + no-refetch assertions.
6. test/MapEditingWorkspace.test.tsx `railOrder` maps `className.split(" ")[0]`; fragile if a root gains a leading class, but fine now.
7. UX note (plan-mandated, D4): with a non-paint tool active the GBA palette is shown and a pick only sets the stamp without switching tool; the new test locks this in. Fine, but worth confirming it is intended since the old strip only showed for pencil/rect/bucket.

### Assessment
Approved
