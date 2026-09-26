import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GbcApp } from "../../src/gbc/GbcApp.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const GROUPS = {
  groupOrder: ["OLIVINE", "MAHOGANY"],
  groups: { OLIVINE: ["OlivineCity", "OlivinePort"], MAHOGANY: ["MahoganyTown"] },
};

function makeFetchMock(opts: { groupsFail?: boolean } = {}) {
  return vi.fn((url: string) => {
    if (url === "/api/groups") {
      if (opts.groupsFail) {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(GROUPS) } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

describe("GbcApp", () => {
  it("shows the real-shaped fixture groups in the tree", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    render(<GbcApp root="/root/pokemap-corpus/pokecrystal-PerfPlus" />);

    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
    expect(screen.getByText("OlivinePort")).toBeTruthy();
    expect(screen.getByText("MahoganyTown")).toBeTruthy();
  });

  it("shows the loading state before groups resolve", () => {
    vi.stubGlobal("fetch", makeFetchMock());
    render(<GbcApp root="/x" />);
    expect(screen.getByText(/Loading map groups/)).toBeTruthy();
  });

  it("shows the sidebar error when /api/groups fails", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ groupsFail: true }));
    render(<GbcApp root="/x" />);

    await waitFor(() => expect(screen.getByText(/Could not load map groups/)).toBeTruthy());
  });

  it("clicking a map sets the status and the map placeholder text", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    render(<GbcApp root="/x" />);

    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
    fireEvent.click(screen.getByText("OlivineCity"));

    const placeholder = screen.getByTestId("gbc-map-placeholder");
    expect(placeholder.textContent).toBe("OlivineCity · day");

    // The status span in the header names the selected map too.
    const status = document.querySelector(".app__status");
    expect(status?.textContent).toBe("OlivineCity");
  });

  it("shows 'Select a map' when nothing is selected yet", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
    expect(screen.getByText("Select a map")).toBeTruthy();
  });

  it("time buttons: exactly one is aria-pressed, and it starts as Day", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());

    const group = screen.getByRole("group", { name: "Time of day" });
    const buttons = group.querySelectorAll("button");
    expect(buttons.length).toBe(3);

    const pressed = Array.from(buttons).filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed.length).toBe(1);
    expect(pressed[0]?.textContent).toBe("Day");
  });

  it("clicking Nite changes the placeholder to '… · nite', pinned exactly", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
    fireEvent.click(screen.getByText("OlivineCity"));

    const niteBtn = screen.getByRole("group", { name: "Time of day" }).querySelector("button:nth-child(3)");
    expect(niteBtn?.textContent).toBe("Nite");
    fireEvent.click(niteBtn as HTMLElement);

    expect(screen.getByTestId("gbc-map-placeholder").textContent).toBe("OlivineCity · nite");
    expect(niteBtn?.getAttribute("aria-pressed")).toBe("true");
  });

  it("the World toggle swaps to the world placeholder", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());

    const view = screen.getByRole("group", { name: "View" });
    const worldBtn = Array.from(view.querySelectorAll("button")).find((b) => b.textContent === "World");
    expect(worldBtn).toBeTruthy();
    fireEvent.click(worldBtn as HTMLElement);

    const placeholder = screen.getByTestId("gbc-world-placeholder");
    expect(placeholder.textContent).toBe("World view (Task 5)");
  });

  it("switching to World view hides the selected-map status", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
    fireEvent.click(screen.getByText("OlivineCity"));
    expect(document.querySelector(".app__status")?.textContent).toBe("OlivineCity");

    const view = screen.getByRole("group", { name: "View" });
    const worldBtn = Array.from(view.querySelectorAll("button")).find((b) => b.textContent === "World");
    fireEvent.click(worldBtn as HTMLElement);

    expect(document.querySelector(".app__status")).toBeNull();
  });

  it("shows the family tag", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    render(<GbcApp root="/x" />);
    expect(screen.getByText("Crystal")).toBeTruthy();
  });
});
