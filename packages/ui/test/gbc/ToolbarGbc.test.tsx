import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Toolbar } from "../../src/components/Toolbar.js";
import { SaveDialog } from "../../src/components/SaveDialog.js";
import { GBA_CAPABILITIES, GBC_CAPABILITIES } from "../../src/shell/adapter.js";
import { GBC_TOOLS } from "../../src/gbc/GbcMapEditing.js";

afterEach(() => vi.unstubAllGlobals());

const base = {
  activeToolKind: null, onSelectTool: vi.fn(), isDirty: false, onUndo: vi.fn(), onRedo: vi.fn(),
  canUndo: false, canRedo: false, onOpenSave: vi.fn(), onDiscard: vi.fn(),
};
describe("Toolbar for GBC (additive props)", () => {
  it("renders the GBC Sign tool through the GBC tool wiring", () => {
    render(<Toolbar {...base} tools={GBC_TOOLS} availableTools={GBC_TOOLS} />);
    const group = screen.getByRole("group", { name: "Tools" });
    expect(Array.from(group.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Pencil", "Rect", "Bucket", "Dropper", "Shift", "Sign"]);
    expect(screen.queryByRole("button", { name: "Collision tool" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sign" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pok\u00e9mon Indicator" })).toBeNull();
  });

  it("unavailable tools are disabled with the supplied reason as title", () => {
    render(<Toolbar {...base} tools={GBC_TOOLS} availableTools={[]} unavailableTitle="this map's .blk is flagged non-writable: oversize" />);
    const b = screen.getByRole("button", { name: "Pencil" }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe("this map's .blk is flagged non-writable: oversize");
  });

  it("GBA default (no tools prop) still has six tools plus the sign button", () => {
    render(<Toolbar {...base} onOpenIndicator={vi.fn()} availableTools={[]} />);
    expect(screen.getByRole("group", { name: "Tools" }).querySelectorAll("button").length).toBe(7);
    expect(screen.getByRole("button", { name: "Pok\u00e9mon Indicator" })).toBeTruthy();
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

describe.each([GBA_CAPABILITIES, GBC_CAPABILITIES])("Indicator capability %j", capabilities => {
  it("shows the feature for either enabled family and hides it when disabled", () => {
    const open = vi.fn();
    const view = render(<Toolbar {...base} availableTools={[]} onOpenIndicator={capabilities.pokemonIndicator ? open : undefined} />);
    const button = screen.getByRole("button", { name: "Pok\u00e9mon Indicator" });
    expect(button.title).toBe("Pok\u00e9mon Indicator");
    fireEvent.click(button);
    expect(open).toHaveBeenCalledOnce();
    view.rerender(<Toolbar {...base} availableTools={[]} onOpenIndicator={undefined} />);
    expect(screen.queryByRole("button", { name: "Pok\u00e9mon Indicator" })).toBeNull();
  });
});
