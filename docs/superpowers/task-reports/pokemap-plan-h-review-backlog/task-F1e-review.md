# F1e review (combined spec + quality), commit 5890b74 vs 0eb1340

Verdict: APPROVED (no Critical, no Important findings; four Minor notes). Did not run vitest/typecheck/build, as instructed.

## Spec checklist

| Criterion | Status | Evidence |
|---|---|---|
| `BrokenPathError` class carrying `defect: BrokenPath` | met | useMapLayout.ts:9-14 (also sets `name`, harmless extra) |
| `fetchLayout` parses 409 body, throws typed error only for code "broken-path" + object defect with string file/message/fix; else old `GET /api/map/<t> -> <status>` | met | useMapLayout.ts:90-106 |
| `brokenPath` in result; set in `.catch`, cleared at load start, on success, on null name | met | :68, :117 (null name), :126 (start), :134 (success), :142 (catch), :170 (returned) |
| `reload()` unchanged | met | :153-168, not in diff. Note: a reload rejecting with `BrokenPathError` now carries the defect message instead of `GET ... -> 409` (see Minor 3) |
| `brokenPathToDefect` with/without line | met | useMapLayout.ts:20-22, tests at useMapLayout.test.ts (two cases) |
| `FamilyRuntime.map.defects?: DataDefect[]` with doc comment | met | shell/adapter.ts:76-82 |
| GBA adapter passes `defects` | met | gba/adapter.tsx:147 |
| FamilyApp: both places show DefectsBanner + "cannot be opened until this is fixed" via one shared component; otherwise unchanged | met | FamilyApp.tsx:19-27 (component), :292-297 (canvas), :300-310 (popup) |
| GBC adapter untouched, other statuses keep old text | met | `git diff --stat` lists no gbc files; 500 test covers the old text |
| Tests: 4 hook cases, 2 app cases, 2 helper cases | met | useMapLayout.test.ts new cases; BrokenPathBanner.test.tsx |
| Only listed files changed | met | 6 files, all on the allowed list |

## Races and state

- Epoch/cancelled guards are preserved: `setBrokenPath` is called only inside the existing `!cancelled && epoch.current === mine` blocks (useMapLayout.ts:131-137, 140-145). A superseded broken reply cannot set `brokenPath`.
- State consistency: `error` and `brokenPath` are always set together in `.catch` (one batch), and both cleared together at load start. No state with `brokenPath` set and `error` null, so `FamilyApp`'s `error` check gates the new branch correctly.
- A -> B where B is broken: `data` stays A's data (pre-existing "keeps previous map's data until fetch lands"), but FamilyApp checks `error` before `ready`, so the defect shows. Fine.

## fetchLayout catch logic (useMapLayout.ts:95-105)

Correct. A `BrokenPathError` thrown inside `try` is caught by the local `catch` and rethrown by the `instanceof` check; a `r.json()` rejection (non-JSON) or any other value falls through to the old `Error`. The "other code" / missing-field cases skip the throw and fall through. Behaviour is right, but the throw-inside-try-then-rethrow shape is a little roundabout (see Minor 2).

## Warp popup question

`useGbaRuntime` calls `useMapLayout(selected)` (gba/adapter.tsx:25), so `runtime.map` describes the selected map. It is not the popup destination in general, but `useWarpPopup` calls `select(request.dest)` before `setPopup` (useWarpPopup.ts:~44-47), so while the popup is open `selected === popup.destination` (close requires `selected === popup.destination`, :~57). The pre-existing branch relied on that, so the new branch is consistent with it. During the one-render transition after `select(dest)`, `runtime.map.error`/`defects` can still be the previous map's. The old code already showed the stale `Could not load <dest>: <old error>` in that window, and the new code shows the old map's defect under the destination's name. Equivalent staleness, not worse. Not a regression, no action.

## Findings

Critical: none. Important: none.

Minor 1. No test for the warp-popup branch (FamilyApp.tsx:300-306). The `BrokenPathPlaceholder name={warp.popup.destination}` call could be changed (wrong name, dropped branch) and no test would fail. The brief did not require it. A case in BrokenPathBanner.test.tsx opening a popup onto the 409 map would cover it.

Minor 2. Style/type safety in fetchLayout (useMapLayout.ts:96-100). `body` is `any`; the guards cover file/message/fix strings but `line` (number) is not validated, so a malformed `line: "x"` would render as `file:x` via `brokenPathToDefect`. Harmless in practice (server-controlled). The try/throw/catch/rethrow could be flatter: parse in `try`, return `null` on failure, validate and throw after the block. Optional.

Minor 3. `reload()` is unchanged, but its rejection from a now-broken map is a `BrokenPathError` with the defect message, so the GBA save path shows "Saved, but could not reload the map: <defect message>" (gba/adapter.tsx:199) instead of "... GET /api/map/X -> 409". Arguably better text and `brokenPath` state is not updated (as specified). Noting it only because the brief says "keep old text" for other statuses; this one is a 409 broken-path, so it is within spec.

Minor 4. Test coverage gaps and nits, none of which hide a logic break the brief cares about:
- `setBrokenPath(null)` on success (:134) is redundant with the clear at load start (:126), since only `.catch` sets it, so no test can distinguish the two. It is spec-required; fine.
- No test for `name -> null` clearing `brokenPath` (:117) or for a cancelled broken reply being dropped.
- No test for a body that has `code: "broken-path"` but a missing/non-string `fix`/`file`/`message` (the validation guard at :97-98 is untested; removing it would not fail a test).
- BrokenPathBanner.test.tsx has no trailing newline.

## Test quality

- Hook tests assert `brokenPath` toEqual defect, `error` equals the defect message, `data` null; the two fall-through cases assert the exact old text and `brokenPath` null; the recovery case asserts both cleared after a healthy map. Each fails if the matching logic breaks (e.g. dropping the `code` check would not fail the "other code" test only if code were equal; it uses `code: "other"` so it does fail).
- App tests use the real `FamilyApp` + `gbaAdapter` with a routed fetch mock. The first test asserts message (exact-text match, so it would not be satisfied by the old `Could not load X: <message>` paragraph), `<code>` file with `:3`, fix, `role="alert"`, the placeholder text, and absence of `GET /api/map`. It fails if the FamilyApp branch is removed. The 500 test guards the unchanged path.

## Dead code / consistency

No dead code. Imports are used (`DataDefect` in adapter.ts, FamilyApp.tsx, useMapLayout.ts). The long single-line `map:` object in gba/adapter.tsx:147 matches the density of nearby lines. GBC unaffected (optional field).
