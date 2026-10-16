import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { EditingWorkspace } from "../../src/shared/EditingWorkspace.js";

function Canvas({ label }: { label: string }) {
  return <canvas data-testid="canvas" aria-label={label} />;
}

describe("EditingWorkspace", () => {
  it("renders active top, body canvas, and side in order, while inactive retains only body and canvas", () => {
    const slots = { top: <div data-testid="top" />, side: <div data-testid="side" />, canvasProps: { label: "main" }, Canvas };
    const { container, rerender } = render(<EditingWorkspace active {...slots} />);
    expect([...container.children].map((node) => node.getAttribute("data-testid") ?? node.className)).toEqual(["top", "app__map-editing-body"]);
    expect([...container.querySelector(".app__map-editing-body")!.children].map((node) => node.getAttribute("data-testid") ?? node.className)).toEqual(["canvas", "edit-rail"]);
    expect(container.querySelector(".edit-rail > [data-testid=side]")).toBeTruthy();
    expect(container.querySelector("canvas")?.getAttribute("aria-label")).toBe("main");
    rerender(<EditingWorkspace active={false} {...slots} />);
    expect(container.querySelector("[data-testid=top]")).toBeNull();
    expect(container.querySelector("[data-testid=side]")).toBeNull();
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild?.className).toBe("app__map-editing-body");
    expect(container.querySelector("canvas")?.getAttribute("aria-label")).toBe("main");
  });

  it("keeps the same canvas and body nodes across active toggles", () => {
    let mounts = 0;
    function Probe() { useEffect(() => { mounts++; }, []); return <canvas data-testid="canvas" />; }
    const slots = { top: <div />, side: <div />, canvasProps: {}, Canvas: Probe };
    const { container, rerender } = render(<EditingWorkspace active={false} {...slots} />);
    const canvas = container.querySelector("canvas");
    const body = container.querySelector(".app__map-editing-body");
    rerender(<EditingWorkspace active {...slots} />);
    rerender(<EditingWorkspace active={false} {...slots} />);
    expect(container.querySelector("canvas")).toBe(canvas);
    expect(container.querySelector(".app__map-editing-body")).toBe(body);
    expect(mounts).toBe(1);
  });

  it("uses renderCanvas instead of Canvas and passes its canvas props, including null", () => {
    const renderCanvas = vi.fn((props: { label: string } | null) => <output>{props?.label ?? "empty"}</output>);
    const { rerender, getByText } = render(<EditingWorkspace active top={null} side={null} canvasProps={{ label: "custom" }} Canvas={Canvas} renderCanvas={renderCanvas} />);
    expect(getByText("custom")).toBeTruthy();
    expect(renderCanvas).toHaveBeenLastCalledWith({ label: "custom" });
    rerender(<EditingWorkspace active={false} top={null} side={null} canvasProps={null} Canvas={Canvas} renderCanvas={renderCanvas} />);
    expect(getByText("empty")).toBeTruthy();
    expect(renderCanvas).toHaveBeenLastCalledWith(null);
  });
});
