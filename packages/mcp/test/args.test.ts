import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { parseMcpArgs } from "../src/args.js";

describe("parseMcpArgs", () => {
  it("accepts --project <path> and --project=<path>", () => {
    expect(parseMcpArgs(["--project", "D:\\a b"]).project).toBe("D:\\a b");
    expect(parseMcpArgs(["--project=D:\\a b", "--allow-writes"])).toEqual({ project: "D:\\a b", allowWrites: true });
    expect(parseMcpArgs([])).toEqual({ project: undefined, allowWrites: false });
  });
  it("a missing --project value is an error", () => {
    expect(() => parseMcpArgs(["--project"])).toThrow();
    expect(() => parseMcpArgs(["--project", "--allow-writes"])).toThrow();
  });
  it("an unknown option is an error", () => {
    expect(() => parseMcpArgs(["--allow-write"])).toThrow();
  });
});

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = join(HERE, "../src/index.ts");
const ROOT = join(HERE, "../../..");

async function writeRefusal(extra: string[]): Promise<string> {
  const t = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", INDEX, ...extra], cwd: ROOT, stderr: "ignore" });
  const c = new Client({ name: "t", version: "0" });
  await c.connect(t);
  try {
    // dry_run and a dash-leading map: with the flag on it stops at the argument check, never at a subject.
    const r = await c.callTool({ name: "pokemap_paint", arguments: { map: "--x", tool: "pencil", x: 0, y: 0, metatile: 0, dry_run: true } });
    return (r.content as { text: string }[])[0]!.text;
  } finally { await c.close(); }
}

describe("index.ts flag wiring (stdio)", () => {
  it("without --allow-writes a write tool names the flag; with it the call reaches the argument checks", async () => {
    expect(await writeRefusal([])).toMatch(/--allow-writes/);
    expect(await writeRefusal(["--allow-writes"])).toMatch(/must not start with "-"/);
  }, 60_000);
  it("exits nonzero on a missing --project value", async () => {
    const code = await new Promise<number | null>((res) => { const p = spawn(process.execPath, ["--import", "tsx", INDEX, "--project"], { cwd: ROOT, stdio: "ignore" }); p.on("close", res); });
    expect(code).not.toBe(0);
  }, 30_000);
});
