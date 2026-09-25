# Task 19 code-quality re-review — fix round 2 (I1/I2)

**Verdict: YES, ready to merge.** Critical 0 · Important 0 · Minor 0 new.
Commit reviewed: `92a85f1` (on top of `fc0b7dc`). File: `packages/core/test/write/corpus.test.ts`. Independently re-derived every claim below; did not trust the implementer's report.

---

### Verified

| # | Check | Result | Evidence |
|---|---|---|---|
| 1a | `blockdataPath` write still unconditional | ✅ correct — `commitSave` genuinely rewrites it every run | `corpus.test.ts:471` |
| 1b | `borderPath` guard is real `.equals()` on two `Buffer`s, not `===` | ✅ `beforeBorder = readFileSync(borderPath)` (no encoding arg → `Buffer`, `:411`); guard re-read also no-encoding-arg (`:472`) → `Buffer`; `.equals()` is the correct byte comparison. `===` would've been a **new** always-false bug — not present. | `:411`, `:472` |
| 1c | `mapJsonPath` guard is string `!==`, not Buffer-vs-string | ✅ both `beforeMapJson` (`:412`) and the guard re-read (`:473`) pass `"utf8"` → both `string`. Correct comparison; the "always writes" defeat-the-guard mistake is not present. | `:412`, `:473` |
| 2 | Pre-`finally` assertions unchanged in substance | ✅ `expect(readFileSync(mapJsonPath,"utf8")).toBe(beforeMapJson)` and `expect(readFileSync(borderPath)).toEqual(beforeBorder)` at `:454-455` are untouched by the diff (confirmed via `git show`) — guard only changes whether the *redundant restore-write* fires, never what's asserted. | `:454-455` |
| 3 | I2 comment clarity | ✅ Not vague. `EXCLUDED_TARGET_NAMES` comment (`:117-131`) explicitly names two distinct hazard classes: named-collision (what the list covers) vs. whole-corpus iteration-scan (what it structurally cannot cover, names the 3 offending test files), states survival today is "by construction," not by the list, and points to the actual mitigation (minimal `finally` write surface). A maintainer adding an 8th name would come away understanding both classes. | `:117-131` |
| 4 | `stubProject.ts` doc-comment claim | ✅ confirmed against source: `layouts: []`, `layoutByName: () => undefined`, `layoutById: () => undefined`, `mapNames: () => []` are all silent benign defaults, distinct from `unused()` throwers on `paths`/`constants`/`groups`/`layoutForMap`/`splitFor`/`tileset`/`tilesetSymbols`/`map`/`encounters`. Matches `projFor`'s new doc-comment paragraph exactly. | `stubProject.ts:16-32`, `corpus.test.ts:76-84` |
| 5a | `corpus.test.ts` alone | ✅ 37/37, `--reporter=verbose`, all 6 roots named under each of the 4 `it.each` blocks incl. the funnel test, zero skips | ran directly |
| 5b | `packages/core` | ✅ 325/325, 38 files | ran directly |
| 5c | full repo | ✅ 673/673, 73 files | ran directly |
| 5d | typecheck | ✅ `tsc --noEmit -p packages/core` exit 0, no output | ran directly |
| 6 | 6-root git-status-clean proof | ✅ subject root: exactly the same documented baseline as the prior review's §0 (`NavelRockZygardeChamber/map.bin`, `NavelRock_Fork/map.bin`, `layouts.json`, 2× `map.json`, `fieldmap.h`, + untracked `docs/human-tasks-notes.md`) — no new dirt. All 5 reference roots: clean, zero output. | `git status --porcelain` in all 6 roots |
| 7 | Commit scope | ✅ `git show --stat 92a85f1` touches exactly `packages/core/test/write/corpus.test.ts` (46 insertions, 3 deletions, 1 file) | `git show --stat` |
| 8 | New race from the read-guard itself | ✅ None. Reasoning below. | — |

**Item 8 detail.** The guard adds two *reads*, no new *writes* — on the normal (non-throwing) path, since `commitSave` never touches border/mapJson here, the guard reads now replace what used to be unconditional writes, net-**shrinking** the write-race window I1 flagged, not adding to it. A "torn read causes false negative" scenario requires: (a) the file *does* need restoring (not true today, verified by the pre-`finally` assertions) *and* (b) a concurrent writer happens to leave the file in a state that reads back as bit-identical to `beforeBorder`/`beforeMapJson` despite being genuinely different — vanishingly improbable, and in the realistic case (a genuinely different current-vs-before state) the guard correctly detects it and restores. A torn read that just returns *some* different bytes only ever trips the guard *true* (extra harmless restore-write), never *false*. The only race this method can't rule out — a concurrent writer clobbering the file's true state at exactly the wrong instant — is the pre-existing whole-corpus-scanner/named-collision hazard I1/I2 already cover; this specific guard neither creates nor worsens it, since it performs no write of its own on the path that hazard depends on.

---

### Issues

#### Critical / Important / Minor

None. No new issue introduced by this fix.

---

### Assessment

**Ready to merge?** Yes

**Reasoning:** Both I1 and I2 are closed as specified. I1: `borderPath`/`mapJsonPath` writes are now genuinely conditional on real content comparison, with correct types on both sides of both comparisons (Buffer `.equals()`, string `!==`) — the two "easy mistakes" flagged for special attention in this re-review's brief are both absent. `blockdataPath` correctly stays unconditional. Pre-`finally` assertions are byte-identical to before, so no test semantics changed — only the redundant restore-write's firing condition did. I2: the comment addition clearly separates the two hazard classes (name-collision vs. whole-corpus iteration) and is unambiguous about what the list does and doesn't prove. The bonus `stubProject` doc-comment addition is verified accurate against source. All reruns match claimed counts (37/37, 325/325, 673/673), typecheck is clean, and the 6-root git-status-clean proof still holds byte-for-byte against the prior review's documented baseline. No new race, no new issue. This closes out the merge gate for Plan 2.
