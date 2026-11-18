Approved: Critical 0, Important 0, Minor 2

Reviewer: Claude Opus (fallback; astra out of quota). ROLE: spec. Fix round 1, static review at `94ddb40`.
Scope: `git diff f6cedeb..HEAD -- packages/` (cac902f tests, 4d8991b conductor test, 94ddb40 fix). Paths are relative
to `packages/ui/`. I ran no tests and edited no code. Binding rulings: U1-U5 (task-10-rulings.md) and U6a-d (task-10b-fix1-brief.md).

## Earlier findings (round-1 spec report)

**I1 (discard never notes the version): closed.**
- `src/shared/useEditSessionCore.ts:139` captures the generation after `barrier()` and the `isCurrent` check, just
  before the fetch. `:142-143` reads the body and notes `tilesetVersion` with that generation, and does this before
  the `owner.isCurrent()` return at `:144`. That order is correct: the version belongs to the whole project, so a
  retired visit's reply is still a valid announcement, and the generation check covers the project-switch case.
- The local reset at `:145-147` is unchanged and does not merge the empty grid (U6a).
- Both hubs answer discard with JSON that carries `tilesetVersion`: GBA at `server/src/index.ts:1035`, GBC through
  `ok(NOTHING_OPEN())` at `server/src/gbcEditRoutes.ts:403` and `:103-105`. A successful discard therefore always has
  a body to parse.
- The round-1 note about the sign/indicator/external readers is waived by U6d. I checked the reason it gives: none of
  those routes can change the overlay union, so it holds.

**I2 (a late reply after a project switch pushes an old version past the reset): closed.**
- `src/shared/tilesetVersion.ts:24-25,31-33,46` add the generation. `reset` increments it, and `note` drops a value
  whose generation was given and differs from the current one.
- The grep finds 5 calls to `noteTilesetVersion` in `src`. All 5 pass a generation captured synchronously just before
  their fetch:
  - `useMapLayout.ts:57`, noted at `:65` inside `if (!cancelled)`, as U6b requires;
  - `useGbcMap.ts:35`, noted at `:38` inside `if (!cancelled)`;
  - `useGbcMap.ts:50`, `reload`, noted at `:52`;
  - `useEditSessionCore.ts:83`, `post`, noted at `:93`; for undo/redo the capture comes after `await barrier()`, which
    is still send time;
  - `useEditSessionCore.ts:139`, `discard`, noted at `:143`.
- No unguarded announcer is left.
- Ordering across a switch: `Root.tsx:56-59` keys `FamilyApp` on family:root:gen, and `FamilyApp.tsx:33` resets in
  its unmount cleanup. React runs the deleted tree's passive cleanups before the new tree's passive mount effects.
  Both loaders fetch from `useEffect`, so the new project's first GET always captures the post-reset generation.
- StrictMode replay is also safe. The first mount's request gets the old generation, but its effect is cancelled, and
  the second mount captures the new one.

**m1 (world `imageUrl` identity does not change on a bump): closed.**
- `src/gba/worldSurface.tsx:207-213` and `src/gbc/worldSurface.tsx:314-320` turn `imageUrl` into a getter. The getter
  calls `useTilesetVersion()` and returns `useCallback(..., [tv])` (GBC: `[tv, time]`).
- Is the pattern sound under U6c? Yes, for the current consumers:
  - The only read of `adapter.imageUrl` in `src` is `src/canvas/WorldSurface.tsx:252`. It runs once per render, at
    the top level of the component body.
  - Every `return` between the component's first hooks (`:96-97`) and `:252` sits inside an effect or memo body. The
    component's only top-level return is at `:811`, so the read is unconditional and the hook order is stable.
  - The adapter is a `useMemo` object (`components/WorldCanvas.tsx:79`, `gbc/GbcWorldCanvas.tsx:59`). The repo
    already exposes hooks as adapter members (`adapter.useWorld`, `adapter.useCoverage` at `WorldSurface.tsx:96-97`),
    so hook-on-adapter is an existing pattern.
  - Nothing spreads the adapter (no `...adapter` / `Object.assign` / `Object.keys` in `src`), and no test reads the
    getter outside render.
  - A GBC time switch builds a new adapter, but the hook slots stay at the same positions in the same `WorldSurface`
    instance, so `[tv, time]` gives a new function. That is correct.
- URLs stay exact. GBA uses the same formula as before. GBC changed `?${query}` to `${query ? ... : ""}`, but `query`
  always contains `time=`, so the output is identical. The rules-of-hooks risk of a getter that calls hooks belongs to
  the quality pass; I raise no spec objection.

**Mutation survivors N1 and N11: pinned (by reasoning, not by a run).**
- N1 (the GBA loader does not note): `test/useMapLayout.test.ts:28-48` expects `currentTilesetVersion()` to be 1 after
  the second-generation GET, so dropping the note fails it.
- N11 (no reset on unmount): `test/App.test.tsx:260-268` notes 7, unmounts, and expects 0.

## U6b, tests and oracles

Static mutation analysis: for each wrong implementation, the test that fails.

| Wrong implementation | Fails |
|---|---|
| `reset` does not bump the generation | `tilesetVersion.test.tsx` "ignores stale generations" (`not.toBe(oldGeneration)`, then 20 is ignored) |
| `note` ignores its generation argument | late post/discard (`:109-134`), both loader late-reply tests (20 would land) |
| GBA note moved back before `cancelled` (generation kept) | `useMapLayout.test.ts:50-68` (cancelled Foo reply of 20 would land) |
| post/discard capture the generation after `await fetch` | late post/discard: the capture would see the new generation and accept 20 |
| post/discard capture the generation at hook mount (ref) | late post/discard: the second send under the new generation expects 1 |
| discard does not read the body | discard test `:93-107` (stays `tv=5`) |
| GBC base loader passes no generation / does not note | `useGbcMap.test.ts:29-50` (20 lands / 1 never lands) |
| world `imageUrl` stable (old `currentTilesetVersion` shape) | both world tests: `not.toBe(original)` |
| `FamilyApp` cleanup removed | `App.test.tsx:260` |

- Every oracle is a literal or a mocked reply (versions 1/5/6/7/20, exact URL strings). No expectation comes from the
  code under test.
- The `vi.mock` of `useWorldTiles` (`WorldCanvasSurface.test.tsx:9-19`, `gbc/GbcWorldCanvasSurface.test.tsx:8-18`)
  records the argument and delegates to the real hook unconditionally, so the existing request assertions still
  exercise real behaviour.
- Every new or extended test file resets the store in both `beforeEach` and `afterEach`.
- Brief case 1 says "a mounted palette", but the discard test (`tilesetVersion.test.tsx:93-107`) mounts a probe
  `<img>` that builds its own URL from `useTilesetVersion()`, not the real `MetatilePalette`. The full chain still
  holds by composition, because round 1's `MetatilePalette.test.tsx` already pins that a mounted palette follows the
  store. I accept it as it stands.

## Findings

**Minor 1: the generation on `useGbcMap`'s `reload` is implemented but no test pins it.** `src/gbc/hooks/useGbcMap.ts:50,52`.
- Mutation: change `:52` to `noteTilesetVersion(v)` with no generation, or capture the generation after the `await`
  at `:51`. Every new test still passes, because the GBC late-reply test (`test/gbc/useGbcMap.test.ts:29-50`) covers
  only the base effect.
- Scenario if it regresses:
  1. GBC project A saves, and `reload()` is in flight.
  2. The user switches to project B. FamilyApp unmounts and resets the store.
  3. A's reload reply lands with `tilesetVersion: 9` and is noted without a guard. B's store is now 9.
  4. B's stages at versions 1-8 leave every render URL at `tv=9`, so the canvas and palette keep the first image
     fetched under `tv=9` and miss each later edit.
- The code is correct today. Suggested fix: add one `reload` variant of the existing late-reply test (start
  `reload()`, reset, resolve with 20, expect 0).

**Minor 2: nothing pins that the world `imageUrl` identity stays stable when there is no bump.** `src/gba/worldSurface.tsx:209`, `src/gbc/worldSurface.tsx:316`.
- The new world tests check only that the identity changes after a bump. A getter that returns a fresh arrow on every
  render (dropping `useCallback`) passes them.
- Scenario: that regression makes `useWorldTiles`' effect (`src/canvas/useWorldTiles.ts:74`) run on every
  `WorldSurface` render, including every pan and zoom frame. Each run recomputes the URL of every visible placement.
  There is no refetch, because the URLs are equal and hit `continue`, but it is wasted work that U6c's "keyed on it"
  wording was meant to prevent.
- Suggested fix: in the same tests, assert that a re-render without a bump (for example a viewport resize) keeps
  `tileCalls.imageUrls.at(-1)` identical.

## Checked and not raised

- GBA has no map re-GET after a save (`useMapLayout` has no reload), so a successful GBA save's bump is not noted until
  the next post, discard or map change. This causes no visible failure: the URL at the old version already shows the
  staged pixels, which equal the saved ones; a failed save does not bump; and the max-only rule means the next stage
  (a higher version) still moves the URLs. U6d accepts this path.
- `currentTilesetVersion` is no longer used in `src`. Only tests use it; it is still exported. Hygiene belongs to the
  quality pass.

## Not checked

- I did not run tests, typecheck, the build or any mutation. The mutation table above is static reasoning, and the
  conductor's red run (9 failed / 98 passed) and the round-2 mutant run were not re-verified.
- Quality-role items are left to the quality pass: whether `useGbcMap`'s inline effect drifts from
  `useGuardedFetch`, whether discard's `await r.json()` throws on a non-JSON 200, and any lint (react-hooks) behaviour
  of the getter.
- I did not run the UI live.
