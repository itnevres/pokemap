# Task 5 spec-compliance review (6ce48d8 vs 4cba0bd originals)

Verdict: Spec PASS. 0 Critical / 0 Important / 2 Minor.

## R1-R7
- R1: core stores `{forMap, seed, state, flags}`, live only when forMap===mapName && seed identity (core.ts:25,32). GBA reset effect deleted. OK.
- R2: ticket `{map, seed, seq}` issued in `post`; `apply` guard = map, seed, `seq > applied`, then `applied = seq`. Identical to old GBC guard. OK.
- R3 a-e: all five reachable and each has a GBA witness (2a, 2b, refetch case, 2c, 2d).
- R4: signatures match. Body: `undefined` sends exactly `{method:"POST"}`, else JSON.stringify. GBA `call` default `{}` still yields body "{}"; callEvent bodies unchanged. Error text: server `{error}` only when `readServerError`; otherwise `POST ${base}/${raw map}${path} -> status`; json not read when disabled; read once (catch->null) when enabled, and that same value is returned as data. Null map -> null. Ticket guard OK. discard: throws `POST /api/edit/<map>/discard -> N` on !ok with state kept; success sets applied=issued, stored=null. markClean: no-op when stored null. Seed memo deps match R5 (GBA [initialBlocks, initialMap]; GBC [initialBlocks, initialEvents]). Callers pass stable refs (App.tsx:63 layout.data fields, GbcApp.tsx:103 `ready?.events`), so R5 does not reset the live view every render.
- R6: all exported names/types (PaintApplyBody, GbcPaintBody, both result interfaces, re-exports) intact; the GBA discard postmortem retained (reworded only where it named the deleted `call()/applyResponse`/reset effect). GBC class comment rewritten to point at the core. Resulting-value shapes unchanged.
- R7: no existing test file changed (diffstat: only 3 new tests + 3 src files).

## Non-R3 behaviour audit (all preserved)
- GBA `map` merge: `d.map === undefined ? prev.map : d.map ?? undefined` (keep / null->undefined). Same.
- GBA nothing-open undo reply (`blocks: []`, map null): applied as is; flags `?? false`. Same.
- GBA event ops: flags synthesised canUndo=true/canRedo=false, blocks/border kept via `...prev`; returned warnings `?? []` returned even when the apply was dropped as stale (old code returned them too).
- GBA applyExternalMapUpdate: ticket-less apply on current map/seed; blocks come from live-or-seed (same as old state after reset effect). Same.
- GBC: `events: null` returns null before apply; shape check throws before the guard (ticket issued, nothing applied, same as old `mine` bump); deleteEvent returns warnings even when stale; `{error}` text; URLs/methods identical.

## Tests
1a/1b (it.each map|seed), 1c, 1d, 1e, 1f, 1g, 1h, 1i, 1j (it.each both flags, json call count 0/1), 1k, 1l present and assert what the spec says. 2a-d present (plus an extra same-map seed-refetch case = R3b); 2d asserts the first render synchronously. 3 present. Not re-run; red/teeth are coordinator items.

## Findings
- Minor 1: null-vs-falsy map. Both originals guarded with `!mapName` (also "" and undefined-ish); the core uses `=== null` (core.ts post ~L29, discard ~L52). `mapName === ""` now fetches `/api/edit//x`. Spec R4 literally says "null", and the type is `string | null`, so compliant; no caller in src passes "" (App.tsx/GbcApp.tsx pass `selected`) — cannot verify that `selected` is never "" at runtime from this diff.
- Minor 2: core interface members lost the R4 doc comments (`state` "live else seed", `post` body/throw contract, `apply` ticket semantics, `discard`/`markClean` contracts); only `EditUpdate` is commented. R6 only requires family docs, so not a violation, but the contract the spec wrote is undocumented in the core file.
- Also (informational, not a defect): `post`'s identity now changes with the seed (old GBA `call` changed only with mapName), so consumers listing hook methods in effect deps may re-run on a seed change. Cannot verify consumers from the diff; full suite is green.
