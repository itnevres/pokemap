import { InvalidArgumentError } from "commander";

// 1,000 rings is already 2,000 metatiles of padding per side -- absurdly
// generous for anything this tool renders. The cap exists because a
// non-negative integer alone is not enough: --border 4294967296 sailed
// through /^\d+$/ and reached Buffer.copy as "Invalid typed array length:
// 3.022314556777135e+23", and --border 100000 reached it as "Array buffer
// allocation failed" -- both naming node:buffer or V8 internals, not the
// user's flag, exactly what this guard exists to prevent.
const MAX_BORDER_RINGS = 1000;

/**
 * commander's `argParser` callback for `--border`. Rejects anything that is
 * not a non-negative integer no greater than MAX_BORDER_RINGS, at the option
 * boundary, rather than letting a bad value travel all the way to
 * `Buffer.copy` inside the renderer.
 */
export function parseBorder(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError(`--border must be a non-negative integer, got ${JSON.stringify(value)}`);
  }
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n > MAX_BORDER_RINGS) {
    throw new InvalidArgumentError(`--border must be between 0 and ${MAX_BORDER_RINGS}, got ${value}`);
  }
  return n;
}

export type TimeOfDay = "morn" | "day" | "nite";

/**
 * commander's `argParser` for `render --time` (GBC only -- Task 10). Rejects
 * anything but the three real clock values at the option boundary, the same
 * "name the flag, refuse rather than guess" shape as `parseBorder`/
 * `parseScale` above, instead of letting a typo travel into
 * `resolveFromTables`'s `clockIndexByOption` lookup as `undefined` and
 * silently fall back to whatever that lookup's own default happens to be.
 */
export function parseTime(value: string): TimeOfDay {
  if (value !== "morn" && value !== "day" && value !== "nite") {
    throw new InvalidArgumentError(`--time must be one of morn, day, nite, got ${JSON.stringify(value)}`);
  }
  return value;
}

export interface Bbox { x: number; y: number; w: number; h: number; }

/**
 * commander's `argParser` for `render-world --bbox`. Four comma-separated
 * integers, width/height strictly positive -- rejected here rather than
 * travelling as NaN into render-world's culling test (`p.x + p.width <= bx
 * || ...`, where a NaN comparison is always false, silently disabling that
 * exclusion instead of throwing) or into `blitScaled`'s destination offset
 * (a NaN index is a silent no-op write on a Uint8ClampedArray, so `drawn++`
 * would still count a map that painted nothing). x/y may be negative --
 * a bbox legitimately can start before the world origin -- but a
 * zero-or-negative width/height would reach `createRaster` as a silently
 * empty buffer rather than a refusal naming this flag.
 */
export function parseBbox(value: string): Bbox {
  const parts = value.split(",");
  if (parts.length !== 4 || parts.some((p) => !/^-?\d+$/.test(p))) {
    throw new InvalidArgumentError(`--bbox must be four comma-separated integers x,y,w,h, got ${JSON.stringify(value)}`);
  }
  const [x, y, w, h] = parts.map(Number) as [number, number, number, number];
  if (w <= 0 || h <= 0) {
    throw new InvalidArgumentError(`--bbox width and height must be positive, got w=${w} h=${h}`);
  }
  return { x, y, w, h };
}

/**
 * commander's `argParser` for `render-world --scale`. The exact
 * unvalidated-input problem parseBbox exists to prevent, in the same
 * command: `Number(opts.scale)` let "abc" become NaN (createRaster(NaN,
 * NaN) is a raster with NaN dimensions, not a throw) and "0" become a
 * silently empty 0x0 PNG, both failing confusingly downstream instead of
 * naming --scale.
 */
export function parseScale(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError(`--scale must be a positive integer, got ${JSON.stringify(value)}`);
  }
  const n = Number(value);
  if (n <= 0) {
    throw new InvalidArgumentError(`--scale must be a positive integer, got ${JSON.stringify(value)}`);
  }
  return n;
}
