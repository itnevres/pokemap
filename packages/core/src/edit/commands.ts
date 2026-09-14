import type { EditSession } from "../write/save.js";

export interface EditCommand {
  label: string;
  apply(session: EditSession): void;
  revert(session: EditSession): void;
}

/**
 * Unbounded undo/redo over one open EditSession. Owns only the stack
 * mechanics -- it has no idea what a "paint stroke" or "event move" is,
 * only that some caller decided one `EditCommand` is one undo step. A
 * stroke being a single command (not one per block) is a property of WHO
 * CALLS `push`, not of this class.
 *
 * `cleanIndex` is the stack position considered "matches what's on disk" --
 * `isDirty()` compares the current position against it, not against the
 * position the session first loaded at, so `markSaved()` (called right
 * after a successful `commitSave`) correctly moves the clean point forward
 * without needing to know or reset any of the session's own committed
 * blocks/map data (`planSave`/`commitSave` already read those live off the
 * session; the stack's only job is knowing WHETHER they differ from disk).
 */
export class EditCommandStack {
  private undoStack: EditCommand[] = [];
  private redoStack: EditCommand[] = [];
  private cleanIndex = 0;

  push(session: EditSession, command: EditCommand): void {
    command.apply(session);
    this.undoStack.push(command);
    this.redoStack = []; // pushing after an undo discards the redo branch
    session.isDirty = this.isDirty();
  }

  undo(session: EditSession): void {
    const command = this.undoStack.pop();
    if (!command) return; // unbounded but not infinite -- past the start is a no-op
    command.revert(session);
    this.redoStack.push(command);
    session.isDirty = this.isDirty();
  }

  redo(session: EditSession): void {
    const command = this.redoStack.pop();
    if (!command) return;
    command.apply(session);
    this.undoStack.push(command);
    session.isDirty = this.isDirty();
  }

  /** Call right after a successful commitSave. */
  markSaved(): void {
    this.cleanIndex = this.undoStack.length;
  }

  isDirty(): boolean {
    return this.undoStack.length !== this.cleanIndex;
  }
}
