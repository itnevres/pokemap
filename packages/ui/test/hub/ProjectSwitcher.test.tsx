import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ProjectSwitcher } from "../../src/hub/ProjectSwitcher.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** ProjectPicker (mounted inside the modal) fetches /api/hub and, once it
 *  has a `dir`, /api/hub/browse -- stubbed minimally here since this file
 *  only exercises ProjectSwitcher's own button/modal/Escape behaviour, not
 *  the picker's own contents (covered by ProjectPicker.test.tsx). */
function stubHubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url === "/api/hub") {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ current: null, recent: [] }) });
      }
      if (url.startsWith("/api/hub/browse")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ dir: null, parent: null, entries: [] }) });
      }
      return Promise.reject(new Error(`unexpected fetch in test: ${url}`));
    }),
  );
}

describe("ProjectSwitcher", () => {
  const CURRENT = { family: "gba" as const, root: "/tmp/pokeemerald" };

  it("shows the folder name and titles the button with the full root", () => {
    stubHubFetch();
    render(<ProjectSwitcher current={CURRENT} onOpened={vi.fn()} />);
    const btn = screen.getByRole("button", { name: /switch project/i });
    expect(btn.textContent).toBe("pokeemerald");
    expect(btn.getAttribute("title")).toBe("/tmp/pokeemerald");
  });

  it("click opens a dialog labelled 'Switch project'", async () => {
    stubHubFetch();
    render(<ProjectSwitcher current={CURRENT} onOpened={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /switch project/i }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Switch project" })).toBeTruthy());
  });

  it("opening focuses the picker's Close button (what lets Escape reach the backdrop)", async () => {
    stubHubFetch();
    render(<ProjectSwitcher current={CURRENT} onOpened={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /switch project/i }));
    const dialog = await screen.findByRole("dialog", { name: "Switch project" });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Close" }));
  });

  it("a 409 inside the switcher leaves exactly one backdrop / one aria-modal; Escape on the focused Cancel only backs out of the confirm", async () => {
    const posts: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url === "/api/hub") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ current: null, recent: [{ path: "/tmp/other", family: "gba", openedAt: "2026-09-29T00:00:00.000Z" }] }),
          });
        }
        if (url.startsWith("/api/hub/browse")) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ dir: null, parent: null, entries: [] }) });
        }
        if (url === "/api/hub/open" && init?.method === "POST") {
          posts.push(JSON.parse(String(init.body)));
          return Promise.resolve({
            ok: false,
            status: 409,
            json: () => Promise.resolve({ error: "unsaved edits in 1 map(s)", dirtyMaps: ["Route1"] }),
          });
        }
        return Promise.reject(new Error(`unexpected fetch in test: ${url}`));
      }),
    );
    render(<ProjectSwitcher current={CURRENT} onOpened={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /switch project/i }));
    const dialog = await screen.findByRole("dialog", { name: "Switch project" });
    const row = (await within(dialog).findByText("/tmp/other")).closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Open" }));

    await screen.findByRole("alertdialog", { name: "Unsaved edits" });
    expect(document.querySelectorAll(".warp-modal__backdrop").length).toBe(1);
    expect(document.querySelectorAll('[aria-modal="true"]').length).toBe(1);

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByRole("dialog", { name: "Switch project" })).toBeTruthy();
    expect(posts).toEqual([{ path: "/tmp/other" }]);
  });

  it("Escape closes the modal", async () => {
    stubHubFetch();
    render(<ProjectSwitcher current={CURRENT} onOpened={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /switch project/i }));
    const dialog = await screen.findByRole("dialog", { name: "Switch project" });

    fireEvent.keyDown(dialog.parentElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
