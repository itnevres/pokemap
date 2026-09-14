import { describe, it, expect } from "vitest";
import { EditCommandStack, type EditCommand } from "../../src/edit/commands.js";
import type { EditSession } from "../../src/write/save.js";
import type { Block } from "../../src/model/types.js";

function fakeSession(blocks: Block[]): EditSession {
  return {
    mapName: "Test", layout: {} as any, blocks, border: [], map: {} as any,
    originalBlocks: blocks.map((b) => ({ ...b })), originalMap: {} as any,
    originalMapJson: "{}", jsonEdits: [], insertOps: [], removeOps: [], isDirty: false,
  };
}

/** A minimal command: replaces session.blocks wholesale, storing enough to
 *  revert -- the same shape a real paint-stroke command (Task 6/8) uses. */
function setBlocksCommand(prev: Block[], next: Block[]): EditCommand {
  return {
    label: "paint",
    apply: (s) => { s.blocks = next; },
    revert: (s) => { s.blocks = prev; },
  };
}

describe("EditCommandStack", () => {
  it("apply mutates the session; undo reverts it exactly", () => {
    const session = fakeSession([{ metatileId: 1, collision: 0, elevation: 0 }]);
    const stack = new EditCommandStack();
    const prev = session.blocks;
    const next = [{ metatileId: 2, collision: 0, elevation: 0 }];
    stack.push(session, setBlocksCommand(prev, next));
    expect(session.blocks).toEqual(next);
    stack.undo(session);
    expect(session.blocks).toEqual(prev);
  });

  it("redo re-applies an undone command", () => {
    const session = fakeSession([{ metatileId: 1, collision: 0, elevation: 0 }]);
    const stack = new EditCommandStack();
    const prev = session.blocks;
    const next = [{ metatileId: 2, collision: 0, elevation: 0 }];
    stack.push(session, setBlocksCommand(prev, next));
    stack.undo(session);
    stack.redo(session);
    expect(session.blocks).toEqual(next);
  });

  it("pushing a new command after an undo discards the redo branch", () => {
    const session = fakeSession([{ metatileId: 1, collision: 0, elevation: 0 }]);
    const stack = new EditCommandStack();
    const a = [{ metatileId: 2, collision: 0, elevation: 0 }];
    const b = [{ metatileId: 3, collision: 0, elevation: 0 }];
    const c = [{ metatileId: 4, collision: 0, elevation: 0 }];
    stack.push(session, setBlocksCommand(session.blocks, a));
    stack.push(session, setBlocksCommand(a, b));
    stack.undo(session); // back to a
    stack.push(session, setBlocksCommand(a, c)); // branches away from b
    expect(session.blocks).toEqual(c);
    stack.redo(session); // nothing to redo -- b was discarded
    expect(session.blocks).toEqual(c);
  });

  it("undo is unbounded within a session -- undoing past the start is a no-op, not a throw", () => {
    const session = fakeSession([{ metatileId: 1, collision: 0, elevation: 0 }]);
    const stack = new EditCommandStack();
    expect(() => stack.undo(session)).not.toThrow();
    expect(session.blocks).toEqual([{ metatileId: 1, collision: 0, elevation: 0 }]);
  });

  it("isDirty is true after a push, false again after undoing back to the loaded state", () => {
    const session = fakeSession([{ metatileId: 1, collision: 0, elevation: 0 }]);
    const stack = new EditCommandStack();
    expect(stack.isDirty()).toBe(false);
    stack.push(session, setBlocksCommand(session.blocks, [{ metatileId: 2, collision: 0, elevation: 0 }]));
    expect(stack.isDirty()).toBe(true);
    stack.undo(session);
    expect(stack.isDirty()).toBe(false);
  });

  it("isDirty stays false across redo/undo cycles that return to the saved point, even after several pushes", () => {
    const session = fakeSession([{ metatileId: 1, collision: 0, elevation: 0 }]);
    const stack = new EditCommandStack();
    stack.push(session, setBlocksCommand(session.blocks, [{ metatileId: 2, collision: 0, elevation: 0 }]));
    stack.push(session, setBlocksCommand(session.blocks, [{ metatileId: 3, collision: 0, elevation: 0 }]));
    stack.undo(session);
    stack.undo(session);
    expect(stack.isDirty()).toBe(false);
  });

  it("markSaved() resets the clean point to the CURRENT position, not the original load -- isDirty goes false right after a save even with a full history behind it", () => {
    const session = fakeSession([{ metatileId: 1, collision: 0, elevation: 0 }]);
    const stack = new EditCommandStack();
    stack.push(session, setBlocksCommand(session.blocks, [{ metatileId: 2, collision: 0, elevation: 0 }]));
    stack.markSaved();
    expect(stack.isDirty()).toBe(false);
    stack.push(session, setBlocksCommand(session.blocks, [{ metatileId: 3, collision: 0, elevation: 0 }]));
    expect(stack.isDirty()).toBe(true);
    stack.undo(session); // back to the state markSaved() was called at
    expect(stack.isDirty()).toBe(false);
  });

  it("a stroke is one command -- undoing a multi-block paint reverts the WHOLE stroke in a single step", () => {
    // Simulates dragging a pencil across 40 tiles: the caller (Task 8's own
    // paint route) computes the FULL before/after block arrays for the
    // whole stroke and pushes ONE command, never one push per block.
    const start = Array.from({ length: 40 }, () => ({ metatileId: 0, collision: 0, elevation: 0 }));
    const session = fakeSession(start);
    const stack = new EditCommandStack();
    const strokeResult = start.map((b) => ({ ...b, metatileId: 7 })); // "painted" all 40 in one drag
    stack.push(session, setBlocksCommand(start, strokeResult));
    expect(session.blocks).toEqual(strokeResult);
    stack.undo(session);
    expect(session.blocks).toEqual(start); // ALL 40 reverted by one undo call
  });
});
