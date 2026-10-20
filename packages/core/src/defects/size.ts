import type { DataDefect } from "./types.js";

export function sizeDefect(file: string, actualBytes: number, expectedBytes: number, fixTarget: string): DataDefect {
  return {
    file,
    kind: "size",
    message: `${file}: actual size ${actualBytes} bytes, expected ${expectedBytes} bytes`,
    fix: `Change ${fixTarget} or trim/extend ${file} from ${actualBytes} to ${expectedBytes} bytes.`,
  };
}
