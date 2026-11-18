Needs changes — 0 Critical / 2 Important / 0 Minor

1. **Important — Case 4 does not pin commit-time synchronization.** `packages/server/test/tilesetOverlay.test.ts:261–273`.

   The failed-save setup changes disk before the commit request. Replanning detects that change and returns before the writer’s `try/finally` (`index.ts:1067–1070`, `gbcEditRoutes.ts:436–438`), so this does not exercise synchronization after a writer failure.

   For success, the test requests a render and then map GET before checking the version. Both endpoints synchronize independently. Removing the commit’s `syncOverlay()` would therefore still allow these assertions to pass: the next GET repairs the stale overlay.

   Pin synchronization before any subsequent HTTP request, and separately exercise a failure that reaches the writer’s `finally`. Keep the external-change refusal case too.

2. **Important — Cases 3 and 4 use staged output as their expected pixels, contrary to V7’s independent-oracle requirement.** `packages/server/test/tilesetOverlay.test.ts:226–235,255–270`.

   Case 3 records the implementation’s staged thumbnail and reuses it as the expected redo result. Case 4 similarly records the staged render as its post-save expectation. The only independent check on those staged pixels is that they differ from the original.

   A wrong implementation that consistently renders a different, incorrect metatile during staging, redo and save can satisfy these comparisons. Capture the intended replacement’s PNG through the hub before staging, in the same rendering context, and compare against that independent oracle. Preservation comparisons may remain as additional assertions.

**Ruling assessment**

| Ruling | Decision |
|---|---|
| V1 | **Implemented exactly.** `tilesetOverlay.ts:4–28` has the required interface, sorted-owner union, restored entries, Buffer identity comparison, no-op return, and prescribed update order. Both family states start at version zero with an empty map. |
| V2 | **Implemented at the named call points**, detailed below. Writer success and exceptions synchronize in `finally`; pre-writer refusals return earlier. |
| V3 | **Implemented exactly.** GBA clears only `pngCache` (`index.ts:220`). GBC clears exactly render, metatile, warp and coverage caches (`gbcRoutes.ts:362–366`). Existing commit invalidations remain separate. |
| V4 | **Implemented exactly for the named payloads.** Session and nothing-open builders use their sync return directly. Map handlers capture that request’s return and include it in the payload. `stageTilesetPlan` remains unchanged and version-free. |
| V5 | **Implemented in the writer paths.** Success closes the session before synchronization; failure retains it. GBA retains its success-path `pngCache.clear()`. Case 4 does not adequately prove this timing. |
| V6 | **Implemented.** No new production disk writes, routes or UI changes; staging remains independent of caches. Test writes target temporary copies. |
| V7 | **Deviates.** Required scenarios exist, but the oracle and commit-boundary gaps above remain. |

**V2 call-point inventory**

References below are under `packages/server/src/`.

| Required point | GBA | GBC |
|---|---|---|
| Map GET | Sync before payload reads: `index.ts:368` | Sync before `buildGbcMapPayload`: `gbcRoutes.ts:417–423` |
| Render, session bypass | Sync before branch: `index.ts:415` | Sync before branch: `gbcRoutes.ts:440` |
| Render, cached path | `cachedRender` syncs before lookup: `index.ts:152` | `cachedRender` syncs before lookup: `gbcRoutes.ts:312` |
| Metatile GET | Before lookup/render: `index.ts:475` | Before lookup/render: `gbcRoutes.ts:485` |
| World GET / world tile rendering | World handler: `index.ts:643`; tile PNGs use synchronized render paths | World handler: `gbcRoutes.ts:523`; tile PNGs use synchronized render paths |
| Shared session builder | `sendSession`: `index.ts:280` | `sessionBody`: `gbcEditRoutes.ts:107`; `asSession` delegates at `:204` |
| Nothing-open undo | `index.ts:993` | `gbcEditRoutes.ts:383`, through `NOTHING_OPEN()` |
| Nothing-open redo | `index.ts:1002` | `gbcEditRoutes.ts:389`, through `NOTHING_OPEN()` |
| Discard | Close, then sync in response: `index.ts:1035` | Close, then `NOTHING_OPEN()` sync: `gbcEditRoutes.ts:403` |
| Commit success | Close at `index.ts:1080`, sync in `finally` at `:1083` | Close at `gbcEditRoutes.ts:448`, sync in `finally` at `:450` |
| Commit writer failure | Same `finally`, session retained | Same `finally`, session retained |

Additional session-shaped responses also receive the sync return: GBA event creation, move/add/delete and indicator responses (`index.ts:347,1130,1152,1177,1393`); GBC event creation (`gbcEditRoutes.ts:262`), sign/indicator mutations through `asSession`, and event deletion through `sessionBody` (`:428`). Event creation constructs its underlying result before the wrapper synchronizes; the final versioned response is assembled afterward.

**V7 case assessment**

All references are to `packages/server/test/tilesetOverlay.test.ts`.

| Case | Assessment |
|---|---|
| 1 — two owners | `:197–215`: both families, distinct files, both renders and thumbnails change, then return to pre-stage HTTP bytes after discard. Pins union inclusion and restoration; it does not independently identify the correct staged pixels. |
| 2 — GBC alias | `:282–306`: discovers shared-file aliases, verifies different constants, stages through the other owner, and first requests the target render after staging. Compares against post-discard hub bytes. Meets the named alias scenario; checks change rather than exact staged art. |
| 3 — history and thumbnails | `:217–244`: both families; each undo/redo/discard response must increase the version, and thumbnails follow the sequence. Original/reverted oracle is independent; redo’s expected staged image is not. Finding 2 applies. |
| 4 — save | `:246–278`: both families; verifies subsequent pixels and version relationships. Can pass without commit synchronization, does not reach writer-failure `finally`, and uses staged output as its expected pixels. Findings 1–2 apply. |
| 5 — map version | `:225,234,242`: verifies equality with the preceding session response after staging, history operations and nothing-open operations. This pins the named equality. |
| 6 — unit identity | `:312–340`: pins literal initial version, unchanged Buffer identities, equal-byte replacement objects, removal, and exact cache-clear counts. Detects “always changed” and content-equality substitutions. Meets the named case. |

I reviewed the scoped diff at `b9b74f2`, binding documents, ownership contract and core overlay setters. No files were edited and no tests or other checks were run. The supplied 290/290, typecheck and red-run results were not independently verified; mutation results were unavailable. UI Task 10b and broader quality-role analysis were outside this review.