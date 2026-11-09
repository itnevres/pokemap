Changed `gbcBuild.ts`, `gbaBuild.ts`, and their test files. Preserved CRLF and all existing test lines.

New tests:

- `unedited Buena corpus copy preserves RGBDS interpolation without measuring text`
- `edited GBC copy ignores RGBDS interpolation in original and edited widths`
- `edited GBC copy accepts a trailing @ string terminator`
- `edited GBC copy measures corpus originals without refusing unknown characters`
- `unedited GBA copy preserves PAUSE control codes without measuring text`
- `edited GBA copy ignores brace control codes in original and edited widths`
- `edited GBA copy still refuses unknown characters outside control codes`
- `edited GBA copy measures corpus originals without refusing unknown characters`
- `edited GBA copy still refuses lines wider than the limit after removing control codes`

Vitest and git were not run, as instructed.