# Follow-up 5: discard/close-session -- spec-compliance review

Verdict: SPEC COMPLIANT. No issues found.

## Method

Read implementer report in full, then independently: `git show --stat 2656c49`
(file list), full diff per file, source-read `editSessions.ts`'s `close()`
and route-ordering in `index.ts`, ran `npx vitest run packages/server
packages/ui` and `npm run test` (full suite) and `npm run typecheck` myself
rather than trusting reported numbers.

## 1. Server route -- CONFIRMED, exact match

`packages/server/src/index.ts:796-807`. `discardMatch` regex
`/^\/api\/edit\/(.+)\/discard$/`, placed after `/redo` (line 780-787) and
before the save/commit section (line 809) -- no earlier route regex can
shadow it (checked every `/^\/api\/edit\/(.+)\/...$/` pattern in the file,
all suffix-specific).

- 404: `if (!project.mapNames().includes(name)) return send(404, ...)` --
  same idiom used by every other map-name-taking route in the file (12
  occurrences).
- Response shape: `{ blocks: [], border: [], map: null, isDirty: false,
  canUndo: false, canRedo: false }` -- byte-identical object literal to
  undo/redo's own "nothing open" response (lines 774, 783).
- Idempotent: `editSessions.close(name)` is called unconditionally after the
  404 check, regardless of whether a session was open; `close()`
  (`editSessions.ts:62-64`) is `sessions.delete(mapName)` -- a no-op on a
  missing key, confirmed by reading the body directly, not just trusting the
  doc comment.
- No disk write: `close()`'s body is literally one `Map.delete` call --
  confirmed by reading `editSessions.ts:62-64` directly (not inferred).

Test coverage (`packages/server/test/saveRoutes.test.ts:107-160`, all read
in full): 404-unknown-map case, no-open-session no-op case
(`AzaleaTown_Mart`), and a real paint→discard→`/plan` round trip
(`AzaleaTown`) that asserts (a) the exact response body, (b) a subsequent
`GET /plan` shows `changes: []`/`refusals: []` (proof of a genuinely
re-opened, disk-backed session, not a retained dirty one), and (c)
`readFileSync(binPath)` is byte-identical before/after. Map-name choice
(`AzaleaTown`/`AzaleaTown_Mart`, confirmed grep'd as unused elsewhere in this
file's single shared `beforeAll` session store) avoids cross-test
collisions as claimed.

## 2. `useEditSession.ts` `discard()` -- CONFIRMED, traced precisely

`packages/ui/src/hooks/useEditSession.ts:334-344`.

- Does NOT call `call()`/`applyResponse`: it's a standalone `useCallback`
  doing its own bare `fetch` -- confirmed by reading the full function body,
  not just the doc comment claiming it.
- The blank-canvas root cause the doc comment cites is real: traced
  `MapCanvas.tsx`'s `blocks = editSession ? editSession.blocks :
  staticBlocks` and `App.tsx` always passing a real `editSession` object
  (never `undefined`) -- the ternary genuinely never takes the
  `staticBlocks` branch, so `applyResponse`'s `blocks: []` would stick.
- Reset target: `setBlocks(initialBlocks ?? [])`, `setMap(initialMap)` --
  the same pre-edit seed params the hook's own `[mapName, initialBlocks,
  initialMap]` effect (line 234-241) already uses, not the server's `[]`/
  `null` response body. `setBorder([])` matches that same reset effect's own
  border handling (there's no `initialBorder` param anywhere in this file --
  not a spec deviation, it's consistent with the pre-existing convention).
- Throws, does not silently reset: `if (!r.ok) throw new Error(...)` occurs
  *before* any `set*` call -- a failed response leaves local state
  untouched, confirmed by the dedicated failure test (see below).
- `if (!mapName) return` guard matches the exact idiom `call()`/`callEvent()`
  already use.

Test coverage (`packages/ui/test/useEditSession.test.tsx:255-315`, read in
full): the success test dirties local state first via a real `undo()` round
trip (mocked to return `blocks:[{metatileId:99,...}]`, `isDirty:true`),
*then* calls `discard()` and asserts `blocks` equals the original seed (not
`[]`) and `map` equals `MAP_BEFORE` (not `null`) -- a genuine reset, not a
coincidental match, as claimed. The failure test forces `ok:false`, asserts
the promise rejects, and asserts `blocks`/`isDirty` are still the dirtied
values afterward (not silently reset).

## 3. `Toolbar.tsx` -- CONFIRMED

`packages/ui/src/components/Toolbar.tsx:16-19` (new `onDiscard: () => void`
prop) and `:96-111` (new `toolbar__discard` group, `disabled={!isDirty}`,
`aria-label="Discard Changes"`, `className="map-canvas__btn
toolbar__discard-btn"`). Visually distinct from Save: separate `<div>`
group, separate CSS class (`.toolbar__discard-btn`, `styles.css:2079-2100`)
reusing the outline-then-fill-on-hover technique from
`.event-inspector__delete-btn` against the `--danger` token (confirmed that
token exists in `:root`), opposite hue from `.toolbar__save-btn`'s green.
Test (`Toolbar.test.tsx:74-86`) confirms disabled+no-op when `!isDirty`,
enabled+calls `onDiscard` when `isDirty`.

## 4. `App.tsx` `handleDiscard` -- CONFIRMED

`packages/ui/src/App.tsx:316-330`. `window.confirm("Discard all unsaved
changes on this map? This cannot be undone.")` guards the call; declining
returns early with no side effect. On confirm,
`editSession.discard().catch((e: unknown) =>
setEventOpError(eventOpErrorMessage(e)))` -- byte-identical pattern to the
four pre-existing call sites (lines 137, 158, 190, 231), not a new
error-surface invention.

Confirm-text note: the task description quotes selectMap's own guard text
("You have unsaved changes on this map. Discard them and switch maps?") as
a *tone* reference, not a verbatim requirement -- and that text is
semantically about switching maps, which discard doesn't do. The actual
implemented text is a reasonable same-tone variant for a different action.
Not a deviation.

Test coverage (`App.test.tsx:648-696`): confirm→true actually POSTs to
`/api/edit/PalletTown/discard` and clears the dirty indicator; confirm→false
never calls fetch and leaves the dirty indicator set. Both read in full and
re-run; both pass.

## 5. `SaveDialog.tsx` Cancel -- CONFIRMED zero behavior change

`packages/ui/src/components/SaveDialog.tsx` diff (`git show
2656c49 -- packages/ui/src/components/SaveDialog.tsx`) touches only the
comment block above the button. The line `<button type="button"
className="map-canvas__btn" onClick={onCancel} autoFocus>` is unchanged
context in the diff -- not a `-`/`+` line. `SaveDialog.test.tsx`'s 9
pre-existing tests are untouched in the commit and all still pass (verified
by re-running, not just trusting the report).

## Extra/unneeded work check

- `MapCanvas.test.tsx:81` -- one line added, `discard:
  vi.fn().mockResolvedValue(undefined)`, to the shared `makeEditSession()`
  mock factory's object literal. Confirmed via diff: purely a default-value
  addition for typecheck against the widened `UseEditSessionResult`
  interface, no assertions or test logic touched. All 32 tests in that file
  pass unmodified otherwise, as claimed.
- No other files beyond the 12 in `git show --stat 2656c49` (implementer
  report + 6 source files + 5 test files). Matches the report's file list
  exactly; nothing beyond scope.

## Test re-runs (own, independent)

- `npx vitest run packages/server packages/ui`: 29 files / 335 tests
  passed, including `saveRoutes.test.ts` (8), `App.test.tsx` (15),
  `Toolbar.test.tsx` (10), `MapCanvas.test.tsx` (32),
  `editSessions.test.ts` (5) -- all match claimed counts.
- `npx vitest run packages/ui/test/useEditSession.test.tsx
  packages/ui/test/SaveDialog.test.tsx`: 2 files / 24 tests passed (15 + 9,
  matches claim).
- `npm run typecheck`: clean, no errors.
- `npm run test` (full root suite): 73 files / 705 tests passed -- matches
  the report's claimed 705/705 exactly.
- `git status --porcelain` after all runs: only the pre-existing untracked
  `docs/superpowers/task-reports/pokemap-plan-2-editing/` dir (present
  before this review started, per session's initial git status) -- nothing
  from this verification pass left stray changes.

## Live-verify methodology spot-check

Did not re-drive the real dev server/browser myself for this review (not
necessary given the equivalent-strength server-level integration test
below); instead cross-checked the live-verify's *causal claims* against
code already traced and against an independent real-integration test that
exercises the same chain server-side:
`saveRoutes.test.ts`'s round-trip test performs real
`/paint/begin`+`/paint/apply`+`/paint/end`+`/discard`+`/plan` HTTP calls
against the real corpus and asserts the binary file is untouched throughout
-- the same "paint, discard, disk never touched" claim the live-verify makes
in the browser, verified here at the HTTP/filesystem layer instead of
DOM/screenshot layer. Combined with the traced `discard()` implementation
(resets to `initialBlocks`/`initialMap`, confirmed above) and the passing
`App.test.tsx` confirm-gate tests, the live-verify's reported outcomes
(prompt appears, decline preserves edits, accept reverts to original tiles
not blank, dirty state clears, disk untouched) are consistent with the
actual code paths and not contradicted by anything found. The described
methodology (stub `window.confirm` to `true` immediately before one real
click, let everything downstream -- `handleDiscard`, `editSession.discard()`,
`fetch`, server round trip -- run for real) is a legitimate way to exercise
the accept path in a sandboxed browser that auto-suppresses native dialogs;
it does not bypass any part of the claimed code path.

## Conclusion

- Missing requirements: none.
- Extra/unneeded work: none beyond the one legitimate incidental typecheck
  fix (MapCanvas.test.tsx mock default), which is harmless and necessary.
- Misunderstandings: none. Design decision (Cancel stays non-destructive,
  Discard is separate) was followed exactly; `discard()`'s bypass of
  `call()`/`applyResponse` is correctly reasoned and correctly implemented.
