# PokeMap: follow-ups and review backlog (roadmap Plan H)

> **Status (2026-11-13).** Task D is done. Task A is open. Task B starts with a repro: its reported symptom was fixed another way in Plan 10a2, but the ordering it names is unchanged. Task C is open and re-scoped. Tasks E-P were added on 2026-11-13 from the 2026-11-12 code review; none has started. Roadmap decisions D21-D23 (`2026-10-14-pokemap-roadmap-unified-ui.md`) place this document in the plan order as **Plan H**.
>
> **History.** Tasks A-C were found live during Plan 2's own follow-ups (2026-09-22/23), and Task D during Plan 6b (2026-09-28). Plan 2 and its follow-ups merged via [itnevres/pokemap#1](https://github.com/itnevres/pokemap/pull/1) on 2026-09-25. The file names inside Tasks A-C are the 2026-09 ones; the dated note under each heading gives the current location.

## How to run this plan

- **Tiers follow the project `CLAUDE.md`.** Each task states its tier and the trigger. A High task gets a spec and a step-level plan (`superpowers:writing-plans`) when its batch starts, then subagent-driven development with separate spec and quality reviews; this document is its scope and acceptance source. A Medium task gets one combined review. A Low task gets its checks only. This replaces the older instruction to run every task here with the full workflow.
- **Implementers and bulk reads go through the `delegate` skill.** Log hops and skips in the batch ledger under `docs/superpowers/task-reports/pokemap-plan-h-review-backlog/`.
- **One branch per batch from `master`, merged with a merge commit.** No push, PR or merge to `master` without the user.
- **Gate once per batch** for Low and Medium batches (`gate` skill: full suite, typecheck, UI build, subjects unchanged). A High task gates at its own merge. Never run two vitest processes at once.
- **Re-confirm every file:line before writing step code.** The references in Tasks E-P were checked on 2026-11-13 against `plan-14-2-block-editor` at `b0b697e`.
- **Do not start a batch whose files Plan 14.2 has in flight.** Until Plan 14.2 merges to `master`, leave these alone:
  - server: `packages/server/src/{index,gbcRoutes,gbcEditRoutes,editSessions,gbcEditSessions}.ts`;
  - core: `packages/core/src/{index,project}.ts`, `gbc/project.ts`, `config/engine.ts`, `write/save.ts`, `gbc/write/save.ts`, `load/tilesetData.ts`, `gbc/load/tileset.ts`, everything under `blockEdit/`;
  - UI: `packages/ui/src/styles.css`, `shared/{useEditSessionCore.ts,MapCanvasViewport.tsx}`, `shell/{FamilyApp.tsx,adapter.ts}`, `canvas/MapSurface.tsx`, `components/{SaveDialog,MetatilePalette,Toolbar,toolIcons}.tsx`, `hooks/useMapEditing.ts`, `gba/{adapter,mapSurface,worldSurface}.tsx`, `gbc/{adapter,mapSurface,worldSurface,GbcMetatilePalette,GbcMapEditing}.tsx`.

## Batches and order

| Batch | Tasks | Tier | Earliest start | Why this grouping |
|---|---|---|---|---|
| Now | L1, M2, K5 | Low | now, beside Plan 14.2 | none of their files is in Plan 14.2; one branch, one gate |
| H1 | E, A, F | High (A Medium) | after Plan 14.2 merges | E and A share `server/src/index.ts`: one branch, separate commits. F is core-only: its own worktree, built at the same time, test runs serial |
| H2 | G, B, C | High | after H1 | G and B open with a repro that may close them. C builds on the barrier from Plan 14.2 Task 12 |
| H3 | K, H, I1, I2 | Low, Medium, Medium, High | after H2 | K first, with no other branch open (it touches about 90 sites). H and I use `http.ts` from Task E |
| H4 | J | Medium | after H3 | it edits the route files that Task I moves |
| Between plans | L2, M1, M3, O, P | Low to Medium | any time after Plan 14.2 merges, one at a time | L2 and P3 each need an otherwise idle repository |
| Before Plan 15 | N, with O | High | after a brainstorming session | Plan 15 adds a whole new view; build it on the finished layout rules |

**Batches H1-H3 finish before roadmap Plan 14A starts** (roadmap D21; order confirmed by the user 2026-11-13): Plans 14A, 14C, 15 and 17 each add hub routes and file writers in both families, and they are cheaper to build on one route shape, one session store and a contained write path. H4 and the "between plans" tasks may slip behind later plans.

## Review findings and where each one went

Ids match the 2026-11-12 review report (S security, R refactor, U UI, P plans). The number is the report's checklist item.

| # | Finding | Task |
|---|---|---|
| 1 | S1 species icon route path traversal | E |
| 2 | S3 unbounded request body; `nosniff` | E |
| 3 | S4 GBA routes laxer than GBC | E |
| 4 | S6 `npm audit fix` (non-breaking) | L1 |
| 5 | U2 reduced motion; U6 palette search label | M1, M2 |
| 6 | R5 `errorMessage`; R7 `hex`, `isRecord` | K1, K2 |
| 7 | Stale status lines in RESUME and the roadmap | done 2026-11-13 |
| 8 | P7 `CLAUDE.md` and `AGENTS.md` duplicate each other | K5 |
| 9 | R11 dead code | K4 |
| 10 | S2 decomp-sourced paths not contained | F |
| 11 | R10 GBA map cache after a save (suspected) | G |
| 12 | R1 routes written twice | H |
| 13 | S5 POSTs sent as `text/plain`; R6 two fetch styles | J |
| 14 | P1-P5 Plan 3 and Plan 5 overlap the roadmap | done 2026-11-13 (roadmap D22) |
| 15 | S7 Google Fonts request on every launch | M3 |
| 16 | R3 two session stores; R4 paint written twice | I2; roadmap Plan 14A |
| 17 | R2 one 1,065-line request handler | I1, I2 |
| 18 | S6 `vitest` 2 → 5 | L2 |
| 19 | U1 no responsive layout; U3 map canvas is mouse-only | N |
| 20 | R8 no `gba/` folders, no public core surface | P3 |
| 21 | U4 unreachable light theme; U5 one global stylesheet | N; O |
| 22 | No lint, no CI | P1, P2 |
| - | P6 discard waits for strokes (Task C and RESUME's Plan 8 item) | C |
| - | R9 test-only cache in production code | K3 |
| - | U7 `WorldSurface.tsx` 934 lines | roadmap Plan 16 |
| - | U8 no request cancellation | not planned (see the end of this document) |

---

## Task A: `GET /plan` permanently disabling the PNG render cache

**Re-checked 2026-11-13: still open. Tier Medium** (the three tests below catch a wrong answer). The bypass is `if (editSessions.has(name))` at `packages/server/src/index.ts:429`. Run it in batch H1 on Task E's branch (same file) as its own commit. Check the GBC render route (`gbcRoutes.ts`, `renderCache`) for the same condition, and fix both or record why GBC differs.

**Root cause:** `packages/server/src/index.ts`'s `/api/edit/:name/plan` route (`planMatch`, hit by `SaveDialog.tsx`'s own `useEffect` fetch on mount) unconditionally calls `editEntryFor(name)`, opening an edit session as a side effect of a read. Sessions close only on a successful commit (`commitMatch`'s own `editSessions.close(name)`). The live-render follow-up (2026-09-22, commit `2359ecb`) made `/api/render/:name.png` bypass its own `pngCache` entirely whenever `editSessions.has(name)` is true — correct for an actually-dirty session, but the two conditions aren't the same: once a player has EVER opened the Save dialog for a map (even cancelling immediately, never editing, or undoing back to clean), that map's render cache stays bypassed for the rest of the server process's life. Measured on a real large map (Route110): 2.8ms cached vs. 40-77ms bypassed, permanently, with zero edits ever made.

**Fix:** key the render route's cache-bypass on `entry.session.isDirty`, not merely `editSessions.has(name)`.

```ts
// packages/server/src/index.ts, inside the renderMatch handler
const liveEntry = editSessions.has(name) ? editEntryFor(name) : undefined;
if (liveEntry && liveEntry.session.isDirty) {
  const layoutName = resolveLayoutName(name); // reuse the existing helper both branches already share
  if (!layoutName) return send(404, { error: `no layout or map ${name}` });
  const png = encodePng(renderLayout(project, layoutName, { border, blocksOverride: liveEntry.session.blocks }));
  res.writeHead(200, { "content-type": "image/png", "cache-control": "no-cache" });
  return res.end(png);
}
// ...existing pngCache path, unchanged, for the isDirty:false and no-session cases
```

This is correct, not just a perf hack: nothing is ever written to disk until a real commit (I6), so an `isDirty:false` session's in-memory blocks are BY DEFINITION identical to what's already on disk — falling back to the cached/disk path for that case can never serve stale pixels. Only a genuinely dirty session (real pending edits) needs the live-render bypass, which is exactly when it's needed.

**Test:** open a session via a real `/plan` fetch with no edits, confirm the render route still hits `pngCache` (mirror `api.test.ts`'s existing "keys the PNG cache on border" test's own observability technique — same-instance identity or an equivalent signal, whatever that established test already uses, don't invent a new one). Then: paint a real edit (`isDirty:true`), confirm the render now bypasses cache and reflects the live blocks (mirror the live-render follow-up's own existing test in `api.test.ts` for this). Then: undo back to clean (`isDirty:false` again), confirm the render falls back to the cache/disk path again, not stuck bypassing forever. All three cases, not just the fix's own headline case.

**Risk:** low-medium. Single conditional change, one file, well-precedented test patterns to mirror already exist in `api.test.ts` from the live-render follow-up itself.

---

## Task B: `jsonEdits`-before-`insertOps` ordering bug in `applyJsonOps`

**Re-checked 2026-11-13: starts with a repro. Tier High** (core write path; every mutating route funnels through it). `applyJsonOps` (`packages/core/src/write/save.ts:332-346`) still applies `jsonEdits` (line 334) before `insertOps` (line 335). RESUME records that Plan 10a2 Task 6 fixed "moving an unsaved (pending-insert) event broke the GBA save plan" another way. Step 1 of the test list below therefore decides the task. If add-then-move in one session now passes at plan and at commit, keep the test as a pin, record why the order no longer matters, and close the task without the reorder. If it fails, continue as written.

**Root cause:** `packages/core/src/write/save.ts`'s `applyJsonOps` applies `session.jsonEdits` (scalar field edits — `moveEvent`'s x/y/elevation) BEFORE `session.insertOps` (array insertions — `addEvent`'s new element). Adding an event (insertOp targeting index N, appended, doesn't exist in the original array text yet) and then moving it in the SAME session (jsonEdit targeting `[arrayKey, N, "x"]`) throws `index N is not present` — the jsonEdit is applied first, against text where index N genuinely doesn't exist yet. Found live during the event-elevation follow-up's own live-verify (2026-09-22), reproduced against the real subject decomp, confirmed NOT elevation-specific (any move — x/y alone included — on a same-session freshly-added event hits this).

**Fix:** reorder `applyJsonOps` to apply `insertOps` before `jsonEdits`.

```ts
// packages/core/src/write/save.ts, applyJsonOps
function applyJsonOps(session: EditSession): string {
  let text = session.originalMapJson;
  for (const op of session.insertOps) text = insertArrayElement(text, op.path, op.index, op.value);
  if (session.jsonEdits.length > 0) text = editJson(text, session.jsonEdits);
  const removesByPath = new Map<string, number[]>();
  for (const op of session.removeOps) {
    const key = JSON.stringify(op.path);
    removesByPath.set(key, [...(removesByPath.get(key) ?? []), op.index]);
  }
  for (const [key, indices] of removesByPath) {
    const path = JSON.parse(key) as JsonPath;
    for (const index of [...indices].sort((a, b) => b - a)) text = removeArrayElement(text, path, index);
  }
  return text;
}
```

**Why this is safe in general, not just for the one repro case:** `addEvent`'s own doc comment already states insertOps always APPEND ("there is no established meaning" for inserting mid-array for this format) — an append never shifts any EXISTING element's index. So reordering insertOps before jsonEdits cannot break a jsonEdit targeting a PRE-EXISTING index (its target index is unaffected by an append happening first or last), and it FIXES a jsonEdit targeting a freshly-inserted index (now present when the jsonEdit runs). `removeOps` staying last, highest-index-first, is unaffected by this reordering — verify this reasoning holds by re-reading `insertArrayElement`'s and `editJson`'s own implementations before treating it as settled, this is exactly the kind of "sounds right, verify by tracing" claim this project's own Plan 0 §7 test-design rules warn against accepting on reasoning alone.

**Test, TDD, both directions:**
1. Reproduce the exact bug first (add an event, move it, same session, confirm it currently throws) — watch it fail red against the CURRENT ordering.
2. Apply the fix, confirm it now succeeds and the resulting JSON reflects both the insert and the move correctly.
3. Confirm both `/plan` (dry preview) and `/commit` (real write, restore after) work for this sequence, not just the pure `core` function in isolation.
4. **Re-run the FULL I5 corpus gate** (`packages/core/test/write/corpus.test.ts`) — this changes the shared `applyJsonOps` function every write path (paint, event, sign) funnels through; the existing corpus tests use single-op scenarios that may not exercise the mixed insert+edit-same-session path this fix targets, but full regression coverage across all 6 engine roots is non-negotiable for a change to this function, matching the exact rigor Task 19 already established for any change here.

**Risk:** medium — small diff, but it's a core write-path ordering change touching the function every mutating route depends on. **Recommend Opus for review** (both spec-compliance and code-quality), matching this project's own established policy for hand-derived-numeric-fixture/core-write-correctness changes (CLAUDE.md's own cost-discipline notes, Task 19's own precedent).

---

## Task C: discard/save vs. in-flight-paint race

**Re-scoped 2026-11-13: still open. Tier High** (async ordering; save and discard ownership). The files named below no longer exist in that form. Today `discard` in `packages/ui/src/shared/useEditSessionCore.ts` (line 131) awaits only `eventCreateBarrier`. Paint strokes are tracked apart from it by `shared/useStrokeChain.ts` (`strokeSettled`): the map-switch path awaits it (`shell/FamilyApp.tsx:319`); the toolbar Discard and the Save dialog do not. The server side is unchanged, so a late paint POST still reopens a fresh session. Plan 14.2 Task 12 turns the barrier into `sessionMutationBarrier(mapName)` for undo, redo, Discard, Save and map switch. **Run Task C after Plan 14.2 merges, on top of that barrier:** register stroke chains in it, or have the toolbar Discard, the Save plan and the Save commit await `strokeSettled()`, in both families. The `pendingRef` design below is superseded. The accepted ceiling and the controlled-delay test technique still apply. This task also closes RESUME's Plan 8 deferred item (a discard does not wait for queued stroke links).

**Root cause:** `editSessions.ts`'s `close()` (`sessions.delete(mapName)`, used by both the discard follow-up's new route and the pre-existing commit route) has no generation/version tag, and `open()` silently creates a fresh session from disk if none exists. `MapCanvas.tsx`'s paint-stroke lifecycle has at least one fire-and-forget chain (`onMouseLeave`'s own cleanup, `void pendingPaintRef.current.catch(() => {}).then(...)`, not awaited before the handler returns) — if a player's cursor leaves the canvas mid-stroke and they then click Discard (or Save) before that in-flight `/paint/apply`/`/paint/end` actually lands server-side, the session-closing call can beat it there. The late-arriving paint request then finds no session, silently reopens a FRESH one from disk, and applies the stroke to it — a new dirty server-side session the just-cleaned client UI has no idea exists. Self-recoverable (discard again) but a real data-integrity footgun. Pre-existing (Save had the identical gap already; the discard follow-up, 2026-09-22, just inherited it, didn't introduce it).

**Fix, worked out already (this is the part needing real design care, not just a conditional):** centralize "the latest pending mutating call" tracking inside `useEditSession.ts` itself, since that's where BOTH `discard()` and (once wired) `SaveDialog`'s own commit flow can reach it — `MapCanvas`'s own `pendingPaintRef` is the wrong place, since `SaveDialog` has no access to a MapCanvas-internal ref.

```ts
// packages/ui/src/hooks/useEditSession.ts
const pendingRef = useRef<Promise<unknown>>(Promise.resolve());

// Wrap every mutating call (beginStroke, applyPaint, endStroke, undo, redo,
// moveEvent, addEvent, deleteEvent) so it registers itself here -- e.g. the
// existing `call` helper becomes:
const call = useCallback(async (path: string, body: unknown = {}) => {
  if (!mapName) return;
  const p = (async () => {
    const r = await fetch(`/api/edit/${encodeURIComponent(mapName)}${path}`, { method: "POST", body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`POST /api/edit/${mapName}${path} -> ${r.status}`);
    applyResponse((await r.json()) as SessionResponse);
  })();
  pendingRef.current = p;
  return p;
}, [mapName]);
// callEvent gets the identical treatment.

// New, exposed on UseEditSessionResult:
const waitForPending = useCallback(() => pendingRef.current.catch(() => {}), []);

// discard() awaits it FIRST:
const discard = useCallback(async () => {
  if (!mapName) return;
  await waitForPending();
  const r = await fetch(`/api/edit/${encodeURIComponent(mapName)}/discard`, { method: "POST" });
  if (!r.ok) throw new Error(`POST /api/edit/${mapName}/discard -> ${r.status}`);
  setBlocks(initialBlocks ?? []); setBorder([]); setMap(initialMap);
  setIsDirty(false); setCanUndo(false); setCanRedo(false);
}, [mapName, initialBlocks, initialMap, waitForPending]);
```

`SaveDialog.tsx`'s own commit call is currently a raw `fetch` bypassing this hook entirely (per its own existing doc comment) — this fix should either (a) have `App.tsx` call `editSession.waitForPending()` before rendering/allowing `SaveDialog`'s save button to actually fire its own commit fetch, or (b) pass `waitForPending` down as a prop `SaveDialog` awaits before its own `fetch`. Pick whichever reads cleaner against the real current `SaveDialog`/`App.tsx` code — both close the race for commit, not just discard, which is the actual complete fix (closing it for discard alone while leaving Save's own identical exposure open would be half a fix to a bug that affects both equally).

**Explicitly accepted, not fixed by this design:** this closes the race for a SINGLE client tab's own out-of-order fire-and-forget chains. It does NOT close a much rarer network-reordering case (a slower FIRST request arriving after a faster SECOND one, independent of any client-side fire-and-forget gap). Name this as an accepted ceiling in the final code's own doc comment, matching this project's own established `ponytail`-style "name the ceiling" convention — do not silently pretend the fix is airtight, and do not scope-creep into the much larger server-side generation-counter alternative (every paint/event route would need to check a generation tag) unless live-verify or a future incident shows the client-side fix is insufficient in practice.

**Test:** the deterministic, controlled-delayed-promise repro technique this file's own `MapCanvas.test.tsx` already established for its rect-tool async-race regression test (search for it — same pattern: a mock that resolves on a controlled delay, not an instant-resolving one, since instant resolution doesn't expose ordering bugs, exactly the lesson this project's RESUME.md already documents about this specific file's own race-testing history). Confirm `discard()` genuinely waits for a controlled, artificially-delayed prior call before its own request fires. Confirm the SAME for whichever `SaveDialog` fix direction is chosen.

**Risk:** medium-large — the trickiest of these 3, real design judgment already spent above, but still needs the implementer's own verification against current real source (this design was worked out against `useEditSession.ts`/`SaveDialog.tsx`/`MapCanvas.tsx` as they stood 2026-09-22, re-confirm no drift).

---

## Task D: GBA `MapCanvas` StrictMode zoom, hover overflow, and `vite build` CSS comment (DONE: D1/D2 in Plan 6c E1, D3 in Plan 6b)

**Origin:** Plan 6b Task 4's spec review (`docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/_archive/task-4-spec-review.md`, sections A and B plus its "Side note"; branch `plan-6b-gbc-app-layer` until it merges). The review found the first two bugs in `GbcMapCanvas.tsx`, which was copied from GBA `MapCanvas.tsx`, and reproduced both on GBA live. Task 4 fixed only the GBC copy and deliberately left GBA's `MapCanvas.tsx`, `App.tsx` and the shared `.map-canvas` rule untouched, deferring GBA to this follow-up. The fixed `packages/ui/src/gbc/GbcMapCanvas.tsx` is the reference implementation for D1 and D2.

**D1: DONE in Plan 6c E1 (`a13a308`, 2026-10-05).** `MapCanvas` now holds one `view` state with a shared pure `zoomAboutPivot` (`components/mapView.ts`), pinned by a `<StrictMode>` test. The original text follows for the record.

**D1. StrictMode zoom bug.** `packages/ui/src/components/MapCanvas.tsx`, `applyZoom` (lines 532-542 on `master`), calls `setPan(...)` inside the `setZoom` updater. `packages/ui/src/main.tsx` renders under `<StrictMode>`, which runs updaters twice in development, so the pan is applied twice. In `npm run dev --workspace=@pokemap/ui`, clicking 2× or 4× moves the map off-canvas, and 4× looks blank. A production build is correct (measured: prod pan (−78, −59) vs. a double-applied pan in dev on PalletTown / KantoRoute23).
- **Fix:** a single `{ zoom, pan }` view state with a pure updater. Extract the zoom-about-pivot math into an exported, unit-tested pure function (mirror `GbcMapCanvas`'s `GbcView` + `zoomAboutPivot`).
- **Test:** render `<StrictMode><MapCanvas …/></StrictMode>`, click 2× from Fit, then 4×, and pin the exact pan `pivot − (pivot − pan0)·k` from the last draw call. It must fail on the old code (show the red run in the report). jsdom tests do not use StrictMode by default, which is why nothing caught this.
- **Also:** confirm `WorldCanvas.tsx` has no nested-updater pattern (the review's `grep "setZoom(("` matched only `MapCanvas`; re-run it).

**D2: DONE in Plan 6c E1 (`dd50d43`, 2026-10-05).** `min-width: 0` and an ellipsising hover now sit on the shared `.map-canvas` rules. GBA keeps its 28 px single-row status strip, and the 44 px two-row strip stays GBC-only (E1 fix round `a1a59e0`). All three are pinned in `styles.test.ts`. The original text follows for the record.

**D2. Hover overflow.** `.map-canvas` (`packages/ui/src/styles.css`, about line 501) is a flex item of `.app__map-editing-body` with the default `min-width: auto`, which resolves to its min-content width. The `white-space: nowrap` hover text in `.map-canvas__status` therefore widens the row, pushes `EventInspector` past the viewport, and the page scrolls horizontally on hover. Measured: PalletTown at a 1280-px window, `document.documentElement.scrollWidth` 1280 → 1384. `overflow: hidden` on the status bar does not help, because the status bar is not the row flex item whose minimum is being resolved.
- **Fix:** `min-width: 0` on the shared `.map-canvas` rule. That alone clips the end of the hover text, so also keep it legible: truncate with an ellipsis or wrap into a fixed-height strip (mirror the `.gbc-map-canvas` status-strip rules Task 4 added).
- **Check:** with Playwright, hover the longest realistic status line and assert `document.documentElement.scrollWidth === clientWidth` at 1280×800 and 1024×768. Read the numbers from a script, not from a screenshot.

**D3: DONE in Plan 6b (`5629602`, 2026-09-28).** It was worse than described below. Browsers silently dropped the next rule, `.species-spotlight { position: relative }`, so the spotlight dropdown rendered off-screen in both families. The fix rewords the comment. `packages/ui/test/styles.test.ts` parses the sheet strictly with lightningcss and pins the rule, and `vite build` passes. The original text follows for the record.

**D3. `vite build` fails.** lightningcss (default minify) rejects the `*/` inside a CSS comment in `packages/ui/src/styles.css` (line 1272 on `master`, about 1296 on `plan-6b-gbc-app-layer`: `world-canvas__spotlight-*/world-canvas__lens-tint`), which ends the comment early. Reword it (for example `world-canvas__spotlight-* and world-canvas__lens-tint`) so `npm run build --workspace=@pokemap/ui` succeeds.

**Constraints:** GBA behaviour must otherwise stay identical. `npm test` must keep RESUME's "Git state" baseline, with only new tests added. `npm run typecheck` must be clean. Live-verify in the Vite dev server (StrictMode on) against a GBA project (`npx tsx packages/server/src/serve.ts`, with `pokemap.config.json` pointing at a GBA decomp), and take screenshots of Fit/2×/4× and of the hover. Never commit `pokemap.config.json`. If `plan-6b-gbc-app-layer` has merged by then, branch from `master` and reuse the merged `GbcMapCanvas.tsx`. Otherwise read it from that branch.

**Risk:** low. Three small, independent diffs in two files (`MapCanvas.tsx`, `styles.css`), each with a fix already proven on the GBC sibling.

---

# Review backlog (added 2026-11-13)

Source: the code review of 2026-11-12 on `plan-14-2-block-editor` at `b0b697e`. Every finding below was checked against the code, except Task G, which is a suspicion with a repro step. The hub's design holds and is not a finding: it binds `127.0.0.1`, and `isCrossOriginRequest` (`packages/server/src/hub.ts:161-169`) rejects a foreign `Origin` or `Host`; browsing and opening any folder is by design behind that guard.

---

## Task E: server request boundary (S1, S3, S4)

**Tier: High** (hub I/O error boundary).

**Findings.**
- **S1.** `GET /api/species/<name>/icon.png` (`packages/server/src/index.ts:483-518`) decodes the name after the route regex has matched, so `%2F` passes the `[^/]+` test. `speciesToDirName` (`packages/core/src/render/species.ts:14-23`) puts the result into `graphics/pokemon/<dir>/icon.png`. `SPECIES_..%2F..%2F..%2FWindows%2FTemp` resolves outside the project root (reproduced with `node`, 2026-11-12). The read is of a file that must parse as an indexed PNG, and the Origin guard limits callers to the app's own page, so the severity is low.
- **S3.** `readBody` (`index.ts:89-96`) buffers a body of any size.
- **S4.** `index.ts` calls `decodeURIComponent` unguarded at 27 sites (346, 353, 399, 458, 485, 528, 1000 and others); a malformed `%` becomes a 500 from the outer catch (1359-1362). The GBC routes use `decodeMapName` (`gbcRoutes.ts:92-98`). GBA `POST /api/world/placement` (`index.ts:693-719`) lacks the guard its GBC twin has (`gbcRoutes.ts:553-579`): a `null` body answers 500, and `__proto__` is accepted as a map key.

**Change.** Create `packages/server/src/http.ts` and use it from both handlers and the hub:

```ts
export const MAX_BODY_BYTES = 16 * 1024 * 1024;
/** Reads a request body. Stops buffering and rejects with BodyTooLarge past MAX_BODY_BYTES; the caller answers 413 and closes the connection. */
export function readBody(req: IncomingMessage): Promise<string>;
/** decodeURIComponent that returns undefined on a malformed escape. Replaces gbcRoutes' decodeMapName. */
export function decodeSegment(raw: string): string | undefined;
/** JSON response with `x-content-type-options: nosniff`. Replaces each handler's own `send`. */
export function sendJson(res: ServerResponse, status: number, body: unknown): void;
```

```ts
// before  packages/server/src/index.ts:485
const species = decodeURIComponent(speciesIconMatch[1]!);
// after
const species = decodeSegment(speciesIconMatch[1]!);
if (species === undefined || !/^\w+$/.test(species)) return send(400, { error: "malformed species" });

// before  packages/server/src/index.ts:702
if (typeof parsed.map !== "string" || typeof parsed.x !== "number" || typeof parsed.y !== "number") {
// after: the GBC guard (gbcRoutes.ts:563) plus a known-map check
if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)
  || typeof parsed.map !== "string" || !project.mapNames().includes(parsed.map)
  || !Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) {
```

**Acceptance (tests first; each fails on the current code).**
1. `GET /api/species/SPECIES_..%2F..%2Fx/icon.png` answers 400. A name outside `^\w+$` answers 400. A real species still answers 200.
2. One malformed-`%` request per GBA route family (map, render, metatile, species, edit, defects, event-options, world) answers 400, never 500.
3. A body of `MAX_BODY_BYTES + 1` bytes answers 413 and the route body does not run.
4. GBA placement with the bodies `null`, `[]`, `{"map":"__proto__","x":0,"y":0}`, an unknown map, and `{"map":"<real>","x":1e999,"y":0}` answers 400 each time, and `.pokemap/world.json` is byte-identical afterwards.
5. Every JSON response carries `x-content-type-options: nosniff`.
6. Mutation checks: remove the `^\w+$` test; remove the size cap; drop the known-map check. Each turns its test red.

**Files:** create `packages/server/src/http.ts`, `packages/server/test/http.test.ts`; modify `index.ts`, `gbcRoutes.ts`, `gbcEditRoutes.ts`, `hub.ts`; new cases in the existing route tests.

---

## Task F: path containment for decomp-sourced paths (S2)

**Tier: High** (writes to subject repos; parsing boundary).

**Finding.** `packages/core/src/load/layouts.ts:20-21` copies `border_filepath` and `blockdata_filepath` from `layouts.json` unchecked. They are joined to the root for reads and for **writes**: `write/binary.ts:57,76`, `server/src/editSessions.ts:44-45`, `server/src/index.ts:381`, `render/layout.ts:62,108`, `defects/gba.ts:63`, `signs/suggest.ts:79`, `cli/src/writeCommands.ts:25-26`. A project whose `layouts.json` holds `"../../x"` makes Save write outside the project. GBC paths taken from `INCBIN` lines have the same gap for reads: `gbc/load/map.ts:346`, `gbc/load/tileset.ts:506-509`, `gbc/load/palette.ts:470-471,591,598`, `gbc/load/roofs.ts:218`, `gbc/load/sprites.ts:76`. This matters for a project cloned from someone else.

**Change.**

```ts
// before  packages/core/src/load/layouts.ts:20
borderFilepath: String(l.border_filepath),
blockdataFilepath: String(l.blockdata_filepath),
// after
borderFilepath: insideRoot(String(l.border_filepath)),
blockdataFilepath: insideRoot(String(l.blockdata_filepath)),

// packages/core/src/config/paths.ts
/** Refuses a project-relative path that is absolute or climbs out of the root. Returns it unchanged. */
export function insideRoot(rel: string): string {
  const n = posix.normalize(rel.replace(/\\/g, "/"));
  if (n === ".." || n.startsWith("../") || n.startsWith("/") || /^[A-Za-z]:/.test(n)) throw new Error(`path leaves the project: ${rel}`);
  return rel;
}
```

A second guard sits at the one write choke point: `writeFilesAtomically` (`packages/core/src/write/atomic.ts:26`) takes the project root and refuses any entry outside it before it writes a temp file. That covers every writer, including Plan 14.2's tileset entries. `addEvent/sources.ts` already has the containment idiom (`relative(resolve(root), resolve(path))` must not start with `..`).

**Spec question to settle first:** GBC data defects never throw (GBC roadmap invariants). Decide whether an escaping `INCBIN` path is a refusal at project open or a `DataDefect` that marks the map unreadable.

**Acceptance (temp projects only).**
1. `blockdata_filepath` of `../../outside.bin`, an absolute path, a drive-letter path and a backslash variant are each refused at load, naming the layout id and the path.
2. A GBC `INCBIN` path with `..` is handled as the spec question rules, with file and line context.
3. `writeFilesAtomically` with one entry outside the root throws before any write; every file is byte-identical afterwards.
4. Every real root still loads and the corpus counts are unchanged, which shows that no real project uses such a path.
5. Mutation checks: remove the guard in `atomic.ts` (test 3 red); remove `insideRoot` in `layouts.ts` (test 1 red).

---

## Task G: GBA map cache after a save (R10, suspected)

**Tier: High** (save ownership; nothing catches a wrong answer today).

**Suspicion, not yet run.** `mapCache` (`packages/core/src/project.ts:136-160`) has no invalidation API. The event operations return new objects (`edit/events.ts:35,60,70`) and do not change the cached `MapData`. After a commit that changes events, `project` consumers may see the data from before the save. `packages/server/src/signRefresh.ts:77` re-opens the whole project to get fresh data, which looks like a workaround for this.

- **Step 1 decides the task.** Hub test on a temp copy: move an event, commit, then read the map through `GET /api/map/<name>` and through the consumers that use the cached project (defects, sign refresh, world warps). Expect the saved coordinates everywhere.
- **Green:** keep the test as a pin, record which code refreshes the data, close the task.
- **Red:** add `forgetMap(name)` to `Project`, call it in the commit route's `finally` beside `symbols.invalidate()` (`index.ts`, about line 1039), then check whether `signRefresh.ts:77` still needs the full re-open. Check the GBC project for the same shape.

---

## Task H: one sidecar route module for both families (R1)

**Tier: Medium** (behaviour-preserving; the existing route tests of both families are the oracle).

**Finding.** 14 route paths exist in both handlers, and `index.ts` and `gbcRoutes.ts` share 75 identical long lines. `/api/world/conflicts/accept` at `index.ts:674-691` equals `gbcRoutes.ts:510-527` except for the root variable. The JSON-body preamble (read, parse, 400 on bad JSON, shape check, 500 on a throw) is written out about 25 times.

**Change.** Add `jsonBody(req, send, guard, shapeText, handler)` to `http.ts`. Create `packages/server/src/sidecarRoutes.ts`, which exports a route of the shape `addEvents.handleOptions` already has (`index.ts:323`): `(req, url, send) => boolean`, true when handled. Mount it from both handlers for the routes that only read and write `.pokemap/` files: world placement, conflict acceptance, dungeons and the dungeon auto-layout switch. List the exact routes in the step plan.

```ts
// before, in both files
return readBody(req).then((body) => {
  let parsed: unknown;
  try { parsed = JSON.parse(body); }
  catch (e) { return send(400, { error: `invalid JSON body: ${(e as Error).message}` }); }
  if (!isAcceptConflictBody(parsed)) return send(400, { error: `expected { key: string, accepted: boolean }, got ${body}` });
  // ...
}).catch((e: unknown) => { console.error(e); send(500, { error: e instanceof Error ? e.message : String(e) }); });
// after, once
if (url.pathname === "/api/world/conflicts/accept" && req.method === "POST")
  return jsonBody(req, send, isAcceptConflictBody, "{ key: string, accepted: boolean }", (body) => { /* ... */ });
```

**Acceptance.** Both families' sidecar tests pass with no test edited. A new test mounts `sidecarRoutes` on a bare temp root, which pins that it has no family dependency. The report gives the line count removed from each handler.

---

## Task I: route modules and one session store (R2, R3)

**Finding.** `createProjectHandler` spans `index.ts:119-1420`, and its `handle` function is one if-chain of 1,065 lines (300-1365). `editSessions.ts:31-100` and `gbcEditSessions.ts:41-71` expose the same store shape, `{ open, close, has, dirty, closeAll, entries, root }`, and differ only in how an entry is opened.

- **I1, Tier Medium** (verbatim move; route tests are the oracle): move the read-only GBA routes (map, render, metatile, species, encounters, world, defects, event-options) to `packages/server/src/gbaReadRoutes.ts`.
- **I2, Tier High** (save and discard ownership): move the edit-session routes (paint, event, sign, plan, commit, discard, undo, redo) to `packages/server/src/gbaEditRoutes.ts`, and replace both stores with `createSessionStore<E>(root, openEntry)` in `packages/server/src/sessionStore.ts`. The move commit changes no route body. A behaviour change is a separate commit with its own test.

```ts
// after  packages/server/src/index.ts
const routes = [addEvents.handleOptions, gbaReadRoutes(ctx), gbaEditRoutes(ctx), sidecarRoutes(root, getWorld), blockEditRoutes(ctx)];
for (const route of routes) if (route(req, url, send)) return;
return send(404, { error: "not found" });
```

**Acceptance.** The test count is unchanged and no test is edited. `git diff --stat -M` shows moves. `index.ts` holds context construction and the loop. For I2, a mutation spot check: make the store's `has` always false, and the existing session tests fail in both families.

---

## Task J: JSON content type and one guarded fetch (S5, R6)

**Tier: Medium.**

**Finding.** UI POSTs send JSON with no `content-type` header (`gba/worldSurface.tsx:172,177`, `shared/useEditSessionCore.ts:82` and others). The browser labels them `text/plain`, which a cross-site page may send without a preflight, so the Origin/Host guard is the only cross-site defence. 14 UI files call `fetch` directly and 16 use `fetchGuarded` or `useGuardedFetch`; `if (!r.ok) throw new Error` appears 13 times. `hooks/useDungeons.ts` (97 lines, raw `fetch`, unchecked cast) and `gbc/hooks/useGbcDungeons.ts` (53 lines, guarded) serve one endpoint and return one type. The test-only `createServer` (`index.ts:1426-1430`) has no Origin guard.

**Change, in this order on one branch.**
1. `postJson(path, body, guard?)` beside `fetchGuarded` (`packages/ui/src/hooks/useGuardedFetch.ts:39`); it sets `content-type: application/json`. Move every request that has a body to it.
2. Both families use the guarded dungeons hook; delete the fetch code in `useDungeons.ts` and keep its types.
3. Hub: a non-GET request with a body and a content type other than `application/json` answers 415.
4. `createServer` runs the hub's cross-origin check.

```ts
// before  packages/ui/src/gba/worldSurface.tsx:172
await fetch("/api/world/placement", { method: "POST", body: JSON.stringify({ map, x, y }) });
// after
await postJson("/api/world/placement", { map, x, y });
```

**Acceptance.** The UI suite passes with mocks changed only for the header (list them). Hub test: a `text/plain` body answers 415; a bodyless POST (discard) still answers 200. The report lists every remaining direct `fetch(` in `packages/ui/src` and why it stays. Live check in both families: paint, save, discard, drag a placement.

---

## Task K: small dedupes and dead code (R5, R7, R9, R11, P7)

**Tier: Low** (mechanical). Run K1 and K2 with no other branch open.

- **K1.** Export `errorMessage(e: unknown): string` from core (a private copy is at `write/atomic.ts:20`). Replace the 86 inline copies of `x instanceof Error ? x.message : String(x)` (server 36, ui 33, core 14, cli 3).
- **K2.** One `hex` in `packages/ui/src/shared/format.ts`, upper case, in place of four copies: `components/MetatilePalette.tsx:46` (upper case), `gba/mapSurface.tsx:32`, `gbc/GbcMetatilePalette.tsx:30` and `gbc/mapSurface.tsx:27` (lower case). The same id shows today as `0x1AF` in the GBA palette and `0x1af` in the status strip; after this it is upper case everywhere. Name the tests that pinned lower case in the report. One `isRecord` in place of the three in `packages/ui/src`: `gbc/guards.ts:21`, `world/conflictAcceptance.ts:3` and `hooks/useEditSession.ts:273`.
- **K3.** `addEvent/sources.ts:4-16` reads `process.env.POKEMAP_SUBJECT_SNAPSHOT` on every call to drive a cache that only tests use. Export `setImmutableRoot(root)` and call it once from the vitest setup. Compare the suite's wall time before and after; a slower suite is a finding.
- **K4.** Delete `VERSION` (`packages/core/src/index.ts:1`; no reference anywhere). `TilesetFileEdit` (`blockEdit/types.ts:36`) is not dead: Plan 14.2 Task 8 consumes it.
- **K5.** `CLAUDE.md` and `AGENTS.md` are 37 lines each and differ only on line 5 (the path of the global rules file). Keep one body in `AGENTS.md` with a line 5 that names both paths, and make `CLAUDE.md` the single line `@AGENTS.md`. This one can run now.

---

## Task L: dependency advisories (S6)

`npm audit` on 2026-11-12: 8 advisories (2 critical, 3 high, 3 moderate). All are in the development toolchain; nothing ships to users.

- **L1, Tier Low, can run now.** `npm audit fix` without `--force`. It updates `undici` (through `jsdom`) and `source-map-js`. Lockfile only; gate.
- **L2, Tier Medium, own branch, nothing else in flight.** `vitest` 2.1.9 → 5.x with the matching `vite` and `esbuild`, which clears the rest (`vitest`, `tinypool`, `vite` 5.4.21, `esbuild` 0.21.5, `@vitest/mocker`, `vite-node`). Acceptance: the same test and file counts as RESUME's baseline; the gate's `--maxWorkers=4 --minWorkers=1` flags still work, or their replacement is recorded in the `gate` skill and LESSONS; the `globalSetup` that redirects every test root to a scratch copy (Plan 14.2 Task 0) still does; the UI build passes.

---

## Task M: UI quick fixes (U2, U6, S7)

**Tier: Low.** Live check in both families.

- **M1, reduced motion.** `packages/ui/DESIGN.md:302` says to respect `prefers-reduced-motion`. `styles.css` has 10 transitions, one keyframe animation and no such rule. Add this after the global `:focus-visible` rule (`styles.css:195-198`) and pin it in `styles.test.ts`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; }
}
```

- **M2, palette search label. Can run now.** `packages/ui/src/shared/PaletteFrame.tsx:27`: add `aria-label="Search by hex id"` to the input. This is also the Plan 9F deferred minor "search input has no aria-label" in RESUME.
- **M3, self-hosted fonts.** `styles.css:1` imports IBM Plex Sans and JetBrains Mono from Google Fonts on every launch: a request to a third party, and a blocked first paint when offline. Put the woff2 files and their OFL licence texts in `packages/ui/public/fonts` and declare them with `@font-face` and `font-display: swap`. Live check with the network blocked.

---

## Task N: layout and keyboard access (U1, U3, U4)

**Tier: High** (canvas-core pointer and keyboard behaviour). Run `superpowers:brainstorming` first; these are open design decisions.

- **U1.** `styles.css` has no `@media` rule. The sidebar (280 px, lines 229-230), the rail (272 px, line 2831) and the canvas minimum (`min-width: 480px`, line 239) overflow below 1,032 px. `DESIGN.md:226-236` specifies a 260 px tree that resizes between 240 and 420 px; neither exists. Decide the smallest supported width, how the tree and rail collapse, and whether DESIGN.md or the CSS is right about 260 and 280.
- **U3.** The map editor canvas (`shared/MapCanvasViewport.tsx:28`) has no `tabIndex`, accessible name or key handler. The world canvas has all three (`canvas/WorldSurface.tsx:871-897`). Decide the keyboard model (cell cursor, paint key, pan keys) together with Plan 14A's rectangular selection.
- **U4.** `[data-theme="light"]` (`styles.css:132-169`) cannot be reached; no code sets `data-theme`. Either add a toggle (stored like `shared/useFollowHover.ts` stores its setting) or delete the block and the claim at `DESIGN.md:33`.

---

## Task O: stylesheet tokens and split (U5)

**Tier: Low** for the tokens (mechanical; `styles.test.ts` and a live check), **Medium** for the split. Run it with Task N; both rewrite layout rules.

`styles.css` is one global sheet of 3,231 lines. It has 34 raw `z-index` values (1-12 and 1000) and no scale. The shadow `0 4px 16px rgba(0, 0, 0, 0.4)` is written out at lines 922, 951, 1025, 1063, 1265, 1438 and 1526.

```css
/* before */
box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
/* after */
box-shadow: var(--shadow-popover);
```

Add `--shadow-popover` and a named z-index scale (`--z-overlay`, `--z-popover`, `--z-dialog`, `--z-toast`). Then split the sheet by area (shell, canvas, palette, dialogs, world) and import the parts in the current order.

---

## Task P: tooling and module layout (R8, lint, CI)

**Tier: Medium.**

- **P1.** ESLint with `typescript-eslint` and `react-hooks`, configured so the current code passes. No formatter churn.
- **P2.** A CI job for typecheck, the UI build and the tests that need no subject corpus (the subjects are private or local; see RESUME "Environments").
- **P3.** An `exports` map in `packages/core/package.json`, so imports stop reaching into `@pokemap/core/src/...` (234 imports through 68 deep paths, none through the package root). Then move the GBA-only core and UI folders under `gba/` to mirror `gbc/`. Typecheck is the oracle. Run it between plans with no other branch open.

```ts
// before
import { textFiles } from "@pokemap/core/src/addEvent/sources.js";
// after
import { textFiles } from "@pokemap/core/shared/sources";
```

---

## Folded into other plans, or not planned

- **R4, `paintCells` and `floodFill` written twice** (`packages/core/src/edit/paint.ts:36-87`, `packages/core/src/gbc/edit/paint.ts:23-72`): the first task of roadmap Plan 14A, which builds stamps on painting in both families. One generic version copies only the keys the existing block already has; the GBC file re-exports it, as it already does for `readBlock` and `shiftGrid`.
- **U7, `canvas/WorldSurface.tsx` is 934 lines:** the first task of roadmap Plan 16, which adds the minimap to that surface. Extract the warp fetch, the encounter fetch and the lens overlays as hooks.
- **U8, no `AbortController`:** not planned. The hooks already drop late results and the server is local.
- **P1-P5, Plan 3 and Plan 5 overlap the roadmap:** resolved by roadmap D22; the moved tasks are marked in those plans.
