# Task 6a implementer report

Status: GBC implementation complete; focused verification passes. The requested wider all-green gate remains unmet for the compatibility and environment findings below. No commit or mutation run.

## Scope and implementation

Changed only the authorized GBC files: `packages/server/src/gbcEditRoutes.ts`, `packages/server/src/gbcEditSessions.ts`, new `packages/server/src/signRefresh.ts`, new `packages/server/test/gbcSignRoutes.test.ts`, and this report. No GBA routes, core writers, existing tests, or fixtures were edited.

Added GET `sign/at`, POST `sign/put`, and POST `sign/resolve` under the existing `/api/edit/:map` prefix. Sign reads distinguish empty tiles, non-sign background events, editable original signs, and unsupported scripts. Returned text joins parsed lines and paragraphs, with marker mode and hand-edit status. Placement combines the inserted block and background event into one `place sign` snapshot; updates, Refresh, and Unlink each create one snapshot. All sign edits therefore share existing undo/redo/discard ownership.

Session open records body hashes for every editable sign-shaped block in the map file. Updates pass that baseline to the core helper; a marker's hash retains precedence. Number selection reuses the core allocator while reserving orphan text labels and double-colon labels as well as script labels. Coordinate, body-field, mode, optional label, and force validation happens before staging; occupied background tiles and mismatched update labels refuse.

The GBC half of signRefresh exports `refreshGbcLinkedSigns(proj, entry)`, returning `{ session, notices }`. It copies the session before editing, scans the map file for linked blocks, preserves free/original signs, skips hand-edited linked blocks with the exact required notice, and regenerates safe linked blocks with the shared charmap, wrapping, name/species, and update helpers. Generated text uses width 18. It opens a fresh read-only GBC project for linked generation so cached wild/header data cannot hide external source edits. The underlying splice helpers preserve target EOL and final-newline state. Plan and commit both call this same refresh and plan pipeline. Source/encoding/wrapping failures return located `{ refusals }` with a fix, before any write; failed generation never stages a partial edit.

## Test evidence

Tests were written first. The CLI failed while loading vitest.config.ts because esbuild could not read an ancestor directory. The allowed Node API fallback used `startVitest`, `config:false`, `watch:false`, and the repository setup file. Before implementation: nine assertion failures (missing 404 routes / absent notice responses), one passing painting-only preservation test.

Final focused command selection: `packages/server/test/gbcSignRoutes.test.ts` plus `packages/core/test/write/{guards,save,saveScriptReplace,diff}.test.ts`. Result: **45 passed, 0 failed, 0 skipped**, five files. The new GBC suite contributes 12 passing cases: byte-exact LF/CRLF placement without a final newline; original Route29Sign1 read/adoption preserving body bytes; undo/redo, number reuse and discard; pure refresh and planned-session/written-byte equality after changing landmarks; hand-edit skip, explicit Refresh and Unlink; source-error refusal before pending paint writes; orphan-label reservation; unchanged sign bytes on painting-only saves; invalid text, occupancy, label and source-data refusals. Every new test writes only a fresh temp copy of the real GBC subject.

`npm.cmd run typecheck`: passed. `git diff --check`: passed.

## Wider gate and outstanding concerns

The requested complete server-test plus core/write run produced **288 passed, 26 failed, 38 skipped** across 21 files. Existing tests attempted protected real-root writes (GBA save/sign/dungeon tests, GBC sidecars, and six GBA corpus save/restore cases). These failures were already documented in prior task reports; they are not writes by the new temp-copy tests. The GBC edit suite's beforeAll Git porcelain check also failed due safe.directory, accounting for its 38 skipped cases.

Re-ran that suite using process-local `GIT_CONFIG_COUNT=1`, `GIT_CONFIG_KEY_0=safe.directory`, and `GIT_CONFIG_VALUE_0=C:/Programming Projects/pokecrystal-PerfPlus`, without changing Git configuration on disk: **34 passed, 4 failed, 0 skipped**. The four failures are response-shape assertions at gbcEditRoutes.test.ts lines 80, 272, 312, and 430. They compare against exactly `{ changes: [], refusals: [] }`; the binding Task 6 interface adds `signNotices: []`. This is a task-induced test-contract mismatch, not an unrelated failure. I kept the mandated wire shape and did not edit or loosen existing tests, as the dispatch explicitly forbids doing so. The coordinator must reconcile those assertions with the new API contract before the wider gate can pass.

GBA integration, independent reviews, mutation checks, and committing remain for the coordinator/6b. The pre-existing GBC save funnel remains non-transactional across its binary and text writes. No new assembler verification was available; committed sign output is re-parsed by the app's map-event loader in the placement tests.
