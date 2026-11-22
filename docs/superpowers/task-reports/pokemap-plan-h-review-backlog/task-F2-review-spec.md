# F2 spec review (Claude Opus, read-only), diff f66b254..38f240b

Verdict: PASS. No blockers or important findings.

Guard in `write/atomic.ts:30-36` runs over every entry before the first temp write; callers `write/save.ts:336` and `gbc/write/save.ts:261` pass the root; no other callers of `writeFilesAtomically` in core/server/cli (root is a required parameter).

- NIT-1: the other-drive / UNC branch (`isAbsolute(rel)`, atomic.ts:33) and the exact-parent (`rel === ".."`) arm are untested; deleting them leaves tests green on a same-drive tmpdir.
- NIT-2: guard is lexical; a symlink/junction inside the root pointing out passes (spec asks no realpath).
- NIT-3: `insideRoot(".")` is true; a tileset edit with path `.` reaches `checkTilesetBaselines` and fails EISDIR, and the atomic guard would reject `rel === ""`. Nothing is written.
- NIT-4: `checkTilesetBaselines` reads outside the root before the write guard (reads only; `mergeTilesetEdits` already refuses such paths).
