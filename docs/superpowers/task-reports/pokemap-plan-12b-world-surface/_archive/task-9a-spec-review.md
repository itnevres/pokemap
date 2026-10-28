Reviewer: Nemotron 3 Ultra via `ask.py` (free tier first, user 2026-10-27). Inputs: plan Task 9a, spec P12-4w, brief, report,
full diff, both UI adapters. No repo access; conductor 12 checked every finding against the code.

## Conductor rulings

- C1 "GBC render route loses 404": rejected. The route returns 404 earlier, `if (!mapNames.has(name)) return send(404, ...)`,
  unchanged context above the hunk; the `!` comment says so.
- C2 "GBA buildWorld ~4 s blocks requests in the first turn": measured live, not a defect. Hub listening at 0.75 s, warm-up done
  at 4.7 s with the tile loop itself 3.8 s, so the world list build (world, sidecar, placements) took ~0.14 s on this PC. The
  report's known-ceiling note stands and now carries the number.
- I3 GBC payload not cached: rejected. `getWorld()` and `getWarps()` are the cached parts (2.8 s cold); the payload builder is
  a few ms and the route builds it per request today.
- I4 test (e) calls `handle` directly: kept on purpose. A direct synchronous call is the only way to land exactly between two
  maps; mutations M6/M7 (insert deferred one turn) turn it red.
- I5 no hub-swap test: covered by (d) (`dispose()` is what a swap calls, hub.ts) plus the live runs; hub prewarm is off in hub tests.
- M6 Map order, M7 (b) timing: M7 answered in the quality review rulings (Q2). M6 no change. M8 compliant.
- "Not done": gate and live are now done (report).

Verdict after rulings: **Approved**.

## Reviewer report (verbatim)

# SPEC-COMPLIANCE Review: Task 9a Hub World-Tile Pre-warm (P12-4w)

## Verdict: **Needs rework**

---

## Critical Findings

### 1. GBC render route loses 404 behavior for unknown maps
**File:** `packages/server/src/gbcRoutes.ts:450`  
**Diff lines:**  
```typescript
const png = cachedRender(name, border, time)!; // membership checked above (404)
res.writeHead(200, { "content-type": "image/png", "cache-control": "no-cache" });
return res.end(png);
```
**Failure scenario:** A client requests `/api/render/NonExistentMap.png?time=day`. `cachedRender` returns `undefined` (since `mapNames.has("NonExistentMap")` is false). The non-null assertion `!` throws a TypeError, resulting in a 500 Internal Server Error instead of the expected 404. The GBA route (index.ts:420) correctly checks `if (!png) return send(404, ...)`. The GBC route must do the same. The comment "membership checked above (404)" is misleading—no such check exists in the visible diff hunk, and the GBA route doesn't have one either; it relies on `cachedRender` returning `undefined`.

---

### 2. GBA `buildWorld` (~4 s) runs synchronously in warm-up's first yield, blocking all requests
**File:** `packages/server/src/index.ts:1348–1370`  
**Diff lines:**  
```typescript
const nameList = names ?? await new Promise<string[]>((resolve) => {
  setImmediate(() => {
    // ...
    const world = getWorld();  // <-- buildWorld() executes here synchronously
    // ...
  });
});
```
**Failure scenario:** A cold hub starts; `warmUp()` is called. Before the first map render, the first `setImmediate` callback runs `getWorld()`, which invokes `buildWorld()` synchronously for ~4 s. Any client request (e.g., `/api/project`, `/api/render/...`) arriving during this window is queued behind the 4 s synchronous block. The spec requires "never delays or reorders a client request beyond one map render" and explicitly asks to "name any longer synchronous step". This 4 s step is that violation. The report acknowledges it as a "known ceiling" but the spec does not exempt it.

---

## Important Findings

### 3. GBC warm-up computes world payload but does not cache it, unlike GBA
**File:** `packages/server/src/gbcRoutes.ts:758–770` (warmUp default list)  
**Diff lines:**  
```typescript
const payload = buildGbcWorldPayload(proj, getWorld(), readSidecar(proj.root), getWarps());
// ...
for (const [name, p] of Object.entries(payload.placements)) { ... }
```
**Failure scenario:** The brief states this "also warms world and warps, which cost most of the 2.8 s". However, `buildGbcWorldPayload` is not cached—the `/api/world` route will recompute it on first request. GBA caches `worldCache` via `getWorld()`. The 1–7 ms cost is small, but the asymmetry is unintended per the brief's "families act the same" preference.

---

### 4. Test (e) uses direct handler invocation instead of HTTP round-trip
**File:** `packages/server/test/warmUp.test.ts:200–215` (GBA), `352–375` (GBC)  
**Diff lines:**  
```typescript
setImmediate(() => fresh.handle(
  { url: "/api/render/PetalburgCity.png", method: "GET", headers: {} } as never,
  { writeHead: () => undefined, end: () => undefined, setHeader: () => undefined } as never,
));
```
**Failure scenario:** The test verifies the cache is populated before the next `setImmediate` by calling `handler.handle` directly (synchronous). A real HTTP request would go through the server's event loop and could expose timing differences (e.g., if `cachedRender` were accidentally async). The brief's alternative—spying that the cache holds the key synchronously when `warmOne` returns—would be a stronger contract test. The current test passes but is less realistic.

---

### 5. No test for hub swap stopping the *old* handler's warm-up loop
**File:** `packages/server/test/warmUp.test.ts` (missing)  
**Failure scenario:** A project is open, warm-up is running. User switches projects via `/api/hub/open`. The old handler's `dispose()` is called (hub.ts:303), which sets `disposed = true`. The old warm-up should stop at its next yield. Test (d) covers `dispose()` before first yield, but not mid-loop during a hub swap. The hub integration test (`hub.test.ts`) is not updated to verify this.

---

## Minor Findings

### 6. GBA warm-up default list iteration order is non-deterministic
**File:** `packages/server/src/index.ts:1362`  
**Diff lines:**  
```typescript
for (const name of merged.keys()) { ... }
```
`merged` is a `Map` from `resolveWorldPlacements`. `Map.keys()` yields insertion order, which depends on `buildWorld`'s internal traversal. Not a spec violation (no order required), but makes warm-up logs non-reproducible.

---

### 7. Test (b) integration check `expect(warmDone).toBe(false)` is a weak interleaving proof
**File:** `packages/server/test/warmUp.test.ts:120` (GBA), `310` (GBC)  
**Diff lines:**  
```typescript
const project = await fetch(`${base}/api/project`);
expect(project.status).toBe(200);
expect(warmDone).toBe(false);  // only proves warm-up not *finished*
```
**Failure scenario:** If the warm-up rendered all 6 maps in <1 ms (e.g., mocked renders), `warmDone` could become true before the fetch resolves, making the test flaky. It doesn't prove the request was handled *during* the warm-up, only that the warm-up wasn't complete when the response arrived. A stronger check would record the order of render calls vs. request handling.

---

### 8. `warmUp.ts` logs every failure with `console.warn`; spec says "no console spam beyond one warn per failure"
**File:** `packages/server/src/warmUp.ts:33`  
**Diff lines:**  
```typescript
console.warn(`pokemap warm: ${name}: ${e instanceof Error ? e.message : String(e)}`);
```
Compliant—one warn per failed map. No issue.

---

## Plan / Brief Items Not Done

| Item | Status |
|------|--------|
| Plan Step 4: Live measurement (cold hub warm-up duration, World open during warm-up) | **Not done** — report marks "Pending" |
| Brief: "Gate" (separate spec and quality reviews) | **Not done** — report marks "Pending" |
| Brief: "Report unrelated bugs instead of fixing them" | N/A — no unrelated bugs reported in diff |

---

## Summary of Required Fixes

1. **GBC render route:** Add `if (!png) return send(404, { error: \`no map ${name}\` });` after `cachedRender` call (match GBA).
2. **GBA warm-up:** Move `buildWorld`/`getWorld` off the critical path (e.g., compute default list asynchronously, or accept the 4 s delay as a documented exception with a spec amendment).
3. **Add hub-swap warm-up stop test** in `warmUp.test.ts` (or `hub.test.ts`).
4. **Consider caching GBC world payload** if parity with GBA is desired (brief says "families act the same").

---

## Test Mutations Validated (from report)

All 10 mutations (M1–M10) correctly turn tests red. This confirms tests (a)–(g) are not vacuous for the properties they cover.

---

## Final Note

The implementation satisfies the structural requirements (background loop, yield per map, edit-session skip, dispose stop, no disk writes, single-step render+cache, correct cache keys, drawn-by-default rules). The two Critical issues—GBC 404 regression and GBA 4 s synchronous block—must be fixed before approval.
