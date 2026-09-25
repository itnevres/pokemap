import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { CollisionPalette } from "../src/components/CollisionPalette.js";

describe("CollisionPalette", () => {
  it("renders 4 collision swatches (0-3) and an elevation strip 0-15", () => {
    const { getAllByRole } = render(<CollisionPalette selected={{ collision: 0, elevation: 3 }} onSelect={vi.fn()} />);
    const collisionSwatches = getAllByRole("button", { name: /^collision /i });
    const elevationSwatches = getAllByRole("button", { name: /^elevation /i });
    expect(collisionSwatches).toHaveLength(4);
    expect(elevationSwatches).toHaveLength(16);
  });

  it("clicking a collision swatch calls onSelect with the new collision and the previously-selected elevation kept", () => {
    const onSelect = vi.fn();
    const { getByRole } = render(<CollisionPalette selected={{ collision: 0, elevation: 5 }} onSelect={onSelect} />);
    fireEvent.click(getByRole("button", { name: "collision 1 (impassable)" }));
    expect(onSelect).toHaveBeenCalledWith({ collision: 1, elevation: 5 });
  });

  it("clicking an elevation swatch calls onSelect with the new elevation and the previously-selected collision kept", () => {
    const onSelect = vi.fn();
    const { getByRole } = render(<CollisionPalette selected={{ collision: 2, elevation: 0 }} onSelect={onSelect} />);
    fireEvent.click(getByRole("button", { name: "elevation 15" }));
    expect(onSelect).toHaveBeenCalledWith({ collision: 2, elevation: 15 });
  });

  it("marks the currently-selected collision and elevation swatches with aria-pressed=true, all others false", () => {
    // No @testing-library/jest-dom in this repo (confirmed: no matcher
    // extension anywhere under packages/ui/test) -- toHaveAttribute is not
    // a real chai assertion here, so this reads the attribute directly, the
    // same way every other test in this repo does (e.g. MetatilePalette
    // .test.tsx's own comment on this, EncounterGutter.test.tsx's
    // `toggle.getAttribute("aria-pressed")`).
    const { getByRole } = render(<CollisionPalette selected={{ collision: 1, elevation: 7 }} onSelect={vi.fn()} />);
    expect(getByRole("button", { name: "collision 1 (impassable)" }).getAttribute("aria-pressed")).toBe("true");
    expect(getByRole("button", { name: "collision 0" }).getAttribute("aria-pressed")).toBe("false");
    expect(getByRole("button", { name: "elevation 7" }).getAttribute("aria-pressed")).toBe("true");
  });
});
