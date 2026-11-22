# Task E (E1 + E1b + E2) spec review

Scope: `git diff 6de71e3 a477e87` in worktree `plan-h-server-e2`. Authority is `docs/superpowers/plans/plan-h-hardening.md`, "### Task E" plus binding traps 8-11, 21 and 29. I checked the briefs `brief-e1.md`, `brief-e1b.md` and `brief-e2.md` against it. I read all of the changed source and every new or edited test myself. Per the dispatch brief, I did not run vitest, typecheck or a build.

(This file was written into worktree `overnight-standby-5-8438fc` because a hook blocks writes into `plan-h-server-e2` from this session. Copy it to the same relative path in `plan-h-server-e2` if it should live there.)

**Verdict: CHANGES.** There is one Important finding: the streaming cap does not close the connection, and the plan requires it to. Every acceptance line otherwise holds in code, and the tests cover it.

## Acceptance, line by line

1. **Species (S1): holds.** `index.ts:531-536` calls `decodeSegment` and then refuses `undefined` or anything outside `^\w+$` with 400 before `renderSpeciesIcon` reads a file. In the tests:
   - `api.test.ts` sends `SPECIES_..%2F..%2Fx` and `a%20b` and expects 400.
   - It requests `SPECIES_ESPEON` and expects 200 with `image/png`.
   - The species row of the malformed-`%` table sends `%E0%A4%A` and expects 400.

   The UI builds the URL as `encodeURIComponent(species)` (`ui/src/encounters/summary.ts:130`), and decomp species constants are always `\w+`, so the guard refuses no legitimate caller.

2. **Malformed `%` answers 400, never 500: holds.**
   - `grep -n decodeURIComponent packages/server/src/index.ts` finds nothing. The old file had 28 `decodeURIComponent(` sites, and the new one has 28 `decodeSegment(` sites.
   - I matched each site with its next line. Every site in `index.ts`, `gbcRoutes.ts`, `gbcEditRoutes.ts` and `blockEditRoutes.ts` checks `=== undefined` and returns 400 right away. The species site does the same, with a comment between the call and the check.
   - All the POST sites decode before calling `readBody`, so no site sits inside a promise chain where a 400 could be swallowed.
   - The create-event site (`index.ts:363-364`) used to be a try/catch and is now a direct 400.
   - Event-options lives in `addEventRoutes.ts:219`. It still calls `decodeURIComponent` inside its own try, which answers 400 through `eventFailure`. That matches trap 10, and the test table pins it.
   - The test table covers map, render, metatile, species, edit/session, defects, event-options, warps (standing in for "world"), encounters and where.

3. **413: holds for a declared length.** It only partly holds for the streamed backstop; see I1.
   - `refuseOversize` runs at the top of the GBA `handle` (`index.ts:343`, after the 503 check), the GBC `handle` (`gbcRoutes.ts:380`) and the hub (`hub.ts:146`, after the 403 check).
   - Every `readBody` caller checks `BodyTooLarge` first in its rejection path:
     - `index.ts`: 13 calls and 13 checks (366/371, 730/743, 750/789, 802/819, 834/869, 879/902, 947/1030, 1132/1174 for commit, which is trap 9's route, 1189/1215, 1226/1242, 1253/1272, 1345/1425, 1435/1500).
     - `gbcRoutes.ts`: 5 calls and 5 checks.
     - `hub.ts`: 170/240.
     - `gbcEditRoutes.ts`: 511/528.
     - `blockEditRoutes.ts`: 158 goes through `fail` at 205, which checks at 146.
   - `addEventRoutes.ts` never calls `readBody`.
   - No caller answers 400 or 500 for `BodyTooLarge`.

4. **Placement guard: holds.** `index.ts:750-791` refuses null, non-objects and arrays, requires a string map and finite numeric x and y, then checks the known map. Every refusal happens before `readSidecar` and `writeSidecar`.
   - `null` and `[]` are refused by the object check.
   - `__proto__` and unknown maps are refused by `mapNames().includes`.
   - `1e999` parses to Infinity and is refused by `Number.isFinite`.
   - The 400 text is the same as before and the same as GBC's, which satisfies trap 21. The unknown-map case has its own message.
   - `world.test.ts` sends all five bodies, expects 400 for each, and compares the sidecar bytes before and after.

5. **nosniff: holds.** There are no JSON `writeHead` calls left in `packages/server/src`. The only remaining `writeHead`s are `image/png`.
   - All three `send` closures and both `project closed` 503s (`index.ts:325`, `gbcRoutes.ts` disposed branch) go through `sendJson`.
   - The route modules get `send` and the Buffer-aware wrappers, which also call `send`.
   - Tests cover a 200 and a 400 for GBA, a 200 and a 400 for GBC, and a 200 for the hub.

6. **`isCrossOriginRequest`: holds.** `http.ts:92-136` matches `git show 6de71e3:packages/server/src/hub.ts:125-169` exactly: `LOCAL_HOSTNAMES`, `hostnameOf`, the function body and the SR-F9 comment. The only change is the added `export`.

## Other checks

- **Existing tests edited:**
  - `gbcRoutes.test.ts`: only the import plus the describe and it titles of the `decodeMapName` case. The brief allows this.
  - `world.test.ts`: the placement persistence test now uses `Route101` with an exact `toEqual` against the auto placement. Acceptance 4 forces this, and the brief allows it.
  - `api.test.ts`, `hub.test.ts` and `http.test.ts`: additions only.
- **Comments:**
  - The `readBody` docstring moved to `http.ts` word for word, with one added sentence.
  - The `decodeMapName` comment moved to `decodeSegment` and drops only the clause about GBA keeping its 500, which is no longer true.
  - The SR-F9 comment moved word for word.
  - The `index.ts` "ponytail" comment was kept, with an S3 paragraph added.
  - The two GBC comments that named `decodeMapName` were updated.
- **Pass-through wrappers:** none, apart from the one-line `send` closures that trap 8 requires.
- **`Send` type:** unchanged in `addEventRoutes.ts`, `gbcEditRoutes.ts` and `blockEditRoutes.ts`.
- **Imports (trap 11):** `readBody` is no longer imported from `index.js` anywhere. `git grep` shows no remaining `decodeMapName`.

## Findings

### Important

**I1. The streaming cap answers 413 but never closes the connection, which the plan requires.** The plan's `readBody` contract says "the caller answers 413 and closes the connection". Trap 9 says "the streaming cap in `readBody` is the backstop for a chunked body and closes the socket."
- `http.ts:28-35` only removes its own listeners and rejects. Every `BodyTooLarge` branch (for example `index.ts:1174`, `gbcRoutes.ts:520`, `hub.ts:240`, `blockEditRoutes.ts:146`, `gbcEditRoutes.ts:528`) calls only `send(413, ...)`.
- Only the declared-length path (`refuseOversize`, `http.ts:86-87`) sets `connection: close` and destroys the request.
- Failing input: `POST /api/edit/PetalburgCity/commit` with `transfer-encoding: chunked` and a 2 GiB body. After 16 MiB plus one chunk the server sends 413. The request stream is still flowing because a `data` listener was attached, so Node does not `_dump` it. The server keeps reading and discarding bytes on the same keep-alive socket until the client stops or the default `requestTimeout` (300 s) fires, and the 413 response carries no `connection: close`.
- Memory stays bounded, so this is not a buffering hole. It is a spec deviation in the backstop the plan names.
- Fix with one line per handler and no route edits: at the top of each `handle` (`index.ts:343`, `gbcRoutes.ts:380`, `hub.ts:146`), add `res.once("finish", () => { if (!req.complete) req.destroy(); })`. Alternatively, have the 413 answer set `connection: close`.
- Add a chunked over-cap test through one real route, which also covers M1.

### Minor

**M1. The route-level `BodyTooLarge` to 413 mapping has no test.** About 22 `if (e instanceof BodyTooLarge)` branches exist, and none is exercised by a test. Only the unit test (`http.test.ts:57-85`) drives `readBody` past its cap, through an inline handler. For example, deleting `index.ts:1174` (the commit route trap 9 names) would make a chunked oversize commit answer 400 with the whole suite still green. One chunked `MAX_BODY_BYTES + 1` POST to the GBA commit route, asserting 413, would pin trap 9 directly.

**M2. The 413 mutation fails only by timeout.** The declared-length tests (`world.test.ts` 413 case, `gbcRoutes.test.ts:970`, `hub.test.ts` E1b) send headers with no body. If `refuseOversize` is removed, the route waits for 16 MiB that never arrives, so the test turns red only by hitting its timeout (300 s in `world.test.ts`). The mutation still fails, but slowly and without a clear message. A short per-test timeout, or asserting within a bounded `Promise.race`, would make it a fast failure.

**M3. A wire change on the GBA create-event path.** A malformed escape there used to answer `{ error: "malformed map name", code: "BAD_OPTION" }` and now answers `{ error: "malformed percent-escape in path" }` with no `code` (`index.ts:364`). `brief-e2.md` directed this, and no test pins the old body. The UI always encodes, so this is unreachable from the app. Noted only so the `code` drop is a known decision.

**M4. Some decode sites are not exercised by the acceptance 2 tests.** "World" is represented by `/api/warps`. The dungeon-id PATCH and DELETE sites (`index.ts:877, 909`) and the POST sites (commit, paint, event, sign, indicator) are never sent a malformed `%`. I inspected every one, and each returns 400 before `readBody`, so this is a coverage gap, not a defect.

### Observation (outside Task E's scope)

- **GBC placement still accepts `__proto__`.** `gbcRoutes.ts:551-569` has the shape guard but no known-map check. So `{"map":"__proto__","x":0,"y":0}` answers 200: it rewrites `world.json` and sets the prototype of `manualPlacements`. Any unknown name is stored as well. The plan scopes the known-map check to GBA ("GBA's addition"), so this is not a Task E defect, but the same hole exists in the twin. Consider a follow-up row.

## Mutation evidence

The repository has no E1 or E2 implementer report with mutation results, only hop logs. The dispatch forbids running vitest, so I did not run any mutation. Here is my reasoning for the plan's three mutations, which the orchestrator should confirm:

- **Remove `^\w+$`** (`index.ts:536`): `SPECIES_../../x` reaches `renderSpeciesIcon`, which answers 404 when no art exists or 500 when it throws. Neither is 400, so the S1 test fails.
- **Drop the known-map check** (`index.ts:779-781`): the unknown map and `__proto__` answer 200, so the acceptance 4 status assertion fails.
- **Remove the size cap:**
  - Removing the `bytes > max` check (`http.ts:30`) fails the `http.test.ts` 413 cases.
  - Removing `refuseOversize` (`index.ts:343`) fails the `world.test.ts` 413 test only by its 300 s timeout (M2).
- Deleting any route-level `BodyTooLarge` branch fails no test (M1).
