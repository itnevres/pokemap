Needs changes

- **Not resolved — Minor, load lifecycle coverage:** `packages/ui/test/shared/useBlockEditor.test.tsx:796–807` resolves GET after unmount, but assertions would pass without the cancellation guard: `result.current` retains its last rendered value, and unmounted effects cannot schedule previews. Add an observable assertion that detects late GET processing.
- **New — Minor, preview lifecycle coverage:** `packages/ui/test/shared/useBlockEditor.test.tsx:828–841` has the same limitation: unchanged `result.current.previewSrc` after unmount does not prove the reply was ignored.

Read-only static review; conductor’s 103/103 result accepted as reported, not rerun.