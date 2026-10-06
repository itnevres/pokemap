# Plan 6c branch baseline (measured 2026-09-29, Windows machine)

Branch `plan-6c-hub-encounters-world`, rebased onto `master` at `ce020d9` (the #3 merge; its tree is
byte-identical to 6b HEAD `243cbef`, `git diff --stat 243cbef ce020d9` is empty). Plan-doc commit is
now `9643fe0`.

| Gate | Result |
|---|---|
| `npm test` | **1,679 pass / 0 fail**, 107 files (50 s) |
| `npm run typecheck` | clean |
| `npx vite build packages/ui` | passes (css 38.68 kB, js 303.48 kB) |

Corpus state:
- GBA subject `git status --porcelain`: 6 M + 1 ?? (the NavelRock/`fieldmap.h`/`layouts.json` set and
  `docs/human-tasks-notes.md`), unchanged since Plan 2.
- PerfPlus: clean.
- `~/.pokemap/` does not exist yet.

## Phase B start (measured 2026-09-30, Windows, HEAD `f0b860e`)

| Gate | Result |
|---|---|
| `npm test` | **1,779 pass / 1 fail**, 112 files. The 1 = the known flake, now identified (below) |
| `npm run typecheck` | clean |
| `npx vite build packages/ui` | passes (css 42.08 kB, js 310.96 kB) |

**The unidentified Windows flake, identified:** `WorldCanvas.test.tsx` > "jump to map" > "pans/zooms to
the given map's real placement when jumpToken changes" (`expected null to be truthy` on
`.world-canvas__jump-highlight`). `WorldCanvas.tsx` clears the highlight with a real
`setTimeout(() => setJumpHighlight(null), 2000)`; under full-suite load (environment time ~390 s) the
gap between render and the assertion can pass 2 s. The file alone: 59/59, three runs. Test-only fix
flagged as a separate task; Phase B treats this one failure as the known flake.
