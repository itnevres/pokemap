# D1 spec review — `15b8368`

**Verdict: changes requested.** Independently read the executed D1 spec, Plan 6c D1/U1–U4, implementation, existing GBA counterparts, and changed tests. No permanent implementation changes. The required feature is substantially present, but response validation, failure recovery, and regression coverage need correction.

## Findings

### SR-F1 — P2: placement POST bypasses the required response guard

`packages/ui/src/gbc/GbcWorldCanvas.tsx:803–808` uses raw `fetch`, checks only HTTP status, and never reads the `{ ok: true }` response. A 200 containing invalid JSON, `{ ok: false }`, or an unrelated object is treated as a successful save. The D1 executed spec explicitly requires `fetchGuarded`/`useGuardedFetch`, shape guards, and visible errors. Existing `fetchGuarded` only accepts GET arguments, so extend its API without changing existing callers, or share an appropriate guarded operation helper. Add the success-shape guard and behavioral coverage for HTTP, network, parse, and shape failures.

The existing `.catch` does visibly report network/non-OK failures; it is not a swallowed-rejection bug. World/encounter GETs already use guarded helpers with visible errors.

### SR-F2 — P2: the existing pre-fit regression test was made ineffective

`packages/ui/test/gbc/GbcWorldCanvas.test.tsx:543` adds `mapType: "INDOOR", manual: false` to `NearInterior` in **“F5 regression: nothing loads from the pre-fit zoom-1 view…”**. D1 now hides that map regardless of the fit gate, so the test no longer exercises the failure it names. SR-M1 removes `!fitted` from the visibility gate and the test passes. With the probe marked `TOWN` (SR-W1), the same mutation fails and requests `/api/render/NearInterior.png?time=day`. Keep this fixture drawable (`TOWN` or manual `INDOOR`) so it preserves its original regression purpose.

### SR-F3 — P2: server test edits remove existing placement guarantees

`packages/server/test/gbcRoutes.test.ts:629–665` replaces exact placement equality with visibility counts. Counts are needed, but can be added alongside equality after adding the new metadata/applying a known sidecar. **“buildGbcWorldPayload wire-shapes a real GbcWorld directly (unit, no HTTP)”** at line 694 now makes an HTTP request and never calls the imported builder or checks placements. Its name and former protection no longer match its body.

SR-M2 changes only NewBarkTown's returned x by +1; all seven GET-world/POST-placement tests pass. This is a real output change that the removed equality check would have caught. Restore the placement guarantee and the direct unit test, with explicit sidecar input and independently derived expected metadata.

### SR-F4 — P2: drag tests do not pin coordinates or the Shift-drag path

The new drop test at `packages/ui/test/gbc/GbcWorldCanvas.test.tsx:705` checks that a request body contains the map name and that an image is requested. SR-M3 shifts its persisted/drawn x by +1 and passes. In the test's 200×200 viewport, fit zoom is 10 and pan is `(0,50)`; dropping its 5×5 map at `(100,100)` must POST `{ map: "Interior", x: 8, y: 3 }` (`round(10−2.5)`, `round(5−2.5)`). Pin those independently derived numbers and the draw location.

SR-M4 suppresses `commitMapDrag`'s POST while retaining the entire local Shift-drag behavior; all 56 canvas component tests selected by `-t GbcWorldCanvas` pass. Add Shift+mousedown/move/up and leave-before-up cases, checking grab offset, rounded coordinates, exactly one POST, and no POST for a no-op move. This overlaps the quality review's drag-coverage finding.

### SR-F5 — P2: PerfPlus restoration is conditional on assertions already passing

`packages/server/test/gbcRoutes.test.ts:708–713` performs the POST, asserts status and response body, and only then assigns `written`. If the operation writes but the response assertion fails, `written` remains null and `finally` does nothing. A changed success response or a failure after the write therefore leaks the test placement into the real subject. Capture the post-operation file state before assertions and use that captured state for the guarded restore. Also track whether `.pokemap` existed before removing its empty directory, so an existing empty directory is preserved. The successful run's cleanup works; failure-path restoration is the gap.

### SR-F6 — P2: a save error has no recovery control

`GbcWorldCanvas.tsx:978–981` renders a permanent alert once `saveError` is set. Neither a later successful save nor a dismiss action clears it. The GBA counterpart provides a dismissible save error (`WorldCanvas.tsx:1945–1955`), and D1 asks to port the same placement error handling. Add dismissal or clearly scoped retry/success clearing and pin recovery with a failed-then-successful sequence.

## Requirement and boundary audit

- **Payload/visibility:** required `mapType` and `manual` fields are present and guarded. `applySidecar` precedes wire serialization; manual hidden maps draw. Independent parsing of PerfPlus `maps.asm` reproduced TOWN 23, ROUTE 54, CAVE 42, DUNGEON 39, INDOOR 208, GATE 25: 158 shown, 233 hidden.
- **State invariant:** there is one `view` state holding zoom/pan/fitted. All view updaters are pure; placement override state is not another view state. No setter is called inside another setter's updater.
- **U1/GBA:** `git diff 15b8368^ 15b8368 -- packages/server/test/world.test.ts packages/ui/test/App.test.tsx packages/ui/test/WorldCanvas.test.tsx packages/ui/test/world/visibility.test.ts packages/ui/test/MapTree.test.tsx` is empty. Shared `MapTree`/visibility helper preserve the original GBA default set. GBA behavior is unchanged by inspection and the unchanged visibility/tree tests pass.
- **U2:** double-click still opens Map view; no GBC editing was added. Context-menu work belongs to E3. **U3:** conflict acceptance belongs to D4 and is untouched. **U4:** unchanged `pickBorderSide` still uses the same order; manual coordinate overrides feed border geometry.
- **Writes:** the new route reuses `readBody`, `readSidecar`, and `writeSidecar`; its only intended persistent destination is `.pokemap/world.json`. It mirrors GBA's request/response implementation. This also copies GBA's weak validation: JSON `null` reaches the 500 catch, and `1e400` becomes Infinity, passes `typeof number`, then serializes as null. The quality review separately requests the appropriate object/finite-number validation; I agree this should be fixed at the new GBC boundary without changing GBA behavior.
- **Tree freshness:** GbcApp owns a snapshot separate from canvas overrides, so the row remains grey after a drop until World mode is re-entered. This matches the explicitly accepted existing GBA limitation documented at `App.tsx:89–94`; unlike the quality review, I do not classify it as a new P1 parity violation. Sharing placement updates would improve D1, but the coordinator should explicitly decide whether to preserve that known parity limitation.
- **Collision scan:** `rg -n -F '.pokemap/world.json' packages` identifies the existing real GBA writer in `server/test/world.test.ts` and the new GBC writer in `gbcRoutes.test.ts`; core sidecar/dungeon tests use temporary roots. No other concurrent PerfPlus writer was used during this review. The real round-trip was run serially and restored the absent file.
- **Existing test report:** the implementer report names neither the two rewritten server tests nor the F5 fixture change. Other GBC edits add required metadata to GbcApp's WORLD_ONE/world-click/jump/lens fixtures, GbcWorldCanvas's WORLD/CONFLICT_WORLD/fit fixtures, `guards.test.ts`'s valid payload, and `useGbcWorld.test.ts`'s VALID_BODY; those are justified wire-shape migrations. Record those migrations and the reasons for the two server-test rewrites explicitly. No existing GBA test edit requires justification because there is none.

## Fresh checks and mutation ledger

Baseline: six UI files (`guards`, `GbcWorldCanvas`, `GbcApp`, `useGbcWorld`, unchanged world visibility and MapTree) passed **196 tests**. Focused `gbcRoutes.test.ts -t 'GET /api/world|POST /api/world/placement'` passed **7 tests, 71 skipped**, including the real PerfPlus round-trip. Existing jsdom canvas warnings occurred in GbcApp tests. No full suite/typecheck was rerun by this reviewer.

Every mutation below was checked for a concrete observable change before execution. Each literal anchor matched exactly once. Original Buffers stayed in memory, were restored in `finally`, and compared byte-for-byte. No checkout, restore, stash, or persistent implementation edit was used.

| ID | Concrete effect / result |
| --- | --- |
| SR-M1-PREFIT | Remove `!fitted` from visibility gate; can load a shown map in the initial zoom-1 viewport before fit. Current F5 test **survived** (1 passed/89 skipped). |
| SR-W1-SHOWN-PREFIT-WITNESS | With SR-M1 active, change only NearInterior's test fixture type to TOWN. **Failed** with the extra NearInterior render URL, proving SR-M1 is non-equivalent and the fixture change hides it. |
| SR-M2-WORLD-X | Add +1 to NewBarkTown's wire x only. **Survived** all 7 focused server tests. |
| SR-M3-DROP-X | Add +1 to the drop path's computed x. **Survived** the new hidden-drop test (1 passed/89 skipped). |
| SR-M4-NO-SHIFT-COMMIT | Disable only the changed-position Shift-drag POST. **Survived** all 56 selected canvas component tests (34 pure tests skipped). |

Restored SHA-256: canvas source `b1f4cad63279ba1d93de5982593558c2ab90e55c14aeb27fb390d3c35c2b7371`; canvas test `e54a3c9fe94562c43a47e3e13fdfb247f109c24e71d62d3c666087c9016f8505`; routes source `37df543435fea851c18898023264239fae315e87f585495602467c1dbc25e8d9`. Final diff of these three paths is empty. The implementer's D1-GUARD-MAPTYPE, D1-CANVAS-MANUAL-VISIBILITY, and D1-ROUTE-PLACEMENT results were read as historical evidence, not represented as reviewer reruns.

PerfPlus `.pokemap/world.json` remains absent. GBA sidecar SHA-1 remains the review-start value `b285bbf74a86b9d2fbfbeb7df6aed9624300ac3f`; this does not repair or erase the earlier preflight discrepancy. Reports and D2 work belonging to other agents were left untouched.
