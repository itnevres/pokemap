# Task A2 implementer report

Status: **DONE**

## Commits (base 48b50e8)
| sha | subject |
|---|---|
| ddbfe94 | feat(ui): hub guards + openProject (Task A2 step 1) |
| 184fc13 | feat(ui): SwitchConfirmDialog (Task A2 step 2) |
| 10fef87 | feat(ui): ProjectPicker (Task A2 step 3) |
| 1a8c170 | feat(ui): ProjectSwitcher (Task A2 step 4) |
| 2b9a4e9 | feat(ui): Root reads /api/hub; App/GbcApp gain switcher prop (step 5, partial -- bad `git add` pathspec) |
| 9b9974c | feat(ui): Root reads /api/hub; App/GbcApp gain switcher prop (cont'd -- rest of step 5) |
| 1dc73e9 | style(ui): project hub CSS + DESIGN.md (Task A2 step 6) |
| cbd2076 | fix(ui): stale-browse test scoped to entries list, not screen-wide |

Note on 2b9a4e9/9b9974c: `git add <files...>` included one already-`git rm`'d
path a second time, which made the whole `add` fail silently (fatal, nothing
staged) while `git commit -F msg` (no pathspec restriction, my mistake) still
committed the already-staged deletions alone. Split into a second commit
immediately after noticing; no content lost, both land in this branch.

## Files
New: `src/hub/{guards.ts,ProjectPicker.tsx,ProjectSwitcher.tsx,SwitchConfirmDialog.tsx}`,
`test/hub/{guards.test.ts,ProjectPicker.test.tsx,ProjectSwitcher.test.tsx,SwitchConfirmDialog.test.tsx}`.
Edited: `src/{App.tsx,Root.tsx,styles.css}`, `src/gbc/GbcApp.tsx`,
`src/gbc/hooks/{useGbcGroups.ts,useGbcMap.ts}`, `src/hooks/useGuardedFetch.ts`
(doc-comment only), `DESIGN.md`. Deleted: `src/hooks/useProjectInfo.ts`,
`test/gbc/useProjectInfo.test.ts`.

## Test edits (U1)
- `test/gbc/Root.test.tsx` **rewritten (behaviour change)**: Root now fetches
  `/api/hub` not `/api/project`. Mock extended to answer `/api/hub`,
  `/api/hub/browse` (empty listing), `/api/hub/open` (POST, echoes a
  configured `{family,root}` per requested path). Every original assertion's
  intent kept (loading placeholder, gba/gbc routing via Dungeon
  button/Time-of-day group, 500 alert, bad-shape alert naming the bad value,
  gbc-never-calls-GBA-only-routes). Added 4 new tests: `current:null` shows
  the picker's "Open a project" heading with no `/api/groups` call; switcher
  button renders in both App/GbcApp headers; two re-key remount tests
  (different root, and forced same-root reopen) proven via GbcApp's own
  Time-of-day state resetting to "Day" fresh after a real remount.
- `test/gbc/useProjectInfo.test.ts` **deleted**: tested the hook deleted
  alongside it (Root was its only importer).

## Gate
`npm test`: 112 files / 1762 tests pass (baseline 109/1715; net +4 test
files: +5 new hub files -1 deleted). `npm run typecheck`: clean.
`npx vite build packages/ui`: clean, no lightningcss warnings.
`git diff 48b50e8 -- packages/ui/test/`: exactly the 4 new `hub/` files, the
`Root.test.tsx` rewrite, and the deleted `useProjectInfo.test.ts` -- nothing
else. No `packages/server/` or `packages/core/` files touched.

## M1-M7 (all applied, run, confirmed red, restored via `git checkout --`)
| # | Mutation | Result |
|---|---|---|
| M1 | `Root`'s key = `family` only | RED — both re-key tests in `Root.test.tsx` failed (remount never happens on root/gen change) |
| M2 | `SwitchConfirmDialog`'s Cancel button also calls `onConfirm` | RED — ProjectPicker's 409-Cancel test failed (`postBodies` had 2 entries, not 1) |
| M3 | `ProjectPicker`'s entry Open button `disabled={false}` always | RED — the disabled-for-unsupported/null assertion failed |
| M4 | `openProject`'s 409 branch gated behind `false &&` | RED — 1 guards.test failure + 3 ProjectPicker.test failures (409 fell through to generic error) |
| M5 | `SwitchConfirmDialog`'s Cancel drops `autoFocus` | RED — the focus-on-mount assertion failed |
| M6 | Removed the `browseReqRef` staleness checks | RED (after fixing the test itself, see Deviations) |
| M7 | `isOpenConflict`'s `dirtyMaps` check widened to `Array.isArray` (accepts non-string items) | RED — the "rejects dirtyMaps with a number" test failed |

## Deviations
1. **Fixed a self-inflicted test bug found while running M6.** My original
   stale-browse test asserted `screen.getByText("tmp")` unscoped. Root's own
   post-navigation breadcrumb legitimately renders "tmp" as a path segment
   after browsing into `/tmp/misc`, so that assertion stayed true under
   *both* correct and buggy (guard-removed) behaviour — M6 did not go red on
   first attempt. Root-caused via a scratch debug test (not committed) that
   logged each `fetchGuarded` resolution; confirmed the state update *was*
   firing, the query was just ambiguous. Fixed by scoping the assertion to
   `.hub-picker__entries` via `within(...)` (commit cbd2076); re-ran M6,
   confirmed red, then restored. No spec deviation — same design, corrected
   test.
2. Split step 5's commit in two (see Commits table) after a bad `git add`
   pathspec silently dropped most of the changes from the first commit;
   fixed immediately, nothing lost.
3. `openProject`'s POST includes `headers: { "content-type": "application/json" }`,
   not specified verbatim in the spec's design prose but required for the
   server (`hub.ts`'s `readBody`/`JSON.parse`) to treat the body as JSON
   consistently with `SaveDialog`'s own commit POST pattern.

## Concerns
- Breadcrumb navigation (`ProjectPicker`'s `breadcrumbOf`) is implemented
  per the binding design section but has no dedicated unit test (not called
  for in the spec's Tests 1-6 list); it's exercised only incidentally.
- `ProjectPicker`'s `guessParent`/`ProjectSwitcher`'s `folderName` are
  intentionally naive (string-split heuristics, not the server's canonical
  `parentOf`) per the spec's own "client-side guess only" framing — flagged
  in both components' doc comments.
