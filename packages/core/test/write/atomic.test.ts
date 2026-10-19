import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, renameSync, unlinkSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFilesAtomically, type AtomicEntry, type AtomicIo } from "../../src/write/atomic.js";

describe("writeFilesAtomically", () => {
  let dir: string;
  const realIo: AtomicIo = { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync };
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "pokemap-atomic-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const temps = () => readdirSync(dir).filter(name => name.includes(".pokemap-tmp-"));
  const entries = (): [AtomicEntry, AtomicEntry, AtomicEntry] => {
    const file = (name: string, before: Buffer | null): AtomicEntry => {
      const path = join(dir, name);
      if (before !== null) writeFileSync(path, before);
      return { path, before, after: Buffer.from(`new-${name}`) };
    };
    return [file("first", Buffer.from("old-first")), file("second", null), file("third", Buffer.from("old-third"))];
  };
  const unchanged = (files: AtomicEntry[]) => {
    for (const file of files) {
      if (file.before === null) expect(existsSync(file.path)).toBe(false);
      else expect(readFileSync(file.path)).toEqual(file.before);
    }
  };
  const message = (run: () => void): string => {
    try { run(); } catch (error) {
      expect(error).toBeInstanceOf(Error);
      return (error as Error).message;
    }
    throw new Error("Expected the writer to throw");
  };

  // Fail the chosen real call, optionally after creating a partial stage file.
  const failingIo = (method: "writeFileSync" | "renameSync", nth: number, partial = false) => {
    let calls = 0;
    const swapped: string[] = [];
    const io: AtomicIo = {
      ...realIo,
      writeFileSync(path, data, options) {
        if (method === "writeFileSync" && ++calls === nth) {
          if (partial) writeFileSync(path, data.subarray(0, Math.floor(data.length / 2)), options);
          throw new Error("injected write failure");
        }
        writeFileSync(path, data, options);
      },
      renameSync(from, to) {
        if (method === "renameSync" && ++calls === nth) throw new Error("injected rename failure");
        renameSync(from, to);
        swapped.push(to);
      },
    };
    return { io, swapped };
  };

  it("writes exact CRLF, binary and no-final-newline bytes, including an absent target", () => {
    const files = entries();
    files[0].after = Buffer.from("one\r\ntwo\r\n");
    files[1].after = Buffer.from([0, 255, 128, 13, 10]);
    files[2].after = Buffer.from("no final newline");
    writeFilesAtomically(files);
    for (const file of files) expect(readFileSync(file.path)).toEqual(file.after);
    expect(temps()).toEqual([]);
  });

  it("does no IO for an empty list", () => {
    const unexpected = () => { throw new Error("unexpected IO"); };
    writeFilesAtomically([], {
      existsSync: unexpected, readFileSync: unexpected, writeFileSync: unexpected,
      renameSync: unexpected, unlinkSync: unexpected,
    });
    expect(readdirSync(dir)).toEqual([]);
  });

  for (const nth of [1, 2, 3]) {
    for (const partial of [false, true]) {
      it(`cleans up stage write ${nth} failure (partial=${partial}) without changing three targets`, () => {
        const files = entries();
        const { io, swapped } = failingIo("writeFileSync", nth, partial);
        const error = message(() => writeFilesAtomically(files, io));
        expect(error).toContain("injected write failure");
        expect(error).toContain(files[nth - 1]!.path);
        expect(error).not.toContain("temp not removed:");
        unchanged(files);
        expect(swapped).toEqual([]);
        // Removing cleanup leaves earlier stage files, or the partial failed write, behind.
        expect(temps()).toEqual([]);
      });
    }
  }

  for (const nth of [1, 2, 3]) {
    it(`rolls back rename ${nth} failure, including deletion of an originally absent target`, () => {
      const files = entries();
      const { io, swapped } = failingIo("renameSync", nth);
      const rename = io.renameSync;
      let observedSwap = false;
      io.renameSync = (from, to) => {
        if (to === files[nth - 1]!.path && nth > 1) {
          for (const file of files.slice(0, nth - 1)) {
            expect(readFileSync(file.path)).toEqual(file.after);
          }
          observedSwap = true;
        }
        rename(from, to);
      };
      const error = message(() => writeFilesAtomically(files, io));
      expect(error).toContain("injected rename failure");
      expect(error).toContain(files[nth - 1]!.path);
      expect(swapped).toEqual(files.slice(0, nth - 1).map(file => file.path));
      expect(observedSwap).toBe(nth > 1);
      if (nth > 1) {
        expect(error.indexOf("restored:")).toBeGreaterThan(error.indexOf("injected rename failure"));
        for (const file of files.slice(0, nth - 1)) expect(error).toContain(file.path);
      }
      // Removing rollback leaves the first file changed (and the second newly created at nth=3).
      unchanged(files);
      expect(temps()).toEqual([]);
    });
  }

  for (const change of ["bytes", "created", "deleted"] as const) {
    it(`refuses a target ${change} change on disk before any rename`, () => {
      const files = entries();
      const changed = files[change === "created" ? 1 : 2];
      if (change === "deleted") unlinkSync(changed.path);
      else writeFileSync(changed.path, Buffer.from("outside edit"));
      const { io, swapped } = failingIo("renameSync", 99);
      expect(() => writeFilesAtomically(files, io)).toThrow(
        `${changed.path} changed on disk since the save was previewed; reopen Save to review`,
      );
      expect(swapped).toEqual([]);
      expect(readFileSync(files[0].path)).toEqual(files[0].before);
      if (change === "deleted") expect(existsSync(changed.path)).toBe(false);
      else expect(readFileSync(changed.path)).toEqual(Buffer.from("outside edit"));
      expect(temps()).toEqual([]);
    });
  }

  for (const method of ["existsSync", "readFileSync"] as const) {
    it(`cleans staged temps and locates a check-step ${method} failure`, () => {
      const files = entries();
      const { io, swapped } = failingIo("renameSync", 99);
      io[method] = () => { throw new Error("check IO failure"); };
      const error = message(() => writeFilesAtomically(files, io));
      expect(error).toContain("check IO failure");
      expect(error).toContain(files[0].path);
      unchanged(files);
      expect(swapped).toEqual([]);
      expect(temps()).toEqual([]);
    });
  }

  it("uses exclusive wx creation and retries a collision without owning the foreign file", () => {
    const files = entries();
    let foreign = "";
    let attempts = 0;
    const { io } = failingIo("renameSync", 1);
    io.writeFileSync = (path, data, options) => {
      expect(options?.flag).toBe("wx");
      expect(path).toMatch(/\.pokemap-tmp-\d+-[0-9a-f]+$/);
      if (++attempts === 1) {
        foreign = path;
        writeFileSync(foreign, Buffer.from("foreign"));
      } else expect(path).not.toBe(foreign);
      // The first call really throws EEXIST from the exclusive filesystem create.
      writeFileSync(path, data, options);
    };
    expect(() => writeFilesAtomically(files, io)).toThrow("injected rename failure");
    expect(attempts).toBe(4);
    unchanged(files);
    expect(readFileSync(foreign)).toEqual(Buffer.from("foreign"));
    expect(temps()).toEqual([foreign.slice(dir.length + 1)]);
  });

  it("leaves an unrelated pre-existing foreign temp untouched during cleanup", () => {
    const files = entries();
    const foreign = join(dir, "first.pokemap-tmp-9999-abcdef");
    writeFileSync(foreign, Buffer.from("foreign"));
    const { io } = failingIo("writeFileSync", 3, true);
    expect(() => writeFilesAtomically(files, io)).toThrow("injected write failure");
    unchanged(files);
    expect(readFileSync(foreign)).toEqual(Buffer.from("foreign"));
    expect(temps()).toEqual(["first.pokemap-tmp-9999-abcdef"]);
  });

  it("reports successful restores, failed restores and leftover temps after the original cause, and continues cleanup", () => {
    const files = entries();
    const { io } = failingIo("renameSync", 3);
    const leftover: string[] = [];
    io.writeFileSync = (path, data, options) => {
      if (path === files[0].path) throw new Error("restore failure");
      writeFileSync(path, data, options);
    };
    io.unlinkSync = path => {
      if (path.includes(".pokemap-tmp-")) {
        leftover.push(path);
        throw new Error("cleanup failure");
      }
      unlinkSync(path);
    };
    const error = message(() => writeFilesAtomically(files, io));
    const restored = `restored: ${files[1].path}`;
    const notRestored = `not restored: ${files[0].path} (restore it from version control or your editor's copy)`;
    expect(error).toContain(restored);
    expect(error).toContain(notRestored);
    expect(error).not.toContain(`; restored: ${files[0].path}`);
    expect(error).toContain(`temp not removed: ${leftover[0]} (delete it)`);
    expect(error.indexOf(restored)).toBeGreaterThan(error.indexOf("injected rename failure"));
    expect(error.indexOf(notRestored)).toBeGreaterThan(error.indexOf(restored));
    expect(error.indexOf("temp not removed:")).toBeGreaterThan(error.indexOf(notRestored));
    expect(readFileSync(files[0].path)).toEqual(files[0].after);
    expect(existsSync(files[1].path)).toBe(false);
    expect(readFileSync(files[2].path)).toEqual(files[2].before);
    expect(leftover).toHaveLength(1);
    expect(temps()).toHaveLength(1);
  });

  it("reports a failed rollback deletion and still restores the next swapped target", () => {
    const original = entries();
    const files: [AtomicEntry, AtomicEntry, AtomicEntry] = [original[1], original[2], original[0]];
    const { io } = failingIo("renameSync", 3);
    io.unlinkSync = path => {
      if (path === files[0].path) throw new Error("delete restore failure");
      unlinkSync(path);
    };
    const error = message(() => writeFilesAtomically(files, io));
    expect(error).toContain(`not restored: ${files[0].path} (restore it from version control or your editor's copy)`);
    expect(error).toContain(`restored: ${files[1].path}`);
    expect(readFileSync(files[0].path)).toEqual(files[0].after);
    expect(readFileSync(files[1].path)).toEqual(files[1].before);
    expect(temps()).toEqual([]);
  });

  it("continues removing later temps after an unlink failure and never unlinks a failed rename target", () => {
    const files = entries();
    const { io } = failingIo("renameSync", 1);
    const unlinks: string[] = [];
    io.unlinkSync = path => {
      unlinks.push(path);
      if (unlinks.length === 1) throw new Error("cleanup failure");
      unlinkSync(path);
    };
    const error = message(() => writeFilesAtomically(files, io));
    expect(unlinks).toHaveLength(3);
    expect(unlinks.every(path => path.includes(".pokemap-tmp-"))).toBe(true);
    expect(error).toContain(`temp not removed: ${unlinks[0]} (delete it)`);
    expect(error.indexOf("temp not removed:")).toBeGreaterThan(error.indexOf("injected rename failure"));
    expect(temps()).toHaveLength(1);
    unchanged(files);
  });
});
