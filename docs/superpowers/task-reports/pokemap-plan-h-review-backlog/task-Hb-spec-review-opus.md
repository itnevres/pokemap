# H-b spec-compliance review (adversarial, High tier)

Range 57f9271..b7925b6 (branch claude/plan-h-server-8-h-b). Read from the code: the full src diff, pre-change index.ts / gbcRoutes.ts / http.ts, the current mount sites, all jsonBody callers, the new and changed tests, and the plan's Task H, traps 19-21 and row H-b. I ran no vitest, npm, typecheck or build, as instructed. I ran no mutations because the brief forbids running tests. The report's mutation list (16) is audited below.

**Verdict: PASS. No Critical or Important findings. 4 Minor findings: 2 doc/report accuracy, 1 spec-record gap, 1 test gap.**

## (1) Route-by-route equivalence, both families

Both mounts sit inside the handler's outer `try`: GBA at index.ts:756 (try opens at :364), GBC at gbcRoutes.ts:534 (try opens at :406). A synchronous throw from GET /api/dungeons, from DELETE (readDungeons I7 on a corrupt dungeons.json), or from a TDZ-free deps closure still reaches the same `console.error` plus `send(500, {error: message})` as before. Async throws inside a body handler go through jsonBody's `.catch`. Its 413 text (`request body too large`), its 500 (`console.error` plus `e instanceof Error ? e.message : String(e)`) and its invalid-JSON text (`invalid JSON body: <msg>`) are byte-identical to the deleted inline copies (http.ts:85-96 vs the old preambles). The `expected ${shapeText}, got ${text}` template reproduces all four old shape texts exactly: `{ key: string, accepted: boolean }`, `{ map: string, x: number, y: number }`, `{ enabled: boolean }`, `a dungeon object`.

Mount position. GBA's seven routes were one contiguous block (old index.ts:739-928, one hunk, no context lines inside). The mount replaces that block exactly, after GET /api/world (index.ts:700) and before the paint routes. GBC's conflicts/accept, world/dungeons and placement were contiguous after `/api/world`; the four dungeon routes came after `/api/warps/(.+)` GET. They now precede it. The paths are disjoint (`/api/dungeons...` vs `/api/warps/...`), so the order change is neutral. GBC `/api/world` (gbcRoutes.ts:525) matches any method and still runs first, as before.

Non-owned methods. Every condition keeps its method test: sidecarRoutes.ts:100, :118, :147 POST; :162 GET; :167 POST; :199 PATCH|DELETE. Any other method falls through (`return false`, :232) to the same downstream routes as before. For example, GET /api/dungeons/<id> still falls through on both families, as before.

Per route:
- conflicts/accept: identical in both families before; identical now (sidecarRoutes.ts:106-114). The world is still read only after the shape check.
- placement: GBA unchanged. The guard is the same predicate (isPlacementBody :69-74 == old index.ts guard), then known-map, then write. GBC is unchanged except for the allowed known-map 400 (:132-134). The old GBC guard (`typeof x/y` plus isFinite) is equivalent.
- world/dungeons: GBC unchanged (`null` / non-object gives 400; an array can never carry `enabled` from JSON). GBA: `null` was a TypeError and a 500, now 400 (allowed 2a). For `[]` and primitives the text is unchanged (old `parsed.enabled` was undefined, so the same 400 text). Reply goes through `autoLayoutReply`: GBA `{ok:true}`, GBC `{dungeonAutoLayout:v}` (index.ts:307, gbcRoutes.ts:365).
- GET /api/dungeons: identical.
- POST /api/dungeons: GBC identical. GBA: `null` was 500, now 400. Consequence of allowed 2b not spelled out in the brief: on GBA, an array or primitive body (`[]`, `5`, `"x"`, `true`) used to get `expected a non-empty "name" string, got <body>` and now gets `expected a dungeon object, got <body>`. No test pins the old text (dungeons.test.ts checks status only). It is covered by the brief's guard wording, so this is not a finding.
- PATCH: GBC identical. GBA: `null` was 500, now 400. An array or primitive body used to pass both optional checks and reach the 404 or a 200 that rewrote dungeons.json unchanged; it now gets a 400 and writes nothing. This is allowed 2c. The order of decode-id, then body, then name/maps checks, then 404, then write is preserved (:199-228).
- DELETE: identical except the malformed-id text (allowed 2d). The 404 `no dungeon <id>` and `{ok:true}` are preserved (:205-212).
- Malformed id: GBA `malformed percent-escape in path` becomes `malformed dungeon id <raw>` on PATCH and DELETE only (:204). The api.test.ts:455-471 malformed table has no dungeons row, so no test pins it.

GBC `getWorld` stays lazy. The function is passed (gbcRoutes.ts:363) and called only inside the accept handler (:107). `getWarps` (which runs syncOverlay) is still only called on a seeded create, as before. `edit.syncOverlay` was never called on the other sidecar routes before, and still is not.

## (2) Traps

- Trap 19: the deps are `{ root, getWorld, knownMap, expandSeed, autoLayoutReply }` (sidecarRoutes.ts:41-56). `autoLayoutReply` is the brief's justified addition, because the two pinned replies differ. `getWorld` is typed `{ conflicts: Conflict[] }` from core connections.js. The module imports no Project or GbcProject.
- Trap 20: `/api/world` is not handled by the module (exact-path checks only). Both families' GET /api/world stay in place. The module test (sidecarRoutes.test.ts:315-321) pins `false` for `/api/world`.
- Trap 21: my own diff of the two families' 400 texts, pre-change. Identical: accept, placement shape, `expected { enabled: boolean }`, name/seedMap/maps texts, `seedMap X is not a known map`, `no dungeon <id>`. Differing: (a) the malformed id text, (b) GBA had no `expected a dungeon object` guard, (c) GBC had no `unknown map` check. Tests pinning any of these: world.test.ts:166ff pins GBA `unknown map`, still produced. gbcRoutes.test.ts uses `stringContaining("expected { map: string, x: number, y: number }")`, unchanged. No test pins (a) or (b) on GBA. No existing test is broken by wording.

## (3) Acceptance

- `git diff --numstat 57f9271..HEAD -- packages/server/test`: gbcRoutes.test.ts 29/0 (addition only, one new `it` at :966-993) and sidecarRoutes.test.ts 356/0 (new). No existing test was edited.
- Bare-temp-root test: sidecarRoutes.test.ts imports only vitest, node built-ins, `../src/sidecarRoutes.js`, `../src/http.js` and core paths/types/readSidecar (:1-11). It does not import createServer, createProjectHandler, createGbcProjectHandler or any loader. It uses mkdtempSync under tmpdir and removes it in afterEach.
- The line count per handler is given, but the numbers are wrong (see M1).

## (4) GBC known-map change

sidecarRoutes.ts:132-134 sends `send(400, { error: \`unknown map ${placement.map}\` })` after the shape guard and before readSidecar/writeSidecar. This is the same status, text and order as the old GBA index.ts:364-366. It is pinned by gbcRoutes.test.ts:970-993 (`__proto__` and NoSuchMap give exactly `{error:"unknown map <name>"}`, with sidecar bytes unchanged) and by sidecarRoutes.test.ts:240-241, 257-260. The existing GBC placement happy path uses `PlayersHouse1F`, a real map, so it is unaffected. I found no behaviour change beyond the brief's allowed list.

## (5) jsonBody signature

http.ts:83 changes `handler: (body: T) => unknown` to `(body: T, text: string) => unknown`. Adding a trailing parameter to a callback type is assignment-compatible for one-argument callbacks. Every caller: sidecarRoutes.ts:106, 125, 149, 168, 214, and http.test.ts:191, 245 (one-argument lambdas). No other caller exists in packages/.

## Mutation evidence (audit only; nothing run)

The report lists 16 killed mutations, covering the module, GBC and GBA known-map checks, isFinite, sort, unknown seed, autoLayoutReply, the 404s, PATCH write, the guards, the malformed id, jsonBody text and unowned->true. From reading the tests:
- The GBC-mount known-map check is killed only by the new gbcRoutes.test.ts:970.
- The GBA mount is killed by world.test.ts:166ff.
- `autoLayoutReply` is killed by sidecarRoutes.test.ts:271, world.test.ts:219 and the GBC temp-copy suite (:1411).

These claims are plausible. One surviving class remains (M4).

## Findings

**M1 (Minor). The report misstates the lines removed from each handler.** task-Hb-report.md:7 says "`index.ts` -214 / `gbcRoutes.ts` -191 lines each side (net of the one mount + deps block)". Those are `--stat` totals (insertions plus deletions). `git diff --numstat`: index.ts +21/-193 (net -172), gbcRoutes.ts +33/-158 (net -125). Acceptance asks for the line count removed, so a reader taking "-214/-191" at face value overstates the reduction by about 40-65 lines. Fix: state 193 and 158 deleted (net 172 and 125).

**M2 (Minor). The impl notes are stale and self-contradictory.** task-Hb-impl-notes.md:
- Deviation 1 (:33-48) describes a private `dungeonBody` helper. Commit cb8ef76 removed it, and POST and PATCH now use jsonBody (sidecarRoutes.ts:168, 214).
- :13 and :66-74 refer to a mount named `sidecar` and a shadowing hazard. The mount was renamed `sidecarRoute`, so the hazard is moot.
- Deviation 3 says the known-map check "is the only behaviour change applied", which contradicts deviation 5 and the code (GBA null gives 400, the id text changed).

Failure scenario: a later reviewer or the I1 author trusts the notes and believes POST and PATCH /api/dungeons bypass jsonBody. Fix: amend, or mark them superseded by task-Hb-report.md.

**M3 (Minor). The spec does not record the extra allowed changes.** plan-h-hardening.md:396 still says the GBC known-map check "is the one allowed behaviour change in H-b". The brief also allowed guard unification (GBA null gives 400 on world/dungeons, POST and PATCH dungeons; arrays and primitives give 400 on GBA PATCH, which used to answer 200 with a no-op write) and the malformed-id text change. Project CLAUDE.md requires rulings to be recorded in the spec. The extra changes also go beyond the spec as written. They are defensible (only crashes become 400s, and no test pins them), but they are binding decisions taken in the brief only. The GBA consequences for primitive and array bodies (the POST text change, and PATCH 200 becoming 400) are not named anywhere. Fix: amend Task H's Requirement paragraph to list the allowed changes, including these GBA consequences.

**M4 (Minor, test gap). The method guards are untested.** Dropping `&& req.method === "POST"` from sidecarRoutes.ts:100, :118 or :147 (or narrowing :199) survives every test. Nothing sends e.g. GET /api/world/placement or GET /api/dungeons/<id> and expects a fall-through 404. The "unowned" test uses a different path (`/api/world`, sidecarRoutes.test.ts:318), and gbcRoutes.test.ts:141-172 covers only `...x` suffix paths. Failure scenario: a refactor drops a method check, and GET /api/world/placement then answers 400 `invalid JSON body` (an empty body) instead of 404, unnoticed. The gap existed before this change, but the module is now the single place to pin it. Fix: one table test in sidecarRoutes.test.ts that sends a wrong method to each owned path and expects a 404 from the test server's fallback.

Nit: sidecarRoutes.ts has no trailing newline (diff "\ No newline at end of file"). It uses CRLF, which is correct. The other touched files keep CRLF.
