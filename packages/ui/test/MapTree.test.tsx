import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MapTree } from "../src/components/MapTree.js";

const GROUPS = {
  groupOrder: ["gMapGroup_TownsAndRoutes", "gMapGroup_Dungeons"],
  groups: {
    gMapGroup_TownsAndRoutes: ["NewBarkTown", "Route29"],
    gMapGroup_Dungeons: ["NavelRock_Base"],
  },
};

describe("MapTree", () => {
  it("renders every group with its map count", () => {
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} />);
    expect(screen.getByText(/TownsAndRoutes/)).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    // A substring regex matches the raw `gMapGroup_TownsAndRoutes` key just as
    // well as the stripped label, so the assertion above cannot tell whether
    // the prefix was stripped at all. Verified by mutation: deleting the
    // `.replace()` left all five tests green.
    expect(screen.queryByText(/^gMapGroup_/)).toBeNull();
  });

  it("filters maps as the user types, keeping groups that still match", () => {
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/filter/i), { target: { value: "navel" } });
    expect(screen.queryByText("NewBarkTown")).toBeNull();
    expect(screen.getByText("NavelRock_Base")).toBeTruthy();
  });

  it("calls onSelect with the map name", () => {
    let picked: string | null = null;
    render(<MapTree data={GROUPS} selected={null} onSelect={(n) => { picked = n; }} />);
    fireEvent.click(screen.getByText("Route29"));
    expect(picked).toBe("Route29");
  });

  it("says so when a filter matches nothing, rather than showing an empty panel", () => {
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/filter/i), { target: { value: "zzzz" } });
    expect(screen.getByText(/no maps match/i)).toBeTruthy();
  });

  it("marks the selected map for assistive tech, not just visually", () => {
    // `selected` is otherwise accepted and never asserted on, so a component
    // that ignored the prop entirely would pass every test above.
    render(<MapTree data={GROUPS} selected="Route29" onSelect={() => {}} />);
    expect(screen.getByText("Route29").getAttribute("aria-current")).toBe("true");
    expect(screen.getByText("NewBarkTown").getAttribute("aria-current")).toBeNull();
  });
});
