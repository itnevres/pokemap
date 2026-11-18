Needs changes — Critical: 0, Important: 2, Minor: 0.

1. **Important — Late replies can restore another project’s version after reset.**  
   `packages/ui/src/hooks/useMapLayout.ts:63` calls `noteTilesetVersion` before checking `cancelled`; `packages/ui/src/shared/useEditSessionCore.ts:92` likewise notes successful responses without checking project ownership.  
   **Failure scenario:** project A has a pending response carrying version 50. Switching to project B unmounts `FamilyApp` and resets the store, but A’s response subsequently sets it back to 50. B’s versions 1–50 are then ignored, so successive tileset edits stop changing image URLs and can leave stale pixels displayed.  
   Guard announcements with a project-generation identity retired on switch. Preserve max-only handling for out-of-order replies within the same project. Add a delayed-response regression covering reset followed by an old project’s reply.

2. **Important — Discard never announces the reverted tileset version.**  
   `packages/ui/src/shared/useEditSessionCore.ts:92` adds version handling only to `post`; the separate `discard` implementation at lines 138–151 fetches directly and never reads its response body. Both server discard handlers return the updated `tilesetVersion`.  
   **Failure scenario:** a staged tileset edit is displayed at `tv=5`; the user discards while staying in the editing workspace. The server removes the overlay and returns version 6, but the client remains at 5. Palette URLs remain unchanged, retaining staged thumbnails; other mounted views sharing those tilesets also receive no invalidation.  
   Read and announce the discard response’s version with project ownership protection, while retaining the existing local-state reset rather than merging its empty session payload. Add a discard-to-mounted-palette regression.

Other quality observations: all six `/api/render/` and `/api/metatile/` builders are covered. World adapters read the current version at call time; their stable `imageUrl` identity is compensated by rebuilding `world`, which changes `visible` and reruns `useWorldTiles`. This works statically, though it couples image invalidation to placement recomputation. No additional blocking duplication or dead-code issue found.

Not checked: runtime behavior, tests, typecheck, build, or mutations. Conductor evidence remains unverified. Reviewed the scoped diff at `f6cedeb` and relevant lifecycle consumers; `git diff --check` passed. No files edited.