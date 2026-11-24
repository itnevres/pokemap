# Plan H Task J: combined review (J1a, J1b, J2, J3)

Range: `git diff origin/master HEAD`, branch claude/plan-h-j. Medium tier. Static review only: no vitest, typecheck or build run.

**Verdict: APPROVED** (0 Critical, 0 Important, 7 Minor).

## Spec checklist

| Criterion | Result | Evidence |
|---|---|---|
| (1) `postJson(path, body, guard?)` beside `fetchGuarded`, sets `content-type: application/json` | met | `packages/ui/src/hooks/useGuardedFetch.ts:55-74`. The extra `sendJson(method, ...)` serves PATCH and is not in the spec (see M1). |
| (1) every UI request with a body uses it | met | Converted: `shared/useEditSessionCore.ts:142`, `shared/SignEditor.tsx:52`, `components/SaveDialog.tsx:125,143`, `components/PokemonIndicatorDialog.tsx:120`, `gba/worldSurface.tsx:174,179`, `gbc/worldSurface.tsx:278,281`, `world/useConflictAcceptance.ts:16`, `hub/guards.ts:78`, `hooks/useDungeons.ts:55,61`. The two header spellings (trap 28) are gone. |
| (2) one guarded dungeons hook, GBC copy deleted, types kept | met | `gbc/hooks/useGbcDungeons.ts` deleted. `gbc/adapter.tsx:13,31` and `gba/adapter.tsx:12,45` both use `hooks/useDungeons.ts`. `Dungeon` and `UseDungeonsResult` are still exported there, and `DungeonSidebar`, `shell/adapter.ts` and `shell/useDungeonFilter.ts` import them unchanged. No dangling reference remains outside archived plan docs. |
| (3) 415 for a non-GET request with a body and a non-JSON type, in the hub and both family handlers | met, with a narrower method set (see M3) | `http.ts:125-146`, `hub.ts:248`, `index.ts:363` (GBA handler), `gbcRoutes.ts:403` (GBC handler). |
| (3) bodyless POST (discard) still 200 | met | `declaresBody` is false with no content-length or content-length 0. Pinned in `http.test.ts` ("bodyless write") and `jsonContentType.test.ts` (discard 200). |
| (4) `createServer` runs the cross-origin check | met | `index.ts:1117-1123`. |
| (4) server test helpers send `application/json` (J2) | met | Every server test `fetch` with a body now sets the header. I checked the full `method: POST/PUT/PATCH` grep of `packages/server/test`. The three multi-line sites in `dungeons.test.ts` and `world.test.ts` have the header on the next line. The two sites with no header (`gbcRoutes.test.ts:1029`, `world.test.ts:285`) are the oversize 413 tests, which still expect 413 (see ordering below). |
| (4) UI mocks changed only for the header | met | I read the whole UI test diff. Every hunk only adds `headers: { "content-type": "application/json" }` to an expected call. The one new test block is `useGuardedFetch.test.ts` for `sendJson`/`postJson`. |

## (a) Remaining direct `fetch(` in `packages/ui/src` (acceptance asks for this list)

All are GET or bodyless, and none needs the header:

- GET: `PokemonIndicatorDialog.tsx:91,244`, `SaveDialog.tsx:85,127`, `SpeciesSpotlight.tsx:111,208`, `useMapDefects.ts:12`, `useMapLayout.ts:70`, `useWorldVisibility.ts:36`, `AddEventDialog.tsx:46`, `blockEditor/useBlockEditor.ts:64`, `SignEditor.tsx:36`, `useEditSessionCore.ts:179`, `useEventOptions.ts:33`.
- Bodyless POST: `useEditSessionCore.ts:142` (the `body === undefined` branch) and `:217` (discard).
- `fetchGuarded` with `method: "DELETE"` and no body: `useDungeons.ts:68`.

No UI request with a body lacks the header.

## (b) Other callers

- `packages/server/src/serve.ts:113` POSTs `/api/hub/open` and now sends the header (J3 fix, correct).
- `packages/mcp/src` and `packages/cli/src`: no HTTP POST callers.
- `scripts/launch.mjs:59`: GET only.
- No curl or PowerShell POST snippets outside archived plans.

## (c) Order of checks and connection behaviour

- Hub (`hub.ts:244-248`): cross-origin 403, then oversize 413, then 415. The project handlers do 413 then 415 (`index.ts:362-363`, `gbcRoutes.ts:402-403`).
- The 413-before-415 order is covered only implicitly. `gbcRoutes.test.ts:1029` and `world.test.ts:285` send a 16 MiB `content-length` with no content type and expect 413. They fail if the two calls are swapped.
- The 403-before-415 order is pinned explicitly by the hub test "J3: a forged Origin is refused with 403 before the content type is looked at".
- The 415 is sent before the body is read, the same approach as `refuseOversize`. The connection is kept open and Node dumps the unread body when the response finishes, so there is no reset for the normal case. Nothing tests a large non-JSON upload (see M5). The risk matches the existing 413 path, which has such tests.
- The hub check and the handler check overlap for hub-forwarded requests. That is harmless (idempotent) and needed, because `createServer` uses the handler alone.

## (d) Test quality

- `http.test.ts` "refuseNonJsonBody": it fails under these mutations.
  - Dropping a method from the list fails the POST/PUT/PATCH loop.
  - Dropping the `transfer-encoding` clause fails the chunked test.
  - Dropping the `;` parameter strip fails the `charset` case.
  - Switching to `startsWith("application/json")` fails the `application/jsonp` case.
  - Dropping the case fold fails `Application/JSON`.
  - Rejecting bodyless writes fails the `content-length: 0` and "no length" cases.
- `hub.test.ts` J3 tests: they would fail if `hub.ts:248` were removed. They assert that nothing was opened, that the unlabelled `fetch` (Node labels a string body `text/plain`) gets 415, and that a bodyless POST reaches the route (400, not 415).
- `jsonContentType.test.ts`: it covers 415, a JSON pass-through (400 for `{}`, which I confirmed is the shape error for both families' `paint/apply`), a bodyless discard 200, and 403 on Origin and Host. It is corpus-gated like the rest of the server suite. If the corpus is absent, deleting `index.ts:363` or `gbcRoutes.ts:403` fails nothing. That follows the repo convention, but the handler-level 415 has no unit-level test.
- No existing test was loosened. Header additions are the only edits. I found no removed assertion.
- UI: `useGuardedFetch.test.ts` pins the exact header, body and method for `postJson`/`sendJson`, and the guarded error text. `SaveDialog`, `SignEditor`, `useEditSessionCore`, `useEditSession` and `GbcWorldCanvas` assert the header at the call site.

## (e) `useDungeons.ts` rewrite

- It is now the old GBC hook with an unchanged return shape. All five `UseDungeonsResult` members keep their signatures.
- Behaviour differences, all benign:
  - The list is now shape-guarded instead of cast. A malformed entry becomes an error banner (`GET /api/dungeons returned an unexpected shape: ...`).
  - Error labels use the encoded path (`PATCH /api/dungeons/<encoded id> -> 500`) instead of the raw id.
  - The delete reply is now required to be `{ ok: true }`. `sidecarRoutes.ts:216` sends exactly that for both families, and the existing `useDungeons.test.tsx` mock already does too, so no caller or test breaks.
  - PATCH is shared by `rename` and `setMaps` through one helper.
- The `Dungeon` shape check matches `sidecarRoutes` (`id`, `name` and `maps` as strings).
- `GbaMapSurface.test.tsx:33` mocks `useDungeons` by path and is unaffected.

## Findings

All Minor. None blocks merge.

- **M1. UI `sendJson` shares its name with the server's `sendJson` (`packages/server/src/http.ts:103`).** `packages/ui/src/hooks/useGuardedFetch.ts:61-67` exports `sendJson(method, path, body)`, a request sender. The server's `sendJson(res, status, body)` is a response writer. They are in different packages, but the same name with opposite meaning is a trap when grepping. It also exists only for the single PATCH in `useDungeons.ts:61`. Consider `patchJson` or `requestJson`, or keep it private to the module and export only `postJson`, as the spec asked.
- **M2. Wrong import direction.** `packages/ui/src/hooks/useDungeons.ts:3` imports `isRecord` from `../gbc/guards.js`, so a family-neutral hook now depends on a GBC file. `hub/guards.ts` already does the same, so there is precedent. Task K2 plans one shared `isRecord`; this import should move with it. Worth noting in the K2 row, since `useDungeons.ts` now adds a fourth importer of the GBC copy.
- **M3. Method coverage.** The spec says "a non-GET request with a body". The implementation (`http.ts:140`) covers POST, PUT and PATCH only.
  - `declaresBody` is correct: `content-length > 0` or any `transfer-encoding`. A bodyless POST has neither.
  - DELETE with a body is not covered. It does not matter in practice: no server route reads a DELETE body (`sidecarRoutes.ts:210-218`). A cross-site DELETE is not a CORS-simple request and needs a preflight the server never grants, so only POST is the real text/plain risk. PUT and PATCH coverage is defence in depth.
  - Suggest widening the check to "not GET, HEAD or OPTIONS", or documenting the choice. The doc comment already names the three methods.
  - The `http.test.ts` test title says "any GET or DELETE" lets through, but its DELETE probe is bodyless. It does not pin DELETE-with-body behaviour. Either add the case or reword the title.
- **M4. Header coverage gaps in the UI suite.**
  - `useDungeons.test.tsx` was not touched. No test asserts that `create` (POST) and the PATCH calls send `content-type`. Reverting `useDungeons.ts:55` or `:61` to a raw `fetchGuarded` with no header would pass every UI test and only fail live, with a 415.
  - The newly guarded list shape has no negative test (for example `[{ id: 1 }]` giving the "unexpected shape" error).
  - The same gap exists for `openProject` (`hub/guards.ts:78`), `PokemonIndicatorDialog` and `useConflictAcceptance`, but those go through the unit-tested `postJson`.
  - Suggest adding two assertions to `useDungeons.test.tsx`: the header on create and PATCH, and one bad-shape case.
- **M5. 415 on a large body.** There is no test that a large `text/plain` upload gets a readable 415 rather than a reset, as the 413 path has (`helpers/oversizeBody.ts`). The `probe` in `http.test.ts` uses `keepAlive:false` and tiny bodies. The mechanism is identical to `refuseOversize`, so the risk is low.
- **M6. Cross-origin check duplicated.** `index.ts:1118-1121` repeats the 4-line guard in `hub.ts:244-246`. Fine for now. If a third copy appears, a `refuseCrossOrigin(req, res): boolean` in `http.ts` (beside `refuseOversize` and `refuseNonJsonBody`) would remove it.
- **M7. Nits.**
  - `hooks/useDungeons.ts` lost its trailing newline (`\ No newline at end of file` in the diff).
  - `PokemonIndicatorDialog.tsx:120` is now a very long single line (a ternary URL plus a ternary body).
  - `packages/ui/DESIGN.md:533` still describes `useGuardedFetch.ts` only as fetch-once data hooks. It could name `postJson`, since it is now the one JSON body sender.

## Dead code, duplicated helpers

No dead code found. The deleted `useGbcDungeons.ts` is the only removal, and nothing references it outside archived plans. No duplicated helper was introduced beyond the `isDungeon`, `isDungeons` and `isDeleted` guards, which moved from the GBC hook to `useDungeons.ts` unchanged.
