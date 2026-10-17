Status: Not approved (C=0 I=1 M=0)

## Critical

None.

## Important

- `packages/core/src/write/save.ts:248` permits multiple `ScriptReplace` entries for one path and writes each in sequence. Two staged replacements with the same `before` both pass the disk check, the plan displays one change, then the second `after` silently overwrites the first. This violates the one-replace-per-path ruling and can discard an earlier sign edit.

## Minor

None.