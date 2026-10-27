# Task 5 independent spec review

Result: **NEEDS REWORK**. High-risk independent review of the four scoped files against the Task 5 brief, Plan 12b Global Constraints / Tasks 5–6, and P12 rulings. Read-only source review; no test runner was started, as instructed. The implementation report was read only after independent source/fixture analysis. Preexisting spec and brief preserved.

## Findings

### S1 — Important: initial jump is consumed before the viewport exists

`packages/ui/src/canvas/WorldSurface.tsx:85-92` stamps the jump token without checking measured viewport dimensions. `useStage` starts with `{w:0,h:0}`; measurement schedules state from an effect, so the initial jump effect still closes over zero dimensions. `jumpFit` then returns zoom 1 / pan 0, and the surface marks that degenerate result fitted. On the measured render, initial fit overwrites the jump with the cluster fit and the token prevents retry. This affects a mount with world and jump props already supplied (exactly the hidden-jump test's setup). It also permits tile work from the degenerate fitted view on the intermediate render, contrary to the no-pre-fit invariant.

Keep the token pending until a positive measured viewport exists. Pin a world-present initial jump with exact destination geometry and verify no intermediate pre-fit requests. For Hidden in this fixture, raw fit is min(200/5,100/5)=20; 60% is 12; centre (12.5,12.5) gives pan (-50,-100), and the screen rect must be (70,20,60,60). The existing hidden test checks reveal and relative projection only, so it misses landing at the cluster fit instead.

### S2 — Important: DOM differences are acknowledged but not preserved by adapter fields

`WorldSurface.tsx:174-179` always puts selection/jump before lens/spotlight and always renders the conflict toast without a stack wrapper. Original `GbcWorldCanvas.tsx` puts lens/spotlight before selection/jump. Original `WorldCanvas.tsx` wraps ConflictErrorToast in `.world-canvas__toasts`, even when no save/reload error exists. The adapter exposes no field for either difference. This violates the brief's explicit preservation rule and the plan's no-unnamed-DOM-change constraint; Task 6 deferral of save/reload content does not defer the already-rendered conflict toast's wrapper. The implementation report correctly recognizes the differences but leaves them unresolved. Preserve both arrangements through narrow adapter presentation fields, or obtain a binding ruling before unifying them. No ruling presently covers this order/wrapper change.

Canvas aria-label also differs: GBA currently has no attribute, GBC has keyboard text. A required string field needs to permit omission (or an explicitly documented undefined value) to preserve that difference cleanly. `fitFirst`, `legendExtras`, `lensLegend`, and `statusItems` do preserve their respective observed differences.

### S3 — Important: mandatory first-fit and draw-order oracles are weaker than the acceptance criteria

`WorldSurface.test.tsx:80-96` proves no images only while `world` is null. It never observes world present before fit lands. Removing the fitted gate can still satisfy that assertion. This does not pin P12-4e or support the required draw-before-fit mutation. Use a controlled measurement and/or request-time view observation to prove the intermediate state, with a map visible under the default view but offscreen after fit.

The shared `getContext` spy records *every* canvas, including `buildSmallTile`'s offscreen thumbnail `drawImage`. The order assertion searches for any tile call anywhere before the last extra call, rather than within one stage redraw. If badges move before tiles, a preceding redraw's badge/extra calls can satisfy this ordering. Distinguish the stage context, clear/snapshot the log for one redraw, then assert stage tiles < extra < first badge in that redraw. Keep this independently adversarial rather than relying on a green suite. The explicit plan mutations must reject both broken implementations.

### S4 — Important: manual cluster Fit is not tested; exact manual pan is unasserted

`WorldSurface.test.tsx:98-114` clicks Fit only with filter A/B active and checks rounded zoom text `63%`. The required unfiltered manual cluster fit after wheel is absent, and the filtered manual fit's pan could be wrong while the assertion passes. Add unfiltered wheel → Fit with exact (zoom 5, pan -50,-50), observable as A's stage rect (0,0,50,50), and pin the filtered Fit position too. Cluster initial fit and filtered/jump assertions cannot substitute for the manual path oracle.

## Independent numeric derivation

No production helper supplied these expectations. Multi-map components contain A/B/C/D: extrema (10,10) to (50,30), dimensions 40×20. Viewport 200×100 therefore gives zoom 5 and centred pan (-50,-50); A becomes (0,0,50,50). Native 16 yields round(5/16×100)=31%. Far and Shelf are outside; Hidden is suppressed; one absent singleton is Unplaced.

Filter A/Shelf excludes synthetic component 99 from anchored bounds, leaving A 10×10: zoom 10; spare horizontal 100 centres A at x50; pan (-50,-100). A/B filter has dimensions 20×10, zoom10, pan(-100,-100), rounded percent63. B jump: min(200/10,100/10)×0.6=6; centre(25,15) gives pan(-50,-40); B rect(70,20,60,60). All existing numeric literals agree. Dynamic cap at current3/base2 clamps 3×1.2 to3, then 3/1.2=2.5. Hidden initial-jump numbers are derived under S1. Projection comparison currently checks consistency after one pivot-wheel event but lacks an independent resulting rectangle; strengthening it would make a shared erroneous projection detectable.

## Fifteen-rule audit

1. Ledger ref and unconditional world hook: present.
2. Uncontrolled stage, continuous range, stable fit trampoline, constant mapName, inert map image inputs, chromeless, own fit shortcut: present.
3. Optional boundsFor reads the updater's current zoom via ref; listener dependencies exclude function identity; surface context cap connected: present. Cap test arithmetic correct.
4. Drawn order follows placement iteration; positive dimensions/filter/reveal checks; visible fitted gate and AABB: present, but S1 bypasses fit readiness.
5. Measured once-per-mount cluster/filter fit and atomic view assignment: present. Empty bounds produce no fit.
6. Filter identity fit/reset: present; position refreshes retain view.
7. Manual/context fit and enabled routing: present; test gap S4.
8. Wait outside filter, reveal, 60% helper, keyed token and isolated 2-second timer: present; initial-measurement defect S1.
9. Tile hook parameters, native unit and versions: correct.
10. Draw order in source and viewport/version dependencies: correct. Badges match the instructed GBC scope, dimensions, offsets, acceptance colours/tick/prefix. GBA previously did not filter badges; brief explicitly chooses GBC. Test issue S3.
11. rectByMap for borders/lens/spotlight and outline fallback through rectOf: present, no separate pan/zoom formula in overlay JSX.
12. Encounter cache synchronously reserves each visible map; failures stay reserved and counted; arrival version bump; sides include all drawn neighbours; native LOD threshold: present.
13. Coverage level colours, empty maps, cached method tint and best-percent spotlight: present. Both old tint functions read only fetched methods and return CSS variable strings; neither reads time. Fetch-time tint is equivalent.
14. Context placement scope/size, view setter, menu blocking, context overlay/menu/toast/tooltip: present, subject to DOM finding S2.
15. Missing singleton names sorted; rail and filter rendered: present.

## Scope and evidence limits

No Task 6 interaction/POST/warp implementation was added; deferred markers exist. Adapter source is types only. useStage diff against aaa8ae96 is limited to optional bounds and ref sampling. No existing tests were edited. Forbidden-family-word matches in other canvas files predate this task; the new source contains none. The shortened first-fit/filter/resize comments keep useful rationale, although the token key's animation-restart explanation should be restored beside that key as the brief requests.

There are five `it` blocks covering portions of the nine requested cases; grouping is acceptable, but S3/S4 mean the nine acceptance cases are not all robustly pinned. Tests were not executed by this reviewer. Implementation report records successful typecheck and a Vitest config-load infrastructure failure (zero tests executed); no green focused-test, mutation, full-gate, build or live-check evidence is claimed here. Those execution gates remain the orchestrator's responsibility under its command authorization.
