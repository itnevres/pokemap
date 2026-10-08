# Task 7 code-quality review (cc319e9..fd051c7, committed state)

Verdict: **CHANGES_REQUESTED** (1 blocker, 6 important, 9 minor). `bash -n` on the hook passes. The gate logic is sound and failure messages name map and kind. The problems are the missing hook fetch entry, circular and duplicated pins, and B4 readability.
Paths: WG = packages/core/test/gbc/write/writeGate.test.ts, AS = packages/core/test/gbc/write/asmSplice.test.ts, H = .claude/hooks/session-start.sh.

## Blocker
| # | where | finding | fix |
|---|---|---|---|
| B1 | H:46-53 (PINNED array) | **The pret `PINNED` entry is missing.** Only the config line (H:107) changed (`git diff` is 1 line; `git grep 3bc8daa fd051c7 -- .claude` finds nothing). The implementer report claims a PINNED entry for `pokecrystal` @ 3bc8daa was added; that is false. Spec Part A.3 required it. In cloud, `$CORPUS/pokecrystal` is never fetched, so `hasGbcProject` silently filters pret out. The pret half of the gate (and of lineIdentity/blocks/map/tileset/asmSplice) skips on cloud with no warning. | Add `"pokecrystal\|https://github.com/pret/pokecrystal\|3bc8daa4173e96a7f4011dad3922eb6fa5dad5c6"` after H:52 (`$CORPUS/$name` = `$CORPUS/pokecrystal` matches H:107). Re-run `bash -n`. Correct the report. |

## Important
| # | where | finding | fix |
|---|---|---|---|
| I1 | WG:48-298 (~250 of 569 lines) | The pinned name lists are ~120 strings each, copy-pasted for subject and pret (pret = subject minus 3-4 lines). They are order-sensitive (depend on `proj.maps` order). They were "measured on the first green run" from the code under test, so they are circular: a regression that shifts skip classification is simply re-pinned. A one-line change gives a 120-element diff. | Pin counts by reason (sole-with-const / referenced / non-canonical-const) plus the 2 const-line-not-canonical names. Compare per-map lists as sorted sets against one shared base list plus per-root add/remove. At minimum derive pret from subject. |
| I2 | WG:115-216 (B4) | One ~100-line `it` with three sub-phases, 6 `continue` skip paths, shared loop state, and the same locate call done twice (WG:148 `args`, WG:152 `call`). A maintainer cannot tell which sub-phase a failure or skip belongs to; skip reasons are interleaved with the proof. Spec asked for one `it` per phase. | Extract `moveRoundTrip`, `deleteReAdd` (returns ok or a skip reason) and `addDelete` helpers; B4 becomes a tally loop. Compute `call` once and derive `args` from it. Optionally split into B4a/B4b/B4c `it`s. |
| I3 | WG:210-212, WG:40-45 | B4's catch records only `${map} ${kind}: ${message}`. The sub-step (move / move-back / delete / re-add / add / delete) is lost when the error comes from `commit()`'s context-free `expect(plan.refusals)`. A systemic bug (G2 gave 1564 failures) dumps a ~1500-element array diff. | Track `step` and prefix it to the message. Assert `failures.slice(0, 20)` with the total in the message (`expect(failures.slice(0,20), \`${failures.length} failures\`).toEqual([])`). |
| I4 | AS (the new in-loop asserts: 11 count `toBe`s, arg-set `toEqual`s, 2 `toHaveLength(pins.maps)`) | Inside `for (const root of ...)` the asserts carry no root tag. A pret-only failure prints "expected 1312 to be 1327" without naming the root. | `expect(counts, root).toEqual(pins.counts)` (keys are exactly the 11 macros), `expect(mapFiles, root).toHaveLength(...)`, same for arg-count sets. |
| I5 | WG:21-56, 58-113, 218-225 | Phases B2-B6 depend on state set in B1 and on one another. If B1 or the copy fails, later tests fail with cascaded, confusing errors; if `writable` is empty, B2 is vacuously green, and B3 is vacuously green on pret. B4 failures also dirty the copy, so B5 fails too (deliberate since 6f0e278, but undocumented). | Assert `writable.length`/`nonWritable.length` against PINS inside B2/B3 (or classify in `beforeAll`). Add a comment at the B4 catch saying the dirty copy is intentional so B5 is red as well. |
| I6 | WG:53-56 (cleanup) | `removeTemp` runs before `expect(porcelain(root))`. If `rmSync` throws (EBUSY from AV/indexer is common on Windows after thousands of writes; helper has `maxRetries: 3` at the default 100 ms, ~300 ms total) the real-root guard is skipped and the temp copy leaks. If `cpSync` throws mid-copy, `tmp` is never assigned and the half-copy leaks (`mkdtempSync` is inside the same helper). | `try { expect(porcelain...) } finally { removeTemp(tmp) }`. Helper: `maxRetries: 10, retryDelay: 200`. Split `mkdtempSync` from `cpSync` in `copyGbcRootToTemp` and clean up in a catch. |

## Minor
| # | where | finding | fix |
|---|---|---|---|
| m1 | WG:18 | `vi.setConfig({testTimeout: 300_000, hookTimeout: 300_000})` is file-wide, so any phase can silently grow from 47-60 s to 290 s. Spec says report, not hide. | Per-test timeouts on the two heavy `it`s (`it(name, fn, 180_000)`); keep defaults for B1/B3/B5/B6; keep the high `hookTimeout` for the copy only. |
| m2 | WG:245, AS (x2) | `root === GBC_SUBJECT_ROOT ? "subject" : "pret"` appears 3 times. A second reference project is labelled "pret" and gets pret pins. | One exported `gbcRootLabel(root)` in corpus.ts that throws for an unknown reference root. |
| m3 | WG:18-19, 227-230 | The only re-measure mechanism is the B6 `console.log("GATE-STATS ...")`, but the comment only says "must re-measure". `toEqual(PINS)` on 120-string arrays gives an unreadable diff. | Comment "run `-t B6`, copy the GATE-STATS line". Shrinks with I1. |
| m4 | WG:59 | `walk(tmp, "")` walks the whole decomp, then filters `maps/`. | `walk(tmp, "maps")`. |
| m5 | WG:218-225 | `expect(copy).toEqual(real)` on two path lists of thousands of entries prints a giant diff on failure. | Compare as sets and report `extra` and `missing` separately. |
| m6 | WG:297 `porcelain` | The real-root guard is weak: porcelain is unchanged if an already-modified file is modified again; ignored files are invisible; `git status` can refresh `.git/index` (a write to a real root). Tmp isolation is the real protection. | `git --no-optional-locks -C root status --porcelain --ignored`, plus a hash of `git diff`; or document it as belt-and-braces. |
| m7 | WG:85-95 (B2) | B2 checks only the `.blk` diff; the plan's change target is not compared with `m.blkPath`, so a wrong-file patch is only caught later and non-locally by B5. | Assert the change's path equals `m.blkPath`. |
| m8 | Runtime (~2 min) | The two roots run in series in one file. Repeated `openGbcEditSession`+`planGbcSave` is inherent to the re-read-disk model, so no cheap per-op win beyond m4. The 2x win is parallelism. | Split into per-root test files over a shared helper (vitest runs files in parallel), or `describe.concurrent` once I5 is done. |
| m9 | AS top, ~340 | `PRET_PINS` is hoisted while subject is inline in `PINS` (inconsistent). The comment "measured over the subject corpus (findings doc 3.1 ...)" is stale (now per root). A stray blank line precedes the closing `},`. | Inline both under `PINS`, reword to "per root", delete the blank line. |

## Checked, fine
- Failure messages name map + kind (`${map} ${kind}: ...`; B2 `${name} (${blkPath})`); phase via the `it` title.
- Hook config line matches the PerfPlus shape (H:107); `bash -n` OK (but see B1).
- `copyGbcRootToTemp` / `copyGbcSubjectToTemp` one-liner is clean. TS: no `any`. Only nit is `snapOf` `!` (a missing snapshot gives an `undefined.equals` TypeError, not a named failure); make it throw `no snapshot for ${rel}`.
- Mutation evidence in the implementer report (G2-G5) is credible; G6 ("walk skips maps/") was not run, but the stray write was caught.
