# M3 self-hosted fonts

Tier: Low (isolated, fully specified; CSS + static files + one test). Implemented inline (under 20 lines of edit; brief would cost more), reason logged here.

Files (user approved the download, 2026-11-24/25; source: Google Fonts CSS API, latin subset, variable woff2 covering wght 400-600):
- `packages/ui/public/fonts/IBMPlexSans-latin-wght.woff2`, 45,712 bytes, https://fonts.gstatic.com/s/ibmplexsans/v23/zYXzKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1syxeKYY.woff2
- `packages/ui/public/fonts/JetBrainsMono-latin-wght.woff2`, 31,432 bytes, https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPxDcwg.woff2
- `OFL-IBMPlex.txt` (4,456 bytes, github.com/IBM/plex LICENSE.txt), `OFL-JetBrainsMono.txt` (4,399 bytes, github.com/JetBrains/JetBrainsMono OFL.txt)

Evidence:
- Gate at the commit before the test typing fix: 5623 pass / 1 fail / 303 files; the one fail is the known `engine.test` env fail (`parses the subject repo's real porymap.project.cfg`). Subjects unchanged (git status clean on both).
- After a typing fix in `styles.test.ts` (`m[1] ?? ""`): typecheck pass, UI build pass, `styles.test.ts` 18/18.
- Live check (UI served from this worktree, Playwright, every non-localhost request aborted): 0 blocked requests attempted, both `/fonts/*.woff2` served 200, `document.fonts` shows both families loaded, `document.fonts.check` true for 400/600 Plex Sans and 500 JetBrains Mono.
- Mutation check: not run (Low tier).
