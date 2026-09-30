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
