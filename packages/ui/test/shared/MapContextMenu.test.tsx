import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useMapContextMenu } from "../../src/shared/MapContextMenu.js";

type Options = Parameters<typeof useMapContextMenu>[0];
function Harness(props: Options) {
  const { onContextMenu, element } = useMapContextMenu(props);
  return <><canvas aria-label="Map" width={400} height={300} onContextMenu={onContextMenu} />{element}</>;
}
function mount() {
  const options: Options = {
    cellAt: vi.fn().mockReturnValue({ x: 2, y: 1 }),
    disabledReason: vi.fn().mockReturnValue(null), onEditBlock: vi.fn(),
    resetKey: "Foo", viewport: { w: 400, h: 300 },
  };
  const host = render(<Harness {...options} />);
  const canvas = host.container.querySelector("canvas")!;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON() {} });
  // This unit seam stubs cellAt, so pointer (40,24) is only a menu anchor: relative (40-0,24-0).
  // Geometry is tested by the family surfaces; no cell oracle is derived from this stubbed pointer.
  const open = () => fireEvent.contextMenu(canvas, { clientX: 40, clientY: 24, button: 2 });
  return { ...host, options, open };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("useMapContextMenu (Task 14a)", () => {
  it("right-click opens a one-item menu and prevents the browser menu", () => {
    const { open, options } = mount();
    expect(open()).toBe(false);
    expect(options.cellAt).toHaveBeenCalledTimes(1);
    const items = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(items).toHaveLength(1);
    expect(screen.getByRole("menuitem", { name: "Edit block" })).toBe(items[0]);
    expect((items[0] as HTMLButtonElement).disabled).toBe(false);
  });

  it("choosing the item calls onEditBlock with the cell and closes", () => {
    const { open, options } = mount();
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit block" }));
    expect(options.onEditBlock).toHaveBeenCalledTimes(1);
    expect(options.onEditBlock).toHaveBeenCalledWith({ x: 2, y: 1 });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("outside the interior the item is disabled with its hint", () => {
    const { open, options } = mount();
    vi.mocked(options.cellAt).mockReturnValue(null);
    expect(open()).toBe(false);
    const item = screen.getByRole("menuitem", { name: /Edit block.*Not a map cell/ });
    expect((item as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(item);
    expect(options.onEditBlock).not.toHaveBeenCalled();
  });

  it("disables the item while a mutation is pending", () => {
    const { open, options } = mount();
    vi.mocked(options.disabledReason).mockReturnValue("Wait for the current change to finish");
    open();
    expect((screen.getByRole("menuitem", { name: /Edit block.*Wait for the current change to finish/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("pending at choose time blocks the edit and closes the menu", () => {
    const { open, options } = mount();
    open();
    const item = screen.getByRole("menuitem", { name: "Edit block" }) as HTMLButtonElement;
    expect(item.disabled).toBe(false);
    vi.mocked(options.disabledReason).mockReturnValue("Wait for the current change to finish");
    fireEvent.click(item);
    expect(options.onEditBlock).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Escape, an outside click and a resetKey change each close the menu", () => {
    const { open, options, rerender } = mount();
    open(); expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    open(); expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
    open(); expect(screen.getByRole("menu")).toBeTruthy();
    rerender(<Harness {...options} resetKey="Bar" />);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("spends Escape before a later window bubble listener observes it", () => {
    const { open } = mount();
    open();
    const prevented = vi.fn();
    const listener = (event: KeyboardEvent) => prevented(event.defaultPrevented);
    window.addEventListener("keydown", listener);
    try {
      fireEvent.keyDown(window, { key: "Escape" });
      expect(prevented).toHaveBeenCalledTimes(1);
    expect(prevented).toHaveBeenCalledWith(true);
      expect(screen.queryByRole("menu")).toBeNull();
    } finally { window.removeEventListener("keydown", listener); }
  });
});
