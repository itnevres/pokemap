# Plan H task H-b: quality / adversarial review (High tier)

Range 57f9271..b7925b6, branch claude/plan-h-server-8-h-b. I read the code myself: sidecarRoutes.ts, http.ts jsonBody/readBody/decodeSegment, both mount sites and their enclosing try/catch, core sidecar.ts and dungeons.ts (read/write), conflictAcceptance.isAcceptConflictBody, sidecarRoutes.test.ts, the new gbcRoutes.test.ts `it`, and the pre-change code from the 57f9271 diff. I did not read earlier reviews.

## Verdict

No Critical or Important defects. The move preserves behavior: route set, method/path matching, ordering relative to neighbors, laziness, and error ownership all match. Where behavior changed, it changed on purpose and for the better:
- GBA `null` bodies on /api/world/dungeons and /api/dungeons POST/PATCH now get a 400. Before, `null.enabled` threw a TypeError inside the chain, which the old .catch turned into a 500.
- GBC gained the placement known-map check.
- GBA's malformed-dungeon-id text changed.

What is left is four Minor test-strength gaps and two pre-existing observations.

## Checks re-derived (all OK)

1. **Prototype pollution / `__proto__` / `constructor`.** Only one body field becomes a property key: `placement.map` in `sidecar.manualPlacements[placement.map]` (sidecarRoutes.ts:136). It is gated by `knownMap` (line 132). GBA uses `Array.prototype.includes` on real names and GBC uses `Set.has`, so neither answers true for `__proto__`, `constructor` or `toString`. JSON.parse makes `__proto__` an own data property, never the prototype. So `{"__proto__":{"name":"x"}}` sent to /api/dungeons leaves `input.name` undefined and gets a 400. `readSidecar`/`readDungeons` spread with `{...DEFAULTS, ...parsed}`, which defines properties rather than setting them, so a `__proto__` key on disk cannot pollute either. Dungeon `name`/`maps`/`seedMap` only ever become values (array elements, string fields), never keys. The `id` is a `randomUUID()` value and is only compared.
2. **Path containment.** No body field or path segment reaches a filesystem path. Writes go to `projectPaths(root).sidecar` / `.dungeons`, and `root` is fixed at mount (GBA `project.paths.root`, GBC `proj.root`, the same values as before).
3. **Hung requests / double send.** Every jsonBody handler path ends in exactly one `send`: the 404/400 early returns, and the final `send(200)` as the last statement (PATCH 404 at :223 does `send; return`). jsonBody's `.catch` covers throws from readSidecar/readDungeons (the I7 refusal), writeSidecar/writeDungeons, getWorld, and expandSeed, and answers 500. Nothing runs after any `send`, so the catch can never send a second time. The sync paths (GET at :163, DELETE at :206-212, the malformed-id 400 at :204) each send once and return true.
4. **Sync throws.** GET and DELETE call readDungeons synchronously. A corrupt dungeons.json throws into the caller: GBA index.ts:756 sits inside the try opened at index.ts:364, and GBC gbcRoutes.ts:534 sits inside the try at :406 (catch at :617). Both answer 500, the same as before.
5. **Unhandled rejections.** The routes ignore jsonBody's promise. It has a terminal `.catch` that only calls `send`. `handle` returned `void` before, and hub.ts:357 ignores its return value, so the old `return readBody(...)` promise was already discarded. No change.
6. **Laziness.** `sidecarRoutes(deps)` only destructures at :95. `getWorld` is called only inside the accept handler (:107). GBA passes `getWorld` (index.ts:131-139). GBC passes `getWorld` (defined at gbcRoutes.ts:317, before the mount at :371, so there is no TDZ). `getWarps` and `mapNames` are captured in closures and not evaluated at mount.
7. **Method/path matching.**
   - `/api/dungeons/` does not match `^/api/dungeons/(.+)$` and falls through, as before.
   - `/api/dungeons/a/b` matches with id `a/b`, as before. It gets a 404 on lookup.
   - `GET /api/dungeons/x`, `PUT /api/dungeons`, `GET /api/world/placement` and similar all return false and fall through, the same as the old method-guarded ifs.
   - `/api/dungeonsx` falls through.
   - GBA: the seven old blocks were contiguous and the mount replaces them in place.
   - GBC: the four dungeon routes moved ahead of `/api/warps/(.+)`. The two paths are disjoint and `GBA_ONLY_ROUTE_RE` is `/^\/api\/sign\//`, so the reordering is neutral.
8. **%-escape.** `decodeSegment` runs before the method split and covers both PATCH and DELETE. The 400 quotes the raw segment.
9. **Concurrency.** readSidecar/writeSidecar and readDungeons/writeDungeons are fully synchronous (readFileSync/writeFileSync), and each read-modify-write runs in one `.then` callback with no await in between. On Node's single thread, two concurrent requests' read-modify-writes cannot interleave: the last writer wins on the field it touched, and the other field survives because each re-reads. The old code behaved the same way, and the move changes nothing here. Writes are not atomic on a crash, but that is pre-existing in core.
10. **jsonBody signature change.** `handler(body, text)` is additive. The only callers are the five in sidecarRoutes.ts, and one-argument handlers stay compatible.
11. **Body size.** readBody's 16 MiB cap still applies and returns 413. GBC's `refuseOversize` pre-check is still in place at gbcRoutes.ts:401.

## Mutation reasoning on the new tests (by hand, not run)

Each of these is killed:
- Removing `.sort()` at :184 (EXPANDED is deliberately unsorted).
- Removing `Number.isFinite` (1e999 would write and return 200).
- Removing the `knownMap` check at :132 (`__proto__` and NoSuchMap would get a 200; the GBC `it` also gets a 200, and on a fresh root it creates world.json).
- Removing the `null` check in isObjectBody (TypeError, then 500 instead of 400).
- Removing `Array.isArray` in isObjectBody for /api/dungeons (`[]` reaches the name check with different text).
- Removing jsonBody's `.catch` (the corrupted-world.json test hangs and times out at 10 s).
- Calling `getWorld` at mount (`worldCalls` would not be 0).
- Swapping autoLayoutReply (sidecarRoutes test plus world.test.ts `{ok:true}`).
- Turning PATCH into a full replacement (the partial-PATCH test).

The survivors are the Minor findings below.

## Findings

### Minor 1: method guards and path ownership are not pinned negatively
sidecarRoutes.ts:100, :118, :147, :162, :167, :199. Mutation: drop `&& req.method === "POST"` from the placement route (:118), or widen :199 to any method. Then `GET /api/world/placement` gets a 400 `invalid JSON body` (empty body) instead of falling through to the family 404, and `GET /api/dungeons/x` starts reading a body. No test in sidecarRoutes.test.ts, dungeons.test.ts or gbcRoutes.test.ts sends a non-owned method to an owned path, so every such mutation survives. The only "returns false" tests use `/api/world` and `/api/dungeonsx`. Suggested fix: one `it.each` of `[GET /api/world/placement, GET /api/world/conflicts/accept, GET /api/world/dungeons, PUT /api/dungeons, GET /api/dungeons/x, PATCH /api/dungeons/]`, each expecting the harness's own 404 `{error:"not found"}`.

### Minor 2: decoded id vs raw id is not distinguished by any test
sidecarRoutes.ts:208 and :222. Mutation: compare `d.id !== rawId` instead of `id`. It survives because every test id is a UUID or a bare word with no escapes. This only fails in practice if an id ever contains a character that `encodeURIComponent` escapes. Real ids are UUIDs, but both UIs do encode (useDungeons.ts:67, useGbcDungeons.ts:42), so the decode is load-bearing in principle. Suggested fix: seed dungeons.json with id `a b` and PATCH or DELETE `/api/dungeons/a%20b`.

### Minor 3: sync-throw paths (GET and DELETE on a corrupt dungeons.json) have no test
sidecarRoutes.ts:163 and :206. These rely on the caller's try/catch, which is correct at both mounts today. But sidecarRoutes.test.ts's harness (lines 46-51) has no try/catch, so that contract is undocumented by any test. If a future refactor moved the mount outside the try, a corrupt dungeons.json would make `GET /api/dungeons` an uncaught exception in the request listener, which crashes the process, and nothing would catch it. Either test a corrupt file through a real family handler (500 expected), or add a line to the module doc stating that sync throws from GET/DELETE are the caller's to catch.

### Minor 4: the GBC mount's laziness is pinned only through the stub
The stub test (sidecarRoutes.test.ts:222) proves the module never calls getWorld at construction. It cannot catch a mount-site regression such as `getWorld: () => world` with `world` built eagerly in gbcRoutes.ts. That mistake would rebuild nothing but would cost a world build on every project open. It is statically fine today (gbcRoutes.ts:373 passes the function), so this is a test gap only.

### Observation (pre-existing, not introduced): dungeon `maps` are not known-map-checked
sidecarRoutes.ts:186 and :225. Explicit `maps` on POST and PATCH accept any strings, including `__proto__` or names that do not exist, and persist them into dungeons.json as array values. This is not a pollution vector because they are values, not keys. It is mentioned only because H-b's theme is "known-map check at the boundary" and placement now has the check while these do not. It behaves identically to the pre-change code in both families, so out of scope unless the spec says otherwise.

### Observation (pre-existing): in-flight write after dispose
`handle` checks `disposed` only at request entry (gbcRoutes.ts:397; GBA is analogous). A POST whose body is still arriving when the hub switches projects will still run its read-modify-write against the old root after `dispose()`. This is unchanged by H-b: the old inline copies had the same shape.

### Note on the behavior change (intended, verified harmless)
GBA PATCH/DELETE with a malformed id used to return `"malformed percent-escape in path"` and now returns `"malformed dungeon id <raw>"`. No test or UI code reads the old text for the dungeon routes. api.test.ts:471 pins the old text only for other GBA routes, which are untouched. GBA dungeon routes now differ in wording from the rest of GBA's decode sites. This is the stated H-b unification choice, not a defect.

## Not done
I did not run vitest or mutations; per the brief, all mutation results above are reasoned by hand. Tool budget: about 16 calls.
