Reviewer: Nemotron 3 Ultra via `ask.py` (free tier first). Same inputs as the spec review. Conductor 12 rulings below.

## Conductor rulings

- Q1 GBC edit-session bypass: rejected. `const sessionBlocks = edit.openBlocks(name); if (sessionBlocks) { ... }` still precedes
  `cachedRender` in the route (unchanged context).
- Q2 test (b) flakiness: kept. Six real renders (tens of ms each) against one localhost round trip; mutation M1 (no yield) turns it
  red, and it passed in the focused runs and the full gate.
- Q3 lines over 140: fixed (hub log helper `logWarmUp` wraps the line; test (b) names list hoisted to `SIX`).
- Q4 CRLF: rejected. All six files have 0 bare LF (checked); the diff tool shows LF.
- Q5 `.catch()` on the hub's fire-and-forget: fixed in `logWarmUp`.
- Q6 concurrent `warmUp()` guard: rejected (YAGNI). The hub calls it once per handler; a second loop would only skip cached keys.
- Q7 shared GBA/GBC factory: rejected. The two differ in key, world source, skip check and hidden types; a factory with five
  options would be longer than the two bodies.
- Q8 comment path: fixed (`packages/ui/src/world/visibility.ts`).
- Q9 second `syncBuiltinESMExports()`: rejected; it publishes the restored functions after `mockRestore` (api.test.ts pattern).
- Q10 Set per warm-up: rejected (once per project open).

Verdict after rulings: **Approved** (three fixes applied).

## Reviewer report (verbatim)

# Code Quality Review: Task 9a Hub World-Tile Pre-Warm

**Verdict: Approved with fixes**

---

## Critical

### 1. GBC render route edit-session bypass — verify preservation
**File:** `packages/server/src/gbcRoutes.ts` (render route, lines not shown in diff)  
The diff replaces only the cache/render block (lines 435–446 old) with a `cachedRender` call. The edit-session bypass (`if (edit.openBlocks(name)) …`) must exist *before* that block in the unchanged context. If it was removed or never existed, a map with an open GBC edit session would be served from cache instead of the live session — a silent data-corruption bug.  
**Failure scenario:** User opens edit session on `Route30`, makes changes, then requests `/api/render/Route30.png?time=day` — receives stale cached tile instead of live edit preview.

### 2. Test (b) integration — timing assumption / flakiness
**File:** `packages/server/test/warmUp.test.ts` (GBA line ~108, GBC line ~288)  
```ts
const warm = fresh.warmUp([...]).then((r) => { warmDone = true; return r; });
const project = await fetch(`${base}/api/project`);
expect(warmDone).toBe(false);   // assumes warm-up hasn't finished
```
On a fast machine / warm cache (fresh handler but maps may render in <1 ms each), the 6-map warm-up could complete before the HTTP round-trip, making `warmDone` true and the test red.  
**Fix:** Await a “first yield” signal from the warm-up (e.g., a counter incremented in `warmOne` after the first map) before issuing the request, or assert only that the request *succeeds* (200) without depending on `warmDone`.

---

## Important

### 3. Lines exceed 140 characters (brief violation)
**File:** `packages/server/test/warmUp.test.ts` — multiple lines  
Examples (GBA test (c), GBC test (c)):
```ts
await fetch(`${base}/api/edit/Route102/paint/apply`, { method: "POST", body: JSON.stringify({ tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 42 }] }, origin: { x: 0, y: 0 } }) });
```
**Fix:** Break into multiple lines or extract the body object.

### 4. CRLF line endings not preserved in diff
**Files:** All new/modified files in diff show LF endings.  
Brief: “Files are CRLF: keep CRLF line endings.”  
**Fix:** Ensure editor/git writes CRLF (`git config core.autocrlf true` or editor setting).

### 5. Hub fire-and-forget `warmUp()` lacks `.catch()`
**File:** `packages/server/src/hub.ts` lines 273, 309  
```ts
void next.warmUp().then((r) => console.log(...));   // no .catch()
```
`warmEach` never rejects, but a future change could introduce a rejection → unhandled rejection.  
**Fix:** Append `.catch(e => console.error('pokemap warm: ', e))`.

### 6. No guard against concurrent `warmUp()` calls
**Files:** `packages/server/src/index.ts` (GBA `warmUp`), `packages/server/src/gbcRoutes.ts` (GBC `warmUp`)  
Calling `warmUp()` twice on the same handler runs two independent loops concurrently — duplicate renders, double cache writes, confused `stopped()` checks.  
**Failure scenario:** A buggy client or test calls `handler.warmUp()` twice; both loops run, each map rendered twice.  
**Fix:** Add a `warming` flag; if already warming, return the existing promise or reject.

### 7. Duplication between GBA/GBC `warmUp` implementations
**Files:** `packages/server/src/index.ts` (lines 1341–1388), `packages/server/src/gbcRoutes.ts` (lines 748–782)  
~40 lines of near-identical structure (default-list promise, `warmEach` call, skip logic). Only key format, world-builder, edit-session check, and hidden-type set differ.  
**Fix:** Extract a shared `buildWarmUp(handler, opts)` factory (opts: `cache`, `keyFn`, `editCheck`, `hiddenTypes`, `worldBuilder`, `renderFn`).

---

## Minor

### 8. Comment path inaccuracy
**File:** `packages/server/src/index.ts` line 1355  
```ts
// The UI's isDrawnByDefault rule (ui/src/world/visibility.ts HIDDEN_MAP_TYPES) …
```
Actual path: `packages/ui/src/world/visibility.ts`.  
**Fix:** Use repo-relative path.

### 9. `syncBuiltinESMExports()` called twice in test (g)
**File:** `packages/server/test/warmUp.test.ts` lines 200, 210 (GBA) and 380, 390 (GBC)  
```ts
syncBuiltinESMExports();
// … test …
syncBuiltinESMExports();
```
Second call unnecessary (restores already-restored builtins). Harmless but noisy.

### 10. GBA `known = new Set(project.mapNames())` — array→Set every warm-up
**File:** `packages/server/src/index.ts` line 1358  
`project.mapNames()` returns `string[]`; converting to `Set` on each warm-up call. Trivial cost, but `project.mapNames()` is stable — could cache the Set.

---

## P12-4w Requirements Checklist

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Background after project opens (startup + hub swap) | ✅ | `hub.ts` lines 270–273, 306–309 |
| One map at a time with yield (`setImmediate`) | ✅ | `warmUp.ts` lines 22–35 |
| Never delays/reorders client request beyond one map render | ✅ | Yield *before* each map; render is synchronous |
| Skips maps with live edit session | ✅ | GBA: `editSessions.has(name)`; GBC: `edit.openBlocks(name)` |
| Stops on `dispose()` | ✅ | `stopped = () => disposed` |
| Never writes to disk | ✅ | Test (g) verifies; `cachedRender` only memory cache |
| Each map renders + caches in one synchronous step | ✅ | `cachedRender` does `render → cache.set → return` atomically |
| Fills exactly the URLs/cache keys the world canvas requests | ✅ | GBA key `name:0` matches `/api/render/<map>.png`; GBC key `name:0:day` matches `?time=day` |
| Drawn-by-default rule per family | ✅ | GBA: `MAP_TYPE_INDOOR`/`MAP_TYPE_NONE` hidden unless manual; GBC: `INDOOR`/`GATE` hidden unless manual |

---

## Tests (a)–(g) per Family

| Test | GBA | GBC | Vacuous? | Notes |
|------|-----|-----|----------|-------|
| (a) Cache hit after warm-up | ✅ | ✅ | No | Counter unchanged |
| (b) Yield between maps + interleaved request | ✅ | ✅ | Integration `warmDone` timing-dependent (see Critical #2) |
| (c) Edit session skipped, renders after discard | ✅ | ✅ | No | Dirty session → skip → discard → render |
| (d) `dispose()` stops before first yield | ✅ | ✅ | No | Fresh handler, dispose sync, 0 renders |
| (e) Render+cache atomic (P12-4w) | ✅ | ✅ | No | Request from inside render sees cache |
| (f) Unknown map fails, continues | ✅ | ✅ | No | `failed: 1`, others rendered |
| (g) No disk writes | ✅ | ✅ | No | `fs` spies, `syncBuiltinESMExports` |

---

## Behavior Change for Existing Routes

| Route | Same 404s? | Same keys? | Edit-session bypass preserved? |
|-------|------------|------------|--------------------------------|
| GBA `/api/render` | ✅ (`cachedRender` returns `undefined` → 404) | ✅ `name:border` | ✅ (block before `cachedRender` call, unchanged in diff) |
| GBC `/api/render` | ✅ (`cachedRender` returns `undefined` → 404) | ✅ `name:border:time` | **Unverified** — diff context doesn’t show the bypass; must confirm it exists above line 435 |

---

## Plan / Brief Items Not Done

1. **Live measurement (Plan Step 4)** — Conductor report: “Pending”.
2. **CRLF line endings** — Diff shows LF; brief requires CRLF.
3. **Line-length limit (140 chars)** — Violated in test file.

---

## Summary of Required Fixes

1. **Verify/restore GBC render route edit-session bypass** (Critical).
2. **Make test (b) integration non-flaky** (Critical).
3. **Wrap all lines to ≤140 chars** (Important).
4. **Ensure CRLF line endings** (Important).
5. **Add `.catch()` to hub’s `warmUp()` calls** (Important).
6. **Guard against concurrent `warmUp()` calls** (Important).
7. **Deduplicate GBA/GBC warm-up logic** (Important, optional).
8. **Fix comment path** (Minor).
9. **Remove redundant `syncBuiltinESMExports()`** (Minor).
