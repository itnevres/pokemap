# Task 4 executed spec (coordinator, 2026-10-12)

BASE: 5302ac1. Plan text: `task-4-brief.md`. Where this spec and the brief differ, this spec wins.

## Step 1 result (coordinator diff of each pair; the stop rule applied)

| Pair | Verdict | Differences beyond endpoint / response type / family-only fields |
|---|---|---|
| `useCoverage` / `useGbcCoverage` | **merge** | Only GBC validates the body shape (a guard). Error text is identical (`GET /api/coverage -> <status>`). Fixed URL. |
| `useMapGroups` / `useGbcGroups` | **merge** | Same as coverage (`GET /api/groups -> <status>`). |
| `useDungeons` / `useGbcDungeons` | **leave alone** | (a) GBC's DELETE parses and guards the body (`{ok:true}`); GBA never reads it, so a non-JSON DELETE body succeeds in GBA and fails in GBC. (b) PATCH/DELETE error labels: GBA prints the raw id, GBC prints the encoded URL. Both are behaviour, not type. |
| `useMapLayout` / `useGbcMap` | **leave alone** | (a) GBA keeps the previous map's `data` while the next map loads; `useGuardedFetch` (GBC) resets it to null. (b) GBA has `loading`; GBC has `reload` with a `forBase` stale guard. Also, the parked #5/#6 branch edits `useMapLayout.ts`. |

## Rulings

- **R1 — the generic already exists.** `packages/ui/src/hooks/useGuardedFetch.ts` (`useGuardedFetch<T>(url, guard, label?)`) is family-agnostic and is what both GBC hooks already wrap. Do NOT create `shared/useFetched.ts`. The GBA hooks become thin wrappers over `useGuardedFetch`.
- **R2 — GBA keeps "no shape validation".** Add to `useGuardedFetch.ts` one exported module-level guard that accepts any body:
  `export function unguarded<T>(_x: unknown): _x is T { return true; }`
  (the exact name `unguarded`; a one-line doc comment saying it is for callers that trust the server's shape, i.e. the GBA hooks). It must be a module-level function (stable identity), because `guard` is an effect dependency; an inline arrow would refetch every render. GBA must NOT start using the GBC guards (`isMapGroupsData`, `isGbcCoveragePayload`): that would turn a malformed body from data into an error, a behaviour change.
- **R3 — wrappers.**
  - `hooks/useMapGroups.ts`: body becomes `return useGuardedFetch<MapGroupsData>("/api/groups", unguarded);`. Keep the exported `UseMapGroupsResult` interface name and fields as they are. Update the doc comment to say it wraps `useGuardedFetch` without a guard.
  - `hooks/useCoverage.ts`: body becomes `return useGuardedFetch<CoverageResponse>("/api/coverage", unguarded);`. Keep `CoverageResponse` and `UseCoverageResult` and the long `CoverageResponse` doc comment. Update the hook's doc comment the same way.
  - GBC files `gbc/hooks/useGbcGroups.ts`, `gbc/hooks/useGbcCoverage.ts`: unchanged.
  - Drop now-unused `react` imports.
- **R4 — no behaviour change.** Accepted equivalences: `useGuardedFetch` calls `fetch(url)` with one argument (existing `useMapGroups.test.ts` asserts `toHaveBeenCalledWith("/api/groups")`); it resets data/error to null at effect start (both already null on mount); error text format is the same `GET <url> -> <status>`; a JSON parse failure surfaces the same thrown message.
- **R5 — the dungeons and map-layout pairs stay byte-unchanged** (stop rule). Their differences are listed above for the coordinator report; Task 5/7 may revisit.

## Tests (write first; RED before GREEN)

All in NEW files. Every existing test file stays byte-unchanged.

1. `packages/ui/test/useGuardedFetch.stale.test.ts` (shared generic):
   - (a) loading: right after mount with a pending fetch, `{ data: null, error: null }`.
   - (b) error: a rejected fetch (`new Error("boom")`) gives `error === "boom"`, `data === null`.
   - (c) stale response on a key change: url `/api/a` (held) → rerender `/api/b`; resolve B with `{name:"B"}`, wait for it; THEN resolve A with `{name:"A"}` and flush (`await act(async () => {})` twice); data must still equal `{name:"B"}`.
   - (d) `unguarded` accepts anything: `useGuardedFetch("/api/x", unguarded)` with body `{ weird: 1 }` returns that body and `error === null`.
2. `packages/ui/test/useFetchedFamilyGba.test.tsx` (GBA family witness):
   - (a) `useMapGroups` under `<React.StrictMode>` (renderHook `wrapper`): the StrictMode mount fetches twice. Hold both fetches; resolve the SECOND call's body `{ groupOrder: ["B"], groups: { B: [] } }` and wait for it, then resolve the FIRST call's `{ groupOrder: ["A"], groups: { A: [] } }` and flush; data must stay the B body. Assert `fetchMock` was called exactly twice. (If React does not double-invoke effects under renderHook's StrictMode in this setup, stop and report — do not substitute another mechanism silently.)
   - (b) same for `useCoverage` with two distinguishable bodies.
   - (c) `useMapGroups` with a malformed body `{ nope: true }`: data equals it, error null (pins R2 — no GBA shape guard).
   - (d) `useCoverage` with `{ ok:false, status: 404 }`: error equals exactly `GET /api/coverage -> 404`.
3. `packages/ui/test/gbc/useFetchedFamilyGbc.test.tsx` (GBC family witness):
   - (a)/(b) the StrictMode stale witness for `useGbcGroups` and `useGbcCoverage`, using bodies that pass their guards (copy a valid fixture shape from `test/gbc/useGbcGroups.test.ts` / `useGbcCoverage.test.ts`).

RED expectation: on BASE, 1(d) and the GBA witnesses 2(c)/2(d) may already pass (existing behaviour) except where they import `unguarded` (compile/import failure = RED for 1(d)). 1(c), 2(a), 2(b), 3 should already PASS on BASE (the guard exists today) — that is fine: they are teeth for the coordinator's mutation (remove `if (!cancelled)` in `useGuardedFetch`), which must turn 1(c), 2(a/b) and 3(a/b) red. Record honestly which tests were red before the change and why.

## Oracle
`git diff 5302ac1 -- ':(glob)packages/*/test/**' | grep -E '^-[^-]'` prints nothing.

## Files touched (exactly)
- `packages/ui/src/hooks/useGuardedFetch.ts` (add `unguarded`)
- `packages/ui/src/hooks/useMapGroups.ts`, `packages/ui/src/hooks/useCoverage.ts`
- the three new test files above
- the report `task-4-report.md` and logs in this folder
