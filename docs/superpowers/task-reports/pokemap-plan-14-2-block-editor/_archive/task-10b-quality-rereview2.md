Approved. Critical: 0, Important: 0, Minor: 1.

Reviewer: Claude Opus (fallback; astra out of quota). ROLE: quality, round 2. Scope: `git diff 94ddb40..041c362 -- packages/`
(tests `7721a21`, impl `041c362`). Static review only: code and git. I did not run tests, typecheck or mutants, and I edited nothing.
Rulings checked: U7a-c (`task-10b-fix2-brief.md`).

## Round-1 findings

- **I-1 (a property getter that called hooks): closed.**
  - The interface now declares `useImageUrl(): (p, version) => string`, with a doc comment saying it is a hook called once per render, unconditionally (`canvas/worldSurfaceAdapter.ts:126-127`).
  - Both families define it as a `use*` member: `gba/worldSurface.tsx:207`, `gbc/worldSurface.tsx:314`.
    - The bodies are unchanged from round 1, so the URLs are byte-identical.
    - The `useCallback` deps are `[tv]` (GBA) and `[tv, time]` (GBC).
  - `WorldSurface.tsx:98` calls it once, at top level, straight after `adapter.useWorld` / `adapter.useCoverage` (`:96-97`).
    - There is no early return before it, and the result reaches `useWorldTiles` at `:253`.
  - Nothing else reads an adapter `imageUrl` or `useImageUrl` in `packages/ui/src` or `test/`.
    - `MapSurface.tsx:114` reads `imageUrl` from a different interface (`mapSurfaceAdapter.ts`), which is out of scope.
  - A spread of an adapter (`WorldSurfaceInteraction.test.tsx:428,602,668`) now copies a function and invokes nothing.
- **m-1 (the `useGbcMap` inline copy had lost its coverage): closed by tests.** U7 ruled that the inline copy stays.
  - `useGbcMap.test.ts` gains the three cases the review asked for: sticky error, stale payload while B is pending, and a cancelled reply in the same generation.
  - It also gains the reload late-reply case (spec m1).
  - The conductor reports that the "note before cancelled" and "no reset on URL change" mutants are killed. Judged below.
- **m-2 (a strict `await r.json()` in discard): closed.**
  - `useEditSessionCore.ts:143` is now `r.json().catch(() => null)`.
  - `noteTilesetVersion(undefined, g)` is a no-op, because the finite-number check is at `tilesetVersion.ts:26`.
  - The local reset at `:145-148` therefore runs on any 2xx. A non-OK status still throws at `:141`.
- **m-3 (stale docs): closed.**
  - `tilesetVersion.ts:30` now names the production role (the FamilyApp unmount retires the generation).
  - `tilesetGeneration` has a doc comment (`:46`).
  - `useGuardedFetch.ts:66-67,73-79,91-92` no longer names `useGbcMap`.
  - The listed callers are accurate. `useGbcGroups` and `useGbcCoverage` call it, and so do `Root.tsx:29` and `hub/ProjectPicker.tsx:79`.
  - Nit, not counted: `useGuardedFetch.ts:91-93` reads "A caller whose `url` DOES change ... would, without this reset: an `error` ... stuck around forever". The rewrite has broken the grammar.

## The new shape

- **Hook order.** `adapter.useImageUrl()` is unconditional and sits in a fixed slot.
  - For the real adapters it adds two hooks (`useSyncExternalStore`, `useCallback`). The fakes add none.
  - So the hook count still depends on which adapter an instance receives. That is the same contract `useWorld` / `useCoverage` already carry: one adapter implementation per WorldSurface instance.
  - Changing GBC's time recreates the adapter (`GbcWorldCanvas.tsx:59`) but keeps the same hook shape. The `[tv, time]` deps then yield a new builder, which is correct, because `cacheKey: time` drops the cache anyway.
- **Fake adapters.** Both fake adapters now use one module-level `fakeImageUrl` constant, returned from a hook-free `useImageUrl`:
  - `canvas/WorldSurface.test.tsx:10,97`
  - `canvas/WorldSurfaceInteraction.test.tsx:10,170`
  - The constant keeps the builder's identity stable across renders, so `useWorldTiles`' effect does not re-run on every render, as it would with an inline arrow. The URLs are the same literals as before.
  - The test edits stay inside the two files U7a allowed. They are mechanical.
- **Lint and compiler.** A `use`-prefixed property is what `eslint-plugin-react-hooks` and the React Compiler recognise. Neither is configured in the repo today.

## Robustness of the new tests

- **Reload late reply** (`useGbcMap.test.ts:110-135`).
  - `VALID_BODY` (`:13-24`) has no `tilesetVersion`, so the base load notes nothing and the store starts at 0.
  - The generation is captured before the reload is reset, and the reply of 20 is dropped.
  - A second reload in the new generation answers 21, and 21 is noted.
  - The test therefore distinguishes three variants:
    - capturing at send time (passes);
    - capturing when the reply lands (fails at `toBe(0)`);
    - no generation at all (fails at `toBe(0)`).
- **Sticky error** (`:137-156`).
  - `rerender` is wrapped in `act`, which flushes the effect's `setBase` reset synchronously.
  - B's `fetch` resolves only in a later microtask, so the synchronous `error === null` assertion can only pass if the reset happened.
  - Removing the reset at `useGbcMap.ts:32` makes the error survive until B lands, so the test fails.
- **Stale payload** (`:158-180`). B is held on a manual `release`. `toBe(bodyA)` / `toBe(bodyB)` compare identity, so a mixed-up payload cannot satisfy the test.
- **Cancelled reply, same generation** (`:182-205`).
  - There is no reset in this test: B notes 1, then A's late reply of 20 must leave the store at 1.
  - This kills a note placed outside `if (!cancelled)` (`useGbcMap.ts:37-38`). The max rule would otherwise lift the store to 20.
- **Discard with a non-JSON 2xx** (`tilesetVersion.test.tsx:109-128`).
  - A real `new Response("not json", { status: 200 })` makes `r.json()` reject for real.
  - The observable is `isDirty` going true, then false, plus the store staying at 3.
  - The strict-`json` mutant rejects inside `act`, so the test fails on it.
  - `afterEach` unstubs `fetch` (`:14-17`).
- **Identity kept without a bump** (`WorldCanvasSurface.test.tsx:477-486`, `GbcWorldCanvasSurface.test.tsx:572-581`).
  - The GBC rerender keeps `time="day"`, which matches `mount` (`:245`). That keeps the adapter memo (`GbcWorldCanvas.tsx:59`) stable. GBA's adapter memo has `[]` deps.
  - Neither WorldCanvas, GbcWorldCanvas nor WorldSurface is wrapped in `memo`, so the rerender does reach `useWorldTiles`. This holds today, consistent with the conductor's killed "fresh per render" mutants.
  - The new world tests still record each call through the `vi.mock` wrapper, which delegates to the real hook, so hook order is unaffected.

### Minor

**m-A. The identity tests do not prove a re-render happened.**
- Where: `WorldCanvasSurface.test.tsx:483-485`, `GbcWorldCanvasSurface.test.tsx:578-580`.
- Both tests compare `tileCalls.imageUrls.at(-1)` with the value before the rerender. Neither asserts that a new call was recorded, for example that `tileCalls.imageUrls.length` grew.
- Failure scenario: a later `React.memo` on WorldCanvas, GbcWorldCanvas or WorldSurface turns `rerender` with equal props into a no-op. `at(-1)` then is the pre-rerender entry, and the test passes even if a builder is recreated on every render. The U6c "stable between bumps" pin would silently go vacuous.
- Fix: record the length before the rerender and assert it grew. This is optional, and it does not block.

## Not checked

- Runtime behaviour, vitest, typecheck, UI build and the round-3 mutants. I took these from the conductor and re-ran nothing.
- That `{ ...VALID_BODY, map: { name: "MapA" } }` passes `isGbcMapPayload`. If it did not, the stale-payload test would fail, and the conductor reports 2328/2328 passing.
- Spec-role coverage of U7 beyond what quality needed.
