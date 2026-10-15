# Plan 9 final whole-branch review (Opus)

Range `4305376..503a848` (branch `plan-9-family-shell`). One reviewer, no subagents, in passes: (1) the new shell and
runtimes against master `App.tsx`/`GbcApp.tsx`, (2) rail, toolbar, shortcuts, Fit and hover against the spec, (3) tests
and counts, (4) the late F1/F3 commits and the live report, (5) the ledger triage. The checkout was left as found: two
temporary mutations (below) were reverted, and `git status --short` was empty afterwards.

## Verification I ran (not taken from reports)

- `npm test` from the repo root: **176 files, 2,774 passed, 0 failed** (`scratchpad/fr/run-1.txt`).
- `npm run typecheck`: exit 0. `npm run build -w @pokemap/ui`: exit 0.
- Mutation, Review Focus 4: dropped `key={key}` from `<FamilyApp>` in `Root.tsx`. `Root.test.tsx`: 4 failed, including
  "switching family through the switcher mounts a fresh shell for the other family". Reverted.
- Probe, flake question: appended a test asserting `HTMLElement.prototype` has no own `clientWidth`. It passes when run
  alone (`-t probe`) and **fails when the whole `App.test.tsx` runs** (`{ value: 100, ... }`). So the viewport stub leaks
  between tests (see m1). Reverted.
- `GbcApp.test.tsx` run 3 times on its own: 33/33 each time.

## Strengths

- The shell split is honest. `FamilyApp.tsx` holds only what both shells shared. Each "shells disagree" case from the
  spec sits behind the runtime or a capability, exactly as the plan's Decisions say:
  - Tree re-click: `runtime.leave(go, { sameMap })`. GBA ignores `sameMap` (`gba/adapter.tsx:55-58`); GBC skips both the
    prompt and the discard (`gbc/adapter.tsx:210-214`).
  - `enterContext`: `runtime.onEnterContext`. GBC clears state only for the selected map (`gbc/adapter.tsx:282`), as
    master `GbcApp.tsx:194-197` did.
  - `select` side effects: `runtime.onSelected` is the one choke point (`FamilyApp.tsx:56-59`). Tree, world click, Open in
    Map view and context `select` all route through it.
  - `mapFilter`: the `dungeonFilterCache` flag selects the memo in `useDungeonFilter`. Both memo forms are verbatim
    copies of master.
  - Save commit: `ctx.onCommitted()`, then `runtime.saveDialog.onCommitted()` (`FamilyApp.tsx:229`).
  - World host: inside each `renderWorld`.
  - The one deliberate change, the world-visibility error placement, is listed in the plan's Decisions.
- Hook-order safety is pinned by a test that really fails when broken (the mutation above).
- One shared `shortcutGuard.ts` feeds both `Toolbar` and `useFitShortcut`, so the ignore rules cannot drift apart. Both
  listeners subscribe once and read the latest values through a ref. StrictMode witnesses use `reactStrictMode: true`.
- Task 9b's redesign integrates cleanly with Task 10's `MapCanvas` changes:
  - `useFitShortcut(fit, !chromeless)` and `useContextMapFit(fit, chromeless)` sit side by side. In-context Fit therefore
    calls the chromeless canvas's own `fit`, with no duplicated geometry.
  - The provider value (`registerFit`) is a stable `useCallback`. Cleanup unregisters before a replacement registers.
  - `onHoverMetatile` reaches the chromeless canvas through the same `canvasProps`, so the hover-link also works
    in-context.
- Test accounting holds:
  - 66 added `it(`/`it.each(` sites. Two of them are `it.each` tables (6 and 4 cases), which adds 8 more cases.
  - The diff removes exactly 3 `it(` lines, and all 3 are renames:
    - collision strip → rail;
    - metatile strip keyed on layout name → rail palette;
    - "gba renders App" → "gba renders the GBA shell".
  - 63 + 8 = 71 new tests: 2,703 + 71 = **2,774**.
  - 5 new test files (`ToolbarShortcuts`, `useFitShortcut`, `useFollowHover`, `shell/adapter`, `shell/useDungeonFilter`):
    171 → **176**.
  - Every other removed test line is a render-call or query retarget. That matches the per-task accounting in `_archive/`.

## Late fixes reviewed (no separate task review)

- **3ac7681 (F1)**: `.toolbar` gets `flex-wrap: wrap; row-gap; min-width: 0`. This is the right, minimal root-cause fix.
  The toolbar was the only over-wide flex row; the rail was already pinned. The pin test (`styles.test.ts`) fails if
  either declaration goes. Re-verified live in the report (1024/1024 in Map view and in-context). **OK.**
- **6f8534e (F3)**: `FollowHoverSwitch` now mirrors the World bar markup exactly (`WorldCanvas.tsx:1861-1896`): the pill
  holds only `.world-canvas__switch-thumb`, the button carries `aria-label`, and a `.world-canvas__switch-label` span sits
  beside it. Every existing query (`getByRole("switch", { name: "Follow hover" })`) keeps working through `aria-label`.
  The new markup test fails if the text goes back inside the pill. The `.palette__follow` flex wrapper is fine. Clicking
  the label text does not toggle the switch, the same as the World bar. **OK.**

## Issues

### Critical
None.

### Important
None.

### Minor

**m1. The viewport stub leaks across tests: this is the diagnosed cause of Task 10's describe-placement failure.**
- **Where:**
  - `packages/ui/test/App.test.tsx:1059-1060`
  - `packages/ui/test/gbc/GbcApp.test.tsx:387, 430, 701, 787`
  - the same helper is copied in `AppContextEdit`, `AppContextStroke`, `AppContextVisit`, `AppWorldContextMenu`,
    `GbcAppContext` and `GbcAppContextStroke`
- **Why:**
  - The helper saves `Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")`. jsdom defines `clientWidth`
    on `Element.prototype`, so that value is always `undefined`. The `if (w)` restore then never runs, and
    `clientWidth`/`clientHeight` = 100 stays on `HTMLElement.prototype` for the rest of the file (proved by the probe
    above).
  - Task 10's two GBA hover tests rely on jsdom's unmeasured viewport (Fit falls back to the 64x64 composite, so the
    view is 1x). Inside describe "world click selects the map in the tree (Plan 6c C2)" they ran after a `withViewport`
    call, measured 100x100 and failed. Moved earlier in the file, they ran before the leak.
  - So it is a real test-isolation bug. It predates Plan 9 (master `App.test.tsx:841-842` has the same helper) and is not
    a product bug. Plan 9's own copy in the dungeon-rename characterisation (`App.test.tsx:794-797`) restores correctly
    with `Reflect.deleteProperty`.
- **Fix:** add `else Reflect.deleteProperty(HTMLElement.prototype, "clientWidth"/"clientHeight")` in each copy, or
  better, one shared helper in `test/`. Expect a few later tests that silently depended on the leaked 100 px to need
  their own viewport. Follow-up; not merge-blocking.

**m2. With Follow hover on, the palette scrolls its own switch (and GBA's search box) out of view.**
- **Where:** `styles.css:2073-2079` (`.metatile-palette { overflow-y: auto }` on the whole palette) and `:2824-2834`
  (`.gbc-metatile-palette`).
- **Why:** the scroller is the whole palette, header included. Each time Follow hover scrolls to a far cell (live:
  scrollTop 1655), the "Follow hover" toggle leaves the screen. A user who wants to switch it off has to scroll back to
  the top first.
- **Fix:** make the header and search sticky (`position: sticky; top: 0; background`), or move `overflow-y` onto the grid.
  Plan 10/polish.

**m3. Two buttons named "Collision" in GBA Map view (ledger, Task 8 ruling).**
- **Where:** the toolbar tool and the `MapCanvas.tsx:881` overlay toggle.
- **Why:** screen-reader ambiguity. The two only differ by their group ("Tools" vs the canvas toolbar).
- **Fix:** `aria-label="Collision overlay"` on the toggle. That is a canvas chrome change, so it fits Plan 11
  (overlays/`elevationOverlay`).

**m4. `isTextTarget` misses some contenteditable values.**
- **Where:** `shared/shortcutGuard.ts:2-3`.
- **Why:** it matches only `""` and `"true"`, so `contenteditable="plaintext-only"` is missed. No such element exists in
  the app today.
- **Fix:** add `[contenteditable="plaintext-only"]`, or use `:not([contenteditable="false"])`.

**m5. The R5 "Fit disabled while the context map loads" rule has no GBA test (ledger 9b m2).**
- **Where:** GBC pins it (`GbcAppContext.test.tsx:480`). GBA does not.
- **Why:** the GBA code path is the same shared `useWorldContext.fitEnabled`, so the risk is low.
- **Fix:** mirror the GBC assertion in `AppContextEdit.test.tsx`.

## Finish checklist

1. **Spec coverage.**
   - Implemented and tested:
     - R1 (each key and each ignore rule: input, modal, modifier, absent, disabled, unavailable; StrictMode);
     - R2 (highlight; reset on a tree switch and on a same-map re-click);
     - R3 (one `useRuntime` per family);
     - R4 (hook default, persistence, try/catch fallback, both palettes scroll/no-scroll);
     - R5 (hook ignore rules; one test per canvas proving F equals its Fit; in-context Fit and F pinned to the drawn
       framing in both families);
     - D4 (rail order, collision palette only with Collision, palette outside paint tools, in-context rail with the same
       world node and no `/api/world` refetch, CSS pins);
     - D5 (icons, labels, tooltips, disabled reason titles).
   - Each Review Focus item has a test that would fail if broken:
     1. `App.test.tsx` "typing p in the palette search box does not".
     2. `ToolbarShortcuts` and `useFitShortcut` "aria-modal".
     3. `stylesContext` and `styles` CSS pins, plus the live 1024 check after F1.
     4. `Root.test.tsx`, mutation-killed above.
     5. The R2 reset tests, plus `onSelected` as the one choke point.
     6. The `useFitShortcut` input and modifier tests.
2. **Every "shells disagree" case behind the runtime or a capability:** yes (Strengths).
3. **Test counts:** 2,703 → 2,774, 171 → 176, confirmed by my own run and the diff arithmetic. No test was dropped; the 3
   removed `it(` lines are renames.
4. **Cross-task integration:** clean (Strengths). `shortcutGuard` is the single source for both listeners.
5. **Flakes.**
   - **Task 10 placement:** diagnosed (m1). A real test-isolation bug, pre-existing, test-only; Plan 9's tests are
     deterministic in their current order.
   - **GBC "hovering the canvas highlights the matching palette cell":**
     - The test is from Plan 7; Plan 9 changed only its render call.
     - It runs after the leaked viewport in `GbcApp.test.tsx`, but deterministically so: it passed 3/3 on file-level runs
       and in my full suite.
     - A single failure under full-suite load points to a `waitFor` timeout under CPU pressure, not to a product or
       isolation defect introduced by Plan 9.
     - Caveat: a run of that test alone does not reproduce the file-level environment, because of the leak. Re-check
       after m1 is fixed.

## Ledger triage

| Ledger line | Ruling | Reason |
|---|---|---|
| T1 ruling: Step 7 `status()` assertion replaced by sibling pattern | acceptable-deferred (closed) | Plan defect correctly ruled; the mutation target is unaffected |
| T1 ruling: Step 3 GBA fit readouts taken from the real GBA canvas | acceptable-deferred (closed) | Correct oracle; pan-before-change kept the tests discriminating |
| T1 quality m: confirm-spy restore not in `finally` | acceptable-deferred | Leaks only after an already-failing assertion; same family as m1, fix together |
| T1 quality m: pan helper dedup; selector indirection | acceptable-deferred | Style |
| T1 spec m: brief's Step 6 mutation ineffective, substitute used | acceptable-deferred (closed) | The reviewer killed the test with a valid substitute |
| T2: 2 plan-mandated minors | acceptable-deferred | Plan-mandated shape |
| T3: 3 cosmetic + 6 quality minors | acceptable-deferred | Cosmetic; no behaviour |
| T4: 4 spec + 4 quality minors; 17 wiring items | acceptable-deferred | All 17 carry-overs verified MET in T5; the rest cosmetic |
| T5 quality m: unpinned '…' text | acceptable-deferred | Placeholder text unchanged from master |
| T5 quality m: dense main ternary (`FamilyApp.tsx:212-216`) | acceptable-deferred | Readability only |
| T5 quality m: redundant `openDungeon && mapFilter` | acceptable-deferred | Harmless guard |
| T5 quality m: `timeOfDay`-gated `headerExtras` | acceptable-deferred | Matches the spec's "flag gates the slot" |
| T5 quality m: stale comment refs (App.tsx/GbcApp.tsx line cites) | acceptable-deferred | Comments only; the files are deleted, so the cites are historical |
| T5 quality m: weak Root fresh-mount proof | acceptable-deferred (closed) | My key-removal mutation fails 4 Root tests, so the proof is adequate |
| T5 quality m: unmemoized callbacks | acceptable-deferred | No measured cost; consumers do not depend on identity |
| T5 spec m1: `FamilyApp` reads `props.adapter` each render | acceptable-deferred | Keyed by Root; pinned by the mutation |
| T5 spec m2: no test pins GBA world-visibility error placement | acceptable-deferred | Documented Decision; strictly more information; add with m5 |
| T5 spec m3: old `openDungeon` comment not carried | acceptable-deferred | Substance lives in `useDungeonFilter`'s doc comment |
| T5 spec m4: mojibake process note | acceptable-deferred | Report-only |
| T6 m: stale App/GbcApp wording in test titles | acceptable-deferred | Titles only (e.g. Root "resets GbcApp's own state") |
| T7 ruling: `EditingWorkspace.test` side retargeted to `.edit-rail` | acceptable-deferred (closed) | Correct retarget, with a reason |
| T7 m: 2 cosmetic spec minors; stale CSS comments; CSS test lacks min-height; duplicated test body | acceptable-deferred | Cosmetic; `min-height: 0` is present in CSS |
| T7 m: uncapped collision palette height | acceptable-deferred | 16-ish fixed entries; live 1024/1280 fine |
| T8 ruling: two buttons named "Collision" in GBA Map view | acceptable-deferred | m3; scoped queries; fix with Plan 11 overlay work |
| T9 quality m: `latest.current` assigned during render | acceptable-deferred | Common ref pattern; a discarded render only leaves the next render's props, no observable bug |
| T9 quality m: redundant `body.innerHTML` reset; focused button still receives tool letters | acceptable-deferred | Spec-OK (only text targets are excluded) |
| T9 spec m: absent-tool rule masked by disabled rule in test; Alt/Shift exclusions on Ctrl+Z/Y untested | acceptable-deferred | Code verified by hand (`Toolbar.tsx:72-81`); live run exercised `c` on GBC |
| T9b quality I1/I2 and spec I1 | acceptable-deferred (closed) | Resolved by the 782cb77 redesign (map canvas's own `fit` via `ContextMapFit`); both mutations killed |
| T9b m1: two F listeners while the warp-preview modal is open | acceptable-deferred | The guard (aria-modal) blocks both |
| T9b m2: GBA lacks the "Fit disabled while context loads" test | acceptable-deferred | m5 |
| T9b m3 / quality m1-m4 / re-review m: zero-band comment, hard-coded geometry, stale test name, GbcMapCanvas F test lacks pan assertion, `fit` recreated each render | acceptable-deferred | Comments were added; the rest is test polish; `useFitShortcut` reads `fit` through a ref, so recreation is harmless |
| T10 m: stray blank line at end of `App.test.tsx` | acceptable-deferred | Cosmetic |
| T10 m: Follow hover read once at mount per palette instance | acceptable-deferred | Only one palette exists at a time; the live run showed it survives a reload and a family switch |
| T10 m: old-describe order leak undiagnosed | acceptable-deferred (now diagnosed) | m1: the viewport stub never restores; pre-existing and test-only |
| T11 m: Dungeon-view Fit claim not separately traced | acceptable-deferred (closed) | The live run checked Dungeon F vs Fit in both families |
| T12 F1: GBA toolbar overflow at 1024 | fixed (3ac7681), reviewed OK | See Late fixes |
| T12 F3: Follow hover text clipped inside the pill | fixed (6f8534e), reviewed OK | See Late fixes |
| T12 F2: GBA greyed row stays greyed after drag-to-place until a view switch | acceptable-deferred (**predates Plan 9**) | Details below this table |
| T12 O1: GBC `switchError` banner persists after a successful same-map Discard | acceptable-deferred (**predates Plan 9**) | Details below this table |
| T12 O2: GBC dirty/undo lags paint ~0.3-0.5 s | acceptable-deferred (**predates Plan 9**) | Details below this table |

**F2: why it predates Plan 9.**
- Master `App.tsx:45-49` documents the same "snapshot once per World-mode entry" limitation.
- Master GBA `WorldCanvas` has no `onPlacementSaved`. Only GBC wired `markManualPlacement` (master `GbcApp.tsx:171, 231`).
- Plan 9 keeps that as the `manualPlacements` capability.
- Natural home: Plan 10 D3 (manual placements for both families).

**O1: why it predates Plan 9.**
- On master, `switchError` was cleared only by select, enterContext or dismiss. The toolbar Discard never cleared it.
- The spec scopes clearing to `onSelected`.
- It is dismissible. Revisit with D1 save-or-discard (Plan 10).

**O2: why it predates Plan 9.**
- The async GBC edit session (`useGbcEditSession`) is unchanged by Plan 9.
- No data risk: Save is enabled once state lands.

## Declined to judge

- The visual quality of the inline SVG icons: a design call; the live screenshots look consistent.
- Whether in-context GBA Fit should match Map view by pixel crop: the stages differ in size. The live run used zoom-step
  equality, as the report explains; out of my reach without a browser.
- Issue #4 closure: the user's call (plan Finish).

## Assessment

**Ready to merge: Yes.**

**Reasoning:** Nothing Critical or Important was found. The shell merge keeps every per-family policy behind the
runtime, the tests prove it (counts reconcile at 2,774/176, nothing dropped, the hook-order mutation is killed), and
the two late live fixes are minimal and pinned. The five minors and the three live observations are pre-existing or
polish, best handled in a follow-up. m1 (the test viewport leak) is the most useful of them, because it explains the
order-dependent failures seen in this run.
