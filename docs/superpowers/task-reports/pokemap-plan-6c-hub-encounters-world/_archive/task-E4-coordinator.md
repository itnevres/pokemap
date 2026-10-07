# E4 coordinator record: GBA in-context edit mode

E4 ran under the Claude Code coordinator, 2026-10-05/06. The executed spec is `task-E4-spec.md` (`9a1a4e5`).

## Rounds

- **Implementer (Sonnet):** `cedccb9` (contextView maths), `595b054` (chromeless MapCanvas), `201fce5` (workspace `active`), `6b1e73b` (WorldCanvas context mode), `395d7eb` (App wiring), `bc4562c` (CSS/DESIGN).
- **Coordinator rulings on the implementer's deviations:**
  - accepted: chromeless also hides the legend, so the stage box stays equal to the world box;
  - accepted: the context Escape skips while a menu or modal is open. GBA's `SaveDialog` doesn't `stopPropagation`, which was a gap in my spec.
- **Reviews:**
  - spec (Opus): **PASS**. F1 (painting through the App overlay was unpinned) is important; F2-F4 are minor. The race repro was green and has teeth.
  - quality (Sonnet): **CHANGES_REQUIRED**.
    - **P1-1:** the server `pngCache` was never invalidated on commit, so a saved tile would have been served stale. Confirmed by the coordinator.
    - **P1-2:** the bubble-phase Escape listener runs after React has flushed the modal away.
    - **P2-1:** the snap happened before the chrome mounted.
- **First fix round.** A rate limit cut it off before any edit (the tree was clean, no commits, external state intact). The same implementer redid it from scratch:
  - `f1068f6`: `pngCache.clear()` after a successful commit, plus a real-write server test on CianwoodCity with a read-guarded restore;
  - `0206047`: capture-phase Escape with a text-field guard; the snap gated on `context.origin` with client-coordinate pointers; the `Math.max(MAX_ZOOM, zoom)` cap; the `snapPointerRef` clear; a11y labels; refocus on exit;
  - `bcfb9f7`: an App-level paint test through the overlay (F1) and the `selected`-change exit test (F3).
- **Quality re-review (Sonnet): APPROVED.**
- **Coordinator fix `a9481bd`.** Found live: `.world-canvas` needed `min-width: 0` as a flex-row child beside EventInspector. Context mode overflowed the page by 71 px at 1280; it is 0 at 1280 and 1024 after the fix. Pinned in `stylesContext.test.ts` and red-proved.
- **Existing tests:** additions only for pre-E4 files; `saveRoutes.test.ts` gained one test. The only adjustments were inside E4's own new test files: the Done accessible name and the clamp-test rewrite.

## Coordinator mutation rerun on `c890755`

Harness: `C:/Users/Serve/AppData/Local/Temp/pokemap-phase-d-coordinator/e4-mutations.mjs`. Same method:
- an unmutated green baseline for every witness;
- each anchor asserted exactly once;
- in-memory restore, then a byte compare;
- the requested IDs cross-checked against the reported IDs.

| ID | Mutation | Witness | Result |
|---|---|---|---|
| E4-M1 | `mapViewFromWorld` drops `originX·z` | contextView literal `p=(10,20)… -> (261,569)` | RED |
| E4-M2′ | wheel upper bound `MAX_ZOOM` only | `a wheel-in at 64 px/tile…` | RED |
| E4-M3 | the exit request ignores `isDirty` | App `Escape opens the SaveDialog and stays in context…` | RED |
| E4-M4a | the tile refresh clears the whole cache | `a bumped version re-requests exactly that map…` | RED |
| E4-M4b | no `?v=` | same | RED |
| E4-M5 | the workspace body is keyed on `active` (remount) | App `…SAME world canvas, with no /api/world refetch` | RED |
| E4-M6 | a warp-marker double-click falls through to `onEditHere` | `with warps on, a double-click on a warp marker…` | RED |
| E4-M7 | Escape ignores `defaultPrevented` | `Escape calls it once; an Escape another handler already prevented does not` | RED |
| E4-X-capture | Escape listener in the bubble phase | `is judged before any bubble handler…` | RED |
| E4-X-pngcache | `pngCache.clear()` removed | server `a render fetched before a commit is not served stale after it…` | RED |

10 requested, 10 reported, none missing. The tree was clean afterwards, and the GBA subject's porcelain was unchanged.

## Live criterion 8

Setup: Vite dev 5183 → hub 5184, the GBA mirror (whose data folders are junctions to the real subject), Chromium.

**Snapshot first.** The subject porcelain and NewBarkTown `map.bin` (SHA-1 `fa1462b…`, clean in git) were saved to the scratch `e4-subject-snapshot/`.

1. **Enter.** World → tree NewBarkTown → double-click its body. The editing chrome (Toolbar, EventInspector) and the context bar appear. The world canvas rect, the overlay rect and the chromeless stage rect are identical: (280, 164.39, 570.86×592.61).
2. **Record the original block.** The Dropper on tile (3,12) gave metatile **0xC6**. Choosing Pencil mounts the 240 px metatile strip, which pushes the world down. That is expected; the map stays aligned.
3. **Paint.** Pencil with metatile 0x1 on (3,12) produced `paint/begin` → `paint/apply` → `paint/end` through MapCanvas's chain. The overlay pixel changed from (162,229,196) to (127,211,172). The world tile underneath was unchanged.
4. **Save.**
   - Done while dirty → SaveDialog → Save Changes produced `GET plan` and `POST commit`, then **exactly one** tile request, `GET /api/render/NewBarkTown.png?v=1`. The session stays in context and is clean.
   - Done exits.
   - **The world tile at (3,12) now reads (127,211,172).** The world tile updated.
   - On disk, exactly one byte changed: `map.bin` offset 726, 0xC6 → 0x01, with the collision/elevation byte untouched.
5. **Restore by reverse paint.** In Map view, Pencil with metatile 0xC6 at the hover readout `(3, 12)`, then Save → Save Changes. `map.bin` is **byte-identical** to the snapshot (`fa1462b…`), the porcelain is identical, and the GBA sidecars are unchanged. No byte-copy fallback was needed.
6. **Overflow.** The 71 px page overflow in context mode, fixed in `a9481bd`, was verified live as 0 at 1280×800 and 1024×768, with stage == world rect at both. Escape exits a clean context.
7. **GBC (PerfPlus hub).** A right-click on NewBarkTown shows `Open in Map view` and `Edit here GBC editing arrives with Plan 7` (`aria-disabled=true`). A plain double-click opens the Map view, with no context overlay. PerfPlus `.pokemap` stayed absent.

**Known follow-up, not fixed.** At 1024 wide in context mode the world toolbar is cramped: the zoom readout overlaps "Method", because the world's Unplaced sidebar takes half the narrowed width. Hiding the Unplaced sidebar while in context would fix it.

## Phase E gate (`a9481bd`)

`npm test`: **2,202 pass / 2 fail** (130 files). The 2 failures are the known `world.test.ts` pair (the subject's `dungeonAutoLayout:false`). Typecheck is clean (core + ui), and `vite build` passes. The GBA subject is unchanged; PerfPlus is clean, with no `.pokemap`.
