# Task 3 quality review (46e5cf9, base 72cb9a6)

**Verdict: APPROVED. 0 blocker / 0 important / 11 minor.** Reviewed committed state only (`git show`). I also ran a scratch script (outside the repo) that did add/move/delete on NewBarkTown with CRLF-converted text (read-only): all three ops work end-to-end on CRLF, and no bare-LF lines appear.

## Answers to the asked questions

| Q | Answer |
|---|---|
| events.ts size/focus | 272 lines, 8 small fns plus 4 exports. Good. Only `addGbcEvent` (~40 lines) mixes concerns; see m6. |
| Doc comments (the why) | Mostly there. G3 header, pairing rule (`objectConstPlan`), retarget stricter-than-GBA, `-1`, and `ponytail:` (delete ref scan) all present. Gaps: m7. |
| `parseObjectConsts` duplication | Acceptable as shipped: the spec directed it, and the internal-consistency throw plus lineIdentity (which runs add over all 391 maps) make drift loud. Smallest correct fix is m1: one exported offset-aware scanner in `load/events.ts`. Not blocking. |
| `eventInsertAnchor` export | Acceptable. lineIdentity must prove the real anchor rule, and a re-derived copy in the test would prove nothing. The helper is also plausibly useful to Task 4. Keep; no `@internal` tag needed. |
| Error messages | Named and actionable. Prefix style is consistent within events.ts (`Map kind[i]: ...`). Differs from `load/events.ts` (`Map:line:`), which is fine since there is no line here. See m3, m4. |
| Extra validation (radius/sight via `parseNum`) | Warranted; keep. Without it, a bad radius gets through to the post-splice `parseMapEvents`, which throws a bare `parseNum: "wide" ...` naming no map, kind or arg. It is 8 lines and covers exactly the args the parser reads as numbers (the same reasoning as the destWarp check). Not scope creep. |
| TS hygiene | No `any` or casts. `!` use matches house style (`noUncheckedIndexedAccess`), except the one avoidable `!`: m2. |
| Windows EOL | Primitive handles CRLF, tested on 4 shapes. Op level verified OK (above) but untested: m8. PerfPlus has `.gitattributes * text eol=lf`, so the corpus tests' hard-coded `\n` are safe there only: m9. |
| `ponytail:` ceilings | Present for the same-file reference scan. Missing elsewhere: m7. |
| Corpus tests read-only | Yes. Only `readFileSync`; no writes under PerfPlus. Test 14 writes only to `makeFixture`'s tmpdir (cleaned in `afterEach`). |

## Findings (all minor)

| # | Where | Finding | Fix |
|---|---|---|---|
| m1 | `edit/events.ts:76-92` vs `load/events.ts:~138-155` | `constBlock` re-implements `parseObjectConsts`' rule; `objectConstPlan:103-105` throws if the two ever disagree (a runtime guard standing in for a shared function). | In `load/events.ts`, add `export function scanObjectConsts(text): { name: string; line: CodeLine }[]` (the existing loop, pushing `{name, line}`), then `parseObjectConsts = (t) => scanObjectConsts(t).map(c => c.name)`. `constBlock` becomes a 2-line map over it, and the internal-error throw plus the "same rule as" comment go. About 10 net lines; no behaviour change. Can wait for Task 4 or the next touch of `load/events.ts`. |
| m2 | `events.ts:40` (`fail`), `:120` (`marker!`) | `fail` is a `const` arrow with no explicit type, so TS does not treat calls as `never`-asserting and CFA doesn't narrow. This forces `marker!` at :120. | Declare `function fail(...): never { ... }`. Then `marker!` becomes `marker`, and the guard can be `if (!marker) fail(...)`. |
| m3 | `events.ts:231` | The delete refusal reports `offset ${m.index}`, a raw char offset the user can't act on. | Report the 1-based line: `text.slice(0, m.index).split("\n").length`. |
| m4 | `events.ts:185-189` | When `objectConst` is not supplied and the auto-derived name is invalid (a sprite like `$1`, or lower case), the message says `objectConst "X" must match ...`. The user never passed one. | Split the message: when `opts.objectConst === undefined`, say `derived const name "X" is invalid; pass opts.objectConst`. |
| m5 | `lineIdentity.test.ts:93-94` | Pins `[1000, 1562]` and the skipped list `["GoldenrodCity","MoveDeletersHouse"]`. 1000 changes the moment the user adds a map's first coord/bg event in PerfPlus (the very project Plan 7 edits). 391 is spec-mandated, and the house style pins counts (e.g. `load/events.test.ts`), so this is minor. | Derive the values: `expect(adds + skippedObjectAdds.length).toBe(maps.length * 4)`. Drop the literal 1000, and keep the skipped-list literal only if you want it as a canary. |
| m6 | `events.ts:163-202` | `addGbcEvent` mixes const-name resolution, the cap check and the splice. It reads fine but is the longest function. | Optional: extract `resolveObjectConst(mapName, args, plan, opts): string \| null` (lines 179-191). |
| m7 | `events.ts` doc comments / missing `ponytail:` | (a) No *why* for positional `object_const_def` on add: the doc should say consts pair with objects by ordinal, so append-at-end on both sides keeps pairing. (b) `checkAddArgs:139` has no comment on `destWarp` being 1-based (0 is invalid, `-1` is the special "previous map") or on why `mapConsts` is optional (G4, caller-supplied). (c) The uniqueness check (:190) is only against the file's consts; a clash with any other symbol only shows at assemble time. Needs `ponytail: only vs object_const_def, scan labels if it bites`. (d) `opts.objectConst` is silently ignored on a map with no paired block; the `addGbcEvent` doc doesn't say so. (e) `eolOf`/`terminatorAt` (`asmSplice.ts`) accept lone CR and "any CRLF means CRLF"; this deserves a one-line `ponytail:` (a mixed-EOL file gets CRLF; fix by reusing the anchor line's own terminator). | Add the 4-5 one-line comments. |
| m8 | `events.test.ts` | No op-level CRLF test, although the user is on Windows with `autocrlf=true` and the Task 7 pret refs may be CRLF. The scratch run shows it works today. | One small test: `mapText(...).replace(/\n/g, "\r\n")`, run add/move/delete, and assert no bare-`\n` line and `parseMapEvents` still agrees. |
| m9 | `events.test.ts` tests 6, 8, 10, 11 | Corpus tests hard-code `\n` anchors. They pass only because PerfPlus carries `eol=lf`. A CRLF reference root would break them (currently the corpus list is subject-only, so no issue today). | Optional: normalise with `readFileSync(...).replace(/\r\n/g, "\n")` in `readReal`/`NBT` reads, or add a comment saying they rely on `eol=lf`. |
| m10 | Test hygiene | (a) `asmSplice.test.ts:~354` has a mid-file `import` (legal, hoisted, and deliberate to keep the old bytes untouched; a one-line comment already explains it, so this is acceptable). (b) Test titles for tests 1, 2, 4 contain a real `\n` because the string isn't escaped (`"... with \n"`), which breaks the reporter line. (c) `events.test.ts:51` `const NBT =\`` is missing a space; test 11 has a redundant outer `( ... )`. (d) Test 14 packs three scenarios (delete, add-guard, guard teeth) into one `it`; the local `bare` is a parsed-events object and is misnamed. | Escape as `\\n` in the titles; split 14 into 14/14d if convenient; the rest is cosmetic. |
| m11 | `findGbcWarpsRetargetedByDelete:268` | `deleted.index + 1` mixes the 0-based ordinal and the 1-based id inline. | `const deletedId = deleted.index + 1; // destWarp ids are 1-based`. Then `destWarp >= deletedId`. |

## Not an issue (checked)

- `removeLine` start check requires `\n` before `lineStart`, while `terminatorAt` accepts a lone `\r` at the end. Asymmetric, but lone CR is outside the corpus and the code path is unreachable from `scanCalls` output (`splitLines` splits on `\n` only).
- `locateEventCalls` throws with the `locateEventCall:` prefix. This is deliberate (spec: existing messages unchanged), and a refactor leaving the old messages is the safer choice.
- Double or triple `parseMapEvents`/`constBlock` scans per op: negligible; clarity wins.
- Runtime: lineIdentity ~1-2 s for 391 maps; the 120 s timeout is generous but harmless.
- Test E-coverage and fixture design are good (`mapText` is a clear parametrised fixture; teeth shown by the implementer's mutation table).
