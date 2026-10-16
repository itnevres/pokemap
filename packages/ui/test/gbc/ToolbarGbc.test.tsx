import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Toolbar, type ToolKind } from "../../src/components/Toolbar.js";
import { SaveDialog } from "../../src/components/SaveDialog.js";

afterEach(() => vi.unstubAllGlobals());

const base = {
  activeToolKind: null, onSelectTool: vi.fn(), isDirty: false, onUndo: vi.fn(), onRedo: vi.fn(),
  canUndo: false, canRedo: false, onOpenSave: vi.fn(), onDiscard: vi.fn(),
};
const GBC_TOOLS: ToolKind[] = ["pencil", "rect", "bucket", "dropper", "shift"];

describe("Toolbar for GBC (additive props)", () => {
  it("renders exactly the 5 GBC tools and no collision or sign button", () => {
    render(<Toolbar {...base} tools={GBC_TOOLS} availableTools={GBC_TOOLS} />);
    const group = screen.getByRole("group", { name: "Tools" });
    expect(Array.from(group.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Pencil", "Rect", "Bucket", "Dropper", "Shift"]);
    expect(screen.queryByRole("button", { name: "Collision" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add Sign" })).toBeNull();
  });

  it("unavailable tools are disabled with the supplied reason as title", () => {
    render(<Toolbar {...base} tools={GBC_TOOLS} availableTools={[]} unavailableTitle="this map's .blk is flagged non-writable: oversize" />);
    const b = screen.getByRole("button", { name: "Pencil" }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe("this map's .blk is flagged non-writable: oversize");
  });

  it("GBA default (no tools prop) still has six tools plus the sign button", () => {
    render(<Toolbar {...base} onOpenSignComposer={vi.fn()} availableTools={[]} />);
    expect(screen.getByRole("group", { name: "Tools" }).querySelectorAll("button").length).toBe(6);
    expect(screen.getByRole("button", { name: "Add Sign" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Pencil" }) as HTMLButtonElement).title).toBe("Not yet available");
  });
});

describe("SaveDialog with a GBC text change", () => {
  it("lists a kind: text change's summary", async () => {
    const plan = { changes: [{ path: "maps/NewBarkTown.asm", kind: "text", summary: "maps/NewBarkTown.asm -- 1 event moved" }], refusals: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(plan) }));
    render(<SaveDialog mapName="NewBarkTown" onCommitted={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("maps/NewBarkTown.asm -- 1 event moved")).toBeTruthy());
  });
});
