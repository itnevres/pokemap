# Plan H Q3: code-quality / adversarial review (Opus, committed code only)

Range 80cd94e..2fa289e. Verdict: **APPROVE**. No Critical, no Important, 5 Minor. (Report text saved by the conductor: the reviewer's write was blocked by the cross-worktree hook.)

Verified: ENOENT/ENOTDIR (and dangling symlink) answer 409 BAD_VALUE; EACCES/EPERM/EBUSY/ELOOP rethrow to a 500 (environment faults); no new TOCTOU (save re-checks with `checkTilesetBaselines`); both handlers' catch (index.ts ~1042, gbcEditRoutes.ts ~530) map `BlockEditRefusal` to 409 with the code; helper has exactly two callers; message is project-relative; the guard runs before every write to `entry.session.blocks` (mixed GBA stamp writes nothing); `strokeStartBlocks` untouched; removed imports truly unused (index.ts `resolve(` left is a Promise executor parameter); no CRLF churn; tests restore the file in `finally`, discard, clean temp dirs.

Minor:
1. `blockEditOwnership.ts:54`: a directory at the metatiles path stats fine (size 0 on NTFS, 4096 on ext4 = 256 metatiles). Fix: refuse `BAD_VALUE` "is not a file" when `!isFile()`. **Applied.**
2. ENOTDIR branch only tested on POSIX (Windows gives ENOENT). Documented in the test name; not Windows mutation coverage. **Kept.**
3. The stat runs even when no other session owns the path (matches the old behaviour, was a 500). Optional lazy count. **Kept.**
4. A rethrown EPERM/EACCES 500 body can show the absolute path (pre-existing, local server). **Kept.**
5. Doc comment described history; test `finally` could skip discard if `writeFileSync` throws. **Comment fixed; test finally kept.**
