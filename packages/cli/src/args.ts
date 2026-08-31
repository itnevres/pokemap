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
