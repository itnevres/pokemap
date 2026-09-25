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
        onRename={vi.fn().mockResolvedValue(undefined)}
        onSetMaps={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
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
        onRename={vi.fn().mockResolvedValue(undefined)}
        onSetMaps={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
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
        onRename={vi.fn().mockResolvedValue(undefined)}
        onSetMaps={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
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
        onRename={vi.fn().mockResolvedValue(undefined)}
        onSetMaps={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
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

  it("a rejected onCreate keeps the form open with the entered values, shows actionError, and never opens anything", async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error("POST /api/dungeons -> 500"));
    const onOpen = vi.fn();
    render(
      <DungeonSidebar
        dungeons={DUNGEONS}
        error={null}
        openId={null}
        onOpen={onOpen}
        onCreate={onCreate}
        onRename={vi.fn().mockResolvedValue(undefined)}
        onSetMaps={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        allMapNames={["Route1"]}
      />,
    );
    fireEvent.click(screen.getByText("+ New Dungeon"));
    fireEvent.change(screen.getByPlaceholderText(/name/i), { target: { value: "New Cave" } });
    fireEvent.change(screen.getByPlaceholderText(/seed map/i), { target: { value: "Route1" } });
    fireEvent.click(screen.getByText("Create"));

    await waitFor(() => expect(screen.getByText(/POST \/api\/dungeons -> 500/)).toBeTruthy());
    expect(onOpen).not.toHaveBeenCalled();
    // Form stays open with the user's own values intact -- nothing was
    // cleared out from under them by the failed submit.
    expect((screen.getByPlaceholderText(/name/i) as HTMLInputElement).value).toBe("New Cave");
    expect((screen.getByPlaceholderText(/seed map/i) as HTMLInputElement).value).toBe("Route1");
  });

  it("editing the open dungeon's membership shows its maps as removable rows", () => {
    render(
      <DungeonSidebar
        dungeons={DUNGEONS}
        error={null}
        openId="1"
        onOpen={() => {}}
        onCreate={vi.fn()}
        onRename={vi.fn().mockResolvedValue(undefined)}
        onSetMaps={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        allMapNames={[]}
      />,
    );
    expect(screen.getByText("MtMoon_1F")).toBeTruthy();
    expect(screen.getByText("MtMoon_B1F")).toBeTruthy();
  });

  it("removing a map from the open dungeon calls onSetMaps with it excluded", () => {
    const onSetMaps = vi.fn().mockResolvedValue(undefined);
    render(
      <DungeonSidebar
        dungeons={DUNGEONS}
        error={null}
        openId="1"
        onOpen={() => {}}
        onCreate={vi.fn()}
        onRename={vi.fn().mockResolvedValue(undefined)}
        onSetMaps={onSetMaps}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        allMapNames={[]}
      />,
    );
    fireEvent.click(screen.getByLabelText("Remove MtMoon_1F"));
    expect(onSetMaps).toHaveBeenCalledWith("1", ["MtMoon_B1F"]);
  });

  it("typing in the rename input does not call onRename until blur, and commits the final value", () => {
    const onRename = vi.fn().mockResolvedValue(DUNGEONS[0]);
    render(
      <DungeonSidebar
        dungeons={DUNGEONS}
        error={null}
        openId="1"
        onOpen={() => {}}
        onCreate={vi.fn()}
        onRename={onRename}
        onSetMaps={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        allMapNames={[]}
      />,
    );
    const input = screen.getByLabelText("Dungeon name") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "Mt Moon " } });
    expect(onRename).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "Mt Moon Cave" } });
    expect(onRename).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith("1", "Mt Moon Cave");
  });

  it("an empty or whitespace-only rename commit never calls onRename", () => {
    const onRename = vi.fn().mockResolvedValue(DUNGEONS[0]);
    render(
      <DungeonSidebar
        dungeons={DUNGEONS}
        error={null}
        openId="1"
        onOpen={() => {}}
        onCreate={vi.fn()}
        onRename={onRename}
        onSetMaps={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        allMapNames={[]}
      />,
    );
    const input = screen.getByLabelText("Dungeon name") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    expect(onRename).not.toHaveBeenCalled();
  });

  it("the delete button calls onDelete with the open dungeon's id", () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <DungeonSidebar
        dungeons={DUNGEONS}
        error={null}
        openId="1"
        onOpen={() => {}}
        onCreate={vi.fn()}
        onRename={vi.fn().mockResolvedValue(undefined)}
        onSetMaps={vi.fn().mockResolvedValue(undefined)}
        onDelete={onDelete}
        allMapNames={[]}
      />,
    );
    fireEvent.click(screen.getByText("Delete dungeon"));
    expect(onDelete).toHaveBeenCalledWith("1");
  });
});
