# Follow-up 2 fix round — code-quality + spec-compliance review

Commit under review: `e4dafd7` (on top of already-reviewed `2359ecb`). 4 files, no scope creep.
Everything below was re-derived independently (own teeth-proofs, own test runs, own live browser session); the implementer report was read but not trusted.

Verdict: **With fixes.** 0 critical, 1 important, 4 minor.

---

## Verified

| Claim | Result |
|---|---|
| Timer **reschedules**, not stacks (`MapCanvas.tsx:295-296`) | ✅ Teeth-proved: deleting the `clearTimeout` on :295 → v= test fails `expected '3' to be '2'`. 5 rapid `blocks` changes ⇒ exactly one `setPaintVersion`. |
| `skipNextBumpRef` armed with no race (`:272-279` vs `:280-297`) | ✅ The `[mapName]` effect is **declared before** the `[blocks]` effect, so React runs arm→consume in that order inside one commit. No window where a blocks change beats the arming. |
| Timer cleared on unmount | ✅ `:298-300`. Also cleared + nulled on map switch (`:275-278`), so no map-A timer fires after switching to B. |
| Rate-limit leftover cleaned up | ✅ Exactly **one** `setImgLoaded(false)` in the file (`:360`, the `[imageUrl]` effect). `[mapName]` effect (`:344-347`) sets only `toggles`/`hover`. Exactly one `[imageUrl]`-keyed effect. No trace of the duplicate. |
| Test 4a has teeth | ✅ Independently weakened `:381` to `if (imgLoaded)` → **only** 4a went red, on the `aria-pressed` assertion (`MapCanvas.test.tsx:505`). Restored. |
| Test 4b has teeth | ✅ Independently emptied the `[imageUrl]` effect body (`:359-361`) → **only** 4b went red (timeout waiting for `drawImage` to advance). Restored. |
| Borrowed timer convention is real | ✅ `WorldCanvas.test.tsx:1347` and `SpeciesSpotlight.test.tsx:88,380,433` all use real `await new Promise(r => setTimeout(r, N))`, no fake timers. Claim honest. |
| Flake | ✅ `MapCanvas.test.tsx` 4/4 consecutive green (27 tests, ~2.4-3.5s). |
| Full suite / typecheck | ✅ 73 files, **685/685** (was 683, +2 as claimed). `npm run typecheck` clean. |
| Issue 5 (core pixel test) | ✅ Correct. `renderLayout(proj, "PetalburgCity_Layout")` takes no border ⇒ origin 0, so `((by*16+y)*width + bx*16+x)*4` is valid. Override mutates index 0 only, so block (1,0) = index 1 is genuinely untouched; asserting byte-equality across the two renders is a real "only the overridden block moved" proof. |
| Issue 3 (server cache test) | ✅ Honest. The new comment explicitly states it does *not* prove a cache hit and *would pass with pngCache deleted*, and names what it does prove (no cross-map leakage). Exactly the "honest description, not deepened" the coordinator asked for. |
| Issue 6 untouched | ✅ Commit touches `core/test/render/layout.test.ts`, `server/test/api.test.ts`, `ui/src/components/MapCanvas.tsx`, `ui/test/MapCanvas.test.tsx`. Nothing under `packages/server/src/`. |

### Own live browser verification (real `serve.ts` :5174 + real Vite :5173, real Chrome)

| Step | render GETs | `<img src>` | zoom |
|---|---|---|---|
| NewBarkTown first open | 1 | `…&v=0` | `1×` |
| → `2×` + pencil + metatile 0x1 | 0 | `…&v=0` | `2×:true` |
| → **1 paint click** | **1** (`v=1`) — 3 POSTs `paint/{begin,apply,end}` | `…&v=1` | `2×:true` |
| → 2 more single clicks | **1 each** (`v=2`, `v=3`) | `…&v=3` | `2×:true` |
| → switch to CherrygroveCity | lands on `v=1` | — | refit |
| → switch back to NewBarkTown | `v=0` | `…&v=0` | refit |

- **Issue 2 closed, measured:** one paint gesture = 3 paint POSTs but exactly **1** cache-bypassed render GET (was 3-4). Three gestures → three fetches, one each.
- **Issue 1 substantially closed, measured:** first map open now lands on `v=0` (spec review measured `v=1` pre-fix ⇒ that spurious bump is *gone*); a switch lands on `v=1` ⇒ **exactly one** spurious bump (was two). Matches the implementer's own "at most one, not perfect" framing.
- **Invariant (a) pan/zoom survives paint — holds.** `2×` stayed `aria-pressed="true"` across all three paints.
- **Invariant (b) canvas redraws — holds.** Painted cells visibly present on the stage canvas; the `<img>`'s decoded pixels are byte-identical to a forced `fetch(src, {cache:'reload'})`, i.e. the browser is showing live server state, not a cached frame (see minor #3 for why that matters).
- Drag-stroke coalescing not re-measured: the metatile stamp is cleared on map switch (App.tsx behaviour, out of scope), so the drag produced no paint calls. Coalescing follows directly from the reschedule logic, which *is* teeth-proved in jsdom.

---

## Issues

### Critical
None.

### Important

**1. `skipNextBumpRef` — the entire issue-1 fix — has zero test teeth.**
`packages/ui/test/MapCanvas.test.tsx:401` (the v= cache-bust test) · guard at `packages/ui/src/components/MapCanvas.tsx:283-286`

Empirically proved: deleting the whole `if (skipNextBumpRef.current) { … return; }` block from `MapCanvas.tsx:283-286` leaves **27/27 green**. So does deleting `setPaintVersion(0)` (`:274`).

Why it passes vacuously: the debounce masks the skip. The test's only skip assertion is
```
rerender(<MapCanvas … editSession={session2} />);
expect(versionOf()).toBe("0");          // :419
```
read *immediately* after the rerender — but with debouncing the version is "0" at that instant whether the tick was swallowed or merely scheduled. The later rerender then reschedules the same single timer, so the settled values (`"1"`, `"2"`) come out identical either way.

This matters because the test's own **name** asserts the behaviour ("the presumed reseed tick is swallowed") and tests 4a/4b both build their setup on it (`:474-481`, `:518-521`). A future refactor can delete the skip flag and reopen issue 1 with a fully green suite — the exact failure mode issue 4 existed to close, reproduced one commit later for the *new* guard.

Fix is one line, in the same test:
```ts
const session2 = { ...session, blocks: [...session.blocks] };
rerender(<MapCanvas mapName="Foo" data={DATA} editSession={session2} />);
await new Promise((r) => setTimeout(r, 300));   // ADD
expect(versionOf()).toBe("0");                  // now discriminating
```
(Verified: with the guard removed this assertion reads `"1"`.)

### Minor

**2. A real edit immediately after a map switch can be silently swallowed.**
`MapCanvas.tsx:270` + `:283-286` · `useMapLayout.ts:42-75` · `App.tsx:481-564`

Traced (not live-reproduced — window is short locally):
- `App.tsx:481` renders `MapCanvas` whenever `layout.data` is truthy, with **no `key`**, and `useMapLayout` never clears `data` on a name change. So from the moment `selected` becomes B until `/api/map/B` resolves, MapCanvas is mounted, interactive and paintable with `mapName="B"` while still holding A's `data`.
- If the user had **not** painted on A, `useEditSession`'s first post-switch reset calls `setBlocks(initialBlocks)` with the array already in state ⇒ React bails out ⇒ **no `blocks` reference change** ⇒ `skipNextBumpRef` is still armed through that whole window.
- A paint landing in that window therefore consumes the skip flag and produces **no bump**.

Bounded, which is why this is minor and not important: the corrective reseed that lands a moment later clobbers the paint in client state anyway (pre-existing) *and* itself schedules a bump, so no render is permanently dropped — the net visible damage is the pre-existing clobber, not a new frozen canvas.

Related stale comment: `useEditSession.ts:185` claims "that second reset always lands before the player could possibly have started editing, so it never clobbers real work." That premise is false for exactly the reason above (no `key`, no `data` reset). Pre-existing wording, newly load-bearing now that a second mechanism leans on it.

**3. `setPaintVersion(0)` on map switch buys nothing and re-introduces same-URL/different-content.**
`MapCanvas.tsx:274`

With the reset, revisiting a painted map always restarts at `?v=0` — a URL the browser already fetched at first open, when the map was *unpainted*. Without it (monotonic counter), "same URL ⇒ same content for that map" is structural. The reset also costs one extra render per switch and is not needed to change the URL on a switch (`mapName` is already in the path).

Live-verified safe **today**: the displayed image on return matched a `cache:'reload'` refetch byte for byte. But that safety rests entirely on `cache-control: no-cache` being on *both* render branches (`packages/server/src/index.ts:266,278`) with no ETag — add a validator there later and this silently serves stale pixels. Cheapest fix: delete `:274` (tests: 27/27 with it removed).

**4. Debounce-test timing margin is thin, and the borrowed justification doesn't apply here.**
`MapCanvas.test.tsx:426,485,505` (three real 300ms waits vs a 200ms debounce, ~1.4s added to the file)

No flake observed in 4 consecutive runs, so not urgent. But the comment's stated reason for real timers — *"fake timers don't intercept a setTimeout already scheduled before they're enabled"* — is genuinely true at `WorldCanvas.test.tsx:1338-1341` (timer scheduled by a **mount** effect, before the test body runs) and **not** true here: these timers are scheduled by a `rerender` inside the test body, so `vi.useFakeTimers()` would intercept them and make the tests deterministic and instant. Matching the file's convention is defensible; the copied rationale is not accurate for this case.

**5. Nit — issue 5's new assertion pins exactly one block.**
`packages/core/test/render/layout.test.ts:156`

Closes the one-sidedness the spec review named, as asked. A whole-image-minus-block-(0,0) comparison would be strictly stronger for roughly the same code, and would also catch a bug corrupting some *other* single block. Explicitly not required by the brief.

---

## Assessment

**Ready to merge?** With fixes

**Reasoning:**
The two things this fix round most needed to get right, it got right, and I confirmed both without leaning on the report: the debounce genuinely reschedules (teeth-proved), and the two issue-4 invariant tests genuinely fail when their guard is removed (teeth-proved, one at a time, each taking down only its own test). Live measurement reproduces the headline numbers — 1 paint = 1 render fetch, zoom pinned, map switch down to one spurious bump, first open down to zero. Tests 685/685, typecheck clean, cleanup of the rate-limit leftover complete, issue 6 untouched, issue 3's honesty fix honest.

The one thing worth holding for is issue **#1**: this commit's *other* new guard, `skipNextBumpRef`, can be deleted with the suite still fully green. Given this file's documented history — and given that the whole point of issue 4 was "a one-line deletion away from silently regressing" — shipping a second untested one-line guard in the same commit that fixed that class of problem is the wrong trade. It is a one-line test change, already validated against the broken build.

Minors #2-#5 are follow-up material, not merge blockers. #3 is the one I would take next: deleting `MapCanvas.tsx:274` is a *smaller* diff than keeping it and removes a whole failure class.
