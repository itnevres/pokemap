Status: Not approved (C=1 I=0 M=0)

## Critical

- `packages/core/src/gbc/signs.ts:111-114`, reached by `packages/server/src/gbcEditRoutes.ts:236`: GBC inserts hash a LF-normalized body, then `replaceLines` renders that body using the source file’s CRLF. On a CRLF map, reopening a just-committed linked sign makes `signHash(block.body) !== marker.hash`, so refresh falsely reports it as hand-edited and never refreshes it. The CRLF placement test at `packages/server/test/gbcSignRoutes.test.ts:45-59` only verifies initial bytes; it does not reopen a linked CRLF sign and verify zero notices / successful refresh.