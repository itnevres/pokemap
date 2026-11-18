Needs changes — Critical: 0, Important: 2, Minor: 1.

Paths below are relative to `packages/ui/`.

1. **Important — U1: not every session response updates the store.**  
   `src/shared/useEditSessionCore.ts:92` notes versions only through `post()`. The separate discard path at **lines 133–144** never reads its response body.
   
   Concrete failure: discard a staged tileset at version 5. The server removes the overlay and returns version 6, but the client remains at 5. An open palette retains its staged-image URLs; other maps/world tiles sharing that tileset also receive no version notification. Reading the version must preserve discard’s existing reset behavior rather than merging the empty session grid.

   External session readers also bypass this addition: `src/gbc/hooks/useGbcEditSession.ts:134`, `src/hooks/useEditSession.ts:262`, and their sign/indicator callers (`src/shared/SignEditor.tsx:52`, `src/components/PokemonIndicatorDialog.tsx:124`). A newer version delivered through those responses is ignored. The GBA external-update interface drops the payload’s version before calling the core.

2. **Important — U1: late responses can undo project-switch isolation.**  
   `src/hooks/useMapLayout.ts:63` calls `noteTilesetVersion` **before** checking `cancelled`. Likewise, `src/shared/useEditSessionCore.ts:92` records a successful POST response without checking whether its project has retired.

   Concrete failure: project A’s map response carrying version 20 arrives after switching to B and after the reset. It sets B’s store to 20. B’s legitimate versions 1, 2, etc. are then ignored by max-only accumulation, so subsequent tileset edits stop changing URLs until B exceeds 20.

   `FamilyApp` **does unmount on every shell project switch**, including forced reopen: `src/Root.tsx:32,56–60` increments generation and keys it by family/root/generation. The cleanup at `src/shell/FamilyApp.tsx:33` therefore runs, but does not prevent late writes. Version announcements need project-lifetime protection.

3. **Minor — U2: world callbacks do not capture the subscribed version or change identity.**  
   `src/gba/worldSurface.tsx:169–175,214` and `src/gbc/worldSurface.tsx:273–279,321` read `currentTilesetVersion()` inside stable callbacks. Their adapters are memoized at `src/components/WorldCanvas.tsx:79` and `src/gbc/GbcWorldCanvas.tsx:59`.

   On a version bump, the `imageUrl` passed to `useWorldTiles` remains identical, contrary to U2’s explicit requirement. Current visible-tile refetching nevertheless works through a different dependency: rebuilding `world` changes `drawn`, then `visible` (`src/canvas/WorldSurface.tsx:236–252`). This is an implementation-contract deviation, not a demonstrated current rendering failure.

**Ruling assessment**

| Ruling | Result |
|---|---|
| **U1** | **Deviates:** findings 1–2. Store max-only accumulation, finite-number filtering, reset and subscription are correct. Both map loaders announce versions, subject to the GBA lifetime defect. |
| **U2** | **Deviates:** finding 3. All six listed URL builders otherwise preserve version-zero URLs, append `tv` last, and choose `?`/`&` correctly. |
| **U3** | **Implemented:** once the store changes, mounted map canvases and palettes update; mounted world views refetch through changed visibility inputs. Missing announcements remain U1 failures. |
| **U4** | **Implemented:** existing exact-URL expectations remain unchanged; new tests explicitly set/reset the store. |
| **U5** | **Implemented:** no server changes. `FamilyApp` is the reset integration expressly permitted by U1 and the plan. |

**New-test assessment — all 12**

| Test location | Does it pin its named behavior? |
|---|---|
| `test/shared/tilesetVersion.test.tsx` — starts/max/reset | Yes: 0 → 3, ignores 2, resets to 0. |
| Same — invalid values | Yes for every named input: string, NaN, undefined, null, Infinity. |
| Same — mounted subscription | Yes: two bumps update the existing mounted probe. |
| Same — session reply | Yes for one successful `core.post()` response only; does not cover discard or external readers. |
| `test/MetatilePalette.test.tsx` — mounted palette | Yes: exact zero URLs and versioned URLs across primary and secondary IDs. |
| `test/gbc/GbcMetatilePalette.test.tsx` — mounted palette | Yes: sampled thumbnails preserve `time` and append `tv`. |
| `test/gba/GbaMapSurface.test.tsx` — mounted canvas | Yes: existing canvas URL preserves `border` and adds `tv`. |
| `test/gbc/GbcMapSurface.test.tsx` — mounted canvas | Yes: preserves `border` and `time`, appending `tv` last. |
| `test/WorldCanvasSurface.test.tsx` — visible tile | Yes: observes a new image request after a store bump without remounting. |
| Same — per-map version | Yes: exact `?v=3&tv=5` request. |
| `test/gbc/GbcWorldCanvasSurface.test.tsx` — visible tile | Yes: observes a new request preserving `time`. |
| Same — per-map version | Yes: exact `?time=day&v=1&tv=5` request. |

The world tests pin requests, not callback identity or completed image replacement. None of the new tests covers project-switch isolation, discard announcements, external session announcements, or map-loader announcements.

**Not checked:** runtime behavior, typecheck, build, test execution, or mutations. The conductor’s 2311/2311 result and red-run evidence were not independently verified. Review was static at `f6cedeb`, scoped to `d1b7eee..f6cedeb -- packages/` with supporting call-path reads. No files were edited.