export type SignMode = "free" | "name" | "species";

export interface SignBlock {
  scriptLabel: string;
  textLabel: string | null;
  editable: boolean;
  reason: string | null;
  marker: { mode: SignMode; hash: string } | null;
  bodyStart: number;
  bodyEnd: number;
  body: string;
  paragraphs: string[][];
}

/** FNV-1a over UTF-8 bytes; source line endings do not affect the baseline. */
export function signHash(body: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(body.replace(/\r\n?/g, "\n"))) {
    hash = Math.imul(hash ^ byte, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function formatMarker(family: "gba" | "gbc", mode: SignMode, hash: string): string {
  return `${family === "gbc" ? ";" : "@"} pokemap:sign ${mode} ${hash}`;
}

export function parseMarker(line: string): { mode: SignMode; hash: string } | null {
  const match = /^\s*[;@] pokemap:sign (free|name|species) ([0-9a-f]{8})\s*$/.exec(line);
  return match ? { mode: match[1] as SignMode, hash: match[2]! } : null;
}
