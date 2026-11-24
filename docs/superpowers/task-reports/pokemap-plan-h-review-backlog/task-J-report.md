# Plan H Task J: JSON content type and one guarded fetch (J1a, J1b, J2, J3, J4)

Branch `claude/plan-h-j`, cut from master `be0d0ac`; `origin/master` (I1 #66, I2b #67) merged in. Conductor J.

## Tiers and how each row was built

| Row | Tier | Built by | Why |
|---|---|---|---|
| helper | Medium | inline (Claude) | `sendJson` and `postJson` in `useGuardedFetch.ts`, about 20 lines plus a test; every other row imports it |
| J1a | Medium | `chain.py --no-codex`, hop `openrouter/baidu/ernie-5.5-flash-preview:free`, verify = whole UI suite under the lock | free first (Codex out until Nov 25, DeepSeek pool capped) |
| J1b | Medium | same chain, same hop | same. The chain left `useGbcDungeons.ts` in place; deleted by hand (it had no importers) |
| J2 | Low | Haiku subagent | mechanical: add the header to every `fetch` init with a body (75 sites in 23 files) |
| J3 | Medium | inline (Claude) | three one-line call sites, a 20-line helper, tests that need judgement; a brief would cost more |
| J4 | live check | by hand in the Browser pane | see below |

Decisions are in `OVERNIGHT\decisions-plan-h-j.md`.

## What changed

- `packages/ui/src/hooks/useGuardedFetch.ts`: `postJson(path, body, guard?)` and `sendJson(method, path, body, guard?)`. They set `content-type: application/json`. Without a guard they return the raw `Response`.
- J1a: session `post`, SignEditor, SaveDialog (`sign/resolve`, `commit`) and PokemonIndicatorDialog use `postJson`. A bodyless POST (`useEditSessionCore` `body === undefined`, discard) stays a plain `fetch`. The two header spellings (`Content-Type` and `content-type`) are gone.
- J1b: GBA and GBC `worldSurface` (placement, dungeons), `useConflictAcceptance`, `openProject` use `postJson`. One dungeons hook: `hooks/useDungeons.ts` holds the guarded implementation and the types; `gbc/hooks/useGbcDungeons.ts` is deleted; both adapters import `useDungeons`.
- J2: every server test `fetch` with a body sends `application/json`. The chunked-upload helper `test/helpers/oversizeBody.ts` also sends it (found by the first J3 test run).
- J3: `refuseNonJsonBody` in `packages/server/src/http.ts`. A POST, PUT or PATCH with a body (`content-length` above 0, or any `transfer-encoding`) and a type other than `application/json` (parameters and case ignored) gets 415. It runs after the cross-origin 403 and the oversize 413, in the hub (`hub.ts`), the GBA handler (`index.ts`) and the GBC handler (`gbcRoutes.ts`). `createServer` now runs `isCrossOriginRequest` first (403). `serve.ts` sent a body-carrying `/api/hub/open` with no content type; it now sends one.
- J3 covers POST, PUT and PATCH only (not DELETE with a body): no route reads a DELETE body, and a cross-site DELETE needs a preflight the server never grants (review M3).

## Remaining direct `fetch(` in `packages/ui/src` (acceptance asks for this list)

All are GET or bodyless; none needs the header:
`PokemonIndicatorDialog.tsx:91,244`, `SaveDialog.tsx:85,127`, `SpeciesSpotlight.tsx:111,208`, `useMapDefects.ts:12`, `useMapLayout.ts:70`, `useWorldVisibility.ts:36`, `AddEventDialog.tsx:46`, `blockEditor/useBlockEditor.ts:64`, `SignEditor.tsx:36`, `useEditSessionCore.ts:142` (the bodyless POST branch), `:179` (GET), `:217` (bodyless discard), `useEventOptions.ts:33`; plus one `fetchGuarded(..., { method: "DELETE" })` in `useDungeons.ts`.

## UI test changes (mocks changed only for the header)

Every hunk adds `headers: { "content-type": "application/json" }` to an expected fetch init: `SaveDialog.test.tsx`, `shared/SignEditor.test.tsx`, `shared/createEvent.test.tsx`, `shared/useEditSessionCore.blockEdit.test.tsx`, `shared/useEditSessionCore.test.tsx`, `useEditSession.test.tsx`, `gbc/GbcWorldCanvas.test.tsx`. New tests: `useGuardedFetch.test.ts` (`sendJson`/`postJson`), `useDungeons.test.tsx` (JSON header on create and PATCH, malformed list is an error).

## Review

Medium tier: one combined spec and quality review. DeepSeek pool was capped, so Claude Sonnet (`quality-reviewer`): `task-J-review.md`, **APPROVED**, 0 Critical, 0 Important, 7 Minor. Fixed: M4 (dungeon hook tests), M7 (newline), M3 (test title). Left, with reason: M1 (the UI `sendJson` shares a name with the server's response writer; different packages), M2 (`isRecord` import from `gbc/guards`: Task K2 unifies it), M5, M6 (cross-origin check duplicated twice; a helper at the third copy).

## Mutation evidence (J3, nine mutants; scratch worktree, tests `http.test.ts`, `hub.test.ts`, `jsonContentType.test.ts`)

| Mutant | Result |
|---|---|
| M1 GBA handler skips the 415 | killed |
| M2 GBC handler skips the 415 | killed |
| M3 hub skips the 415 | killed |
| M4 `createServer` skips the cross-origin check | killed (2 tests) |
| M5 PATCH not covered | killed |
| M6 a `; charset=` parameter makes JSON refused | killed |
| M7 chunked body not counted as a body | killed |
| M8 bodyless write refused | killed (5 tests) |
| M9 content type compared case-sensitively | killed |
| restored baseline | 85 / 85 pass |

## Live check (J4, both families, scratch copies of the subjects, so no subject repo was written)

Servers started from this worktree (`serve.ts` on 5174, Vite on 5173); Vite served the changed `useGuardedFetch.ts`. A `fetch` logger in the page recorded method, header, body and status.

- GBC (Route39): paint (`paint/begin`, `apply`, `end`), undo, redo, Save dialog then `commit`, discard (after stubbing `window.confirm`, which the pane blocks): all 200; body-carrying calls sent `application/json`, the bodyless ones (begin, end, discard) sent none. World mode: dungeon auto-layout toggle `POST /api/world/dungeons` 200 with JSON; placement via the real `postJson` helper 200; the same placement as `text/plain` 415.
- GBA (NewBarkTown): paint, undo, commit, discard: all 200 with JSON (the GBA session posts `{}` for begin, end and undo, a JSON body). Dungeon toggle 200; placement via `postJson` 200, `text/plain` 415; Dungeon mode loaded `GET /api/dungeons` 200 through the single guarded hook, no error banner.
- Not driven through the pane: a real mouse drag of a placement (synthetic drags do not start it). The UI call site is pinned by `GbcWorldCanvas.test.tsx` (asserts the header); the helper and the route were exercised live.

## Gate

First gate at `e81365f`: 5,580 pass / 2 fail / 294 files; typecheck pass, UI build pass; subjects unchanged. The 2 fails: `core/test/config/engine.test.ts` (the known env fail) and `server/test/gbcAddEventRoutes.test.ts` "commit rebuilds symbols..." (8 s timeout under load; RESUME.md line 1 lists `gbcAddEventRoutes` as a load timeout). The file also fails alone with 1-2 timeouts, and on the pre-J3 base `c65dbeb` the same file shows one of the same timeouts, so J3 is not the cause.

Gate after merging `origin/master` (I2b #67), at `b953ef6`: 5,578 pass / 6 fail / 295 files (**all 6 in known classes**): four `gbcAddEventRoutes` 8 s load timeouts (proven failing on bare master, accepted by the master session), `core/test/config/engine.test.ts` (known env fail), `ui/test/WorldCanvasContext.test.tsx` double-click (load flake that passes alone, listed in RESUME.md line 1). Typecheck pass, UI build pass, subjects unchanged.

After merging `origin/master` again (F1d #68, no conflict in files this branch touched; it adds no body-carrying fetch), the Task J verify set at the PR head: 294 pass / 0 fail / 11 files (`http`, `hub`, `jsonContentType`, `brokenPaths`, `dungeons`, `saveRoutes` server tests; `useGuardedFetch`, `useDungeons`, `SaveDialog`, `SignEditor`, `GbcWorldCanvas` UI tests); typecheck pass, UI build pass.
