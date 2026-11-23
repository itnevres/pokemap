# Review: Task A (A1+A2) and H-a (combined spec + quality, Medium)

Reviewed read-only; no tests/builds run (orchestrator does). A1+A2 read from `git diff 670a295 claude/plan-h-server-a1` (source identical to current HEAD), H-a from `git show dcc7cea`.

Verdict: both approvable. No Critical, no Important. Minor items below.

## Part 1: A1 + A2

### Spec checklist (plan "Task A", traps 1-2, rows A1/A2)

| Item | Status | Where |
|---|---|---|
| GBA render bypass keyed on dirtiness, not `editSessions.has` | met (with the stroke deviation) | `packages/server/src/index.ts:483-484` |
| Same fix in GBC, or record why it differs | met (fixed, not waived) | `packages/server/src/gbcEditRoutes.ts:539-546`, consumed at `gbcRoutes.ts:443-449` |
| Test 1: clean session via real `GET /plan` keeps the cache | met | `api.test.ts:179-215` (clean assert at ~203), `gbcRoutes.test.ts:505-543` |
| Test 2: dirty (real paint) bypasses and shows live pixels | met | same tests, `dirty` block |
| Test 3: undo to clean returns to cache | met | same tests, `undone` block |
| Test 4 (staged-only block edit still renders staged pixels; check `isDirty` first) | met for GBA; not repeated for GBC, which the plan does not require ("repeats the three tests") | `api.test.ts:589-634` |
| Overlay sync before both bypass and cache path, cleared pngCache on change | unchanged and still before the check (`index.ts:445` `syncOverlay()`, `cachedRender` also syncs) | |
| Trap 2: leave the pre-warm alone | GBA untouched (met). GBC pre-warm changed only indirectly via `openBlocks` (see Q2); harmless | `gbcRoutes.ts:~784`, `index.ts:~1553` |
| Mutation evidence | met per report (two mutations, both fail the cache test) | task-A-report.md |

Cited lines: `index.ts:477` and `gbcEditRoutes.ts:536` match the pre-change files. `gbcRoutes.ts:463-471`, `:798`, `index.ts:1464` in the plan have drifted (now ~443-449, ~784, ~1553); this is plan text only, not a code problem.

### Q1: is `isDirty || strokeStartBlocks !== null` correct and complete?

Correct. `session.isDirty` is only ever set by `EditCommandStack` (`packages/core/src/edit/commands.ts:48,56,71`), and the only paths that mutate `session.blocks` without pushing a command are the in-stroke `paint/apply` mutations (`index.ts:1002,1019,1029,1035`; `gbcEditRoutes.ts:220`), whose command is pushed at `paint/end` (`index.ts:1055-1061`, `gbcEditRoutes.ts:391-397`). `strokeStartBlocks` is set at `paint/begin` and cleared at `paint/end` in both families, so the extra clause covers exactly that window. Other state checked:
- Staged-only tileset edit: `stageInto` does `entry.stack.push(...)` (`blockEditOwnership.ts:128`), so dirty. Same function serves both families.
- Redo/undo: `isDirty` recomputed on every push/undo/redo.
- Commit: both families close the session (`index.ts:1170`, `gbcEditRoutes.ts:468`) and clear the render cache (`index.ts:1183`, `onCommit` in `gbcRoutes.ts:~349`), so no clean-but-diverged session survives a save.
- Discard: closes the session; staged overlay change clears the cache on the next `syncOverlay`.
- Events-only edits: dirty, and (as before) render live; no pixel difference, only perf, same as the old behaviour.

One residual gap (Minor, see M1): `paint/apply` with no preceding `paint/begin` mutates `session.blocks` with `isDirty` false and `strokeStartBlocks === null`. Before this change the render still showed it (session existed); now it serves the cached disk PNG. Only a client that violates the begin/apply/end protocol can reach it (the UI always begins), and `paint/end` would not record the change either, so the session is already inconsistent; low priority.

Also note: a client that sends `paint/begin` and never `paint/end` (tab closed mid-stroke) keeps that map on the live path until the session closes. That is the correct pixel behaviour (blocks are live) and matches the old behaviour for that map.

### Q2: GBC `openBlocks` now returns undefined for clean sessions, so the pre-warm warms those maps

Harmless; no stale or wrong render can be cached.
- The warm path calls `cachedRender` (`gbcRoutes.ts:~292-301`), which calls `edit.syncOverlay()` first and renders from `proj` (disk plus any staged tileset overlay), the exact same thing the normal cached request path does for a clean session. Nothing session-derived goes into `renderCache`.
- A clean session has no staged tilesets of its own. If another map's session staged a shared tileset, the overlay is part of `proj` at render time and `clearTilesetCaches` clears `renderCache` whenever the staged bytes change (`gbcRoutes.ts:~345`), so a warmed entry cannot outlive an overlay change.
- Dirty or mid-stroke sessions still return blocks, so they are still skipped by the warm-up. Warm-up and request are synchronous between `syncOverlay` and `renderCache.set`, so no interleaving with a session mutation.
- It contradicts the letter of trap 2 ("leave the pre-warm alone") only in that behaviour shifted via the shared helper; the report discloses this. Splitting a second helper to keep the old warm behaviour would cost more than it saves.

### Q3: do the new tests really observe the cache?

Yes for the three cache tests. They measure the number of calls to a function that only the miss path or the live path calls (`project.layoutById` for GBA, `proj.map` for GBC), against a no-session baseline taken on a different map in the same server (`hit`), so the assertions are `clean.n === hit` (not 0, so they do not depend on the absolute count), `dirty.n > hit`, `undone.n === hit`, plus PNG equality/inequality against the disk render. The reported mutations (old `if (liveEntry)` and `openBlocks` returning blocks for any session) fail the clean-session assertion, so the test is not vacuous for the headline case. Maps used (Route31/Route32, Route29/CherrygroveCity) are not used for sessions elsewhere in these files.

Weaker spots:
- Staged-only GBA test (`api.test.ts:589-634`): the load-bearing assertion is `isDirty === true` (line ~630). The pixel assertion `png !== disk` would also pass if the bypass were removed entirely, because the staged overlay change clears `pngCache` and the cached path then re-renders with the overlay. So the test documents the invariant (staged edit is dirty) rather than guarding the bypass. This matches the plan's own reasoning ("right only because the overlay sync cleared the cache"), so acceptable; just do not read it as a bypass regression guard.
- The `hit` baseline silently becomes wrong if an earlier test in the same server ever leaves a session open on Route32/CherrygroveCity (then `hit` would equal the live-path count and the clean assertion would stop discriminating). Not an issue today.

## Part 1 findings

- **M1 (Minor)** `packages/server/src/index.ts:484`, `gbcEditRoutes.ts:545`: `paint/apply` without `paint/begin` leaves blocks diverged with `isDirty` false and no open stroke, so the render route now serves disk. Scenario: a scripted client posts `paint/apply` directly, then fetches the render; before the change it showed the painted cell, now it does not. UI never does this. Optional: no action, or note it in the comment.
- **M2 (Minor)** Stale comments. `index.ts:~462-470` still opens with "A live edit session for this exact map name means disk state is stale" and the new paragraph below it contradicts it; `gbcRoutes.ts:443-445` still says "An open edit session renders its own ... blocks". Reword to "a dirty (or mid-stroke) session".
- **M3 (Minor)** `api.test.ts:10-17`: `createProjectHandler` is imported in a second import from `../src/index.js` already imported at line 4 (`createServer`); merge into one import. Also `const hit` comments say "cache-hit baseline" but depend on `layoutById` being uncalled on hits; the comment explains this, fine.

## Part 2: H-a (`dcc7cea`)

### Spec checklist (plan "Task H" and row H-a)

| Item | Status | Where |
|---|---|---|
| Signature `jsonBody(req, send, guard, shapeText, handler)` in `http.ts` | met | `packages/server/src/http.ts:79-100` |
| Preamble: read, parse, 400 bad JSON, shape check, 500 on throw | met | same |
| 413 on oversize | met (matches hand copies' `.catch`) | `http.ts` catch branch |
| Messages match hand-written copies | met: `invalid JSON body: ${msg}`, `expected ${shape}, got ${body}`, `request body too large`, 500 `e.message` or `String(e)` are identical to `index.ts:740-755`, `gbcRoutes.ts:~506-520`, and the dungeons/placement copies | |
| Handler returning a rejected promise gives 500 | met: `return handler(parsed)` inside `.then` is adopted by the chain, so a rejection reaches `.catch`; test uses an `async` handler | test `answers 500 ...` |
| Empty body gives 400 invalid JSON | met | test "treats an empty body as invalid JSON" |
| `send` called exactly once on every path | met by construction: each early branch `return`s without throwing; the handler's own sends are the handler's; the catch only runs for a rejection. Not asserted directly by any test | |
| Tests meaningful | mostly (see below) | `http.test.ts:186-248` |
| Plan edit adding the GBC placement known-map requirement | present and consistent with `index.ts:781-783` (GBA known-map check) vs the GBC copy that has none (`gbcRoutes.ts:~560-570`) | plan-h-hardening.md ~393 |

### Findings

- **M4 (Minor)** `docs/superpowers/task-reports/pokemap-plan-h-review-backlog/task-H-a-report.md` (last line): `Mutation checks: MUTATION_PLACEHOLDER` was committed unfilled. The plan tier is Medium so mutations are optional, but a literal placeholder in a committed report should be filled or removed.
- **M5 (Minor)** `packages/server/test/http.test.ts` ("answers 500 ... (sync or async)"): both handlers are `async`, so a synchronous `throw` (thrown inside `.then`, which also becomes a rejection) is not distinct from the async case; the "sync" in the title is not exercised. Add a non-async handler that throws, or drop the word.
- **M6 (Minor)** Tests do not assert "send once". Failure scenario: a refactor that sends 400 and then falls through to the handler (missing `return`) would make `sendJson` throw `ERR_HTTP_HEADERS_SENT`, producing an unhandled rejection that vitest does flag, but not a targeted assertion; the 413 test also does not assert the handler was not called. Add `called` flags to the 413 and shape-mismatch tests (the malformed test already has one).
- **M7 (Minor, pre-existing hazard carried over)** `http.ts:~95-99`: if the handler already wrote a response and then throws, the catch's `send(500, ...)` calls `res.writeHead` a second time, which throws `ERR_HTTP_HEADERS_SENT` out of the `.catch`, so the returned promise rejects. Callers that `return jsonBody(...)` from the route handler (the planned H-b usage) will leave that as an unhandled rejection. The hand-written copies have the same flaw, so this is not a regression; a `headersSent` guard cannot be written here because `send` hides `res`. Mention for H-b: handlers should send only as their last action.
- **M8 (Minor)** Formatting: `http.ts` has two blank lines before the new doc comment and no blank line between the closing `}` of `jsonBody` and `/** JSON replies ...`; `http.test.ts` has no blank line before `describe("jsonBody"`. Run the repo formatter or add the blank lines.
- Comment accuracy: the doc comment ("read, parse, 400 on bad JSON, shape check, 413 on an oversize body, 500 on a throw") and "Messages match the hand-written copies exactly" are accurate. "The one route that treats it as `{}` keeps its own code" (edit-session commit) is plausible (not verified in this review; `index.ts` commit route).

## Not verified here
Tests were not run (orchestrator). The 413 test sends 16 MiB + 1 in one chunked write; if `post` ever hits EPIPE/ECONNRESET while the server replies early it could flake, but `readBody` removes only its data listener and leaves the stream flowing, and the existing oversize tests use the same helper.
