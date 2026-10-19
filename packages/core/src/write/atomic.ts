import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";

export interface AtomicEntry {
  path: string;
  before: Buffer | null;
  after: Buffer;
}

export interface AtomicIo {
  existsSync(path: string): boolean;
  readFileSync(path: string): Buffer;
  writeFileSync(path: string, data: Buffer, options?: { flag?: string }): void;
  renameSync(oldPath: string, newPath: string): void;
  unlinkSync(path: string): void;
}

const defaultIo: AtomicIo = { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync };
const errorCode = (error: unknown) => (error as NodeJS.ErrnoException | null)?.code;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

/**
 * Stages and checks all bytes before swapping; on failure, restores swapped targets and cleans temps best effort.
 * A crash or another program writing between the check and rename is outside this guarantee.
 */
export function writeFilesAtomically(entries: AtomicEntry[], io: AtomicIo = defaultIo): void {
  if (entries.length === 0) return;

  const ownedTemps = new Set<string>();
  const staged: { temp: string; entry: AtomicEntry }[] = [];
  const swapped: AtomicEntry[] = [];
  let operation = "";

  try {
    for (const entry of entries) {
      operation = `Failed to write temp file for ${entry.path}`;
      while (true) {
        const temp = `${entry.path}.pokemap-tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
        // A write may create a partial file before throwing, so ownership starts before the call.
        ownedTemps.add(temp);
        try {
          io.writeFileSync(temp, entry.after, { flag: "wx" });
          staged.push({ temp, entry });
          break;
        } catch (error) {
          if (errorCode(error) !== "EEXIST") throw error;
          // Exclusive creation failed: this name belongs to someone else.
          ownedTemps.delete(temp);
        }
      }
    }

    for (const entry of entries) {
      operation = `Failed to check ${entry.path}`;
      const current = io.existsSync(entry.path) ? io.readFileSync(entry.path) : null;
      if (entry.before === null ? current !== null : current === null || !entry.before.equals(current)) {
        operation = "";
        throw new Error(`${entry.path} changed on disk since the save was previewed; reopen Save to review`);
      }
    }

    for (const { temp, entry } of staged) {
      operation = `Failed to rename ${temp} to ${entry.path}`;
      io.renameSync(temp, entry.path);
      ownedTemps.delete(temp);
      swapped.push(entry);
    }
  } catch (error) {
    const messages = [operation ? `${operation}: ${errorMessage(error)}` : errorMessage(error)];
    const restored: string[] = [];
    const notRestored: string[] = [];
    const targetFix = "restore it from version control or your editor's copy";
    for (const entry of swapped) {
      try {
        if (entry.before === null) io.unlinkSync(entry.path);
        else io.writeFileSync(entry.path, entry.before);
        restored.push(entry.path);
      } catch {
        notRestored.push(entry.path);
      }
    }
    for (const path of restored) messages.push(`restored: ${path} (${targetFix})`);
    for (const path of notRestored) messages.push(`not restored: ${path} (${targetFix})`);
    for (const temp of ownedTemps) {
      try {
        io.unlinkSync(temp);
      } catch (cleanupError) {
        // A failed create can leave no file; that is already clean.
        if (errorCode(cleanupError) !== "ENOENT") messages.push(`temp not removed: ${temp} (delete it)`);
      }
    }
    throw new Error(messages.join("; "));
  }
}

/** SHA-256 of ordered, unambiguously framed paths and before/after bytes. */
export function planFingerprint(entries: AtomicEntry[]): string {
  const hash = createHash("sha256");
  const field = (bytes: Buffer): void => {
    const length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(bytes.length));
    hash.update(length);
    hash.update(bytes);
  };
  for (const entry of entries) {
    field(Buffer.from(entry.path, "utf8"));
    hash.update(Buffer.from([entry.before === null ? 0 : 1]));
    if (entry.before !== null) field(entry.before);
    field(entry.after);
  }
  return hash.digest("hex");
}
