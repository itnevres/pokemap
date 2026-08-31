import { InvalidArgumentError } from "commander";

/**
 * commander's `argParser` callback for `--border`. Rejects anything that is
 * not a non-negative integer at the option boundary, rather than letting a
 * bad value travel all the way to `Buffer.copy` inside the renderer (which
 * throws `RangeError [ERR_OUT_OF_RANGE] ... Received NaN` naming node:buffer,
 * not the user's flag) or, worse, silently accepting a fractional ring count
 * and rendering an off-grid border.
 */
export function parseBorder(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError(`--border must be a non-negative integer, got ${JSON.stringify(value)}`);
  }
  return Number(value);
}
