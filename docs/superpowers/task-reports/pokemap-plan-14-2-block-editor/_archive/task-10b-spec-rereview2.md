Approved: Critical 0, Important 0, Minor 0

Reviewer: Claude Opus (fallback; astra out of quota). ROLE: spec. Fix round 2, static review at `041c362`.
Scope: `git diff 94ddb40..041c362 -- packages/` (tests `7721a21`, impl `041c362`). Paths are relative to `packages/ui/`.
I ran no tests and edited no code. Binding rulings: U1-U6 (as in rereview 1) and U7a-c (task-10b-fix2-brief.md).

## My round-1 Minors

**Minor 1 (`useGbcMap` reload generation unpinned): closed.**
- The test is `test/gbc/useGbcMap.test.ts:110-135`. The mount reply carries no version. `reload()` is then started,
  and the test waits until fetch #2 has been issued. It resets the store, resolves that reply with 20, and expects 0.
  A second `reload()` in the new generation answers 21, and the test expects 21.
- Mutants it kills:
  - no generation at `src/gbc/hooks/useGbcMap.ts:52`: 20 would land;
  - generation captured after the `await` at `:51`: the capture would see the new generation, so 20 would land;
  - no note at all: 21 would never land.
- This agrees with the conductor's killed "reload without generation" mutant.

**Minor 2 (world `imageUrl` identity stable without a bump): closed.**
- The tests are `test/WorldCanvasSurface.test.tsx:477-486` and `test/gbc/GbcWorldCanvasSurface.test.tsx:572-581`.
  Each re-renders the host with the same props, settles, and expects `toBe(original)`.
- The re-render really does reach `useWorldTiles`:
  - neither `WorldSurface` nor the family wrappers are `memo`-wrapped (no `memo(` in `canvas/WorldSurface.tsx`,
    `components/WorldCanvas.tsx`, `gbc/GbcWorldCanvas.tsx`);
  - the GBC re-render keeps `time="day"`, the same value `mount` uses (`GbcWorldCanvasSurface.test.tsx:245`), so the
    adapter memo holds.
- A builder that is fresh on every render therefore fails. This agrees with the conductor's killed mutant.
- Observation, not a finding: the tests do not assert that `tileCalls.imageUrls` grew after the re-render. If
  `WorldSurface` were memoised later, they would pass vacuously.

## U7a-c

**U7a: met.**
- `src/canvas/worldSurfaceAdapter.ts:126-127` replaces `imageUrl` with `useImageUrl(): (p, version) => string`.
- `src/canvas/WorldSurface.tsx:98` calls it once at the top level, right after `adapter.useWorld` and
  `adapter.useCoverage` (`:96-97`), and passes the result at `:253`.
- The grep finds no other reader. The only remaining `imageUrl` identifiers in `src` are `useWorldTiles`' own option
  and the unrelated map-surface adapter.
- Both families keep `useTilesetVersion()` plus `useCallback`, keyed on `[tv]` for GBA (`src/gba/worldSurface.tsx:207-213`)
  and `[tv, time]` for GBC (`src/gbc/worldSurface.tsx:314-320`).
- The URL builder bodies are textually unchanged from `94ddb40`. Only the property line moved from `get imageUrl()` to
  `useImageUrl: () =>`, so the URLs stay byte-identical.
- The two fake adapters (`test/canvas/WorldSurface.test.tsx:10,97`, `test/canvas/WorldSurfaceInteraction.test.tsx:10,170`)
  received the authorised mechanical edit, with each function hoisted to a module const so its identity is stable.

**U7b: met.**
- `src/shared/useEditSessionCore.ts:143` uses `await r.json().catch(() => null)`, and `:144` notes
  `null?.tilesetVersion`, which is `undefined`.
- `noteTilesetVersion` already drops anything that is not a finite number (`src/shared/tilesetVersion.ts:26`), so
  "note only when it is a number" holds.
- The local reset at `:145-148` now runs on a non-JSON 2xx.
- A non-2xx still throws at `:141` before any body read. That is unchanged behaviour and outside U7b.

**U7c: met.**
- `src/shared/tilesetVersion.ts:30` names the FamilyApp-unmount role, and `:46` documents `tilesetGeneration`.
- `src/hooks/useGuardedFetch.ts:66-67,74-79,91-92` no longer names `useGbcMap`. The callers it now lists match the
  code: `useGbcGroups` and `useGbcCoverage` (`gbc/hooks/useGbcCoverage.ts:18`) call the hook, while `useGbcWorld` and
  `useGbcMap` use only `fetchGuarded`.

## U1-U6 still hold

- The diff does not touch `useMapLayout.ts`, `useGbcMap.ts`, `post`, or discard's generation capture
  (`useEditSessionCore.ts:83,139`).
- All 5 announcers still capture the generation synchronously at send time and pass it.
- The `FamilyApp` reset and the store logic are unchanged apart from comments.
- The URL builders are unchanged (see U7a).

## New tests: do they pin what they name?

- **U7b** (`test/shared/tilesetVersion.test.tsx:109-128`): a real `Response("not json")` with status 200. The test
  marks the session dirty through `apply`, then discards, and expects `isDirty` false and the store still at 3.
  - On `94ddb40` the `await r.json()` rejects, so `discard` throws and the test fails. This matches the expected
    single red.
  - Mutants it kills: removing the `.catch`, or returning early on a body failure.
- **Quality m-1 (a)** (`useGbcMap.test.ts:137-156`): A's 500 error is cleared right after the switch to B and stays
  null once B lands. It kills a mutant that removes the URL-change reset at `src/gbc/hooks/useGbcMap.ts:32`.
- **Quality m-1 (b)** (`:158-181`): B's fetch is held pending, and `data` must be null rather than A's body. This also
  kills the removed-reset mutant.
- **Quality m-1 (c)** (`:183-205`): there is no reset, so A and B share one generation. B notes 1, then A's late
  reply of 20 is dropped. It kills a mutant that moves the note at `useGbcMap.ts:38` outside `!cancelled`.
- Oracles are literals and mocked replies throughout: 0, 1, 3, 20, 21, `"GET /api/map/MapA -> 500"`, and the body
  objects the test itself built, compared with `toBe`.
  - The error string matches the format that `fetchGuarded` and the existing `useGuardedFetch` tests already fix. It
    is a hand-written literal, not computed by the code under test.
  - No expectation is derived from the code under test.

## Not checked

- I did not run tests, typecheck or mutants. The kill claims above are static reasoning, and the conductor's red run
  (1 failed / 58 passed), the 2328/2328 run and the round-3 mutant results were not re-verified.
- Quality-role items are left to the quality pass: eslint `react-hooks` treatment of the `useImageUrl` arrow inside
  an object literal (the same pattern as the existing `useWorld` and `useCoverage` members), and the grammar of the
  rewritten `useGuardedFetch.ts:91-93` sentence.
- I did not run the UI live.
