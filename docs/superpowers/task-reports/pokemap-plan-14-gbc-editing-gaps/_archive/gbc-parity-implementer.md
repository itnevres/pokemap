Changed only `gbcBuild.ts` and `gbcBuild.test.ts`. Added both parity checks and the two authorized existing-test label corrections. Preserved CRLF, ASCII, and no BOM.

New test names:

- `existing script ObjectEvent is allowed only for an NPC`
- `unedited corpus script copy passes with the project charmap`
- `edited copy refuses an absent charmap character in %s`
- `edited copy refuses a %s line wider than SIGN_WIDTH`
- `edited copy measures displayed lines separately and accepts SIGN_WIDTH`
- `edited copy uses the widest original line across copied texts as its limit`
- `edited copy uses charmap token widths for original and edited lines`

Both `%s` cases cover `text`, `line`, `cont`, and `para`.

Tests, typecheck, build, and git were not run, as instructed. Existing copy grammar rejects `next`; left unchanged, though width extraction includes it.