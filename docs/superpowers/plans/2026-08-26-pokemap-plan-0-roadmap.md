# PokeMap Roadmap — Plan 0

> **For agentic workers:** This is the overarching plan. It is **not executed directly**. Read it before executing any of Plans 1–5; it defines the conventions, invariants, and package layout every other plan assumes. Plans 1–4 are executed with `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

**Goal:** Establish the shared conventions, hard invariants, and sequencing that bind the five implementation plans into one coherent tool.

**Spec:** [`docs/superpowers/specs/2026-08-26-pokemap-design.md`](../specs/2026-08-26-pokemap-design.md)

---

## 1. Plan sequence

| Plan | File | Scope | Depends on |
|---|---|---|---|
| 1 | `...-plan-1-foundation-world.md` | `core` loaders, per-layout renderer, `cli`, map list, single-map view, stitched world, encounter atlas | — |
| 2 | `...-plan-2-editing.md` | Painting, collision/elevation, event editing, wild sign authoring | 1 |
| 3 | `...-plan-3-data-editors.md` | Connections/headers/encounters editors, tileset editor, region map editor | 2 |
| 4 | `...-plan-4-packaging.md` | Electron, MCP server, opt-in git integration | 3 |
| 5 | `...-plan-5-future-work.md` | Backlog only — no code | — |

**Plans 2–4 get a re-granularisation pass before execution.** Plan 1 is written to full step-level granularity because it is executed next against code that exists today. Plans 2–4 are written to task level with exact file paths, interfaces, test names, and representative code — but their step-by-step code is calibrated against APIs Plan 1 has not built yet. Writing literal code against an imaginary API produces fiction that the executor must discard. **Before executing Plan N, re-read it against the code Plan N−1 actually produced and expand its tasks to step granularity.** This is stated plainly rather than pretended away.

---

## 2. Repository layout

```
C:\Programming Projects\PokeMap\
  package.json              npm workspaces root
  tsconfig.base.json
  vitest.config.ts
  packages/
    core/                   pure logic. Node-targeted. no DOM, no HTTP.
      src/
        config/             engine profile, fieldmap constants, project paths
        model/              Layout, MapData, Tileset, Connection, Encounter types
        load/               parsers, one file per source format
        render/             metatile → RGBA, layout → RGBA, overlays
        write/              surgical JSON editing, .bin writing, guards
        world/              connection graph, warp graph, sidecar
        index.ts
      test/
    cli/                    commander-based. imports core.
    server/                 HTTP shim. imports core.
    ui/                     React + Vite. talks to server over HTTP.
    mcp/                    Plan 4
    electron/               Plan 4
  fixtures/                 read-only copies of decomp slices for tests
  docs/superpowers/
```

**`core` targets Node, not the browser.** It reads the filesystem and decodes PNGs with `pngjs`. The browser never imports `core`; `ui` receives rendered RGBA buffers and model JSON from `server` over HTTP. This is what keeps `core` simple enough to test exhaustively, and it is why an agent's CLI render and the user's on-screen render are byte-identical — they are literally the same function call.

---

## 3. Hard invariants

These bind every plan. A change that violates one is a bug regardless of what else it accomplishes.

### I1 — Split resolution is per layout, always

No code path may read `NUM_METATILES_IN_PRIMARY` (or its siblings) without first resolving which of the two constant sets that layout uses. Any function that renders, validates, or writes blockdata takes the resolved split as a parameter. There is no ambient global.

### I2 — Never reserialize a JSON file

Writes are surgical splices into the original text. `JSON.stringify` of a whole decomp file is forbidden in `packages/core/src/write/`. A lint rule enforces this.

### I3 — Build artifacts are not sources of truth

`*.4bpp`, `*.gbapal`, `*.lz` are gitignored and absent from fresh clones. Read `tiles.png` and `palettes/NN.pal`. Using an artifact as the only source is a bug even when it works locally.

### I4 — Tileset paths come from `INCBIN`, never from name mangling

Resolve `gTileset_Foo` through the string literals in `src/data/tilesets/metatiles.h` and `graphics.h`.

### I5 — The round-trip corpus test is the gate

Load and re-save every map and layout across the subject repo and all reference engines with no edits; assert zero bytes changed. No plan may merge with this test failing or skipped.

### I6 — No autosave, ever

Opening a map to look at it must never write. Every write is user-initiated and diff-previewed.

### I7 — Refuse rather than guess

A layout missing `layout_version` on an engine that supports it renders (as `emerald`) but does not save. A block whose metatile id is out of range for its split does not save. Refusals name the file and the fix.

### I8 — PokeMap writes only decomp data files plus `.pokemap/`

No stray files in the decomp. No modifications to `include/fieldmap.h` — the constant-swapping workaround is what this tool exists to eliminate, not automate.

---

## 4. Conventions

**Language/tooling:** TypeScript strict, ESM, Node 24, npm workspaces, vitest, Playwright, Vite for `ui`, commander for `cli`, `pngjs` for PNG, React 19.

**Testing:** TDD per `superpowers:test-driven-development`. Write the failing test, watch it fail, minimal implementation, watch it pass, commit. Fixtures live in `fixtures/` and are read-only copies; tests never write into a real decomp.

**Commits:** frequent and small — one per task minimum. Conventional Commits. Never `git add -A`; stage named paths. (The subject repo's `docs/resolved.md` records `git add -A` without re-checking `git status` as the mechanism by which the Porymap 6 damage reached a commit.)

**UI work:** every UI task invokes the `frontend-design` and `ui-ux-pro-max` skills before writing components. This is written into the individual steps.

**Subagent models.** Implementers run on Sonnet — they have consistently caught
plan defects by verifying before writing, and nothing suggests a stronger model
is needed. **Reviews of the design-heavy tasks run on Opus**: Plan 1 Tasks 9, 13,
18, 22 and 25, and every UI task. Those are where judgement rather than
verification is the bottleneck and where a missed defect is expensive. Note that
`SendMessage` cannot change a model — a resumed agent keeps the one it started
with — so pick correctly at dispatch.

**Naming:** types are singular nouns (`Layout`, `Tileset`); loaders are `loadX`; renderers are `renderX`; writers are `writeX`; validators are `validateX`. Method signatures established in Plan 1 are not renamed in later plans.

---

## 5. Config

`pokemap.config.json` at the PokeMap repo root, overridable by `--project`:

```json
{
  "projectPath": "C:/Programming Projects/Pokemon Game/game",
  "referenceProjects": [
    "C:/Programming Projects/Pokemon Game/refs/pokeemerald",
    "C:/Programming Projects/Pokemon Game/refs/pokefirered",
    "C:/Programming Projects/Pokemon Game/refs/pokeemerald-expansion",
    "C:/Programming Projects/Pokemon Game/refs/modern-emerald",
    "C:/Programming Projects/Pokemon Game/refs/pokeclassic"
  ]
}
```

`referenceProjects` exist for the corpus test (I5) and are never written to.

---

## 6. Definition of done, per plan

1. All tasks' tests pass.
2. The round-trip corpus test passes at zero bytes changed.
3. Visual regression hashes are stable, and the fixed map list still includes at least one `emerald`, one `frlg`, one `hns`, and one 3×2-border layout.
4. `npx tsc --noEmit` is clean across all packages.
5. The plan's own success criteria (stated at the top of each plan) are demonstrated, not asserted — per `superpowers:verification-before-completion`.

---

## 7. Test-design rules, learned the hard way

Executing Plan 1 turned up defects at roughly 1.5 per task, **every one in the
plan rather than in an implementation**. The plan hands over code verbatim, so a
mistake written here is reproduced faithfully. These are the classes that
actually occurred. Check every new or edited test against them.

**A test must be able to fail.** Four distinct ways one silently could not:

1. **Asserting the code's own fallback.** Task 3's test swapped a constant to
   512 and asserted 512 — which was also that field's default, so a parser that
   matched nothing passed. Pick a value that is neither the input nor any
   default.
2. **Aliased fixture fields.** Task 5's fixture set tiles and metatiles both to
   512/640, mirroring the real header, so swapping the two fields inside a
   branch was invisible. Give every field in a fixture a distinct value.
3. **Positive-only assertions.** Task 6 checked that *some* FireRed map carries
   `floor_number`; all 425 do, so an implementation inventing the field passed.
   Assert the negative too — that a map without the key leaves it `undefined`.
4. **Silent skips.** A corpus test that skips reports green. Guard real-data
   tests with `itWithCorpus` / `referenceRoot` / `describe.skipIf`, then confirm
   with `--reporter=verbose` that they actually **ran**. And guard *only* tests
   that read a decomp — guarding a pure unit test deletes coverage on the
   machines where it is the last thing still able to run.

**Verify every number against the source file, never a directory listing.** Two
counts in this plan were wrong because they came from `ls | wc -l`, which
counted sibling files as entries. It is 1,209 maps and 1,020 layouts, from
`map_groups.json` and `layouts.json`.

**Make a test prove its own claim.** Task 7's invariant-I4 test used a tileset
whose directory a naive mangler would guess correctly, so the test guarding "we
never mangle names" could not have caught mangling. Pick the case that actually
discriminates — here, `gTileset_TrainerHill_Courtyard` → `battle_tower_outer`.

**Three namespaces look alike and are not interchangeable:** map name
(`NewBarkTown`), layout name (`NewBarkTown_Layout`), layout directory
(`NewBarkTown`). `renderLayout` takes a layout name; most callers hold a map
name and want `proj.layoutForMap`.

**Model the data as it is, not as it looks at first glance.** Two examples that
would have shipped wrong answers: a map can own several encounter tables
(day/night variants — 125 maps do, and `.find()` hid three quarters of them),
and `fishing_mons` is three rod distributions packed into one array summing to
300, not one summing to 100.

**A stronger assertion is not automatically a discriminating one — check the
path is reached.** Task 15's review asked for a bare `.toThrow()` to be pinned
to the error message it was supposed to be about. That is strictly stronger and
still did not discriminate: for a name that is not a map at all, `proj.map()`
throws first, so the branch the assertion meant to pin is never reached and the
old implementation passes it too. Found by the implementer mutation-proving a
change they had been told to make. The fix was a stubbed `Project` exercising
the branch directly, because no corpus fixture for it exists — it would require
a form of tree corruption the subject repo should not contain. Tightening an
assertion feels like progress; only the mutation tells you whether it was.

**An agent can be killed mid-edit. Check the tree; never assume either way.**
Twice now a usage limit has stopped an implementer between "break something on
purpose" and "put it back", and the two cases needed opposite responses. Task
16's agent left a reversed draw loop in `renderMetatile` — had the visual
baseline been generated from it, the harness would have locked a wrong renderer
in as the reference. Task 21's agent left 172 passing tests and a coherent body
of uncommitted work, which a reflexive `git reset --hard` would have destroyed.

So on resuming an interrupted agent: `git status`, `git diff`, run the suite,
and read what is there before doing anything. Then decide. The corollary for
implementers is to **commit green work before going back to refine it** — the
window between "this passes" and "this is committed" is the only window in
which an interruption can cost anything.

**Reviews are where the defects are now, including reviews of reviews.** Three
of the loops in Plan 1 fixed something a *previous* review had introduced or
overstated: a border assertion coupled to whichever layout `.find()` returned,
a teeth claim true only for one of two chunk-reorder mutations, and a
top-level error handler that improved the common paths while making a
present-but-broken config strictly less informative than the stack trace it
replaced. Re-review the fix, not just the original.

---

## 8. Risk register

| Risk | Mitigation |
|---|---|
| A write bug damages the subject repo | I2, I5, I6, diff preview; subject repo is under git; Plan 1 is read-only, so no write path exists until Plan 2 |
| Renderer subtly wrong, discovered late | Visual regression against emulator screenshots in `tools/verify/scratch/mapshot/` from Task 14 of Plan 1 onward |
| 1,209-map world view too slow | Per-map buffer cache, viewport culling, LOD mips designed in from Plan 1 Task 23 |
| Engine portability rots | Corpus test spans 5 reference engines from Plan 1, not bolted on later |
| Plans 2–4 drift from reality | Explicit re-granularisation pass, §1 |
