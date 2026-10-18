import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { Toolbar } from "../src/components/Toolbar.js";

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]);
}
describe("Indicator strings", () => {
  it("retires old feature names across UI source", () => {
    const source = files(resolve("packages/ui/src")).map(p => readFileSync(p, "utf8")).join("\n");
    expect(source).not.toMatch(/Wild Sign|Add Sign|wild sign/);
  });
  it("keeps the Sign (G) tooltip", () => {
    render(createElement(Toolbar, {
      activeToolKind: null, onSelectTool: () => {}, isDirty: false,
      onUndo: () => {}, onRedo: () => {}, canUndo: false, canRedo: false,
      onOpenSave: () => {}, onDiscard: () => {}, availableTools: ["sign"],
    }));
    expect(screen.getByRole("button", { name: "Sign" }).title).toBe("Sign (G)");
  });
});
