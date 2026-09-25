# Follow-up 2: live render for open edit sessions — spec-compliance review

Commit under review: `2359ecb`. Reviewer verified everything independently, including an own live browser session.

Verdict: **❌ 6 issues.** All three coordinated pieces ARE present, both non-negotiable invariants DO hold (confirmed in my own browser, not accepted on claim), tests and typecheck are genuinely clean. No blocker. But one stated design guarantee is not actually achieved, one new test has no teeth, and the highest-risk invariant has zero automated coverage.

---

## Independent verification results

### Commit scope
`git show --stat 2359ecb` → 7 files: the 6 claimed code/test files + the implementer report `.md`. No `borderOverride`, no out-of-scope edits. `git status` clean apart from pre-existing untracked report dirs. `grep -c "const imageUrl"` in `MapCanvas.tsx` → exactly 1 (hoisted, not duplicated).

### Tests / typecheck (re-run by me)
| Check | Result |
|---|---|
| `npx vitest run` (full monorepo) | 73 files, **683/683 pass** — matches claim |
| `npm run typecheck` (both configs) | clean |

### Claim (c) — `editSessions.has(name)` never becomes true from the render route
**Confirmed.** Every `editEntryFor` (= `editSessions.open`, `packages/server/src/index.ts:133`) call site: lines 265 (render — **inside** the `has()` guard, so pure lookup, `editSessions.ts:35-36` returns early for an existing entry), 665, 702, 759, 775, 784, 797, 806, 846, 868, 890, 947. Only the render one is a GET that cannot create. ✓

### Claim (d) — border is never edited, so disk-only border is correct
**Confirmed.** `grep "\.border\s*="` over `packages/server/src` + `packages/core/src` → **zero** hits. `session.border` is written once at `editSessions.ts:41/45` and only ever read (`:98`, `index.ts:149`). Undo/redo restores it via `Object.assign` to the same array. Skipping a `borderOverride` is correct and not speculative-gap. ✓

### Server diff — cache bypass complete, no-session path unchanged
`index.ts:262-268` live branch: no `pngCache.get`/`.set` reachable. ✓
`index.ts:270-279` no-session path is the old body verbatim with `resolveLayoutName()` extracted — same key, same 404, same `pngCache.set`, same headers. Byte-for-byte equivalent. ✓

### Core diff
`layout.ts:59` `opts.blocksOverride ?? parseBlocks(readFileSync(...))`; `:72` short-guard now names `"the supplied blocksOverride"` vs the disk path. Correct. ✓

---

## Live browser verification (mine, independent of the implementer's)

Real `tsx packages/server/src/serve.ts` on 5174 + real Vite dev server on 5173, driven in a real browser. Method: `getImageData` checksum of the live `<canvas>` **plus** an alpha-derived content bounding box (the bbox is what actually proves pan/zoom survival — a checksum alone cannot distinguish "pixels changed because I painted" from "pixels changed because the view snapped back to fit").

| Step | zoom aria-pressed | content bbox | canvas checksum | `<img src>` |
|---|---|---|---|---|
| NewBarkTown opened, fit | `1×:true` | `[208,55,739,686]` | 1984755396 | `…&v=1` |
| → 2×, drag-panned | `2×:true` | `[0,0,649,438]` | 1162490816 | `…&v=1` |
| → pencil + palette open (baseline) | `2×:true` | `[0,0,649,438]` | **1209807808** | `…&v=1` |
| → **painted 1 cell (metatile 0x0)** | **`2×:true`** | **`[0,0,649,438]`** | 4183924288 | `…&v=4` |
| → drag-painted 2 more cells | `2×:true` | `[0,0,649,438]` | 3353157056 | `…&v=8` |
| → Grid overlay ON | `2×:true` | `[0,0,649,422]` (legend row) | 4182670400 | `…&v=8` (no refetch) |
| → Undo ×2, Grid OFF | `2×:true` | `[0,0,649,438]` | **1209807808** | `…&v=10` |

- **Invariant (a) pan/zoom survives paint — HOLDS.** Zoom stayed `2×:true` and the content bbox was *byte-identically* `[0,0,649,438]` across single-click paint, 2-cell drag paint, and undo. No snap-back.
- **Invariant (b) canvas genuinely redraws — HOLDS.** Checksum changed on every paint with no page reload, the painted tiles were visible on screen, and **after two undos the checksum returned to exactly the pre-paint value 1209807808** with the same bbox. That round-trip equality is the strong falsifiable result: it proves the canvas is compositing *current live session state*, not stale or frozen pixels.
- Overlay-after-edit composites correctly against the post-edit base and does **not** trigger a refetch (`v=8` unchanged) — toggles still don't bump `paintVersion`. ✓
- Map switch NewBarkTown → CherrygroveCity → NewBarkTown: both switches auto-fit (`1×:true`, recentred bbox). One-time-per-map fit still works for a genuine switch. ✓
- `editEntryFor` inside the live branch verified safe (pure lookup under `has()`).

---

## ❌ Issues found

### 1. The map-switch exclusion the design hinges on does not actually work — `paintVersion` bumps twice per map switch
`packages/ui/src/components/MapCanvas.tsx:252-263`

The comment claims: *"Comparing prevMapNameRef BEFORE updating it below is what excludes a map switch."* It does not. It only excludes the **first** render of the switch. `useEditSession` (`packages/ui/src/hooks/useEditSession.ts:187-194`) re-seeds `blocks` from `initialBlocks`/`initialMap` in an effect that fires again *one or more renders later*, once `useMapLayout`'s fetch for the NEW map resolves — by which point `prevMapNameRef.current` has already been updated to the new `mapName`, so `prevMapNameRef.current === mapName && prevBlocksRef.current !== blocks` is **true** and it bumps.

Measured in my live session, no painting involved:
- first open of NewBarkTown → `<img src>` lands on **`&v=1`**, not `v=0` (one spurious bump + one extra full-map PNG fetch)
- switch NewBarkTown(`v=10`) → CherrygroveCity → **`v=12`** (two spurious bumps, two extra full-map renders + fetches)

Real regression risk: **low** for correctness — `fittedForMapRef` is keyed on `mapName`, not on load count, so the extra load cannot cause a double-fit or a missed fit (I traced both orderings and confirmed the fit fired exactly once in the live run). It is a **wasted-work + wrong-documentation** defect: the comment asserts a guarantee the code does not provide, which is exactly the kind of thing the next person edits against.

Cheapest honest fix: either drop the "already fully handled" claim and accept the extra bump as harmless, or reset `paintVersion`/`prevBlocksRef` inside the existing `[mapName]` effect so the switch genuinely cannot bump.

### 2. Three to four full-map, cache-bypassed renders per paint stroke
`packages/ui/src/components/MapCanvas.tsx:252-263` + `packages/ui/src/hooks/useEditSession.ts:196-217`

`beginStroke`, `applyPaint` and `endStroke` all route through `call()` → `applyResponse` → `setBlocks(d.blocks)`, and every server response is a **fresh array from JSON**. So every one of them is a distinct reference change → a distinct `paintVersion` bump.

Measured network for a single click: `v=2` (begin, 200) → `v=3` (apply, **ERR_ABORTED**) → `v=4` (end, 200). A 2-cell drag: `v=5,6,7,8`. Only the last is needed; the middle ones are rendered server-side and then thrown away.

Cost measured against the real server:
| Map | no session (cached) | live session (bypassed) | payload |
|---|---|---|---|
| NewBarkTown (small) | — | 12 ms every request | 38 KB |
| Route110 (large) | 2.8 ms | **40–77 ms every request** | 150 KB |

So a single paint click on a large map = ~150–230 ms of server render CPU and ~450 KB over the wire, for one tile. During a fast drag the in-flight image is aborted on each bump, so `imgLoaded` stays `false` and the canvas shows stale base art for the whole gesture, only settling on mouse-up. Real regression risk: **moderate on large maps** (UX latency + server CPU), not a correctness bug. Not a spec violation — the spec asked for a bump on every `blocks` change — but worth knowing it is 3–4×, not 1×.

### 3. The "cache still used" server test has no teeth
`packages/server/test/api.test.ts` — *"still serves an untouched map's render from pngCache — opening a session elsewhere doesn't disable it"*

It asserts only `a.equals(b)` across two fetches of GoldenrodCity. `renderLayout` is deterministic, so **this test passes identically with `pngCache` deleted entirely.** It cannot fail for the reason it exists. The spec asked to prove "a no-session map still uses the cache unchanged"; this proves "a no-session map renders deterministically".

Test gap, not a regression. A discriminating version would assert the second fetch is measurably faster, or spy on the cache, or (simplest) assert that a map with a session open returns a *different* buffer than the same map's pre-session buffer while GoldenrodCity's stays pinned — which the sibling test already half does.

### 4. Zero automated coverage of either non-negotiable invariant, and the "jsdom can't" framing is too broad
`packages/ui/test/MapCanvas.test.tsx` (3 new tests, all URL-string only)

The file already has `mountReady()` (`:204-213`) which does `fireEvent.load(utils.img)` and waits for the composite. jsdom cannot reproduce a real image-load *timing race* — true — but it can absolutely prove the **effect wiring**, which is where both invariants actually live:
- (a) mount with an `editSession`, click `2×`, rerender with a new `blocks` array, `fireEvent.load(img)` again, assert `2×` is still `aria-pressed="true"`. Fails today if `fittedForMapRef` is removed.
- (b) assert `stageCtx.drawImage` call count does **not** advance on a URL change alone, then **does** advance after the next `fireEvent.load`. Fails today if the `[imageUrl]` reset is removed.

Given this file's documented history of bugs that passed every jsdom test, leaving the two invariants covered only by a manual live-verify means the next refactor can silently regress them with a green suite. Real risk: **the highest one in this change**, since both fixes are one-line deletions away from being undone.

### 5. Core pixel test is discriminating but one-sided
`packages/core/test/render/layout.test.ts` — the `blocksOverride` pixel test

It does read real bytes (RGBA over the changed block's own 16×16 region at `originX/Y = 0`) and asserts inequality — genuinely discriminating, not "didn't throw". ✓ But it never asserts the *rest* of the image is unchanged, so a hypothetical bug that renders a completely different layout under an override would also pass. Minor teeth gap; one extra `expect(regionAt(20,0,overridden)).toEqual(regionAt(20,0,plain))` would close it.

### 6. Pre-existing, newly consequential: a GET permanently disables the PNG cache for a map
`packages/server/src/index.ts:793-800` (`GET /api/edit/:name/plan` → unconditional `editEntryFor(name)`), reached from `packages/ui/src/components/SaveDialog.tsx:65`

`/plan` is a **GET** and opens a session unconditionally. Sessions are only ever closed on a *successful commit* (`index.ts:824`). Before this commit that was harmless. Now it means: once `/plan` has been hit for a map, every subsequent render of that map bypasses `pngCache` for the life of the server process, even after the user undoes back to clean or cancels the dialog.

Measured: Route110 `2.8 ms` cached → one `GET /api/edit/Route110/plan` → `40–72 ms` on every subsequent render, permanently. ~25× slower, forever, with no edit ever made.

Not introduced by this commit and not a spec violation (the spec did ask for a full bypass while a session is open), but this change is what gave the pre-existing "GET opens a session / session never closes" behaviour a performance cost. Worth a follow-up, not a fix here.

---

## Also checked, no issue

- `imgLoaded` **cannot get stuck `true`** after a URL change: the `[imageUrl]` effect (`MapCanvas.tsx:322-324`) is the sole owner and the old `[mapName]` reset was genuinely *removed*, not duplicated (`:307-310` now sets only `toggles`/`hover`). Verified in the diff and in the current file.
- Stuck-`false` is theoretically reachable only if a `load` event beats React's passive-effect flush (browser-cached image). `cache-control: no-cache` on both render branches forces revalidation, so a cached hit still costs a round trip and cannot outrun the effect. Same shape as the pre-existing `[mapName]` reset, so not a regression either way.
- `fittedForMapRef` (`:342-352`) traced through: first-open, same-map repaint, A→B→A with B loaded, A→B→A with B *never* loaded, component remount, and viewport change from the palette opening. Fit fires exactly once per real map open in every case; no path skips a fit that should happen, no path allows one on a paint reload. Live run agrees.
- Composite effect (`:367-406`) early-returns on `!imgLoaded` **without clearing** the base canvas, so a reload window shows the previous frame rather than blanking — the old canvas-blanking failure mode is not reintroduced.
- Event ops (`moveEvent`/`addEvent`/`deleteEvent`) use `setMap`, never `setBlocks`, so they correctly do *not* bump `paintVersion`; the composite effect's `map` dep still repaints markers. ✓
- `blocks` is plain `useState` in `useEditSession` (`:161`), not a derived array — no per-render reference churn, so the tracking effect cannot loop.
- Render is only ever requested by **map** name (`MapCanvas.tsx:299`, `WorldCanvas.tsx:866`), so the fact that `editSessions.has()` is keyed on map name while the route also accepts a *layout* name is not reachable from the UI.
- Report accuracy: "the old duplicate `const imageUrl` was deleted" is loose phrasing — it was the file's single original declaration, hoisted. Code is correct; wording only.
