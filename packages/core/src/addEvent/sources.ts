import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, extname, resolve, relative, isAbsolute } from "node:path";

// Only the test snapshot is immutable. Never cache reads of live projects. Tests register it once through
// setImmutableRoot (vitest setupFiles); production never calls it, so nothing here is cached.
let immutableRoot: string | undefined;
const fileLists = new Map<string, string[]>();
const texts = new Map<string, string>();
export function setImmutableRoot(root: string | undefined): void {
  immutableRoot = root ? resolve(root) : undefined;
  fileLists.clear(); texts.clear();
}
function immutablePath(path: string): boolean {
  if (!immutableRoot) return false;
  const rel = relative(immutableRoot, resolve(path));
  return rel !== ".." && !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(rel);
}

/** Only regular text files; never follow directory junctions or read directories. */
export function textFiles(root: string, extensions: readonly string[]): string[] {
  const cacheable = immutablePath(root);
  const key = JSON.stringify([resolve(root), [...extensions].sort()]);
  const cached = cacheable ? fileLists.get(key) : undefined;
  if (cached) return [...cached];
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const p = join(root, e.name);
    if (e.isDirectory()) out.push(...textFiles(p, extensions));
    else if (e.isFile() && extensions.includes(extname(p).toLowerCase())) out.push(p);
  }
  out.sort();
  if (cacheable) fileLists.set(key, out);
  return [...out];
}
export function read(p: string): string {
  if (!immutablePath(p)) return readFileSync(p, "utf8");
  const key = resolve(p);
  let text = texts.get(key);
  if (text === undefined) { text = readFileSync(p, "utf8"); texts.set(key, text); }
  return text;
}
export const optionName = (n: string): boolean => !/^NUM_|_COUNT$|_START$|_END$/.test(n);
export function cDefines(text: string): { name: string; value: string }[] {
  return [...text.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/^\s*#define[ \t]+([A-Za-z_]\w*)[ \t]+([^\r\n]+)/gm)]
    .map(m => ({ name: m[1]!, value: m[2]!.replace(/\/\/.*$/, "").trim() }))
    .filter(d => d.value !== "");
}
