# LESSONS.md — PokeMap Handoff Traps & Conventions

Purpose: This document collects every reusable trap, rule, and convention discovered during two months of PokeMap development so a new engineer or AI agent can avoid known failure modes without re-living them. Each entry states a bold rule, its identifying tell (the observation that reveals the trap), the why/how, and a source tag tracing to the original lesson section.

## Table of Contents
- [Testing (Vitest / Testing Library / StrictMode / flakes / fixtures)](#testing-vitest--testing-library--strictmode--flakes--fixtures)
- [Mutation Testing & Review Process](#mutation-testing--review-process)
- [React / UI Patterns](#react--ui-patterns)
- [Canvas / World View Rendering](#canvas--world-view-rendering)
- [Editing Sessions & Save Safety](#editing-sessions--save-safety)
- [Server / Routes](#server--routes)
- [GBC Format & Engine Quirks](#gbc-format--engine-quirks)
- [GBA / Porymap Quirks](#gba--porymap-quirks)
- [Live Browser Verification (Playwright / CDP / Headless)](#live-browser-verification-playwright--cdp--headless)
- [Windows / Tooling / Git / Worktrees](#windows--tooling--git--worktrees)
- [Delegation to Codex / Aider / Subagents](#delegation-to-codex--aider--subagents)

---

## Testing (Vitest / Testing Library / StrictMode / flakes / fixtures)

**Viewport-helper leak (Plan 9 final review m1):** `withViewport`-style helpers save `Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")`, but jsdom defines `clientWidth` on `Element.prototype`, so the saved value is `undefined` and the restore never runs: a fake 100 px viewport leaks into every later test in the file. Tell: a test passes alone (`-t`) and fails in the full-file run, and moving it to another describe "fixes" it. (Plan 9)

**Use `copyGbcSubjectToTemp` (or equivalent temp copy) for every test a mutation could turn into a write.** A test that dry-runs against the real PerfPlus corpus can write under a "dry run commits" mutation; the write was restored byte-identical only by luck. (Plan 7)

**A cheap model's mutation table can claim red without actually running the test.** The coordinator's re-run catches this. (Plan 7)

**Spec fixtures can hide the very bug a mutation targets.** Task 1's `blkPath` equalled the map name; Task 2's diagonals — both found by reviewers, not the test. (Plan 7)

**A deferred test's negative assertion must let the relevant queued microtasks run.** The adjacent-stroke witness missed removal of an `end await` until a coordinator mutation exposed the scheduling gap. (Plan 7)

**Cached image readiness requires both decoded metadata and the current image URL.** A synthetic `load` event without natural dimensions can race the mounted-image readiness effect; do not weaken geometry assertions or inflate timeouts. (Plan 7)

**Run `vitest` from the repo root.** From `packages/ui` the jsdom glob misses; tell: `document is not defined`. (Plan 8)

**New load-only flake class (baseline gate at `3f9f8ce`):**
- `WorldCanvasContext.test.tsx` "Escape that closes an open context menu…" — tell: `TestingLibraryElementError … role "menu"`
- `gbc/GbcAppEditing.test.tsx` "dirty guard…" — tell: `EPERM … pokemap-gbc-*\maps\ElmsHouse.asm`  
Rerun in isolation before calling either a regression. (Plan 8)

**For StrictMode witnesses use `renderHook(..., { reactStrictMode: true })`.** A `<StrictMode>` wrapper runs effects only ONCE here (React 19.2, RTL 16.3); the option runs them twice. (Plan 8)

**New load-only flake class since Task 5** (tell: `expected N to be less than -1` in `gbc/GbcAppWorldGuard` "a world click, confirmed: POST /discard goes out BEFORE…" or `gbc/GbcAppEditing` "dirty guard: … BEFORE switching"; also `GbcApp` "palette highlight resets…"): the status shows the new map before its GET effect fires. Order `discard < GET` held in every instrumented run. **Fixed in `6560014`**: the three ordering tests now wait for the new map's GET (cause: status text commits a scheduler task before the fetch effect runs). (Plan 8)

**`await expect(act(async () => ...)).rejects.toThrow()` can leak its `AssertionError` as an Unhandled Error:** the run exits 1 but the test counts as passed and later asserts never run (Task 5 E3 vs `useEditSession.test.tsx`). Witnesses catch the rejection themselves. (Plan 8)

**Tests written in the cloud may never have run on Windows.** Examples: `spawnSync("npx")` (a `.cmd` shim, gives `ENOENT` without a shell; spawn `process.execPath, ["--import","tsx",…]` instead), or a regex built from `path.split("/")`. Treat new Windows-only failures as portability bugs in the test and fix them test-only. (Plan 6b)

**Mutation harnesses restore from `git show HEAD:<file>`.** Running one over *uncommitted* edits silently discards those edits (happened in Task 5). Commit before you mutate. (Plan 6b)

**Anchor drift:** after a refactor, a harness whose anchor no longer matches can *silently skip* a mutation. Task 5's X2 and X12 never ran; the harness printed nothing for them. Always cross-check requested IDs against printed results. (Plan 6b)

**Deleting a component's tests loses pins silently.** B3's old→new table looked complete, but the GBC LOD 7/8 threshold was pinned only by the deleted gutter test; the new component test pinned a generic threshold, not the canvas wiring (mutant `lodZoom={4}` survived). For each deleted test, mutate the *wiring*, not just the component. (Plan 6c Phase B)

**`waitFor` on a condition already true at mount is no gate.** The WorldCanvas jump test's `waitFor(clearRect)` passed on its first check (the draw runs while `world` is null), so the synchronous highlight read raced the jump effect's re-render under load. Wait on the asserted thing itself. Same test as Phase B's timer flake: a second, independent race. (Plan 6c Phase C)

**Capture the first full run to a file, always.** That's how the flake was finally named: the WorldCanvas jump highlight clears on a real 2 s `setTimeout`, and full-suite load stretched mount-to-assert past it. The fix holds that one timer per test and fires it with an explicit `flush()` (a `clearTimeout` of a held id drops it, so "cancelled and never rescheduled" is still caught). Pattern for any real-timer test: hold the timer, don't sleep past it. (Plan 6c Phase B)

**Load-only flakes still seen** (each passed alone): `gbcRoutes.test.ts` `/api/where/:species` DUNSPARCE 5 s timeout; `GbcApp.test.tsx` "palette highlight resets…" (1 s `waitFor`). **Never run two full suites at once:** `dungeons.test.ts` reads and writes the subject's shared `.pokemap/dungeons.json`, so concurrent suites race across processes (seen once). Measure the phase gate on a quiet machine. (Plan 6c Phase B)

**Quick U1 check per test file:** `git diff <base> -- <file> | grep -c '^-[^-]'` (removed lines); anything non-zero outside the spec's table needs a name and a reason. (Plan 6c Phase C)

**This repo has NO `@testing-library/jest-dom`.** `toBeInTheDocument`, `toHaveValue`, `toBeDisabled`, `toBeEnabled`, `toHaveAttribute` are not real matchers — every UI task's plan-text snippets used them anyway and every implementer had to adapt to plain DOM property/attribute reads (`.getAttribute(...)`, `.disabled`, `.value`, `document.body.contains(el)`). Tell implementers up front. (Plan 2)

**A `*/` inside a CSS comment is silent in the browser.** It closes the comment early, and the next rule is dropped as an invalid selector. Cost the spotlight its `position: relative` for four weeks; the only other symptom was a `vite build` failure recorded as cosmetic. `packages/ui/test/styles.test.ts` now parses the sheet strictly with lightningcss. (Plan 6b)

---

## Mutation Testing & Review Process

**Retaining a ref to the latest request does not make a stroke completion barrier.** Return the first `apply` promise, queue every move, `await end`, and capture visit identity plus start/end cleanup. (Plan 7)

**An "equivalent mutant" is still a finding.** After a fix makes a guard unreachable, record it as equivalent with the live witness named (Task 1's M6/M8). (Plan 8)

**The coordinator re-running a reviewer's surviving mutations on the final fix commit is cheap.** Several times it replaced a whole extra review round. (Plan 6)

**Measured "surprises" need an Opus reviewer to decide real-data vs wrong-rule.** Examples: NewBarkTown's no-op roof swap, and Task 11's 2 connection conflicts. Both turned out real, but only independent derivation could establish it. (Plan 6)

**Review rhythm that worked:** Opus spec review mutates code and runs servers; Sonnet quality review is strictly read-only. They can run concurrently in one checkout. The coordinator commits review reports with a pathspec commit (`git commit -- <path>`). A reviewer's in-flight mutation can therefore sit safely in the tree, and the stop hook's "uncommitted changes" prompt must never be answered by committing it. (Plan 6b)

**Sessions die mid-task:** rate limits (5-hour and weekly) and container restarts. Every agent commits each green step. On resume: `git status`, `git log`, `git diff --stat`, check for stray `tsx`/`vite` processes. Resume the same agent via SendMessage when its context survives; after a container restart it doesn't, so brief a fresh agent from the report and the commits. (Plan 6b)

**"Existing GBA tests unchanged" needs checking in every fix round.** Task 6's fix round edited a GBA test to make a LensPanel change pass. The coordinator caught it with `git diff <base> -- packages/ui/test/<gba files>` (additions only), then reverted it and made the GBC side real instead. (Plan 6b)

**Canvas-drawn UI (badges, tints) can be verified without DOM hooks.** Scan `getImageData` for the token's exact RGB, cluster the hits, and hover each cluster. For lenses, count the tint elements by `style.background` and compare the counts with an independent in-page recomputation from the API. (Plan 6b)

**Every phase gate must run the whole suite.** D3 gave `GbcApp` a Dungeon button and silently broke `Root.test.tsx`, which asserted "no Dungeon text ⇒ App not mounted". No D3 dispatch ran that file; only the full gate caught it. When a task adds UI to a shell, grep the tests for absence assertions (`queryBy…).toBeNull()`) on that text. (Plan 6c Phase D close)

**Check that every required coordinator mutation run left a committed record.** D3's was missing: only uncommitted scratch harnesses existed. The rerun found a survivor (D3-M3 at the `visible`-memo site). The scoped fixture's outsider lay beyond the fit, so viewport culling hid it with or without the filter. When a mutant removes a filter, make sure the fixture puts the filtered item *inside* the viewport. (Plan 6c Phase D close)

**Near-warp layout must see manual placements** (`phase-D-review.md` R1, fixed in `6aa47ae`). Before the fix, `placeNearWarps` ran on automatic positions and `applySidecar` ran last, so obstacle checks never saw where manual maps are drawn. Callers now pass `manualPlacements`. (Plan 6c Phase D close)

---

## React / UI Patterns

**Never call one React state setter inside another's updater.** `main.tsx` renders under `<StrictMode>`, which runs updaters twice in dev. So `setZoom(z => { setPan(...) })` applies the pan twice. **Tell:** zoom/pan is wrong or the canvas is blank only in the Vite dev server, and correct in a production build. Instrument `drawImage`'s destination rect before explaining it. **Fix:** a single `view = { zoom, pan }` state, plus a StrictMode test that pins the exact pan. Fixed for GBA in 6c E1: `MapCanvas` now holds one `view` state; do not split it again. (Plan 6b)

**Flex children that hold long text need `min-width: 0`.** **Tell:** a screenshot taken while hovering shows the sidebar cut off on the left. **Check:** `document.documentElement.scrollWidth === clientWidth` while hovering, at 1280 and 1024 px wide. (Plan 6b)

**An agent's explanation of a visual anomaly can be confidently wrong.** Task 4's "4× is blank because of a headless canvas size limit" was false. The real cause was the StrictMode double pan. Its screenshot was stale, captured before the fix or before the image loaded. **Tell:** the explanation contradicted a reviewer's measurement that a 10,496 px destination renders fine. The coordinator reproduces any such claim with instrumentation before accepting it. (Plan 6b)

**Specs can contradict themselves.** A2's spec said both "mirror SaveDialog's backdrop" and "never two stacked backdrops". The implementer followed both literally, producing nested backdrops, and Escape closed the whole switcher. Both reviewers caught it. The coordinator's call: a confirm *inside* a modal has no backdrop of its own and stops Escape's propagation. Check new specs for this pattern: a nested dialog plus "mirror the modal shell". (Plan 6c Phase A)

**Per-map UI state:** a "reset on map change" `useEffect` runs after child hooks' effects, so a hook keyed on the old toggle fires for the new map in the first render (B4 fetched the wrong map). Hold the state as `forMap: string | null` (`on = forMap === mapName`) instead of resetting it. (Plan 6c Phase B)

**Spec self-check caught a contradiction before dispatch:** per-key state (`listFor === active`) reopens a list when you return to its lens, but the spec's test said "closed". For "always starts fresh on change", a `key={active}` inner component is simpler than per-key state. (Per-key state is still right when the *first render after* a change must already be correct: B4's `encountersFor`.) (Plan 6c Phase C)

**The in-app browser pane can be hidden, and then layout lies.** With the pane hidden, `document.hidden` is true, `requestAnimationFrame` never runs and a `ResizeObserver` never delivers (not even its initial callback), so the canvas keeps a stale `viewport` and a jump looked off-screen. It was not an app bug. Check `document.visibilityState` first; for anything layout- or resize-dependent, use the Playwright MCP's `browser_run_code_unsafe` (it renders normally) and keep each check in one call. (Plan 6c Phase C)

**Ask "what happens on remount, for each selection source?"** C2's spec copied GBC's F1 split (`jumpTarget` set only by tree clicks), and both reviewers confirmed a design gap: after a world click, Map → World re-entry jumped to the *stale* tree target, because the world canvases remount per mode with a fresh `appliedJumpTokenRef`. Fix: entering World from another mode jumps to the current selection (`enterWorld`, both apps). When two fixes work, prefer the one that doesn't touch a shared effect: the alternative changed both canvases' jump effects. (Plan 6c Phase C)

**Equivalent mutants, again.** `enterWorld`'s token bump is redundant today (the remount alone makes any token unapplied); it was kept for intent and recorded as equivalent, not chased with a test. (Plan 6c Phase C)

**Drafting the next task's spec while the current implementer runs** saved a round trip. Commit it with a pathspec commit only after the implementer stops committing, to avoid an index-lock race. (Plan 6c Phase C)

**Modal components own their own shell now, not a half-copy split with `App.tsx`.** `SaveDialog.tsx` set this precedent (backdrop, `onKeyDown` Escape handler, `autoFocus` on the default action) after Task 13's review caught a regression of an *already-once-fixed* bug (`WarpDestinationModal`'s own "Review fix" comment already named this exact failure mode) — Escape silently no-oped because focus never moved into the modal. `SignComposer.tsx` (Task 17) mirrors this. Any future modal component should mirror `SaveDialog.tsx`'s shell exactly, not reinvent it. (Plan 2)

**Every response-consuming component must validate response shape before trusting it, not just check `r.ok`.** `SaveDialog` originally cast every fetch response `as DiffPlan` with no validation — crashed on a real 500 response's `{error: string}` body. Fixed with a real type-guard (`isDiffPlan`); `SignComposer` was built with the equivalent guard from the start once this became an established pattern. Apply this to any new fetch-consuming component. (Plan 2)

**Silent failure on async handlers is a recurring defect class** this plan paid down twice (SaveDialog, then EventInspector's App.tsx wiring) and should not need a third catch. Every `.then()`-based handler wired to a server call needs a real `.catch()` with a visible error surface — check this proactively in review rather than waiting for it to be found. (Plan 2)

**A component that always receives a truthy prop object will always take that branch, even when the object's OWN fields are empty/default** — "is the prop present" and "does the prop have real data" are different questions, and code written as if they're the same silently breaks. `MapCanvas.tsx`'s `blocks = editSession ? editSession.blocks : staticBlocks` looks like a safe live/static fallback, but `App.tsx` always passes a real `editSession` object (the hook never returns `undefined`) — so it ALWAYS takes the live branch, even when `editSession.blocks` is `[]`. This bit twice: the live-render mechanism needs `imgLoaded` to genuinely cycle false→true on every reload, not just once ever, or the canvas freezes on stale pixels; and the discard follow-up's `useEditSession.discard()` had to deliberately bypass its own file's otherwise-consistent `call()`/`applyResponse` helper and reset local state to `initialBlocks`/`initialMap` (the pre-edit seed) instead of the server's own empty "nothing open" response — routing it through the normal path would have blanked the canvas permanently after every discard. Both fixes needed a doc comment explicit enough that a future "simplification" back to the file's own normal pattern wouldn't silently reintroduce the bug — write that comment, don't rely on the fix being obviously load-bearing from the diff alone. (Plan 2 follow-ups)

**A UI convenience action (a button, a tool) can quietly change the meaning of an EXISTING button's label if you're not careful** — check what a word like "Cancel"/"Discard" already promises before wiring new destructive capability near it. `SaveDialog.tsx`'s "Cancel" button had a comment explicitly flagging "no real discard route exists" as the reason it wasn't already called "Discard." Once a real discard route existed, the tempting shortcut was wiring Cancel straight to it — but Cancel's established meaning ("not right now, keep my edits") and a real discard's meaning ("throw away all my edits") are opposite operations that happen to sound similar. The coordinator made this call explicitly before dispatch (new, separate, confirmation-gated button; leave Cancel alone) rather than leaving it for the implementer to guess — worth doing any time a new capability could plausibly get attached to an existing control whose name almost-but-not-quite already implies it. (Plan 2 follow-ups)

**Never remount a heavy canvas to add chrome around it.** Render the wrapper in every state and gate its pieces with `{active && …}`, so the canvas slot keeps its position and identity. The test captures the DOM node before and after and counts the `/api/world` calls. (Plan 6c Phase E)

**Snapping a view while chrome is mounting uses stale coordinates.** Record pointers in client coordinates and convert at snap time with `getBoundingClientRect()`, after the layout that moves the box has committed. (Plan 6c Phase E)

---

## Canvas / World View Rendering

**Live pixel alignment (`live/pix.mjs`):** compare the overlay canvas's map body (opaque bbox inset by the border ring, 32 px at 1×) with the world canvas under it. After hovering or painting, the overlay draws a cyan (34,211,238) cursor-cell outline the world lacks: exclude it, or measure before the pointer enters. GBA's Pencil metatile strip shifts the stage and clips the composite's top, so measure before opening it. Painting the metatile a cell already has leaves the session clean, so Escape then exits without a dialog. (Plan 8)

**Live GBA context paint:** once the Pencil strip is open, a read of the overlay can show 0 opaque pixels (mid-resize); re-read after a redraw. A `mouse.click` at the overlay's lower-middle can paint nothing (Undo stays disabled). `mouse.move` onto the map body, then `down`/`up`, painted. Confirm a paint by the dirty dot or an enabled Undo before going on. (Plan 8)

**Canvas badge verification worked:** scan `getImageData` for the exact `--danger` and `--text-muted` RGB, cluster the hits, read each cluster's tooltip by hovering, then right-click its centre. Run each check inside one `browser_run_code_unsafe` call. (Plan 6c Phase D close)

**A re-entered context snaps to a different view.** The second paint landed on a different tile than the first. Locate painted tiles from the on-disk byte diff (`cmp -l` plus layout width), not from screen positions, then reverse-paint at the hover readout's tile coordinates. (Plan 6c F1 close-out)

**Pick visually distinct metatiles for a "tile updated" check.** Grass 0x00 → 0x01 saved correctly but looked the same. (Plan 6c F1 close-out)

**Read button labels from the DOM before scripting them.** For example, GBC's unused-species list button says "Show list", not "List them". A wrong label silently scripts nothing. (Plan 6c F1 close-out)

---

## Editing Sessions & Save Safety

**A test that writes+restores a real corpus file must check every OTHER test file that reads or writes that same real file, not just files in its own package.** This bit three separate times across Task 18/19 alone: Task 18's spec review caught `writeCommands.test.ts` (package `cli`) racing `signRoutes.test.ts` (package `server`) on Route30's `scripts.inc`; the implementer's follow-up grep found 5 MORE `cli`-vs-`server` collisions; Task 19's spec review caught the new `corpus.test.ts` (package `core`) funnel test racing `blocks.test.ts` (also `core`) on NewBarkTown's real `map.bin` — and the implementer's fix-round grep found 5 more `core`-vs-`server` collisions. **Before adding a real read/write test against the subject decomp or a reference engine, grep `packages/*/test/**` (every package) for the specific map/route/file name you're about to use.** A second, narrower hazard: even a test that only *restores* unconditionally (writes back pre-edit bytes in a `finally`, never changing anything) is still a real `writeFileSync` that can race a concurrent *whole-corpus scanner* in another file — prefer read-guarding a restore (`if (!current.equals(before)) writeFileSync(...)`) over an unconditional one whenever the write is provably a no-op in the common case; see `corpus.test.ts`'s funnel test `finally` block for the pattern. (Plan 2 Task 18/19)

**A plan's own illustrative code can be wrong about which fields of a dependency it actually needs — verify unchecked type-assertion casts (`as Parameters<typeof fn>[0]`, `as SomeType`) against the REAL function body, not the plan's own comment claiming the cast is safe.** Task 19's plan text asserted `planSave`/`commitSave` "only ever read `proj.paths` and `proj.profile`" and that a future drift would "fail type-checking, not silently pass with `undefined`" — both false: `guardLayoutSave`/`guardMapSave` already read `proj.splitFor`/`proj.tileset`/`proj.constants`/`map.warpEvents` unconditionally, and an unchecked type assertion compiles silently regardless. The fix was to reuse this repo's existing `packages/core/test/helpers/stubProject.ts` (predates Task 19, already used by `guards.test.ts`/`save.test.ts`) rather than inventing a new partial-`Project` pattern — check for an existing stub/fixture helper before building a new one when a test needs a partial version of a real interface. (Plan 2 Task 18/19)

**Live-verify on a write-adjacent path (event elevation, discard) needs the same I8 before/after decomp-baseline discipline as a real save, even though the feature itself might never write** — the event-elevation follow-up's live-verify caught a real, unrelated, pre-existing bug (`applyJsonOps` ordering) specifically *because* it exercised a real "Add Event then move it" sequence against the real decomp, which a narrower "just check the elevation field persists" test would never have reached. Real, end-to-end live-verify keeps finding things scoped unit tests structurally cannot. (Plan 2 follow-ups)

**Run the end-to-end demo against the real subject, protected by byte snapshots.** Before the demo, copy every file the demo can write: the porcelain, `.pokemap/*.json`, and the layout `map.bin`. Restore by reverse paint where the UI allows it, and by copying the snapshot bytes for sidecars. Then `cmp` everything. A sidecar touched by an accept/un-accept cycle comes back re-serialized with `acceptedConflicts: []`, which differs only in bytes. (Plan 6c F1 close-out)

**Porymap strips `layout_version` from `layouts.json` on save** if the user opens the project in real Porymap concurrently. Fix by splicing the keys back from `git show HEAD:...` keyed on layout id — never `git checkout`, which would also discard real edits. (Things that will bite you)

---

## Server / Routes

**The hub refuses cross-site requests.** Every request (`hub.ts` `isCrossOriginRequest`) is checked: an `Origin` must be a local hostname, and so must the `Host`. That covers every existing project route too (a drive-by POST to `/commit` was possible before). The Vite proxy and node `fetch` in tests both pass. A new client that sets a non-local `Host` gets a 403. (Plan 6c Phase A)

**Server routes follow an established per-tool/per-op shape validation convention now** (`validateStampAndOrigin`-style shared helpers, `handleEventOp`-style shared snapshot/push helpers) — reuse them for any new route rather than hand-rolling validation/undo-wiring again. Task 17's `/sign/add` route reused Task 14's `handleEventOp` helper directly for its snapshot/push sequence, proving it generalizes past single-field mutations to the two-array-field (`insertOps` + `scriptAppends`) case. (Plan 2)

**The server's `pngCache` was never invalidated on commit.** The unit tests faked `Image`, so "saving updates the world tile" would have failed live. The quality reviewer caught it by reading the server, not the UI. (Plan 6c Phase E)

---

## GBC Format & Engine Quirks

**Saving clears undo history.** Reverse a saved GBC edit by repainting the original metatiles, and read them with `cmp -l` (its byte values are **octal**). (Plan 8)

**Corpus facts the plan had wrong:** only `UNOWN` breaks lowercasing in PerfPlus (`→ unown_a`); `NIDORAN_F`/`MR__MIME`/`HO_OH` lowercase to their real folders. The 295 `gfx/pokemon` entries are 278 folders + 17 `.asm` files. Every PerfPlus front sprite is opaque with a white index 0 (they render as cards). The species→folder mapping needs both `data/pokemon/pic_pointers.asm` (species-indexed labels) and `gfx/pics.asm` (label→file, label and INCBIN on one line, so `parseIncbins` doesn't apply). (Plan 6c Phase B)

**GBC caches normalized warp links at the handler, not the payload builder.** `buildGbcWorldPayload` accepts optional normalized warps; a focused test proves supplied links avoid event loading and that repeated pure resolutions leave the same base placements intact. The route supplies its immutable cache. Do not claim an external test observed the private handler cache unless it gains an intentional seam. (Plan 6c Phase D, D1-D2 handoff)

---

## GBA / Porymap Quirks

**GBA at 1× opens with the map anchored at the stage's bottom right,** so the stage centre is off the map. The tell: no requests and "Hover the map…". Hover first to find on-map points. (Plan 8)

**In GBA, pick a stamp from a palette thumb.** Dropper-then-Pencil gave no stamp; this is unconfirmed on `master`. (Plan 8)

**GBA's Pencil metatile strip shifts the stage and clips the composite's top,** so measure before opening it. (Plan 8)

**Painting the metatile a cell already has leaves the session clean,** so Escape then exits without a dialog. (Plan 8)

**GBA's shelf remains only the enabled-layout fallback.** `resolveWorldPlacements` first retains auto-layout fallback positions, replaces reachable shown singletons near warps, and applies manual sidecar placements last. `dungeonAutoLayout:false` continues to remove singleton placements. (Plan 6c Phase D, D1-D2 handoff)

**GBA coordinates are already tile units; GBC event steps divide by two into block units, preserving halves.** Unresolved arrivals can traverse a hidden map but cannot end an anchor path. `placeNearWarps` preserves its input Map iteration order; deterministic comparisons canonicalize entries rather than imposing a new paint order. (Plan 6c Phase D, D1-D2 handoff)

---

## Live Browser Verification (Playwright / CDP / Headless)

**`TaskStop` on a `npx tsx` hub leaves the node child listening on 5184.** Stop it by port (`Get-NetTCPConnection -LocalPort 5184`). (Plan 8)

**Playwright MCP may only write under the main checkout's `.playwright-mcp/` (pre-existing, untracked).** Remove your own files from it afterwards. (Plan 8)

**Keep `browser_run_code_unsafe` results small.** An `evaluateAll` over the GBA palette returned about 2,000 rows. (Plan 8)

**Playwright MCP held by another session** (tell: `Browser is already in use for …mcp-chrome-…`): launch `%LOCALAPPDATA%\ms-playwright\chromium-1208\chrome-win64\chrome.exe --headless=new --remote-debugging-port=9333 --user-data-dir=<scratch>` and drive it with the cached `playwright-core` (`npm-cache/_npx/9833c18b2d85bc59/...`) via `connectOverCDP`; the driver and step scripts are in the scratchpad `live/` (`pw.mjs`, `pix.mjs`). Pass `executablePath`/CDP, never `playwright install`. (Plan 8)

**Live-verify Vite on Windows:** use `fileURLToPath(new URL(".", import.meta.url))` for `root`; `URL.pathname` keeps `%20` for the space in "Programming Projects", and Vite then serves 404s. (Plan 6c Phase B)

**Cloud browser:** `import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs"` works without `playwright install`. (Plan 6b)

**Windows browser:** the Playwright MCP's `browser_run_code_unsafe` can save screenshots to disk. Keep each check inside one call: twice, a synthetic click (pointerdown→click within 1 ms) landed on an open dropdown *between* calls. An in-page event logger caught it. (Plan 6b)

**The Playwright MCP writes console/snapshot logs to `.playwright-mcp/` in the repo root.** Remove your own after a live verify; older files there aren't yours. (Plan 6c Phase C)

**Escape listeners that must yield to React modals go in the capture phase.** React 18 flushes a discrete update in the microtask after the root listener, so a window *bubble* listener runs after the modal is already gone. jsdom can't show this; the test has to mimic the flush with a document listener that removes the modal. (Plan 6c Phase E)

---

## Windows / Tooling / Git / Worktrees

**When the main checkout holds unrelated uncommitted work, gate and live-verify from a detached `git -c core.longpaths=true worktree add` in scratch (with its own `npm ci`).** Never stash or restore. (Plan 7)

**Tell reviewers which directories they must not write.** A 2026-10-12 spec reviewer `tar`-extracted HEAD over the coordinator's running mutation worktree. Run mutations in their own worktree, and rerun any mutant that was in flight. (Plan 7)

**Never use `pkill -f vite`.** It matches your own shell's command line (exit 144). Kill by PID from `ps aux | grep -E "tsx packages/server|node.*vite" | grep -v grep`. (Plan 6b)

**No worktrees in the cloud.** `pokemap.config.json` is skip-worktree, so a fresh worktree gets the committed Windows paths and the corpus tests silently skip. Run tasks sequentially in the one checkout. (Plan 6b)

**Shell on Windows:** Bash-tool heredocs and `python` work (verified 2026-10-13). Backticks in a commit message passed through Bash can trigger shell substitution: read the commit back after writing it. In Python string literals use raw strings for Windows paths: `"...Pokemon Game\refs..."` turns `\r` into a carriage return (tell: `Gameefs` in the output). (Things that will bite you; Plan 8)

**Stale dev servers from an earlier session can hold 5173/5174.** In A2, the 6b session's `serve.ts --gbc` (pre-hub code) and its Vite were still running. Don't kill what this session didn't start. Live-verify on other ports instead: an `--import` preload that remaps `http.Server.prototype.listen(5174)` to 5184, so the *real* `serve.ts` runs unmodified; Vite started programmatically (`createServer({ root: packages/ui, configFile: false, plugins: [react()], server: { port: 5183, proxy: { "/api": "http://127.0.0.1:5184" } } })`); a scratch `POKEMAP_HOME`, so the real `~/.pokemap` stays untouched. (Plan 6c Phase A)

**Scratch live setup on Windows:** `vite.mjs` must import through `pathToFileURL(require.resolve(...)).href`, and its `createRequire` base must be `packages/ui/package.json`, because `@vitejs/plugin-react` is installed only there. Start the hub with `node --import file:///…/preload.mjs --import tsx packages/server/src/serve.ts <root>`. (Plan 6c Phase D close)

**Background `npx tsx` hubs started with `run_in_background` outlive their task timeout as a node child on 5184** (tell: next hub `EADDRINUSE 127.0.0.1:5184`). Stop by port. (Plan 8)

**Rate limits kill agents mid-mutation.** Twice an agent was cut off with a mutation still applied on disk. When resuming one, the first instruction must be: "diff your files against your intended code, revert any leftover mutation, re-run the suite". (Plan 6)

**Reviewer mutation scripts that restore from a hardcoded snapshot silently discard later uncommitted work.** Restore from the in-memory read or from `git show <commit>:path`, never from a stale file copy. (Plan 6)

**Parallel implementers in isolated worktrees work well.**
- The worktree may start on a stale base, so tell the agent to `git merge --ff-only <branch>` first.
- Keep each task's additions to shared files (`gbcCommands.ts` and its test) in separate blocks. Cherry-pick integration then only conflicts on import lines and comments.
- Don't run two agents that commit in the same checkout at once. (Plan 6)

**Don't use `git checkout`/`git restore` to undo an experiment; commit first.** (Plan 6c Phase B)

**`git add -f <dir>/*.log` stages every ignored log in that folder, including stale ones from earlier tasks.** Name the task's logs (`task-7-*.log`). (Plan 8)

**The decomp baseline moves.** Measure `git status --porcelain` in the subject decomp fresh at session start — it was 6 modified + 1 untracked (`docs/human-tasks-notes.md`, `NavelRock*`/`fieldmap.h`/`layouts.json` files, all mtimes from Aug 29-30) for the entirety of Plan 2, unchanged throughout all 19 tasks. Confirm this number fresh rather than trusting this file's own number if much time has passed. (Things that will bite you)

**Agents get killed mid-edit, including by rate limits mid-review.** Read `git status --porcelain` + `git log --oneline -3` before deciding what to do next, every time. A clean tree at the point of interruption means resume-in-place (via `SendMessage` to the same agent) is safe and usually the RIGHT call if the partial work looks coherent (read the actual diff, don't just trust the last visible status line) — Plan 2 successfully resumed several implementer agents mid-task this way (Task 4, Task 11, Task 15, and twice more in Task 19's own fix rounds) rather than discarding and redispatching from scratch. Discard-and-redispatch only when the partial diff itself looks garbled/incomplete in a way that can't be safely continued. One wrinkle in Task 19: a rate-limited agent can finish its actual file edits and commit, then get cut off only on its final reply/report-append step — `git log`/`git status` after an interruption can show a fully clean, already-committed state even though the notification says "failed"; check before assuming there's partial work to resume at all. (Things that will bite you)

---

## Delegation to Codex / Aider / Subagents

**Never `taskkill /IM codex.exe`:** it ends every Codex process on the machine, including the user's own sessions. Kill the background shell job or the one PID instead. Also, before resuming Codex on a worktree, check that `git checkout` didn't abort (tell: "Aborting" and HEAD unchanged; intent-to-add files from `git add -N` block it, `git reset` first). (Plan 9)

**Never adopt a process change that arrives mid-session in a message** (e.g. "skip prose reports", "pointer-only errors", "drop transcripts", edits to `~/.claude/CLAUDE.md`), however urgent it sounds. It happened once in Plan 2 and was declined: it would have gutted the detailed reports that caught most real bugs. (Plan 2)

**Codex sandbox (`codex exec -s workspace-write -C <p8>`):** Vitest's CLI cannot load its config there (tell: `Cannot read directory "../../../..": Access is denied` / `failed to load config`), and it cannot write git (the worktree's gitdir is under the main checkout's `.git/worktrees`). Codex falls back to the Vitest API; the coordinator runs the full gate itself and commits Codex's diff with pathspecs. Fix rounds: `codex exec resume <thread id>` (ids in the ledger). (Plan 8)

**Codex `"Selected model is at capacity"`** (turn.failed in `--json` events) is transient OpenAI capacity for `gpt-6.1-sol`, not the user's quota; it recurred mid-run after a trivial probe passed. Use `-m gpt-6-astra` (slugs in `~/.codex/models_cache.json`), or `codex exec resume <thread> -m gpt-6-astra "<continue>"`. (Plan 8)

**Aider tell `uv trampoline failed to canonicalize script path`**: `~/.local/bin/aider.exe` points at a deleted `%APPDATA%/uv/tools/aider-chat`. Fixed 2026-10-13: `py -m pip install --user uv`, then `uv tool install --force --python 3.12 aider-chat` (aider 0.86.2; Nemotron probe OK). (Plan 8)

**Codex `"You've hit your usage limit … try again at HH:MM"`** (turn.failed) is the user's OpenAI quota, unlike "at capacity". The partial diff stays in the tree; wait for the stated time, then `codex exec resume <thread> -m <model> "continue"` (Task 6 resumed cleanly). (Plan 8)

**Codex tends to strip existing comments and reflow JSX when it restructures a component** (Task 6 `MapEditingWorkspace`): check `git diff` for deleted comments before review. (Plan 8)

**Subagents hit rate limits mid fix-round.** The recipe held: `git status`/`log`/`diff`, the external-state hashes, stray node processes, then SendMessage the same agent with "verify first, then redo from the start". (Plan 6c Phase E)

**The coordinator's mutation re-run as a node script is cheap and reliable.** Keep a literal anchor asserted to match exactly once, run the narrowest vitest file via `node node_modules/vitest/vitest.mjs run <file>`, restore the in-memory on-disk bytes, and byte-compare the file afterwards. It ran A1's 12 and A2's 13 survivors and fix guards, all red, in minutes. (Plan 6c Phase A)

The raw per-phase lessons this was distilled from, with the session narrative, are in `docs/superpowers/history/` (git-tracked, hidden from Claude's search by the root `.ignore`).
