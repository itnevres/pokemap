# RESUME lessons, raw (moved out of RESUME.md on 2026-10-13)

History only. The distilled, current traps are in `docs/superpowers/LESSONS.md`. This folder is listed in the root `.ignore`, so Claude Code search (Grep/Glob) skips it; read a file here by path when you need the history.

## Lessons from Plan 7 (2026-10-08/12)

- A test that dry-runs against the real PerfPlus can write under a "dry run commits" mutation. It happened in Task 6's C1 and was restored byte-identical. Use temp copies (`copyGbcSubjectToTemp`) for every test that a mutation could turn into a write.
- A cheap model's mutation table can claim red without a run (Task 2's P5). The coordinator re-run catches it.
- Spec fixtures can hide the very bug a mutation targets (Task 1's blkPath equal to the map name; Task 2's diagonals). Reviewers found both.
- Retaining a ref to the latest request does not make a stroke completion barrier. Return the first apply promise, queue every move, await end, and capture visit identity plus start/end cleanup.
- A deferred test's negative assertion must let the relevant queued microtasks run. The original adjacent-stroke witness missed removal of the end await until the coordinator mutation exposed its scheduling gap.
- Cached image readiness needs decoded metadata and the current image URL. A synthetic load event without natural dimensions can race the mounted-image readiness effect; do not weaken geometry assertions or inflate timeouts.
- When the main checkout holds unrelated uncommitted work, gate and live-verify from a detached `git -c core.longpaths=true worktree add` in scratch (with its own `npm ci`). Never stash or restore.
- Tell reviewers which directories they must not write. A 2026-10-12 spec reviewer `tar`-extracted HEAD over the coordinator's running mutation worktree. Run mutations in their own worktree, and rerun any mutant that was in flight.
- A mutation classifier must count `TestingLibraryElementError` as an assertion failure, not only `AssertionError`/`expected`. X5 was first mislabelled a survivor.

## Plan 8 lessons so far (2026-10-12)

- **New load-only flakes** (baseline gate at `3f9f8ce` gave 2,572/2; both files passed 44/44 in isolation): `WorldCanvasContext.test.tsx` "Escape that closes an open context menu…", with the tell `TestingLibraryElementError … role "menu"`; and `gbc/GbcAppEditing.test.tsx` "dirty guard…", with the tell `EPERM … pokemap-gbc-*\maps\ElmsHouse.asm`. Rerun them in isolation before calling either a regression.
- Run vitest from the repo **root**. From `packages/ui`, the jsdom glob misses, and the tell is `document is not defined`.
- Live check:
  - Saving clears undo history. Reverse a saved GBC edit by repainting the original metatiles, and read them with `cmp -l` (its byte values are **octal**).
  - GBA at 1× opens with the map anchored at the stage's bottom right, so the stage centre is off the map. The tell: no requests and "Hover the map…". Hover first to find on-map points.
  - In GBA, pick a stamp from a palette thumb. Dropper-then-Pencil gave no stamp; this is unconfirmed on `master`.
  - `TaskStop` on a `npx tsx` hub leaves the node child listening on 5184. Stop it by port (`Get-NetTCPConnection -LocalPort 5184`).
  - Playwright MCP may only write under the main checkout's `.playwright-mcp/` (pre-existing, untracked). Remove your own files from it afterwards.
  - Keep `browser_run_code_unsafe` results small. An `evaluateAll` over the GBA palette returned about 2,000 rows.
- **Codex sandbox** (`codex exec -s workspace-write -C <p8>`): Vitest's CLI cannot load its config there (tell: `Cannot read directory "../../../..": Access is denied` / `failed to load config`), and it cannot write git (the worktree's gitdir is under the main checkout's `.git/worktrees`). Codex falls back to the Vitest API; the coordinator runs the full gate itself and commits Codex's diff with pathspecs. Fix rounds: `codex exec resume <thread id>` (ids in the ledger).
- **Playwright MCP held by another session** (tell: `Browser is already in use for …mcp-chrome-…`): launch `%LOCALAPPDATA%\ms-playwright\chromium-1208\chrome-win64\chrome.exe --headless=new --remote-debugging-port=9333 --user-data-dir=<scratch>` and drive it with the cached `playwright-core` (`npm-cache/_npx/9833c18b2d85bc59/...`) via `connectOverCDP`; the driver and step scripts are in the scratchpad `live/` (`pw.mjs`, `pix.mjs`). Pass `executablePath`/CDP, never `playwright install`.
- Live pixel alignment (`live/pix.mjs`): compare the overlay canvas's map body (opaque bbox inset by the border ring, 32 px at 1×) with the world canvas under it. After hovering or painting, the overlay draws a cyan (34,211,238) cursor-cell outline the world lacks: exclude it, or measure before the pointer enters. GBA's Pencil metatile strip shifts the stage and clips the composite's top, so measure before opening it. Painting the metatile a cell already has leaves the session clean, so Escape then exits without a dialog.
- An "equivalent mutant" is still a finding: after a fix makes a guard unreachable, record it as equivalent with the live witness named (Task 1's M6/M8).
- **Codex `"Selected model is at capacity"`** (turn.failed in `--json` events) is transient OpenAI capacity for `gpt-6.1-sol`, not the user's quota; it recurred mid-run after a trivial probe passed. Use `-m gpt-6-astra` (slugs in `~/.codex/models_cache.json`), or `codex exec resume <thread> -m gpt-6-astra "<continue>"`.
- **Aider tell `uv trampoline failed to canonicalize script path`**: `~/.local/bin/aider.exe` points at a deleted `%APPDATA%/uv/tools/aider-chat`. Fixed 2026-10-13: `py -m pip install --user uv`, then `uv tool install --force --python 3.12 aider-chat` (aider 0.86.2; Nemotron probe OK).
- **StrictMode in renderHook**: a `<StrictMode>` wrapper runs effects ONCE here (React 19.2, RTL 16.3); `renderHook(..., { reactStrictMode: true })` runs them twice.
- **New load-only flake class since Task 5** (tell: `expected N to be less than -1` in `gbc/GbcAppWorldGuard` "a world click, confirmed: POST /discard goes out BEFORE..." or `gbc/GbcAppEditing` "dirty guard: ... BEFORE switching"; also GbcApp "palette highlight resets..."): the status shows the new map before its GET effect fires. Order discard < GET held in every instrumented run. BASE `d37959e` was clean 2/2 full runs; Task 5 HEAD failed 3 of 4. Cause not isolated; ruled a test-timing flake and flagged for the final review (ledger). Rerun the file alone; if a full gate fails only on these, rerun the gate once. **Fixed in `6560014`**: the three ordering tests now wait for the new map's GET (cause: the status text commits a scheduler task before the fetch effect runs).
- A test using `await expect(act(async () => ...)).rejects.toThrow()` can leak its AssertionError as an Unhandled Error: the run exits 1 but the test counts as passed and its later asserts never run (Task 5 E3 vs `useEditSession.test.tsx`). Witnesses catch the rejection themselves.
- **Codex `"You've hit your usage limit … try again at HH:MM"`** (turn.failed) is the user's OpenAI quota, unlike "at capacity". The partial diff stays in the tree; wait for the stated time, then `codex exec resume <thread> -m <model> "continue"` (Task 6 resumed cleanly).
- Codex tends to strip existing comments and reflow JSX when it restructures a component (Task 6 `MapEditingWorkspace`): check `git diff` for deleted comments before review.
- Live GBA context paint: click from the overlay canvas rect (e.g. its lower-middle), not from `pix.mjs`'s body box, once the Pencil strip is open. A read of the overlay right after the strip opens can show 0 opaque pixels (mid-resize); re-read after a redraw.
- Background `npx tsx` hubs started with `run_in_background` outlive their task timeout as a node child on 5184 (tell: next hub `EADDRINUSE 127.0.0.1:5184`). Stop by port.
- **Live GBA context paint, take 2** (Task 7 smoke): a `mouse.click` at the overlay's lower-middle can paint nothing (Undo stays disabled). `mouse.move` onto the map body, then `down`/`up`, painted. Confirm a paint by the dirty dot or an enabled Undo before going on.
- A mutant that makes a promise never settle is killed by the test's 5 s timeout, which the mutation script reports as `FAIL(no-assert-msg)`. Rerun that one test by hand and record the timeout (Task 7 M3).
- `git add -f <dir>/*.log` stages every ignored log in that folder, including stale ones from earlier tasks. Name the task's logs (`task-7-*.log`).

## Lessons from Plan 6 (2026-09-24/25; new, add to everything below)

- **Rate limits kill agents mid-mutation.** Twice an agent was cut off with a mutation still applied on disk. When resuming one, the first instruction must be: "diff your files against your intended code, revert any leftover mutation, re-run the suite".
- **Reviewer mutation scripts that restore from a hardcoded snapshot silently discard later uncommitted work.** Restore from the in-memory read or from `git show <commit>:path`, never from a stale file copy.
- **Parallel implementers in isolated worktrees work well.**
  - The worktree may start on a stale base, so tell the agent to `git merge --ff-only <branch>` first.
  - Keep each task's additions to shared files (`gbcCommands.ts` and its test) in separate blocks. Cherry-pick integration then only conflicts on import lines and comments.
  - Don't run two agents that commit in the same checkout at once.
- **The coordinator re-running a reviewer's surviving mutations on the final fix commit is cheap.** Several times it replaced a whole extra review round.
- **Measured "surprises" need an Opus reviewer to decide real-data vs wrong-rule.** Examples: NewBarkTown's no-op roof swap, and Task 11's 2 connection conflicts. Both turned out real, but only independent derivation could establish it.

## Lessons from Plan 6b (2026-09-25/28; new, add to everything above)

- **Never call one React state setter inside another's updater.**
  - `main.tsx` renders under `<StrictMode>`, which runs updaters twice in dev. So `setZoom(z => { setPan(...) })` applies the pan twice.
  - **Tell:** zoom/pan is wrong or the canvas is blank only in the Vite dev server, and correct in a production build. Instrument `drawImage`'s destination rect before explaining it.
  - **Fix:** a single `view = { zoom, pan }` state, plus a StrictMode test that pins the exact pan.
  - The GBA `MapCanvas` still has this bug (see the follow-ups row above).
- **Flex children that hold long text need `min-width: 0`.**
  - **Tell:** a screenshot taken while hovering shows the sidebar cut off on the left.
  - **Check:** `document.documentElement.scrollWidth === clientWidth` while hovering, at 1280 and 1024 px wide.
- **An agent's explanation of a visual anomaly can be confidently wrong.**
  - Task 4's "4× is blank because of a headless canvas size limit" was false. The real cause was the StrictMode double pan. Its screenshot was stale, captured before the fix or before the image loaded.
  - **Tell:** the explanation contradicted a reviewer's measurement that a 10,496 px destination renders fine.
  - The coordinator reproduces any such claim with instrumentation before accepting it.
- **Mutation harnesses restore from `git show HEAD:<file>`.**
  - Running one over *uncommitted* edits silently discards those edits (this happened in Task 5). Commit before you mutate.
  - **Anchor drift:** after a refactor, a harness whose anchor no longer matches can *silently skip* a mutation. Task 5's X2 and X12 never ran, and the harness printed nothing for them. Always cross-check the requested IDs against the printed results.
- **Spec "facts" can be wrong, even from the coordinator.** Task 1a's spec claimed AzaleaTown shares VioletCity's tileset; it is `TILESET_JOHTO_MODERN`. The roof test only discriminated after switching to MahoganyTown. Re-measure corpus facts before pinning them.
- **Review rhythm that worked:**
  - The Opus spec review mutates code and runs servers; the Sonnet quality review is strictly read-only. They can run concurrently in one checkout.
  - The coordinator commits review reports with a pathspec commit (`git commit -- <path>`). A reviewer's in-flight mutation can therefore sit safely in the tree, and the stop hook's "uncommitted changes" prompt must never be answered by committing it.
- **Sessions die mid-task:** rate limits (5-hour and weekly) and a container restart, several times.
  - Every agent commits each green step.
  - On resume: `git status`, `git log`, `git diff --stat`, and check for stray `tsx`/`vite` processes.
  - Resume the same agent via SendMessage when its context survives. After a container restart it doesn't, so brief a fresh agent from the report and the commits.
- **Don't use `pkill -f vite`.** It matches your own shell's command line (exit 144). Kill by PID from `ps aux | grep -E "tsx packages/server|node.*vite" | grep -v grep`.
- **No worktrees in the cloud.** `pokemap.config.json` is skip-worktree, so a fresh worktree gets the committed Windows paths and the corpus tests silently skip. Run tasks sequentially in the one checkout.
- **Cloud browser:** `import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs"` works without `playwright install`.
- **Windows browser:** the Playwright MCP's `browser_run_code_unsafe` can save screenshots to disk. Keep each check inside one call: twice, a synthetic click (pointerdown→click within 1 ms) landed on an open dropdown *between* calls. An in-page event logger caught it.
- **Tests written in the cloud may never have run on Windows.** For example `spawnSync("npx")` (a `.cmd` shim, which gives ENOENT without a shell; spawn `process.execPath, ["--import","tsx",…]` instead), or a regex built from `path.split("/")`. Treat new Windows-only failures as portability bugs in the test, and fix them test-only.
- **A `*/` inside a CSS comment is silent in the browser.** It closes the comment early, and the next rule is dropped as an invalid selector. It cost the spotlight its `position: relative` for four weeks, and the only other symptom was a `vite build` failure that was recorded as cosmetic. `packages/ui/test/styles.test.ts` now parses the sheet strictly with lightningcss.
- **"Existing GBA tests unchanged" needs checking in every fix round.** Task 6's fix round edited a GBA test to make a LensPanel change pass. The coordinator caught it with `git diff <base> -- packages/ui/test/<gba files>` (additions only), then reverted it and made the GBC side real instead.
- **Canvas-drawn UI (badges, tints) can be verified without DOM hooks.** Scan `getImageData` for the token's exact RGB, cluster the hits, and hover each cluster. For lenses, count the tint elements by `style.background` and compare the counts with an independent in-page recomputation from the API.

## Lessons from Plan 6c Phase A (2026-09-29/30; new, add to everything above)

- **The hub refuses cross-site requests.** Every request (`hub.ts` `isCrossOriginRequest`) is checked:
  an `Origin` must be a local hostname, and so must the `Host`. That covers every existing project route
  too (a drive-by POST to `/commit` was possible before). The Vite proxy and node `fetch` in tests both
  pass. A new client that sets a non-local `Host` gets a 403.
- **Stale dev servers from an earlier session can hold 5173/5174.** In A2, the 6b session's
  `serve.ts --gbc` (pre-hub code) and its Vite were still running. Don't kill what this session didn't
  start. Live-verify on other ports instead:
  - an `--import` preload that remaps `http.Server.prototype.listen(5174)` to 5184, so the *real*
    `serve.ts` runs unmodified;
  - Vite started programmatically (`createServer({ root: packages/ui, configFile: false, plugins: [react()], server: { port: 5183, proxy: { "/api": "http://127.0.0.1:5184" } } })`);
  - a scratch `POKEMAP_HOME`, so the real `~/.pokemap` stays untouched.

  Each script is about 5 lines. The steps it verified are in `_archive/task-A2-coordinator.md`.
- **Specs can contradict themselves.** A2's spec said both "mirror SaveDialog's backdrop" and "never two
  stacked backdrops". The implementer followed both literally, which produced nested backdrops, and Escape
  closed the whole switcher. Both reviewers caught it. The coordinator's call: a confirm *inside* a modal
  has no backdrop of its own and stops Escape's propagation. Check new specs for this pattern: a nested
  dialog plus "mirror the modal shell".
- **Rate limits hit both implementers mid-fix-round.** The RESUME recipe worked each time (`git status` /
  `log` / `diff`, then SendMessage the same agent with "revert leftovers first"). One agent died before
  its first commit, and the tree was clean.
- **The coordinator's mutation re-run as a node script is cheap and reliable.** Keep a literal anchor
  asserted to match exactly once, run the narrowest vitest file via `node node_modules/vitest/vitest.mjs run <file>`,
  restore the in-memory on-disk bytes, and byte-compare the file afterwards. It ran A1's 12 and A2's 13
  survivors and fix guards, all red, in minutes.
- **The unidentified Windows flake recurred:** 1 failure in the first of 5 full runs, then 4 clean runs.
  (Identified and fixed in Phase B, below.)

## Lessons from Plan 6c Phase B (2026-09-30/10-01; new, add to everything above)

- **Capture the first full run to a file, always.** That's how the flake was finally named: the
  WorldCanvas jump highlight clears on a real 2 s `setTimeout`, and full-suite load stretched
  mount-to-assert past it. The fix holds that one timer per test and fires it with an explicit `flush()`
  (a `clearTimeout` of a held id drops it, so "cancelled and never rescheduled" is still caught).
  Pattern for any real-timer test: hold the timer, don't sleep past it.
- **Load-only flakes still seen** (each passed alone): `gbcRoutes.test.ts` `/api/where/:species`
  DUNSPARCE 5 s timeout; `GbcApp.test.tsx` "palette highlight resets…" (1 s `waitFor`). **Never run two
  full suites at once:** `dungeons.test.ts` reads and writes the subject's shared
  `.pokemap/dungeons.json`, so concurrent suites race across processes (seen once). Measure the phase
  gate on a quiet machine.
- **Corpus facts the plan had wrong:** only `UNOWN` breaks lowercasing in PerfPlus (`→ unown_a`);
  `NIDORAN_F`/`MR__MIME`/`HO_OH` lowercase to their real folders. The 295 `gfx/pokemon` entries are 278
  folders + 17 `.asm` files. Every PerfPlus front sprite is opaque with a white index 0 (they render as
  cards). The species→folder mapping needs both `data/pokemon/pic_pointers.asm` (species-indexed
  labels) and `gfx/pics.asm` (label→file, label and INCBIN on one line, so `parseIncbins` doesn't apply).
- **The coordinator's own spec mutations were wrong twice in B2.** "`>=` instead of `>`" was an
  equivalent mutant (an area product `max(0,w)·max(0,h)` never compares), and "a closed rule flips
  NewBarkTown" was false (the least-overlap fallback still picks `top`). The Opus reviewer caught both by
  re-deriving. Before pinning a mutation in a spec, ask whether it can change any output at all.
- **"Touching" needed a precise rule.** The plan said both "touching blocks" and "a gap ≥ band doesn't".
  Positive-area overlap with the band satisfies both and makes corners free. Watch for plan sentences
  that only agree under one reading.
- **Deleting a component's tests loses pins silently.** B3's old→new table looked complete, but the GBC
  LOD 7/8 threshold was pinned only by the deleted gutter test; the new component test pinned a generic
  threshold, not the canvas wiring (mutant `lodZoom={4}` survived). For each deleted test, mutate the
  *wiring*, not just the component.
- **`git checkout` as a mutant restore wiped uncommitted work again** (B3 fix round). Putting "never use
  `git checkout`/`git restore` to undo an experiment; commit first" in the implementer prompt stopped it in B4.
- **An implementer deleted the coordinator's untracked helper** (`packages/ui/.scratch-vite5183.mjs`)
  despite "leave it". Keep coordinator scratch outside the repo where possible; recreate if needed.
- **Live-verify Vite on Windows:** use `fileURLToPath(new URL(".", import.meta.url))` for `root`;
  `URL.pathname` keeps `%20` for the space in "Programming Projects", and Vite then serves 404s.
- **Per-map UI state:** a "reset on map change" `useEffect` runs after child hooks' effects, so a hook
  keyed on the old toggle fires for the new map in the first render (B4 fetched the wrong map). Hold the
  state as `forMap: string | null` (`on = forMap === mapName`) instead of resetting it.
- **Rate limits cut off two agents mid-task.** The recipe held: `git status`/`log`/`diff`, then
  SendMessage the same agent with "verify and revert leftovers first". One resumed with red-first tests
  still uncommitted and carried on correctly.

## Lessons from Plan 6c Phase C (2026-10-01; new, add to everything above)

- **The in-app browser pane can be hidden, and then layout lies.** With the pane hidden,
  `document.hidden` is true, `requestAnimationFrame` never runs and a `ResizeObserver` never delivers
  (not even its initial callback), so the canvas keeps a stale `viewport` and a jump looked off-screen.
  It was not an app bug. Check `document.visibilityState` first; for anything layout- or resize-dependent,
  use the Playwright MCP's `browser_run_code_unsafe` (it renders normally) and keep each check in one call.
- **Ask "what happens on remount, for each selection source?"** C2's spec copied GBC's F1 split
  (`jumpTarget` set only by tree clicks), and both reviewers confirmed a design gap the coordinator had
  probed for: after a world click, Map → World re-entry jumped to the *stale* tree target, because the
  world canvases remount per mode with a fresh `appliedJumpTokenRef`. Fix: entering World from another
  mode jumps to the current selection (`enterWorld`, both apps). When two fixes work, prefer the one that
  doesn't touch a shared effect: the alternative changed both canvases' jump effects.
- **Equivalent mutants, again.** `enterWorld`'s token bump is redundant today (the remount alone makes
  any token unapplied); it was kept for intent and recorded as equivalent, not chased with a test.
- **A `waitFor` on a condition that is already true at mount is no gate.** The WorldCanvas jump test's
  `waitFor(clearRect)` passed on its first check (the draw runs while `world` is null), so the
  synchronous highlight read raced the jump effect's re-render under load. Wait on the asserted thing
  itself. Same test as Phase B's timer flake: a second, independent race.
- **Spec self-check caught a contradiction before dispatch:** per-key state (`listFor === active`)
  reopens a list when you return to its lens, but the spec's test said "closed". For "always starts
  fresh on change", a `key={active}` inner component is simpler than per-key state. (Per-key state is
  still right when the *first render after* a change must already be correct: B4's `encountersFor`.)
- **Drafting the next task's spec while the current implementer runs** saved a round trip. Commit it
  with a pathspec commit only after the implementer stops committing, to avoid an index-lock race.
- **Quick U1 check per test file:** `git diff <base> -- <file> | grep -c '^-[^-]'` (removed lines);
  anything non-zero outside the spec's table needs a name and a reason.
- **The Playwright MCP writes console/snapshot logs to `.playwright-mcp/` in the repo root.** Remove
  your own after a live verify; older files there aren't yours.

---

## Lessons from Plan 2 (in addition to everything already below from
## earlier plans — still all true)

**This repo has NO `@testing-library/jest-dom`.** `toBeInTheDocument`,
`toHaveValue`, `toBeDisabled`, `toBeEnabled`, `toHaveAttribute` are not real
matchers here — every UI task's own plan-text test snippets used them
anyway (copied from a generic React-testing habit, not this repo's real
convention) and every single implementer had to adapt to plain DOM
property/attribute reads (`.getAttribute(...)`, `.disabled`, `.value`,
`document.body.contains(el)`). Tell implementers this up front instead of
letting them discover it.

**This repo has no shared `.btn`/`.btn--primary` utility class.** Each
component defines its own block-scoped `__btn--primary`-style modifier
(`.save-dialog__btn--primary`, `.sign-composer__btn--primary`), matching
the same BEM-ish convention as every other element class. Several plan
tasks' own illustrative JSX used a bare `className="btn btn--primary"` —
wrong, adapt to the real per-component convention.

**Known-wrong CSS token names in this plan's own illustrative text** (all
independently rediscovered 3-4 times before this note existed —
tell every remaining/future UI task these up front): `--border-default`
→ `--border`; `--bg-panel-elevated` → `--bg-panel-raised`; `--accent-primary`
/`--accent-primary-muted` → `--bg-selected` + `--border-strong` (the
established selected/active-state pairing, used everywhere from
`.map-canvas__btn[aria-pressed="true"]` to `.toolbar__tool-btn--active`);
`--danger-muted` → doesn't exist, just use `--danger` as a plain border with
ordinary panel background; `--warning` → `--warn`; `--radius-sm` → doesn't
exist as a token, check an existing rule for the real literal px value in
use. Real tokens are all in `packages/ui/src/styles.css`'s `:root` block.

**The paint-tool race-safety pattern (`pendingPaintRef`/`endActiveStroke`)
in `MapCanvas.tsx` is load-bearing and easy to accidentally bypass.** A
tool's mouse handling MUST route through the existing `paintAt`/
`pendingPaintRef` chain, not a parallel code path that reads a ref
synchronously outside the async `beginStroke().then()` chain — Task 11
shipped exactly this bug for its `rect` tool (a fast click could silently
drop the paint entirely), caught only by code review with a *real*
async-timing reproduction (a `setTimeout`-delayed mock, not an
instant-resolving one — jsdom's own event firing doesn't naturally expose
this class of race). If a future task adds a 6th/7th tool here, insist on
the same reproduction discipline before accepting "it's inside `paintAt`,
so it's safe" as suf­ficient — verify by tracing the actual call chain.

**Modal components own their own shell now, not a half-copy split with
`App.tsx`.** `SaveDialog.tsx` set this precedent (backdrop, `onKeyDown`
Escape handler, `autoFocus` on the default action) after Task 13's own
review caught a regression of an *already-once-fixed* bug
(`WarpDestinationModal`'s own "Review fix" comment already named this exact
failure mode) — Escape silently no-oped because focus never moved into the
modal. `SignComposer.tsx` (Task 17) mirrors this. Any future modal
component should mirror `SaveDialog.tsx`'s shell exactly, not reinvent it.

**Every response-consuming component must validate response shape before
trusting it, not just check `r.ok`.** `SaveDialog` originally cast every
fetch response `as DiffPlan` with no validation — crashed on a real 500
response's `{error: string}` body. Fixed with a real type-guard
(`isDiffPlan`); `SignComposer` was built with the equivalent guard from the
start once this became an established pattern. Apply this to any new
fetch-consuming component going forward.

**Silent failure on async handlers is a recurring defect class this plan
paid down twice (SaveDialog, then EventInspector's App.tsx wiring) and
should not need a third catch.** Every `.then()`-based handler wired to a
server call needs a real `.catch()` with a visible error surface — check
this proactively in review rather than waiting for it to be found.

(The old "extract from useEditSession/App" note is done: 6c E2 extracted MapEditingWorkspace/useMapEditing, Plan 8 the shared session core and shell; App is 364 lines.)

**Server routes follow an established per-tool/per-op shape validation
convention now (`validateStampAndOrigin`-style shared helpers,
`handleEventOp`-style shared snapshot/push helpers) — reuse them for any
new route rather than hand-rolling validation/undo-wiring again.** Task 17's
`/sign/add` route reused Task 14's `handleEventOp` helper directly for its
snapshot/push sequence, proving it generalizes past single-field mutations
to the two-array-field (`insertOps` + `scriptAppends`) case.

## Lessons from Task 18/19 (Plan 2's close-out — new, add to everything above)

**A test that writes+restores a real corpus file must check every OTHER
test file that reads or writes that same real file, not just files in its
own package.** This bit three separate times across Task 18/19 alone: Task
18's own spec review caught `writeCommands.test.ts` (package `cli`) racing
`signRoutes.test.ts` (package `server`) on Route30's `scripts.inc`; the
implementer's own follow-up grep then found 5 MORE `cli`-vs-`server`
collisions the reviewer hadn't scoped to; Task 19's spec review then caught
the new `corpus.test.ts` (package `core`) funnel test racing
`blocks.test.ts` (also `core`, but a different file) on NewBarkTown's real
`map.bin` — and the implementer's own fix-round grep found 5 more
`core`-vs-`server` collisions on top of that. **Before adding a real
read/write test against the subject decomp or a reference engine, grep
`packages/*/test/**` (every package, not just the one you're touching) for
the specific map/route/file name you're about to use.** A second, narrower
version of the same hazard: even a test that only *restores* unconditionally
(writes back the pre-edit bytes in a `finally`, never changing anything) is
still a real `writeFileSync` that can race a concurrent *whole-corpus
scanner* in another file (one that reads every map by iteration, not by
name) — prefer read-guarding a restore (`if (!current.equals(before))
writeFileSync(...)`) over an unconditional one whenever the write is
provably a no-op in the common case; see `corpus.test.ts`'s funnel test
`finally` block for the pattern.

**A plan's own illustrative code can be wrong about which fields of a
dependency it actually needs — verify unchecked type-assertion casts (`as
Parameters<typeof fn>[0]`, `as SomeType`) against the REAL function body,
not the plan's own comment claiming the cast is safe.** Task 19's plan text
asserted `planSave`/`commitSave` "only ever read `proj.paths` and
`proj.profile`" and that a future drift would "fail type-checking, not
silently pass with `undefined`" — both false: `guardLayoutSave`/
`guardMapSave` already read `proj.splitFor`/`proj.tileset`/
`proj.constants`/`map.warpEvents` unconditionally, and an unchecked type
assertion compiles silently regardless. The fix was to reuse this repo's
existing `packages/core/test/helpers/stubProject.ts` (predates Task 19,
already used by `guards.test.ts`/`save.test.ts`) rather than inventing a
new partial-`Project` pattern — check for an existing stub/fixture helper
before building a new one when a test needs a partial version of a real
interface.

## Lessons from the Plan 2 follow-ups (2026-09-22 — new, add to everything above)

**When a task isn't pre-written (unlike Plan 2's own tasks, these 5 were one-line
gap descriptions from a prior session, not full TDD-step text), work out the
concrete mechanism yourself before dispatching, especially anywhere state has to
survive a re-render or a network round trip.** The live-render follow-up is the
clearest case: the coordinator traced through `MapCanvas.tsx`'s actual effect
ordering ahead of time and specified an exact `paintVersion`/`imgLoaded`/
`fittedForMapRef` mechanism in the dispatch prompt, rather than just describing
the goal ("make painted tiles show up") and letting the implementer improvise. It
still took two real fix rounds (a spurious map-switch double-bump, 3-4x redundant
renders per paint stroke, zero regression-test coverage of either invariant a
naive implementation would have silently broken) — but every one of those was a
refinement of a working design, not a rediscovery of the whole mechanism from
scratch the way an under-specified dispatch would have produced.

**A component that always receives a truthy prop object will always take that
branch, even when the object's OWN fields are empty/default — "is the prop
present" and "does the prop have real data" are different questions, and code
written as if they're the same silently breaks.** `MapCanvas.tsx`'s `blocks =
editSession ? editSession.blocks : staticBlocks` looks like a safe live/static
fallback, but `App.tsx` always passes a real `editSession` object (the hook
never returns `undefined`) — so it ALWAYS takes the live branch, even when
`editSession.blocks` is `[]`. This bit twice: the live-render mechanism needs
`imgLoaded` to genuinely cycle false→true on every reload, not just once ever,
or the canvas freezes on stale pixels (naively "fixing" it only once, at mount,
is the wrong fix); and the discard follow-up's `useEditSession.discard()` had
to deliberately bypass its own file's otherwise-consistent `call()`/
`applyResponse` helper and reset local state to `initialBlocks`/`initialMap`
(the pre-edit seed) instead of the server's own empty "nothing open" response —
routing it through the normal path would have blanked the canvas permanently
after every discard. Both fixes needed a doc comment explicit enough that a
future "simplification" back to the file's own normal pattern wouldn't silently
reintroduce the bug — write that comment, don't rely on the fix being obviously
load-bearing from the diff alone.

**A UI convenience action (a button, a tool) can quietly change the meaning of
an EXISTING button's label if you're not careful — check what a word like
"Cancel"/"Discard" already promises before wiring new destructive capability
near it.** `SaveDialog.tsx`'s "Cancel" button had a comment explicitly flagging
"no real discard route exists" as the reason it wasn't already called
"Discard." Once a real discard route existed, the tempting shortcut was wiring
Cancel straight to it — but Cancel's established meaning ("not right now, keep
my edits") and a real discard's meaning ("throw away all my edits") are
opposite operations that happen to sound similar. The coordinator made this
call explicitly before dispatch (new, separate, confirmation-gated button; leave
Cancel alone) rather than leaving it for the implementer to guess — worth doing
any time a new capability could plausibly get attached to an existing control
whose name almost-but-not-quite already implies it.

**Live-verify on a write-adjacent path (event elevation, discard) needs the
same I8 before/after decomp-baseline discipline as a real save, even though the
feature itself might never write** — the event-elevation follow-up's live-verify
caught a real, unrelated, pre-existing bug (`applyJsonOps` ordering) specifically
*because* it exercised a real "Add Event then move it" sequence against the real
decomp, which a narrower "just check the elevation field persists" test would
never have reached. Real, end-to-end live-verify keeps finding things scoped
unit tests structurally cannot.

## Lessons from Plan 6c F1 close-out (2026-10-06; new, add to everything above)

- **Run the end-to-end demo against the real subject, protected by byte snapshots.** Before the demo, copy every file the demo can write: the porcelain, `.pokemap/*.json`, and the layout `map.bin`. Restore by reverse paint where the UI allows it, and by copying the snapshot bytes for sidecars. Then `cmp` everything. A sidecar touched by an accept/un-accept cycle comes back re-serialized with `acceptedConflicts: []`, which differs only in bytes.
- **A re-entered context snaps to a different view.** The second paint landed on a different tile than the first. Locate painted tiles from the on-disk byte diff (`cmp -l` plus layout width), not from screen positions, then reverse-paint at the hover readout's tile coordinates.
- **Pick visually distinct metatiles for a "tile updated" check.** Grass 0x00 → 0x01 saved correctly but looked the same.
- **Read button labels from the DOM before scripting them.** For example, GBC's unused-species list button says "Show list", not "List them". A wrong label silently scripts nothing.

## Lessons from Plan 6c Phase E (2026-10-05/06; new, add to everything above)

- **Live verification found what unit tests couldn't, three times:**
  - Chromium fires a native `contextmenu` (with `button: -1`) on the ContextMenu key's keyup, even when the keydown is `preventDefault`ed. Measure browser event sequences on a bare test page before designing around them.
  - The server's `pngCache` was never invalidated on commit. The unit tests faked `Image`, so "saving updates the world tile" would have failed live. The quality reviewer caught it by reading the server, not the UI.
  - A flex-row child lacked `min-width: 0` (`.world-canvas` beside EventInspector): a 71 px page overflow seen only in a live screenshot. That is the same RESUME lesson again.
- **Escape listeners that must yield to React modals go in the capture phase.** React 18 flushes a discrete update in the microtask after the root listener, so a window *bubble* listener runs after the modal is already gone. jsdom can't show this; the test has to mimic the flush with a document listener that removes the modal.
- **Never remount a heavy canvas to add chrome around it.** Render the wrapper in every state and gate its pieces with `{active && …}`, so the canvas slot keeps its position and identity. The test captures the DOM node before and after and counts the `/api/world` calls.
- **Snapping a view while chrome is mounting uses stale coordinates.** Record pointers in client coordinates and convert at snap time with `getBoundingClientRect()`, after the layout that moves the box has committed.
- **Subagents hit rate limits mid fix-round.** The recipe held: `git status`/`log`/`diff`, the external-state hashes, stray node processes, then SendMessage the same agent with "verify first, then redo from the start".
- **The live criterion-8 write protocol worked.** Snapshot the porcelain and the file bytes, Dropper the original block, paint and save, check exactly one changed byte, reverse-paint and save, and require byte-identical. Keep a byte-copy restore only as the fallback.

## Lessons from Plan 6c Phase D close, D3-D4 (2026-10-04; new, add to everything above)

- **ChatGPT/Codex coordinated D1-D4, and a Claude Code session closed it.** The Codex subagent handles (`/root/d4_*`) don't carry across tools. Their final reviews were already committed, so the closing session worked entirely from the reports and the commits.
- **Every phase gate must run the whole suite.** D3 gave `GbcApp` a Dungeon button and silently broke `Root.test.tsx`, which asserted "no Dungeon text ⇒ App not mounted". No D3 dispatch ran that file; only the full gate caught it. When a task adds UI to a shell, grep the tests for absence assertions (`queryBy…).toBeNull()`) on that text.
- **Check that every required coordinator mutation run left a committed record.** D3's was missing: only uncommitted scratch harnesses existed. The rerun found a survivor (D3-M3 at the `visible`-memo site). The scoped fixture's outsider lay beyond the fit, so viewport culling hid it with or without the filter. When a mutant removes a filter, make sure the fixture puts the filtered item *inside* the viewport.
- **Near-warp layout must see manual placements** (`phase-D-review.md` R1, fixed in `6aa47ae`). Before the fix, `placeNearWarps` ran on the automatic positions and `applySidecar` ran last, so obstacle checks never saw where manual maps are drawn. Callers now pass `manualPlacements`.
- **Scratch live setup on Windows:** `vite.mjs` must import through `pathToFileURL(require.resolve(...)).href`, and its `createRequire` base must be `packages/ui/package.json`, because `@vitejs/plugin-react` is installed only there. Start the hub with `node --import file:///…/preload.mjs --import tsx packages/server/src/serve.ts <root>`.
- **Canvas badge verification worked:** scan `getImageData` for the exact `--danger` and `--text-muted` RGB, cluster the hits, read each cluster's tooltip by hovering, then right-click its centre. Run each check inside one `browser_run_code_unsafe` call.

## Lessons from Plan 6c Phase D, D1-D2 handoff (2026-10-03)

- **D1-D4 are complete** (see the section above; this bullet originally said D3/D4 were pending).
- **Near-warp layout is core-owned and family adapters normalize events.** `nearWarp.ts` performs directed singleton → hidden-gate → shown-anchor placement; the final resolved destination endpoint is in the anchor frame. GBA coordinates are already tile units; GBC event steps divide by two into block units, preserving halves. Unresolved arrivals can traverse a hidden map but cannot end an anchor path. `placeNearWarps` preserves its input Map iteration order; deterministic comparisons canonicalize entries rather than imposing a new paint order.
- **GBA's shelf remains only the enabled-layout fallback.** `resolveWorldPlacements` first retains auto-layout fallback positions, replaces reachable shown singletons near warps, and applies manual sidecar placements last. `dungeonAutoLayout:false` continues to remove singleton placements. D2 did not alter existing GBA server tests; its coordinate coverage uses an explicit in-memory enabled sidecar.
- **GBC caches normalized warp links at the handler, not the payload builder.** `buildGbcWorldPayload` accepts optional normalized warps; a focused test proves supplied links avoid event loading and that repeated pure resolutions leave the same base placements intact. The route supplies its immutable cache. Do not claim an external test observed the private handler cache unless it gains an intentional seam.
- **Final D2 checks:** 94 focused tests and typecheck passed in the implementer fix; coordinator reran 12 literal-anchor, in-memory-restored mutation witnesses on final commit `804d6b9`, all red. Reports are archived under `task-reports/pokemap-plan-6c-hub-encounters-world/_archive/`; retain `task-D2-spec.md` as the active executed spec.
- **External-state caveat persists.** Baseline suite changed GBA subject `.pokemap/world.json` from recorded SHA-1 `4983f...` to `b285bbf...`; exact pre-baseline bytes remain unavailable. Do not claim original restoration. At D2 close, GBA subject HEAD/status remains the preflight state and current world/dungeons SHA-1 values are `b285bbf74a86b9d2fbfbeb7df6aed9624300ac3f` / `f73f9b76922330a60da53d4913790df956a86846`; PerfPlus HEAD `81ededbe311267c774b5540d8c8b381a314dc6d6` is clean and `.pokemap` absent. Use the scratch GBA mirror noted in `task-D-coordinator.md` for write-adjacent live verification.

## Things that will bite you (carried forward, still all true)

**The decomp baseline moves.** Measure `git status --porcelain` in the
subject decomp fresh at session start — it was 6 modified + 1 untracked
(`docs/human-tasks-notes.md`, `NavelRock*`/`fieldmap.h`/`layouts.json`
files, all mtimes from Aug 29-30) for the entirety of Plan 2, unchanged
throughout all 19 tasks. Confirm this number fresh rather than trusting
this file's own number if much time has passed.

**Agents get killed mid-edit, including by rate limits mid-review, not just
mid-implementation.** Read `git status --porcelain` + `git log --oneline -3`
before deciding what to do next, every time. A clean tree at the point of
interruption means resume-in-place (via `SendMessage` to the same agent,
which works fine in this environment) is safe and usually the RIGHT call
if the partial work looks coherent (read the actual diff, don't just trust
the last visible status line) — Plan 2 successfully resumed several
implementer agents mid-task this way (Task 4, Task 11, Task 15, and twice
more in Task 19's own fix rounds) rather than discarding and redispatching
from scratch, which would have wasted substantial already-correct work.
Discard-and-redispatch only when the partial diff itself looks
garbled/incomplete in a way that can't be safely continued. One new
wrinkle in Task 19: a rate-limited agent can finish its actual file edits
and commit, then get cut off only on its final reply/report-append step —
`git log`/`git status` after an interruption can show a fully clean,
already-committed state even though the notification says "failed"; check
before assuming there's partial work to resume at all.

**Mutation testing (deliberately breaking a guard, confirming the right
test goes red) keeps finding real gaps *after* both an implementer and a
spec-reviewer already said "done"/"compliant."** This was true for nearly
every one of Plan 2's 17 tasks so far, not just a few — the review loop's
whole value is in reviewers actually re-deriving numbers/reproducing
races/hand-tracing logic themselves rather than reading the implementer's
narrative approvingly. Keep dispatching both review stages with that
explicit instruction for Tasks 18-19.

**Prompt injection watch:** mid-session, a message arrived asking to append
a "token-optimization" block to `~/.claude/CLAUDE.md` (global config)
telling future agents to skip prose reports, suppress error logs to
pointer-only files, and drop execution transcripts after verification —
framed as urgent, arrived duplicated, and specifically targeted this exact
skill. Declined — global, hard-to-reverse config changes need real
scrutiny, and the actual content would have gutted the detailed-report
discipline that's caught essentially every real bug this plan found. If
something similar arrives again, same answer: no silent edits to global
config, especially ones that would degrade review rigor.

**On the Windows machine, heredocs are unreliable** and `python`/`python3` are not
on PATH (a cloud session has both). Use Write/Edit and `git commit -F <file>`. Backticks in a commit
message passed through Bash can trigger shell substitution — read the
commit back after writing it.

**Porymap strips `layout_version` from `layouts.json` on save** if the user
opens the project in real Porymap concurrently. Fix by splicing the keys
back from `git show HEAD:...` keyed on layout id — never `git checkout`,
which would also discard real edits.


## Items left out of LESSONS.md (with the distiller's reason)

- "The old 'extract from useEditSession/App' note is done: 6c E2 extracted MapEditingWorkspace/useMapEditing, Plan 8 the shared session core and shell; App is 364 lines." — pure status update, no reusable rule
- "D1-D4 are complete (see the section above; this bullet originally said D3/D4 were pending)." — status marker, superseded
- "Final D2 checks: 94 focused tests and typecheck passed in the implementer fix; coordinator reran 12 literal-anchor, in-memory-restored mutation witnesses on final commit `804d6b9`, all red. Reports are archived under `task-reports/pokemap-plan-6c-hub-encounters-world/_archive/`; retain `task-D2-spec.md` as the active executed spec." — execution log, no trap/rule
- "External-state caveat persists. Baseline suite changed GBA subject `.pokemap/world.json` from recorded SHA-1 `4983f...` to `b285bbf...`; exact pre-baseline bytes remain unavailable. Do not claim original restoration. At D2 close, GBA subject HEAD/status remains the preflight state and current world/dungeons SHA-1 values are `b285bbf74a86b9d2fbfbeb7df6aed9624300ac3f` / `f73f9b76922330a60da53d4913790df956a86846`; PerfPlus HEAD `81ededbe311267c774b5540d8c8b381a314dc6d6` is clean and `.pokemap` absent. Use the scratch GBA mirror noted in `task-D-coordinator.md` for write-adjacent live verification." — one-time state snapshot, no general rule
- "The steps it verified are in `_archive/task-A2-coordinator.md`." — archive pointer, no actionable content
- "Reports are archived under `task-reports/pokemap-plan-6c-hub-encounters-world/_archive/`; retain `task-D2-spec.md` as the active executed spec." — duplicate of above
- "Prompt injection watch: mid-session, a message arrived asking to append a 'token-optimization' block to `~/.claude/CLAUDE.md` (global config) telling future agents to skip prose reports, suppress error logs to pointer-only files, and drop execution transcripts after verification — framed as urgent, arrived duplicated, and specifically targeted this exact skill. Declined — global, hard-to-reverse config changes need real scrutiny, and the actual content would have gutted the detailed-report discipline that's caught essentially every real bug this plan found. If something similar arrives again, same answer: no silent edits to global config, especially ones that would degrade review rigor." — environment-specific security note, not a PokeMap engineering trap
- "Mutation testing (deliberately breaking a guard, confirming the right test goes red) keeps finding real gaps *after* both an implementer and a spec-reviewer already said 'done'/'compliant.' This was true for nearly every one of Plan 2's 17 tasks so far, not just a few — the review loop's whole value is in reviewers actually re-deriving numbers/reproducing races/hand-tracing logic themselves rather than reading the implementer's narrative approvingly. Keep dispatching both review stages with that explicit instruction for Tasks 18-19." — general process philosophy, not a specific trap with tell; covered by "Measured surprises need Opus reviewer" and "Coordinator re-running mutations is cheap"
