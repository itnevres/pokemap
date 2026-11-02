Quality: Approved with fixes

- **Critical:** None.
- **Important:** None.
- **Minor:** `packages/ui/src/gba/worldSurface.tsx:72–73` still says the GET “reflects the saved layout.” The dungeon request at line 77 forces auto-layout regardless of the saved setting. Qualify the comment as World-scope behavior.

Mock changes do **not weaken existing assertions**: fixtures and assertions remain unchanged; matching expands to two exact URLs. New tests explicitly assert the dungeon URL at `packages/ui/test/WorldCanvasSurface.test.tsx:178` and `packages/ui/test/gbc/GbcWorldCanvasSurface.test.tsx:254`.

Verified CRLF and added source/test lines ≤140 characters. Accepted reported test and mutation evidence; no tests rerun or files written.