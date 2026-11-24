# H-b combined review (spec + quality)

Verdict: PASS with 1 Important (dropped rationale comment, brief violation) and a handful of Minors. No Critical. Behaviour is preserved route by route except the allowed changes. Line refs are diff-file lines (hb.diff).

Method: diff text, brief, `git show 57f9271:` for the pre-change sources, `git show HEAD:` for current index.ts/gbcRoutes.ts import/usage greps, and HEAD blobs of http.test.ts / dungeons.test.ts / world.test.ts / api.test.ts for neighbour-test context. No working-tree source read. No tests run.

## 1. Behaviour preserved route by route

| Route | Old (GBA / GBC) | New (sidecarRoutes.ts) | Result |
|---|---|---|---|
| POST conflicts/accept | both: parse -> `isAcceptConflictBody` 400 `expected { key: string, accepted: boolean }, got <body>` -> 404 `unknown conflict key <k>` -> readSidecar/update/write -> 200 `{acceptedConflicts}`; 413/500 | diff 618-634: jsonBody with `"{ key: string, accepted: boolean }"` yields the identical string; same order, same 404/200 | met |
| POST placement | shape 400 `expected { map: string, x: number, y: number }, got <body>`; GBA then `unknown map` 400 (diff 363-365); GBC had none | diff 636-656: `isPlacementBody` (object, non-array, string map, finite numbers x/y) then `knownMap` then write, 200 `{ok:true}` | met; GBC gains the check (Allowed #1) |
| POST world/dungeons | shape 400 `expected { enabled: boolean }, got <body>`; GBA 200 `{ok:true}` / GBC 200 `{dungeonAutoLayout}` | diff 659-668: `isDungeonLayoutBody`, `autoLayoutReply(sidecar.dungeonAutoLayout)` | met. GBA `null` 500 -> 400 (Allowed #2). Arrays: both old impls and new answer the same 400 text (`[].enabled` is undefined), so no change |
| GET /api/dungeons | `send(200, readDungeons(root).dungeons)` | diff 674-677: same, sync, `return true` | met; sync throw still propagates to caller's try/catch (see below) |
| POST /api/dungeons | GBC order: object guard (400 `expected a dungeon object, got <body>`), name, seedMap type, maps type, seed known (400 `seedMap X is not a known map`), `[...expand].sort()`, create with randomUUID, 200 dungeon. GBA had no object guard (null -> 500, array -> name 400) | diff 679-708: identical order and texts. The object-guard text comes out of jsonBody's `expected ${shapeText}, got ${text}` with shapeText `a dungeon object` -> `expected a dungeon object, got <body>` (matches byte for byte) | met; GBA array now `expected a dungeon object` instead of the name error (covered by Allowed #2 "stricter GBC guard") |
| PATCH /api/dungeons/<id> | decodeSegment first (before body read), then object guard, name check, maps check, read, find (404 `no dungeon <id>`), apply, write, 200 dungeon | diff 710-742 same order; the 404 is `send(...); return;` inside the handler, no write | met; malformed-id text now GBC's `malformed dungeon id <raw>` (Allowed #2) |
| DELETE | decode, read, filter, 404 `no dungeon <id>`, write, 200 `{ok:true}` | diff 717-725 same | met |

Sync-throw handling: both mounts are `if (sidecar(req, url, send)) return;` at the exact spot of the first old route, inside the same try block in GBA (try at old index.ts:352, routes at 739+ lie inside it) and in GBC's handler dispatch. GET, DELETE, the decode and the PATCH decode all run synchronously inside `sidecar(...)`, so a `readDungeons` throw still reaches the caller's own try/catch exactly as before. Body-reading routes are async and caught by jsonBody's own `.catch` (413 / console.error + 500). The discarded promise is safe because jsonBody never rejects (its catch swallows everything except a throw from `send` itself, which was equally true of the old `.catch`).

Mount position / order:
- GBA: contiguous block (old index.ts 739-928), mount replaces it. Order relative to `/api/world` (before) and the paint-stroke routes (after) unchanged.
- GBC: old order was `/api/world`, accept, world/dungeons, placement, **warps**, dungeons GET/POST/id, encounters. New order is `/api/world`, sidecar (all seven), warps, encounters. The three world/* routes keep position; the four dungeon routes move ahead of `/api/warps/(.+)`. No overlap between `/api/warps/*` and `/api/dungeons*`, and `GBA_ONLY_ROUTE_RE` / `edit.handle` run later in both, so the reorder is behaviour-neutral. It is not mentioned in the mount comment (gbcRoutes diff 148-153 says "where the first of them used to sit" which is true only for the first). Minor, comment only.
- Non-owned paths fall through: other methods on /api/dungeons, GET /api/dungeons/<id>, /api/dungeons/ (no id) all return false as before.

Lazy getWorld (GBC): `getWorld` is a const arrow at gbcRoutes.ts:317 and passed by reference in the deps object (diff 60-66); `sidecarRoutes` only destructures deps and calls `getWorld()` inside the accept handler (diff 625). Not built at mount. Met in code. See test gap T2.

## 2. Only the allowed behaviour changes differ

Yes. Changes found: GBC placement known-map (#1); `null` -> 400 for world/dungeons, dungeon POST/PATCH (#2); array POST body message (#2, via the stricter guard); malformed-id text (#2); `knownMap` for GBC Set vs array (#3). Nothing else differs. jsonBody now sends `expected ${shapeText}, got ${text}` for the object guard, same as the hand-written copies.

## 3. Rationale comments (compare removed vs kept)

Kept (reworded where noted): "runs after the try/catch" (accept: diff 619-623; placement 637-640; dungeons route 660 as "Same reason as the two routes above"); `__proto__` explanation (diff 642-646, trimmed to the same content); null/array/`1e999` guard explanation (moved onto `isPlacementBody`, 581-586); "The world payload is rebuilt from the sidecar on every request..." (658); Feature C dungeon-sidecar comment (670-673).

Dropped / degraded:
1. **[Important, brief violation "move, never drop"]** The `/api/world/dungeons` rationale was dropped (old index.ts, diff 383-388): "Review fix: the dungeon-layout switch (packages/ui's WorldCanvas) only ever changed the query string used for its own next fetch -- nothing persisted sidecar.dungeonAutoLayout, so a reload silently discarded it. Mirrors /api/world/placement's own shape exactly...". It explains why the route exists. Failure scenario: a later cleanup sees a route that only flips a sidecar boolean and has no history of why persistence matters, and removes or breaks the reload behaviour. Fix: re-add that paragraph above the route in sidecarRoutes.ts (minus the "mirrors ... outer .catch" tail, which jsonBody now obviates).
2. [Minor] The "known-map check is GBA's addition" comment (diff 642) is now stale: it is shared. Reword to "GBA's guard, shared since H-b". The gbcRoutes.ts:561-565 line cross-reference was dropped (fine, stale anyway).
3. [Minor] Old placement rationale listed "bad JSON, wrong shape" as throw examples; the new one lists only the I7 refusal. Harmless since jsonBody now owns those.
4. [Minor] sidecarRoutes.ts header (diff 534-551) claims the two copies "differed only in three places". That was not true before H-b (guards, placement known-map, malformed-id text also differed). Say "three injected deps; plus the guard unifications listed in the plan".

## 4. Wrappers and unused imports

- No pass-through wrappers. `knownMap: (name) => mapNames.has(name)` and the other dep lambdas are the brief's dep shape and add the Set/array adaptation. `isObjectBody` / `isPlacementBody` / `isDungeonLayoutBody` are real guards.
- index.ts: removed `writeSidecar`, `conflictKey`, `isAcceptConflictBody`, `updatedAcceptedConflicts`, `readDungeons`, `writeDungeons`. Remaining imports verified used at HEAD: `readSidecar` (704, 1389), `wireConflicts` (745), `randomUUID` (218), `BodyTooLarge`/`readBody`/`decodeSegment` (many), `warpConnectedMapsFrom` (141 mount). No unused import.
- gbcRoutes.ts: removed `readDungeons`, `writeDungeons`, `randomUUID`, `writeSidecar`, `conflictKey`, `isAcceptConflictBody`, `updatedAcceptedConflicts`, `BodyTooLarge`, `readBody`. At HEAD there are zero remaining uses of any of them in gbcRoutes.ts; `Sidecar`, `applySidecar`, `readSidecar`, `wireConflicts`, `decodeSegment`, `gbcWarpConnectedMapsFrom` all still used. Clean.
- [Minor] index.ts naming: the new outer `const sidecar` (diff 301) is shadowed by block-scoped `const sidecar = readSidecar(...)` at HEAD index.ts:704 and 1389 (both inside inner blocks, mount at 756 is at outer scope, so no TDZ or behaviour issue). Shadowing is a readability trap; rename the mount to `sidecarRoute` (or similar) in both files.

## 5. jsonBody change

`handler: (body: T, text: string) => unknown` with `handler(parsed, text)` (http.ts diff 253-271). Backward compatible: a one-argument handler ignores the extra arg. Existing callers in http.test.ts (HEAD:191, 245) use `(b) => ...` lambdas and `sendJson`, no `toHaveBeenCalledWith` on the handler. Doc comment updated. No separate test for the new second argument in http.test.ts (indirectly covered by the raw-body texts in sidecarRoutes.test.ts); acceptable.

## 6. Tests

What pins well (would fail on regression): sorted seed expansion (unsorted stub list, diff 818-819, 903); unknown seedMap no write and no expandSeed call (907-913); null/array dungeon body raw text (922-931) and PATCH (1075-1087); placement table with exact texts and no-write assertion, including `__proto__` and `1e999` x (977-1007: a removed knownMap would create `world.json`, failing `existsSync`); malformed id on both PATCH and DELETE (957-963); unknown-key accept no-write (965-975); 413 and invalid JSON (1026-1037); `autoLayoutReply` result and persistence (default is `true` per sidecar.ts:15, so `enabled:false` genuinely proves the write, 1009-1014); "false and sends nothing" (1039-1045); bare mount with no family import (the file imports no createServer/handler/loader).

GBC placement test (gbcRoutes.test.ts diff 760-783): asserts 400 + exact `unknown map <name>` for `__proto__` and `NoSuchMap`, file bytes unchanged, restore style copied from the neighbour. Sound. It is `describe.skipIf(!hasGbcProject)`, so it only runs when the subject repo exists; module-level `sidecarRoutes.test.ts` covers the logic regardless, but GBC's `knownMap` wiring (`mapNames.has`) is pinned only in the skip-able test. Acceptable, noting.

Gaps / weaknesses (all Minor unless stated):
- T1 [Minor] POST accept: the 400 shape text `expected { key: string, accepted: boolean }, got <body>` is never asserted, and `accepted:false` (un-accept) is never exercised. Brief said "every 400 text listed above"; this one was listed under routes but is the only body-route text untested at module level.
- T2 [Minor] No test that `getWorld` is not invoked at construction or by non-accept routes. A regression such as `const world = deps.getWorld()` at mount or in the dungeons routes passes every test with the never-throwing stub. This is a brief-level ruling ("do NOT build the world at mount time"). Suggest a `getWorld` stub that throws/counts and assert 0 calls after mounting and after a placement/dungeons request.
- T3 [Minor] PATCH validation texts are not pinned in this file: blank/non-string `name` (`"name" must be a non-empty string when present`) and non-array `maps`, and "partial patch leaves other key untouched". dungeons.test.ts (HEAD:102, 126) covers blank-name and partial PATCH for GBA only through the real server; GBC has no such coverage. A regression in the shared PATCH validation is caught only on GBA.
- T4 [Minor] Placement y non-finite (`"y":1e999`) and non-number y are not tested; only x. Removing `Number.isFinite(p.y)` slips through.
- T5 [Minor] No test for the "does not hang on a corrupted world.json / dungeons.json" rationale (readSidecar I7 refusal -> 500 via jsonBody; sync readDungeons throw propagating). The rationale comments claim this protection; nothing at module level proves it (the old dungeons.test.ts "instead of hanging" tests cover only bad JSON).
- T6 [Minor] `it.each` 400 table for POST /api/world/dungeons (1016-1019) is status-only with no no-write check, and `null`/`[]`/`{}` bodies are the interesting cases; the next test checks only one text. Fold into one table with texts, as done for placement.
- T7 [Minor] Redundancy: "writes a real sidecar file that readSidecar can read back" (1053-1059) duplicates the placement happy path; "PATCH 404s an unknown id" has three overlapping assertions (949-955). Trim.
- T8 [Minor] Misleading comment at diff 938: "jsonBody's own shape 400" for `{}` — the `{}` 400 is the handler's name check, not jsonBody's guard (the text `expected a non-empty "name" string` is the handler's). Reword.
- T9 [Minor, portability] afterEach guard (diff 865) hard-codes `\\` as the separator (`${resolve(tmpdir())}\\pokemap-sidecar-routes-`). On a POSIX CI box it would throw "scratch cleanup escaped temp root" after every test. world.test.ts:42 uses the portable `join(resolve(tmpdir()), "...")` form (world.test.ts:92 uses the backslash form, so there is precedent for both). Use `join(...)`. The comment "Same guard shape as world.test.ts's scratch cleanup" is accurate only for one of the two.
- T10 [Minor] `mount()` rebuilds `sidecarRoutes(deps())` per request (diff 839); production mounts once. Harmless here (no per-mount state) but a closure-state regression (e.g., cached `before`) could not be detected. Hoist the `sidecarRoutes(deps())` call into `mount()`.
- T11 [Minor] Brief asked for happy-path of all 7 routes: DELETE/PATCH/POST/GET are covered; world/dungeons and accept have a happy path; all seven present.

## 7. Other

- Line endings: the diff and HEAD blobs are LF in git; whether working-tree files are CRLF (brief requirement) is not verifiable from git blobs here. New files end without a trailing newline ("No newline at end of file", diff 747 and 1089); minor style inconsistency if other repo files end with a newline.
- Unrelated: none noticed beyond the `.catch` swallowing nothing new.

## Summary list

Critical: none.
Important: (3.1) restore the dropped `/api/world/dungeons` "Review fix" rationale comment in sidecarRoutes.ts.
Minor: stale "GBA's addition" comment; header "three places" claim; GBC mount comment omits the dungeon-route reorder; `sidecar` shadowing in index.ts; test gaps T1-T11 (most useful: T2 lazy getWorld, T3 PATCH validation texts, T5 corrupted-sidecar 500, T9 portable temp guard).
