/**
 * The GBC app-level time-of-day setting (Plan 6b Q3: one setting, not
 * per-view). Shared by `GbcApp` (the segmented control), `GbcMapCanvas`
 * (`?time=` on the render URL) and `GbcMetatilePalette` (`?time=` on each
 * metatile thumbnail) -- and Task 5/6's `GbcWorldCanvas`/
 * `GbcEncounterGutter` will need the identical type. Declared once here
 * (quality review finding 3) rather than redeclared per leaf component, so
 * a future consumer imports this instead of adding a 3rd/4th independent
 * copy of the same 3-value union.
 */
export type GbcTimeOfDay = "morn" | "day" | "nite";
