# PokeMap — Remaining Plan 2 Follow-ups (GBA family)

> **Status (2026-09-25): none of Tasks A-C has started.** Plan 6 (GBC) ran first. Before re-confirming the file:line references below, note:
> - **Cloud sessions can do these now.** The SessionStart hook provisions the GBA corpus (attach the private `itnevres/pokemon-three-region` to the session), and Chromium is available for the live browser verify. The regression gate is RESUME's cloud baseline: 1,271 pass / 6 known local-state deltas.
> - **Base branch.** `master`: Plan 2 and its follow-ups were merged via [itnevres/pokemap#1](https://github.com/itnevres/pokemap/pull/1) on 2026-09-25.
> - **Files touched since.** Plan 6 touched `packages/cli/src/{index,context,args}.ts`, `packages/core/src/load/png.ts` and `packages/core/src/world/connections.ts`, but none of the files these three tasks name.

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`, same rigor as every prior Plan 2 task and its own 6 follow-ups (fresh implementer per task, spec-compliance review, code-quality review, fix loops, live-verify). Read `docs/superpowers/RESUME.md` in full first — it has the real current state and the accumulated lessons this document assumes. These 3 tasks are independent of each other and of Plans 6/7 (the new GBC-family work) — safe to execute in any order, on `master`, no worktree, matching this whole project's established convention.

**Origin:** 3 of the 4 background tasks flagged during Plan 2's own 5 follow-ups (a 4th, "add selected-cell highlight to MetatilePalette," already shipped 2026-09-22/23 as follow-up 6). Each was found live, during a DIFFERENT follow-up's own live-verify, and correctly deferred rather than fixed inline at the time. All three have already been read against real current source once (2026-09-22/23) — **re-confirm nothing has drifted before writing literal step code**, per this project's own standing rule, but each task below already carries real file:line references and a worked design, not just a problem description.

---

## Task A: `GET /plan` permanently disabling the PNG render cache

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

## Suggested order

A → B → C (ascending complexity/risk), independent otherwise — safe to reorder or parallelize across separate sessions if convenient, since none of the three touch overlapping files (A: `server/index.ts` only; B: `core/write/save.ts` only; C: `ui/hooks/useEditSession.ts` + `ui/components/SaveDialog.tsx`).
