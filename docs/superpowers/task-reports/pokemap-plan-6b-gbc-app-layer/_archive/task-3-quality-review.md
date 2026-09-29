# Plan 6b Task 3: code-quality review

Reviewed `git diff 4720cd5..f3900a4` (branch `plan-6b-gbc-app-layer`) against
`task-3-spec.md`, `task-3-implementer.md`, `packages/ui/DESIGN.md` and
`docs/superpowers/RESUME.md`'s UI lessons. Read-only review; no files
changed except this one.

## Verdict: approve-with-fixes

The implementation is solid: `App.tsx` and every existing test file are
untouched, the new hooks correctly add the real type-guard validation
RESUME's `isDiffPlan` lesson calls for (which the pre-existing
`useMapGroups.ts`/`useMapLayout.ts` still don't have — expected, since the
spec scopes that lesson to new code only), CSS tokens are all real, BEM
naming is coherent, markup/class reuse against `App.tsx` is close to
byte-for-byte where the spec asks for it, and the tests are well-targeted
(no jest-dom, proper `vi.stubGlobal`/`unstubAllGlobals`, discriminating
fixtures like `OLIVINE`/`MAHOGANY`, honestly-reported mutation-testing
gap-and-fix). Nothing here blocks merge on correctness grounds. The fixes
below are about the two things Tasks 4-6 will otherwise multiply: hook
location and duplicated fetch/guard plumbing.

## Important

1. **File-placement split is incoherent for Tasks 4-6.** `useProjectInfo.ts`
   lives at `packages/ui/src/hooks/useProjectInfo.ts` (top-level, alongside
   `useMapGroups.ts`/`useMapLayout.ts`), while `useGbcGroups.ts` lives flat at
   `packages/ui/src/gbc/useGbcGroups.ts`. The plan's own file-structure table
   (`docs/superpowers/plans/2026-09-25-pokemap-plan-6b-gbc-app-layer.md:167`)
   puts *all four* — `useProjectInfo`, `useGbcMap`, `useGbcWorld`,
   `useGbcCoverage` — under a third location, `packages/ui/src/gbc/hooks/`.
   If Task 4 follows the plan table literally for its two new hooks, the repo
   ends up with three different conventions for the same kind of file
   (top-level `hooks/`, flat `gbc/`, nested `gbc/hooks/`) with no principled
   line between them.
   **Fix:** pick one convention now and say so in the Task 4 spec. Recommended
   split: `useProjectInfo.ts` stays in `src/hooks/` (it's family-agnostic —
   `Root` calls it before the family is even known, and it mirrors
   `useMapGroups.ts`'s own location exactly, which is what Task 3's spec
   §2 asked for). Every GBC-*specific* hook (`useGbcGroups`, and Task 4-6's
   `useGbcMap`/`useGbcWorld`/`useGbcCoverage`) goes under
   `src/gbc/hooks/`, matching the plan table. That means Task 4 should move
   `packages/ui/src/gbc/useGbcGroups.ts` → `packages/ui/src/gbc/hooks/useGbcGroups.ts`
   (and its test alongside) as a first, mechanical step, before adding the
   next two hooks in the same directory.
   Files: `packages/ui/src/gbc/useGbcGroups.ts` (whole file, wrong directory);
   `docs/superpowers/plans/2026-09-25-pokemap-plan-6b-gbc-app-layer.md:167`.

2. **`describeReceived` is duplicated verbatim between the two new hooks**,
   `packages/ui/src/hooks/useProjectInfo.ts:13-21` and
   `packages/ui/src/gbc/useGbcGroups.ts:12-20` — identical body, identical
   200-char truncation logic, near-identical doc comment. Tasks 4-6 add three
   more hooks (`useGbcMap`, `useGbcWorld`, `useGbcCoverage`) that will need
   the exact same fetch → `!r.ok` → guard → `describeReceived` → `cancelled`
   shape; without consolidation this becomes five copies of the same ~10-line
   block, and a future fix to the truncation rule (or the "name what went
   wrong" wording) has to be applied five times by hand.
   **Fix:** extract `describeReceived` into `packages/ui/src/gbc/guards.ts`
   (already the doc-designated home — its own comment says "Later tasks
   (Task 4+) add `isGbcMapPayload` and friends to this same file") as a named
   export, and have both hooks import it instead of redefining it. Worth
   going one step further before Task 4: a small shared
   `fetchJsonGuarded<T>(url, guard, describeFailure?)` helper (living next to
   `describeReceived`, or in a new `packages/ui/src/hooks/fetchJson.ts`) that
   both current hooks and all three upcoming ones call, so the
   `cancelled`/`.catch`/error-message shape is written once. This is a
   genuine "worth it now" case, not premature abstraction — the fourth and
   fifth copy are already scheduled in this same plan.

## Minor

3. **Guard boilerplate is repeated without a shared primitive**, in
   `packages/ui/src/gbc/guards.ts:16-17` (`isProjectInfo`) and `:34-35`
   (`isMapGroupsData`): `if (typeof x !== "object" || x === null) return
   false; const o = x as Record<string, unknown>;` appears twice already.
   The file already extracted `isStringArray` as a reusable primitive
   (`guards.ts:21-23`) — the same file adding `isGbcMapPayload` and more in
   Tasks 4-6 (per the spec's own "later tasks add ... to this file") is a
   good moment to add a matching `isRecord(x): x is Record<string, unknown>`
   helper and have every guard start with `if (!isRecord(x)) return false;`.
   Small win, but cheaper to do now (two call sites) than after three more
   guards land.

4. **`Root.test.tsx`'s shared fetch mock stubs `/api/dungeons`
   (`packages/ui/test/gbc/Root.test.tsx:33-35`) even though no test in that
   file ever exercises a path that calls it** — the default `App` mount is
   `mode === "map"`, and both `useDungeons` and `useWorldVisibility` are
   gated (`mode === "dungeon"` / `mode === "world"` respectively; see
   `packages/ui/src/App.tsx:82` and `useWorldVisibility.ts`'s own `enabled`
   gate), so `/api/dungeons` is never actually requested by any of this
   file's scenarios. Harmless (the mock branch is just dead in this suite),
   but it's worth trimming or replacing with a comment noting it's there
   defensively, so a future reader doesn't infer dungeon mode is reachable
   from `Root`'s own tests.

## Nit

5. **`GbcApp.tsx:30`'s `{ root: _root }` destructure** (documented as
   "intentionally unused for now") is a reasonable convention, but neither
   `tsconfig.base.json` nor `packages/ui/tsconfig.json` sets
   `noUnusedParameters`/`noUnusedLocals` (confirmed by grep — both absent),
   so a plain `root` param would compile identically today and read more
   naturally once Task 4 starts actually using it, avoiding a rename diff.
   No action needed; flagging only because the implementer's own report
   calls out the underscore choice as deliberate.

## Spot-checks that came back clean (no finding)

- **React idioms vs. `useMapGroups.ts`**: both new hooks match its exact
  shape (`cancelled` guard, `data`/`error` state, same `.then`/`.catch`
  chain) — the only intentional divergence is the added guard call, which is
  the point of the task.
- **`GbcApp` vs. `App.tsx` markup**: the View/Time-of-day button groups,
  `role="group"`/`aria-pressed` pattern, `app__status` conditional, and
  sidebar loading/error text (`Could not load map groups: <error>` /
  `Loading map groups…`) all match `App.tsx:407-432`/`:447`/`:474` in
  substance; `MapTree`'s optional `worldMode`/`visibility` props correctly
  default away since GbcApp doesn't pass them in Task 3.
- **CSS**: both new tokens (`--font-data`, `--text-secondary`, `--space-3`)
  are real `:root` tokens per `DESIGN.md`; no hard-coded colours; BEM
  (`gbc-app__family`, `gbc-app__time`) is coherent with the spec's explicit
  instruction to introduce a new `gbc-app__*` prefix rather than extend
  `app__*`.
- **Accessibility**: `role="alert"` on the error path, `role="group"` +
  `aria-label` + `aria-pressed` on both button groups, native `<button
  type="button">` throughout (keyboard-reachable, no custom focus handling
  needed) — nothing in the diff overrides focus outlines.
- **Test quality**: no `jest-dom` matchers anywhere in the four new test
  files; `vi.stubGlobal`/`vi.unstubAllGlobals()` used correctly in every
  file; fixtures are real-shaped and discriminating (`OLIVINE`/`MAHOGANY`,
  not `foo`/`bar`); the mutation-testing note in the implementer report
  (mutation #3's initial false-pass, caught and fixed) is corroborated by
  the actual test file — `guards.test.ts:67-69` is exactly the isolating
  case described.
- **Comment accuracy**: spot-checked the `selectVersion`/`jumpToken` claim
  in `GbcApp.tsx:34-37` against `App.tsx:68-71`/`:488` — accurate. The
  `useProjectInfo`/`useGbcGroups` doc comments' claims about mirroring
  `useMapGroups.ts`'s shape and about `guards.ts` being the future home for
  more guards both check out against the real files.
- **SHAs/counts**: `297d76d` and `f3900a4` match `git log`; the report's
  file inventory matches `git diff --stat`.

## One-line summary for Task 4-6 authors

Before adding `useGbcMap`/`useGbcWorld`/`useGbcCoverage`, settle the hook
directory (recommend `src/gbc/hooks/`) and pull `describeReceived` (and
ideally the whole fetch+guard+cancelled shape) into one shared place —
otherwise this task's two small, harmless duplications become five.
