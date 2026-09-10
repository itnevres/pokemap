import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DungeonSidebar } from "../src/components/DungeonSidebar.js";

const DUNGEONS = [
  { id: "1", name: "Mt Moon", maps: ["MtMoon_1F", "MtMoon_B1F"] },
  { id: "2", name: "Safari Zone", maps: [] },
];

describe("DungeonSidebar", () => {
  it("lists every dungeon by name with its map count", () => {
    render(
      <DungeonSidebar
        dungeons={DUNGEONS}
        error={null}
        openId={null}
        onOpen={() => {}}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onSetMaps={vi.fn()}
        onDelete={vi.fn()}
        allMapNames={["MtMoon_1F", "MtMoon_B1F", "Route1"]}
      />,
    );
    expect(screen.getByText("Mt Moon")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy(); // Mt Moon's map count
    expect(screen.getByText("Safari Zone")).toBeTruthy();
  });

  it("opening a dungeon calls onOpen with its id", () => {
    const onOpen = vi.fn();
    render(
      <DungeonSidebar
        dungeons={DUNGEONS}
        error={null}
        openId={null}
        onOpen={onOpen}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onSetMaps={vi.fn()}
        onDelete={vi.fn()}
        allMapNames={[]}
      />,
    );
    fireEvent.click(screen.getByText("Mt Moon"));
    expect(onOpen).toHaveBeenCalledWith("1");
  });

  it("marks the open dungeon for assistive tech", () => {
    render(
      <DungeonSidebar
        dungeons={DUNGEONS}
        error={null}
        openId="2"
        onOpen={() => {}}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onSetMaps={vi.fn()}
        onDelete={vi.fn()}
        allMapNames={[]}
      />,
    );
    expect(screen.getByText("Safari Zone").closest("button")!.getAttribute("aria-current")).toBe("true");
    expect(screen.getByText("Mt Moon").closest("button")!.getAttribute("aria-current")).toBeNull();
  });

  it("the + New Dungeon form calls onCreate with the entered name and seed map, then opens it", async () => {
    const onCreate = vi.fn().mockResolvedValue({ id: "3", name: "New Cave", maps: ["Route1"] });
    const onOpen = vi.fn();
    render(
      <DungeonSidebar
        dungeons={DUNGEONS}
        error={null}
        openId={null}
        onOpen={onOpen}
        onCreate={onCreate}
        onRename={vi.fn()}
        onSetMaps={vi.fn()}
        onDelete={vi.fn()}
        allMapNames={["Route1"]}
      />,
    );
    fireEvent.click(screen.getByText("+ New Dungeon"));
    fireEvent.change(screen.getByPlaceholderText(/name/i), { target: { value: "New Cave" } });
    fireEvent.change(screen.getByPlaceholderText(/seed map/i), { target: { value: "Route1" } });
    fireEvent.click(screen.getByText("Create"));
    // Proves the "then opens it" half of this test's own name, not just
    // that onCreate got called: a create that never calls onOpen(created.id)
    // (or opens the wrong id) fails this even though onCreate below passes.
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("3"));
    expect(onCreate).toHaveBeenCalledWith({ name: "New Cave", seedMap: "Route1" });
  });

  it("editing the open dungeon's membership shows its maps as removable rows", () => {
    render(
      <DungeonSidebar
        dungeons={DUNGEONS}
        error={null}
        openId="1"
        onOpen={() => {}}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onSetMaps={vi.fn()}
        onDelete={vi.fn()}
        allMapNames={[]}
      />,
    );
    expect(screen.getByText("MtMoon_1F")).toBeTruthy();
    expect(screen.getByText("MtMoon_B1F")).toBeTruthy();
  });

  it("removing a map from the open dungeon calls onSetMaps with it excluded", () => {
    const onSetMaps = vi.fn();
    render(
      <DungeonSidebar
        dungeons={DUNGEONS}
        error={null}
        openId="1"
        onOpen={() => {}}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onSetMaps={onSetMaps}
        onDelete={vi.fn()}
        allMapNames={[]}
      />,
    );
    fireEvent.click(screen.getByLabelText("Remove MtMoon_1F"));
    expect(onSetMaps).toHaveBeenCalledWith("1", ["MtMoon_B1F"]);
  });
});
