Needs changes. Critical: 0, Important: 1, Minor: 3.

Reviewer: Claude Opus (fallback; astra out of quota). ROLE: quality. Task 10b fix round 1, scope `git diff f6cedeb..94ddb40 -- packages/`
(commits cac902f, 4d8991b, 94ddb40). This was a static review: I read the code and used git only. I ran no tests, typecheck or mutants.

## Round-1 findings

- **I1 (late reply after a project switch restores the old version): closed.**
  - The fix adds `tilesetGeneration()` (`shared/tilesetVersion.ts:46`). `resetTilesetVersion` now bumps the generation (`:32`), and `noteTilesetVersion` drops a stale generation (`:25`).
  - Every announcer captures the generation just before its own `fetch`, not when the reply lands:
    - `useEditSessionCore.ts:83`: `post`, after the undo/redo barrier.
    - `:139`: `discard`, after the barrier.
    - `useMapLayout.ts:57`.
    - `useGbcMap.ts:35` and `:50`: the effect and `reload`.
  - `useMapLayout` now notes only inside `if (!cancelled)` (`:64-65`).
  - Ordering checked by hand. On a project switch, React runs the old tree's passive cleanups (`FamilyApp.tsx:33` reset) before the new tree's passive mounts, so the new loaders capture the new generation. Under StrictMode (`main.tsx:10`), the double-invoked cleanup bumps the generation, and the re-run effects capture it again. The first-pass requests are already `cancelled`. No leak.
  - The four `noteTilesetVersion` call sites in `src/` all pass a generation.
- **I2 (discard never notes the version): closed.** `useEditSessionCore.ts:142-143` reads the body and notes it under the captured generation. The local reset at `:144-147` is unchanged, and the empty session grid is not merged (U6a). Both hubs answer 200 JSON with `tilesetVersion`: `server/src/index.ts:1035`, and `gbcEditRoutes.ts:403` via `NOTHING_OPEN()`.
- **Round-1 observation (stable world `imageUrl` identity, coupled to world rebuilds): closed functionally by U6c.** See I-1 below for the shape.

## Findings

### Important

**I-1. The world `imageUrl` is a property getter that calls hooks, hidden behind an interface typed as a plain method.**
- Where: `gba/worldSurface.tsx:207-213`, `gbc/worldSurface.tsx:314-320`, `canvas/worldSurfaceAdapter.ts:127`.
- Why it works today: the only read is `canvas/WorldSurface.tsx:252`. That read is unconditional, in render, after every other hook, with no early return before it. I found no other read in `packages/ui/src` or `packages/ui/test`: no spread, no `Object.keys`, no effect, no callback. There is no ESLint config and no React Compiler in the repo.
- The hazard: `adapter.imageUrl` looks like a method (`imageUrl(p, version): string`), but every property read is now a `useSyncExternalStore` plus `useCallback` call. The type system, the name and the interface doc all hide that. It breaks the rule "only call hooks from components or `use*` hooks".
- Failure scenario 1: WorldSurface already calls adapter members inside effects (`adapter.drawnByDefault(p)` at `WorldSurface.tsx:214`, `drawExtraLayers` in the draw effect). A follow-up that prefetches or thumbnails a placement with `adapter.imageUrl(p, v)` in an effect or event handler would throw "Invalid hook call" and take the world view down.
- Failure scenario 2: spreading a real adapter (`{ ...createGbaWorldSurface(), x }`) invokes the getter. Outside render, that is a null-dispatcher crash. Inside some other component's render, it silently adds two hooks to that component. This codebase already uses the spread pattern on adapters (`test/canvas/WorldSurfaceInteraction.test.tsx:428,602,668`; fakes today).
- Failure scenario 3: WorldSurface's hook count now depends on which adapter prop it receives. Fakes have a plain `imageUrl` (0 hooks); real adapters have 2. Re-rendering one instance from a fake adapter to a real one fails with "Rendered more hooks than during the previous render".
- Cleaner shape that still fits U6c: an adapter hook member `useImageUrl(): (p, version) => string`. Each family builds it from `useTilesetVersion()` plus `useCallback` keyed on `[tv]` (GBC: `[tv, time]`). WorldSurface calls it at top level, next to `adapter.useWorld` and `adapter.useCoverage` (`WorldSurface.tsx:96-97`). That is the existing convention for hook-bearing adapter members. URLs stay byte-identical. The change is about 10 lines across 4 files plus the interface. The new world tests keep working, because the `vi.mock` wrapper still sees the same function identity.

### Minor

**m-1. The inline copy of `useGuardedFetch` in `useGbcMap` matches its behaviour but has lost its test coverage.**
- Behaviour check, `gbc/hooks/useGbcMap.ts:30-45` against `hooks/useGuardedFetch.ts:102-124`:
  - Error text is identical: same `fetchGuarded`, same `e instanceof Error ? e.message : String(e)`.
  - A URL change resets both data and error (`:32`).
  - The `cancelled` guard is on both branches.
  - Dropping `guard` from the deps is safe, because `isGbcMapPayload` is a module constant.
  - One tiny drift: `setBase({ data: null, error: null })` allocates a new object, so every mount or URL change costs one extra render. The old code used `setData(null)`, which bails out when the value is already null.
- The gap: the URL-switch guarantees are pinned only for the shared hook (`useGuardedFetch.test.ts:122` sticky error, `:143` stale payload while pending). `useGbcMap.test.ts` has no A→B case, and has no GBC analogue of `useMapLayout.test.ts`'s "does not announce a cancelled map response in the same generation".
- Failure scenario (by inspection, not run): someone moves `noteTilesetVersion` at `useGbcMap.ts:38` outside `if (!cancelled)`, or drops the guard at `:37`. No `useGbcMap` test fails. A slow GET for map A that lands after switching to B would then put A's payload under B's name, or note A's version.
- Fix: port the two `useGuardedFetch` URL-switch tests and the cancelled-same-generation test into `useGbcMap.test.ts`. Alternatively, keep the shared hook and give it an optional `onSend`/`onData` pair, so the generation capture stays inside its effect.

**m-2. `discard` turns a server-committed discard into an error on any non-JSON 2xx body.**
- Where: `useEditSessionCore.ts:142`, `await r.json()`.
- Failure scenario: the hub answers 200 but the body is truncated or not JSON (for example, the connection drops mid-body). The server has already closed the session. `r.json()` rejects before `:145-147`, so the local state stays dirty, `seq.applied` is not advanced, and event options are not invalidated. Callers then show "Failed to discard." (`GbcMapEditing.tsx:171`, `MapEditingWorkspace.tsx:124`) for a discard that actually happened. A retry recovers, because the route is idempotent.
- `post`'s structured path already uses `r.json().catch(() => null)` (`:87`). Doing the same here keeps the version note best-effort and lets the reset still run. A note is not needed: `noteTilesetVersion` ignores non-numbers.

**m-3. Two doc comments are now stale.**
- `shared/tilesetVersion.ts:30` says `resetTilesetVersion` is for "(test isolation)". It is now production behaviour: the FamilyApp unmount and the generation retirement that U6b relies on. `tilesetGeneration` (`:46`) has no doc comment.
- `hooks/useGuardedFetch.ts:75-81,92-98` still names `useGbcMap` as its caller, and says it should not hand-roll this block.
- Failure scenario: a reader trusts "test isolation" and drops the call in FamilyApp, or "cleans up" the bump. That reopens I1.

## Fix quality: other checks (no finding)

- **GBC URL shape.** `gbc/worldSurface.tsx:317`: the `query ? … : ""` guard is a no-op, because `time=` is always present, so the URLs equal the pre-fix ones. GBA (`:209-210`) is byte-identical to the removed `renderUrl`.
- **Bump-driven refetch is bounded.** `useWorldTiles.ts:53` skips entries whose URL is unchanged, so a new `imageUrl` identity re-requests only visible tiles whose URL actually changed. Off-screen tiles re-request when they scroll in.
- **Noting before `setBase`/`setData`, in the same tick.** `useGbcMap.ts:38-39` and `useMapLayout.ts:65-66` are batched by React 18+. The new payload and the new `tv` therefore render together, where the old effect-based note meant a render at the old `tv` first.
- **Announcing from a retired visit** (`discard` `:143` before `:144`; `post` `:93`). This is harmless: versions are project-global and max-only, and the generation guard covers project switches.

## Test robustness

- **Store reset per file.**
  - `tilesetVersion.test.tsx:13-17`, `useMapLayout.test.ts`, `useGbcMap.test.ts`, `WorldCanvasSurface.test.tsx` and `GbcWorldCanvasSurface.test.tsx` all reset in both `beforeEach` and `afterEach`.
  - `App.test.tsx` has no file-level reset. Its new test resets first (`:262`), and every FamilyApp unmount (RTL cleanup) resets too. Acceptable.
- **The `vi.mock` of `useWorldTiles`** (`WorldCanvasSurface.test.tsx:9-19`, `GbcWorldCanvasSurface.test.tsx:8-18`).
  - It spreads the real module, records `args[0].imageUrl`, and delegates unconditionally, so the hook order is unchanged for every test in the file.
  - `tileCalls` grows across the file but is cleared in the one test that reads it.
  - Neither file mocks `useWorldTiles` anywhere else.
- **Discrimination (could a wrong implementation pass?).**
  - Capturing the generation when the reply lands, rather than at send, fails the late-reply tests (`tilesetVersion.test.tsx:109-134`, `useMapLayout.test.ts:27`, `useGbcMap.test.ts:29`).
  - Capturing it once per mount fails the second, new-generation assertion.
  - Noting before `cancelled` in `useMapLayout` fails `useMapLayout.test.ts:49`.
  - The old stable `imageUrl` fails `not.toBe(original)`.
  - Weak spot: `not.toBe(original)` also passes for a fresh function on every render (no `useCallback`). That is harmless here because of `useWorldTiles.ts:53`, but the "identity is stable between bumps" half of U6c is not pinned.
- **Expectations come from literals and mocked replies**, not from the code under test. Example: `"/api/render/A.png?tv=5"`, `"?time=day&tv=5"`.

## Not checked

- Runtime behaviour, vitest, typecheck, UI build and mutants. I re-ran none of the conductor's evidence. The m-1 mutation claim is by inspection.
- The spec-role questions beyond what quality needed.
- Whether every project switch actually unmounts `FamilyApp`. I took this from the brief. The N11 test pins only that an unmount resets.
- How React DevTools treats the getters when inspecting props.
