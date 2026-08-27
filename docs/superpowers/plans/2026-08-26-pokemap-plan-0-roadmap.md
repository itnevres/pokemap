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

## 7. Risk register

| Risk | Mitigation |
|---|---|
| A write bug damages the subject repo | I2, I5, I6, diff preview; subject repo is under git; Plan 1 is read-only, so no write path exists until Plan 2 |
| Renderer subtly wrong, discovered late | Visual regression against emulator screenshots in `tools/verify/scratch/mapshot/` from Task 14 of Plan 1 onward |
| 1,214-map world view too slow | Per-map buffer cache, viewport culling, LOD mips designed in from Plan 1 Task 23 |
| Engine portability rots | Corpus test spans 5 reference engines from Plan 1, not bolted on later |
| Plans 2–4 drift from reality | Explicit re-granularisation pass, §1 |
