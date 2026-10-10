# Task 5b cached-image live-fix quality rereview

**Verdict: APPROVED for the scoped frozen change. Open findings: 0 blocker, 0 important, 0 minor.** Static source/test review only; coordinator full gate and live confirmation remain separate.

## Scope and evidence

- Compared `0d5ba4c254ef34d39604ae70b4a8fab243c28db6..f8c88d0971a02f7a11f7e31fafcc2360aaffd76a`. Read actual production source and changed tests with `git show f8c88d0:path`, independently of the diff and implementer narrative. No moving working source was read while the coordinator held the mutation slot.
- The range contains one production change, in `packages/ui/src/gbc/GbcMapCanvas.tsx`, additive tests in `GbcMapCanvasView.test.tsx` and `GbcAppContext.test.tsx`, and the existing combined fix report added by its earlier docs commit. Production change is 14 diff lines, replacing the image-loaded boolean with URL-tagged readiness and checking mounted image metadata.
- The appended live-continuation section of `task-5b-fix.md` is absent from the source freeze's report version. Located its committed update through the report's Git history and read the last section at **`83dab236269b44a9973590c32f1bba4acd90879a`**, using `git show` only. Source/test conclusions remain pinned to f8c88d0; later docs are explicitly separate evidence.
- Read the full frozen controlled/chromeless test file, the new real App witness and its setup/helpers, the component's readiness/fit/composite/blit effects and image JSX, and supporting existing MapCanvas tests for load, time-switch fit preservation, manual fit and uncontrolled view behavior.
- Standard quality-review scope. This is the same harness-provided GPT-6 reviewer; no actual Sonnet model selection is claimed. The frontend-design guidance already loaded for Task 5b remains applicable; this patch changes no design or controls.
- No tests, mutations, browser operations, servers, commits, subagents, implementation changes, or report archival. The sole write is this report. No passing test count, mutation kill, raster alpha result or successful live resolution is claimed as independently executed here.

All source/test locations below refer to **f8c88d0**.

## Cached mount and early-load trace

`packages/ui/src/gbc/GbcMapCanvas.tsx:318` stores `loadedImageUrl`, initially null. The current image URL remains derived from encoded map name, one-block border, time and optional paint version (`:373–376`). Readiness is equality with that current URL, rather than an unqualified historical load flag.

The URL effect at `:416–422` reads the mounted image ref. It marks the URL ready only when `complete === true` and `naturalWidth > 0`. A cached successful image can therefore establish readiness without waiting for an unobserved future event. The ordinary `onImgLoad` callback at `:459` still records the current URL for a cold image's later successful load. An actual successful load observed before the passive URL effect is no longer followed by an unconditional false reset: the effect observes the complete image and records the same URL.

The source mechanism matches the reported blank-base diagnosis. Step1 returns while unready; on readiness it creates/reuses the base canvas, sets its dimensions, clears it, and draws the mounted source image (`:463–477`). After overlay composition it increments `compositeVersion` (`:500`). Step2 then blits that base at the existing view (`:512–534`). The fix supplies the missing readiness transition; it does not depend on a zoom gesture to create a base or change viewport dependencies.

StrictMode effect replay is safe for this change: the readiness effect writes an idempotent URL/null value, creates no listener or pending task, and has no cleanup that resets a successful load. Composite redraws still use their existing effects and state. A fresh overlay mount starts with fresh readiness and base refs, so reentry must initialize its own source/base/stage chain rather than inheriting a previous stage's pixels.

The appended report distinguishes the grounded missing-readiness defect from an unobserved exact browser event timeline. That distinction is warranted. The coordinator's reported decoded source and blank stage support the diagnosis, but static code and mocked draw calls do not independently prove the live browser's precise ordering or restored alpha pixels.

## URL transitions and incomplete/failed images

For a loaded URL A changing to URL B, the first render sees `loadedImageUrl=A` and `imageUrl=B`, making `imgLoaded` false immediately. Step1 cannot treat A's ready state as B's permission to composite. The URL effect then either records B if its mounted image is already complete with positive width, or null while it waits. A later real load records B. Both paths provide a false→true readiness transition and rebuild the base.

This handles the ready-A→cached-ready-B case that a plain boolean would miss: even though both images are decoded, URL equality is false in between. The unchanged composite effect depends on `imgLoaded` (`:508`), so it is triggered for B instead of leaving A's composite indefinitely. Map name, time and paint-version changes all pass through the same URL boundary. No render URL format, debounce, transport fetch, or cache version policy was changed.

An incomplete image fails the `complete` condition. A complete-but-broken image with naturalWidth0 fails the width condition. Neither is admitted by the mounted-image fast path. The successful browser load handler remains the existing event-based path; this change does not add a synthetic success for an error event, retry loop, polling, or image-error suppression. No claim is made that a deliberately fabricated DOM load event with failed metadata models a browser image failure.

Step2 retains its previously composed base while a replacement source is pending; the patch neither clears that base on URL change nor adds a new stale-frame policy. The relevant requirement here is avoiding recomposition from an incomplete/failed source and correctly rebuilding once the new URL is ready. No new regression in that boundary was found.

## Controlled view and ordinary Map loading

The controlled/uncontrolled view decision and updater at `:325–343` are unchanged. The fit effect at `:441–457` still invokes `fit()` only when the image is ready, the map has not already been fitted, and the component is **uncontrolled**. A controlled cached image may now become ready earlier, but it does not call the fit function or report a fitted view to its parent. The World snap remains responsible for placement.

For an uncontrolled map, the same readiness transition enables its existing once-per-map fit. `fittedForMapRef` remains keyed by map name: time or paint-version image refreshes do not reset it. A different map becomes eligible for its own fit once its image is ready. Existing fit calculations, nearest-neighbour drawing, manual Fit, viewport measurement, canvas sizing, composite origin, overlays and gesture callbacks are unchanged.

The change is confined to GBC MapCanvas readiness. No GBA/shared math/App host/World snap/dirty guard/tileVersions/session code is changed. This preserves the previous static review's fixes while addressing the separately discovered loaded-image entry lifecycle. No accidental controlled fit or ordinary Map-load regression was identified from the changed source.

## Independent test assessment

`packages/ui/test/gbc/GbcMapCanvasView.test.tsx:199–228` adds normal and StrictMode cached mount/reentry cases. Each sets complete and positive natural dimensions before rendering, uses no `fireEvent.load` or input gesture, unmounts/remounts, and requires a fresh stage on each visit. It checks the actual mounted image is drawn into a distinct base, the stage blits that base at pan(7,-3)/zoom2, the expected stage dimensions, and no `onViewChange` call. These assertions directly exercise missing base initialization and controlled placement rather than merely checking that an image element exists.

The fixture is a 2×1 map with a one-block ring: native composite128×96. At zoom2 the expected draw destination is(7,-3), size256×192. Those dimensions follow `(layout+2)*32`; they are not image-loader timing substitutes.

`:230–235` specifically covers complete-but-broken metadata (`complete=true`, width0) and requires no stage draw. Its title also mentions incomplete images, but that individual case is the broken-image branch; the next cold URL-transition case supplies the incomplete branch. The source explicitly requires both readiness conditions.

`:237–260` first builds a ready day image, clears base/stage draw logs, then changes to nite under the same controlled view. For the cold case it sets complete false/width0, requires no base recomposition, then simulates the later successful load. For the cached case it remains complete/positive and uses no load event. Both require the mounted image to be drawn into the existing base and then blitted at the preserved controlled transform. This catches the true→true boolean-only mistake documented in the implementer report. The added `restoreAllMocks` at `:114` restores the metadata getter spies after each test.

Existing tests at `:143–147` retain the normal controlled load/no-fit callback assertion; `:190–194` retain uncontrolled load and owned-view behavior. The existing ordinary MapCanvas suite still contains time-load recomposition and no-refit-on-time assertions, plus manual Fit behavior. These were inspected for relevance, not run.

`packages/ui/test/gbc/GbcAppContext.test.tsx:166–209` exercises the real App under StrictMode with the coherent10×10 map/world fixture. It prepopulates mounted-image readiness (384×384 including the ring), enters context, waits for the actual overlay stage, then checks image→base→stage drawing with destination(-42,-92), size384×384. That transform follows the existing Port placement/snap/ring math. It exits with Done and reenters, requires distinct overlay stages, and retains the original world canvas and editing-body nodes on both visits. No load event, zoom, paint or save is used; the final call assertion excludes all edit requests. The drawing-command stub is restored in `finally`, and getter spies use the suite's existing mock cleanup.

These tests independently target component and actual App boundaries. Their stubs model decoded readiness and drawing commands; they do not decode PNGs, measure raster alpha, or recreate a browser's cache event scheduling. The source/fixture assertions are appropriately narrower than live confirmation.

## Implementer evidence and handoff

The appended report at83dab236 records tests-first failures, the rejected boolean-only candidate's cached URL-transition failure, final focused counts14 view /23 App context /21 editing /53 ordinary canvas (111 total), typecheck/build success, and F3/F4/F5 restored mutation proofs. These are **implementer-reported executions**, not this reviewer's executions. The reported total is correctly separate from the previous overlapping293 tests. F3/F4 remove cached readiness at component/App boundaries; F5 drops URL equality and catches the cached transition. The source and newly committed assertions align with those mutation targets, but no mutation result was independently rerun here.

**No scoped findings remain; no additional implementation change is recommended by this pass.** Coordinator owns the serial full gate and live initial entry/multiple reentries, including full-stage alpha scans without zoom/load injection and any live URL/time recovery check. Static approval of f8c88d0 does not turn those pending checks into a passing live verdict.
