# Plan 6b Task 3: spec review

Reviewed independently against `task-3-spec.md`, the plan's Q2/Q3 and Task 3
row, and `packages/ui/DESIGN.md`. Implementation: commits `297d76d` and
`f3900a4`, diffed against `4720cd5`. Working tree confirmed clean
(`git status --short` empty) before and after this review; every mutation
made during review was restored from `git show HEAD:<path>` (or `cp` of a
pre-saved golden copy) and confirmed back to an empty `git diff` immediately
after.

## Verdict: **compliant**

The implementation meets the spec. `App.tsx` and every pre-existing
component/test are byte-identical to `HEAD` before this task; `main.tsx` and
`styles.css` changes are minimal, additive, and use only real CSS tokens; no
`.btn` class exists anywhere; the full gate matches the baseline exactly
(1414 passed, the same 6 known failures); typecheck is clean; every guard
clause and every state transition specified for `Root`/`GbcApp` is
implemented correctly and covered by a passing, meaningful test; the live
GBC and GBA screenshots match their narrative exactly, and my own additional
live checks (keyboard focus, Enter-key activation, and the `/api/project`
failure path with the server killed) all behaved correctly. One test-quality
gap (Finding 1, Important) means the report's "GBA fetches never start"
claim is not actually proven the way the report says it is, but the
underlying behaviour it describes is correct on inspection of `Root.tsx`
itself, so I am not downgrading to non-compliant. I recommend the fix in
Finding 1 be applied at least loosely before or alongside Task 4, since Task
4/5 will keep building on this same "mount-once" contract.

## Findings

### Important

**1. The "GBA fetches never start for a GBC project" test does not test the mount-once guarantee it claims to.**

`packages/ui/test/gbc/Root.test.tsx`'s last test ("a gbc project's fetch is
never called with a GBA-only path") asserts that `calls` never contains
`/api/world`, `/api/dungeons`, `/api/warps/*`, `/api/species*` or
`/api/coverage`. But `App.tsx`'s own GBA-only fetches are all **gated on
`mode`** (`useWorldVisibility(mode === "world")`, `useDungeons(mode ===
"dungeon")`), and `App`'s default mode is `"map"`. So if `Root` had a bug
that mounted `App` *alongside* `GbcApp` for a `gbc` project (e.g. a stray
extra render branch), none of those GBA-only routes would fire at mount
time regardless — the test would still pass. I verified this directly:
mounting `<App/>` (hidden, `display: none`) next to `<GbcApp/>` in the `gbc`
branch of `Root.tsx` and re-running `Root.test.tsx` leaves all 6 tests
green.

The real `Root.tsx` code is correct — it does not mount `App` for a `gbc`
project (I read it: `if (data.family === "gbc") return <GbcApp .../>; return
<App/>;`), so there is no live bug. But the test's own claim ("Prove it")
is not backed by what it actually checks.

**Fix**, verified to catch the mutation: add a DOM-based assertion using the
same "Dungeon" marker `Root.test.tsx` already uses for the `gba` case:
```ts
expect(screen.queryByText("Dungeon")).toBeNull();
```
added to the existing "gbc project's fetch is never called…" test (or a new
one). I confirmed this single line turns the `App`-mounted-alongside
mutation red, because `App`'s header (with its unconditional `Dungeon`
button) renders as soon as `App` mounts, independent of whether its own
`/api/groups` fetch has resolved.

### Minor

**2. No test exercises the `cancelled` guard in `useProjectInfo`/`useGbcGroups`.**
Both hooks correctly implement the `cancelled` flag (mirroring
`useMapGroups.ts` exactly), so there is no behavioural gap — but neither
`useProjectInfo.test.ts` nor `useGbcGroups.test.ts` has a test that unmounts
before the fetch resolves and asserts no post-unmount `act()` warning/state
update. This matches the pre-existing convention: `useMapGroups.test.ts`
(the file these two are explicitly modeled on) has the same gap, so this is
not a regression introduced by this task, just an existing convention this
task correctly followed. No fix required to be compliant with this spec;
worth picking up if a future task adds an "every clause tested" mutation
pass to the older hook too.

**3. The unused `root` prop on `GbcApp` is an accepted, spec-consistent deviation, not a defect.**
The spec's own routing table (§3) shows `gbc → <GbcApp root={data.root}
/>`, and Task 3's own deliverable list never has the shell render anything
derived from `root` (Tasks 4/5 need it for `GbcMapCanvas`/`GbcWorldCanvas`).
Threading it through now via `{ root: _root }` keeps `Root`'s call site
already correct for Task 4, and there's no `noUnusedParameters` compiler
flag to trip. I checked `tsconfig.base.json` and `packages/ui/tsconfig.json`
directly — neither sets it. No change needed; dropping the prop now would
just require re-adding it (and re-touching `Root.tsx`) in Task 4.

## Spec-compliance checklist (all confirmed)

- `git diff 4720cd5..HEAD --stat`: only new files under `packages/ui/src/gbc/`,
  `packages/ui/src/hooks/useProjectInfo.ts`, `packages/ui/src/Root.tsx`,
  `packages/ui/test/gbc/`, screenshots and the implementer report, plus
  `main.tsx` (2 lines) and `styles.css` (16 lines, additive, after
  `.app__mode`). `App.tsx` and every other existing component/test: zero
  diff, confirmed with `git diff 4720cd5..HEAD -- packages/ui/src/App.tsx`
  (empty) and a `--stat` on the existing `*.test.tsx` files (empty).
- CSS tokens used in the new block (`--font-data`, `--text-secondary`,
  `--text-xs`, `--space-3`) all exist verbatim in `styles.css`'s `:root`.
  No known-wrong name (`--border-default`, `--bg-panel-elevated`,
  `--warning`, `--radius-sm`) appears anywhere in the new code. No `.btn`
  class anywhere (`grep` clean).
- `Root`: loading → `.app__canvas-placeholder` "Loading project…"; error →
  `role="alert"` "Could not open project: <error>"; `gba` → `<App/>`
  unchanged; `gbc` → `<GbcApp root=.../>`. All four states verified by
  reading the code and by the passing tests. Error messages name the real
  failure (status code, thrown message, or the truncated bad-shape value) —
  confirmed live too (killed the backend server, reloaded, got exactly
  `Could not open project: GET /api/project -> 502`).
- Guards: every accept/reject clause in `isProjectInfo`/`isMapGroupsData` is
  independently tested. I re-ran the implementer's 6 mutations plus 3 of my
  own (drop the `typeof x !== "object"` guard in `isProjectInfo`; swap
  Root's family branch; drop `useGbcGroups`'s shape-guard call) — all 9 are
  killed by the existing test suite. See the survivors table below for the
  one gap found (Finding 1), which is in `Root.test.tsx`, not in the guards.
- `GbcApp`: header groups have `role="group"`+`aria-pressed` on
  `map-canvas__btn` buttons (View: Map/World; Time of day: Morn/Day/Nite,
  default Day — confirmed both by the passing "starts as Day" test and by a
  mutation to `"nite"` that turns it red). Time and selection both reach the
  placeholder with the exact pinned string (`"OlivinePokecenter1F · nite"`
  live, `"OlivineCity · nite"` in tests). World toggle swaps to the
  `gbc-world-placeholder` with the exact string `World view (Task 5)`.
  `/api/groups` failure surfaces via `map-tree__empty`, mirroring
  `App.tsx:474`'s wording. No `Toolbar`/`SaveDialog`/`EventInspector`/
  `DungeonSidebar`/`SignComposer`/`CollisionPalette`/`MetatilePalette` import
  anywhere in `GbcApp.tsx`/`Root.tsx` (`grep` clean), and no
  `beforeunload` listener.
- Accessibility baseline: the global `:focus-visible { outline: 2px solid
  var(--focus-ring); }` rule in `styles.css` (not scoped to any specific
  class) applies to the new `map-canvas__btn` buttons automatically —
  confirmed live via Playwright: focusing the Nite button gives
  `outline: 2px solid rgb(96, 165, 250)` (`--focus-ring`'s dark value), and
  pressing Enter while focused toggles `aria-pressed` to `"true"`.
  `aria-current` on the selected tree row comes for free from `MapTree`,
  reused unmodified by `GbcApp`.
- Gate: `npm test` → `1414 passed`, `6 failed`, and
  `grep -E "^ FAIL " | sort -u` is byte-identical to
  `baseline-fails.txt` (diff empty). `npm run typecheck` → clean, no output.
- Live verify: both pairs of screenshots (`task-3-gbc-shell.png`,
  `task-3-gbc-nite-selected.png`, `task-3-gba-shell.png`,
  `task-3-gba-map-open.png`) viewed directly with the Read tool and match
  the implementer's narrative exactly — real Crystal group names in
  `newgroup` order, the Nite-pressed + selected-row + exact placeholder
  string, and the untouched GBA shell/editing chrome. My own live pass
  (GBC server + Vite) additionally exercised keyboard focus/activation and
  the `/api/project`-down error path, both correct. Ports 5173/5174
  confirmed free both before I started and after I killed every process I
  started.

## Surviving mutations

None of the mutations I tried survived except the one documented as
Finding 1, which is a test-quality gap rather than a surviving code
mutation (the code itself has no bug at that point — see the finding for
why). Table below records every mutation attempted in this review,
including the ones that were already killed and the one gap.

| # | File | Mutation | Result | How to re-run |
|---|---|---|---|---|
| 1 | `Root.tsx` | Mount `<App/>` (hidden) alongside `<GbcApp/>` in the `gbc` branch | **Test suite still passes** (gap — Finding 1) | Edit `Root.tsx`'s `gbc` branch to `return (<><div style={{display:"none"}}><App/></div><GbcApp root={data.root}/></>)`, run `npx vitest run packages/ui/test/gbc/Root.test.tsx --reporter=verbose`. Add `expect(screen.queryByText("Dungeon")).toBeNull()` to the last test to confirm the fix catches it. Restore with `git checkout -- packages/ui/src/Root.tsx` (confirmed empty diff after). |
| 2 | `Root.tsx` | Swap the family branch (`if (data.family === "gba") return <GbcApp/>`) | Killed (3 of 6 `Root.test.tsx` tests fail) | Same file/command as above, swap the literal in the `if`. |
| 3 | `gbc/GbcApp.tsx` | Default `time` to `"nite"` instead of `"day"` | Killed (2 of 10 `GbcApp.test.tsx` tests fail) | Edit the `useState<TimeOfDay>("day")` line, `npx vitest run packages/ui/test/gbc/GbcApp.test.tsx --reporter=verbose`. |
| 4 | `gbc/GbcApp.tsx` | Swap the View group's `onClick` handlers (Map→"world", World→"map") | Killed (2 of 10 tests fail) | Swap the two `onClick={() => setMode(...)}` bodies in the View group, same test command. |
| 5 | `gbc/useGbcGroups.ts` | Drop the `isMapGroupsData` guard call (cast instead) | Killed (1 of 5 `useGbcGroups.test.ts` tests fails) | Replace the `if (!isMapGroupsData(d)) throw ...; setData(d);` block with `setData(d as MapGroupsData);`, run `npx vitest run packages/ui/test/gbc/useGbcGroups.test.ts --reporter=verbose`. |
| 6 | `gbc/guards.ts` | Drop `isProjectInfo`'s `typeof x !== "object" \|\| x === null` guard | Killed (1 of 15 `guards.test.ts` tests fails, `TypeError` on null) | Delete that line from `isProjectInfo`, run `npx vitest run packages/ui/test/gbc/guards.test.ts --reporter=verbose`. |
| 7-12 | `gbc/guards.ts` | The implementer's own 6-mutation table (widen `family` check; drop `root` check; weaken `groupOrder`/`groups[key]` array checks; drop the non-array-`groups` exclusion; drop the groupOrder-keys-of-groups loop) | All re-confirmed killed | See `task-3-implementer.md`'s mutation table; re-run each against `packages/ui/test/gbc/guards.test.ts --reporter=verbose`. |

All mutated files were restored to `HEAD` (`git checkout -- <path>` or
`cp` from a pre-saved golden copy) and `git status --short` / `git diff
--stat` confirmed empty after every restore and again at the end of the
review.
