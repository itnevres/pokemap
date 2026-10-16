# Plan 9F: Porymap-style metatile palette Implementation Plan

> **STATUS (2026-10-15): done, merged to master via PR #19.** Commits `21e7e22`..`46d663e`. Final-review fixes `1a7995e` amended R-F3 (far fold candidates ignored) and made a GBA cross-column drag select nothing; this plan's text predates them, the spec addendum is current.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Before every implementer hop run the `delegate` skill (offload chain first) and give every Claude dispatch an explicit model.

**Goal:** Both metatile palettes (GBA and GBC) show abutting tiles in the tileset's own row order, folded into two newspaper columns that fill the edit rail, under a pinned header (Selection box, search, Follow hover) that never scrolls.

**Architecture:** Four small shared pieces in `packages/ui/src/shared/`: `paletteFold.ts` (pure fold choice), `useUniformRows.ts` (which rows' thumbnails are pixel-identical), `PaletteFrame.tsx` (pinned header + scroller + Selection box) and `FoldedGrid.tsx` (two columns of rows). `components/MetatilePalette.tsx` (GBA) and `gbc/GbcMetatilePalette.tsx` (GBC) keep their props, cell markup and class names and are rebuilt on top of them. CSS in `src/styles.css`.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library (jsdom, no jest-dom), lightningcss (CSS tests).

**Spec:** `docs/superpowers/specs/2026-10-15-pokemap-plan-9-palette-addendum.md` (addendum to `docs/superpowers/specs/2026-10-14-pokemap-plan-9-family-shell-design.md`). Binding UI rules: `packages/ui/DESIGN.md` "Edit layout (Plan 9, D4/D5)".

## Global Constraints

- Row width: GBA 8 per row, GBC 4 per row, in tileset order. Never re-flow.
- Two columns at 1x in both families: GBA cells 16 px (2 x 8 x 16 = 256 px), GBC cells 32 px (2 x 4 x 32 = 256 px).
- Fold rule (both families): candidates = the row after each uniform row; GBA also the primary/secondary boundary row (only when `primaryCount % 8 === 0` and `secondaryCount > 0`). Pick the candidate nearest `rowCount / 2`, tie to the earlier; none: `Math.ceil(rowCount / 2)`; `rowCount < 2`: one column.
- While a search filter is active: one column, no fold.
- No zoom control. No Border box. No GBC drag-select. The fold is not persisted.
- Pinned header order: (GBC caption `<tileset> · <count> metatiles`), Selection box, search (`placeholder="Search by hex id…"`, both families), Follow hover switch. Only `.palette__scroll` scrolls. Follow hover keeps `scrollIntoView({ block: "nearest" })`.
- Selection caption: `Nothing picked`; one cell `0x1A`; more `3x2 from 0x1A` (first non-empty id, uppercase hex).
- Cells: no gap, border, radius or padding. Picked = `box-shadow: inset 0 0 0 2px var(--accent)`. Hovered = `outline: 2px dashed var(--accent); outline-offset: -2px`. Focus-visible = `outline: 2px solid var(--focus-ring); outline-offset: -2px` (declared after hovered). Thumbnails `image-rendering: pixelated`.
- **Rail width 260 -> 272 px** (`.edit-rail`): 256 px of columns + 2 px column rule + a thin scrollbar (`scrollbar-width: thin`, about 11 px in Chromium) + the 1 px rail border do not fit 260. The user is told this when the plan is handed over; if they reject it, Task 3 Step 3 is the only place to change.
- Class names tests pin stay: roots `metatile-palette` / `gbc-metatile-palette` FIRST in `className` (`MapEditingWorkspace.test.tsx` `railOrder` reads `className.split(" ")[0]`); cells `metatile-palette__cell` (`--selected` picked, `--hovered`, `--out-of-range`), `gbc-metatile-palette__cell` (`--selected` = hover, `--picked`); grids `metatile-palette__grid`, `gbc-metatile-palette__grid` (`role="group" aria-label="Metatiles"`); `metatile-palette__boundary`.
- Tests: run vitest from the repo root (`node node_modules/vitest/vitest.mjs run <file>`). No jest-dom: use `.getAttribute`, `.disabled`, `document.body.contains`.
- Gate before each commit touching `packages/`: `npm test > <scratch>/run.txt 2>&1` (read the pass/fail/files line), `npm run typecheck`, `npm run build -w @pokemap/ui`. Commit with explicit pathspecs. Baseline at plan start: 2,789 pass / 0 fail, 178 files.
- Every existing palette test keeps passing or is retargeted with a stated reason in the commit message; none is dropped.

## Review Focus

1. A search with no matches: the grid is empty, the pinned header (Selection, search, switch) is still rendered, nothing throws. Test in Task 4.
2. Switching map, layout or GBC time of day: uniform rows learned from the old thumbnails must not drive the new fold. Test in Task 2 (key reset).
3. A thumbnail that fails to load (404, or a decode error): its row is never uniform; the fold still resolves. Test in Task 2.
4. The picked cell is also the hovered cell: both marks show (different CSS properties, both classes present). Tests in Task 3 (CSS) and Task 4 / Task 5 (classes).
5. A tiny tileset (0 or 1 row): one column, no empty right column element. Tests in Task 1 and Task 5.

---

### Task 1: `pickFold`

**Files:**
- Create: `packages/ui/src/shared/paletteFold.ts`
- Test: `packages/ui/test/shared/paletteFold.test.ts`

**Interfaces:**
- Produces: `pickFold(rowCount: number, uniformRows: ReadonlySet<number>, boundaryRow?: number): number` (the index of the first row of the right column; `rowCount` means one column) and `chunkRows<T>(items: readonly T[], width: number): T[][]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { chunkRows, pickFold } from "../../src/shared/paletteFold.js";

describe("pickFold (Plan 9 addendum R-F3)", () => {
  it.each([
    // [rowCount, uniformRows, boundaryRow, expected, why]
    [0, [], undefined, 0, "empty: one (empty) column"],
    [1, [], undefined, 1, "one row: one column"],
    [10, [], undefined, 5, "no candidate: the middle"],
    [9, [], undefined, 5, "odd count: ceil of the middle"],
    [10, [4], undefined, 5, "after a uniform row at the middle"],
    [10, [1], undefined, 2, "the only safe cut wins, however far from the middle"],
    [10, [2, 6], undefined, 3, "two equidistant cuts (3 and 7): the earlier"],
    [10, [9], undefined, 5, "a uniform LAST row gives no cut (nothing after it)"],
    [10, [], 3, 3, "the primary/secondary boundary is a candidate"],
    [10, [4], 3, 5, "a uniform-row cut nearer the middle beats the boundary"],
    [77, [], 64, 64, "GBA 512 primary + 104 secondary: boundary only"],
  ] as const)("rowCount %i, uniform %j, boundary %s -> %i (%s)", (rowCount, uniform, boundary, expected) => {
    expect(pickFold(rowCount, new Set(uniform), boundary)).toBe(expected);
  });

  it("ignores a boundary at row 0 or at rowCount (no empty column)", () => {
    expect(pickFold(10, new Set(), 0)).toBe(5);
    expect(pickFold(10, new Set(), 10)).toBe(5);
  });
});

describe("chunkRows", () => {
  it("splits into rows of `width`, keeping a short last row", () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkRows([], 4)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run packages/ui/test/shared/paletteFold.test.ts`
Expected: FAIL, cannot resolve `../../src/shared/paletteFold.js`.

- [ ] **Step 3: Implement**

```ts
/** Plan 9 addendum R-F3: the first row of the right-hand newspaper column. A candidate cut is the row after a
 *  uniform row, or `boundaryRow` (GBA's primary/secondary boundary). Nearest the middle wins, ties to the earlier;
 *  no candidate cuts at the middle. Returns `rowCount` (one column) when there are fewer than two rows. */
export function pickFold(rowCount: number, uniformRows: ReadonlySet<number>, boundaryRow?: number): number {
  if (rowCount < 2) return rowCount;
  const mid = rowCount / 2;
  const candidates = [...uniformRows].map((r) => r + 1);
  if (boundaryRow !== undefined) candidates.push(boundaryRow);
  const valid = candidates
    .filter((c) => c > 0 && c < rowCount)
    .sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
  return valid[0] ?? Math.ceil(mid);
}

/** Rows of `width` items in order; the last row may be short. */
export function chunkRows<T>(items: readonly T[], width: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += width) rows.push(items.slice(i, i + width));
  return rows;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run packages/ui/test/shared/paletteFold.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/shared/paletteFold.ts packages/ui/test/shared/paletteFold.test.ts
git commit -m "feat(ui): pickFold chooses the palette's newspaper fold row"
```

---

### Task 2: `useUniformRows`

**Files:**
- Create: `packages/ui/src/shared/useUniformRows.ts`
- Test: `packages/ui/test/shared/useUniformRows.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `type ThumbSignature = (img: HTMLImageElement) => string | null`
  - `canvasSignature: ThumbSignature` (draws the image to a canvas and hashes its pixels; `null` when there is no 2D context, as in jsdom)
  - `useUniformRows(rows: readonly (readonly number[])[], key: string, signature?: ThumbSignature): { uniformRows: ReadonlySet<number>; onThumbLoad(id: number, img: HTMLImageElement): void; onThumbError(id: number): void }`
  - A row (index into `rows`) is uniform when it has at least 2 cells and every cell's signature is known, non-null and equal. Signatures are batched into one re-render per 30 ms. A change of `key` forgets every signature.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useUniformRows, type ThumbSignature } from "../../src/shared/useUniformRows.js";

/** The signature is the image's alt text, so a test chooses which thumbnails "look" identical. */
const bySig: ThumbSignature = (img) => img.alt || null;
const img = (sig: string) => Object.assign(document.createElement("img"), { alt: sig });
const ROWS = [[0, 1], [2, 3], [4, 5]];

describe("useUniformRows (Plan 9 addendum R-F3)", () => {
  it("marks a row uniform once all its thumbnails loaded with one signature", async () => {
    const { result } = renderHook(() => useUniformRows(ROWS, "A", bySig));
    act(() => {
      result.current.onThumbLoad(0, img("grass"));
      result.current.onThumbLoad(1, img("tree"));
      result.current.onThumbLoad(2, img("blank"));
      result.current.onThumbLoad(3, img("blank"));
      result.current.onThumbLoad(4, img("blank"));
    });
    await waitFor(() => expect([...result.current.uniformRows]).toEqual([1]));
  });

  it("a thumbnail that failed to load never makes its row uniform (Review Focus 3)", async () => {
    const { result } = renderHook(() => useUniformRows(ROWS, "A", bySig));
    act(() => {
      result.current.onThumbLoad(2, img("blank"));
      result.current.onThumbError(3);
      result.current.onThumbLoad(4, img("x"));
      result.current.onThumbLoad(5, img("x"));
    });
    await waitFor(() => expect([...result.current.uniformRows]).toEqual([2]));
  });

  it("a key change forgets what the old thumbnails looked like (Review Focus 2)", async () => {
    const { result, rerender } = renderHook(({ k }) => useUniformRows(ROWS, k, bySig), { initialProps: { k: "Route1:day" } });
    act(() => {
      result.current.onThumbLoad(0, img("blank"));
      result.current.onThumbLoad(1, img("blank"));
    });
    await waitFor(() => expect([...result.current.uniformRows]).toEqual([0]));
    rerender({ k: "Route1:nite" });
    await waitFor(() => expect([...result.current.uniformRows]).toEqual([]));
  });

  it("a one-cell row is never uniform (nothing to compare)", async () => {
    const { result } = renderHook(() => useUniformRows([[7]], "A", bySig));
    act(() => result.current.onThumbLoad(7, img("blank")));
    await new Promise((r) => setTimeout(r, 60));
    expect(result.current.uniformRows.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run packages/ui/test/shared/useUniformRows.test.tsx`
Expected: FAIL, cannot resolve `../../src/shared/useUniformRows.js`.

- [ ] **Step 3: Implement**

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** A thumbnail's identity for "these look the same"; null = unknown (never uniform). */
export type ThumbSignature = (img: HTMLImageElement) => string | null;

/** FNV-1a over the decoded pixels. Thumbnails are same-origin (`/api/metatile/...`), so the canvas is not tainted. */
export const canvasSignature: ThumbSignature = (img) => {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.width > 0 ? c.getContext("2d") : null;
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let h = 2166136261;
  for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i]!, 16777619);
  return `${c.width}x${c.height}:${h >>> 0}`;
};

/** Plan 9 addendum R-F3: the rows (indices into `rows`) whose loaded thumbnails are all pixel-identical, a safe
 *  newspaper fold. `key` names what the thumbnails show (layout, map + time); a new key forgets every signature. */
export function useUniformRows(rows: readonly (readonly number[])[], key: string, signature: ThumbSignature = canvasSignature) {
  const sigs = useRef(new Map<number, string | null>());
  const [version, setVersion] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ponytail: one re-render per 30 ms of thumbnail loads, not one per image (784 GBA thumbnails load at mount).
  const bump = useCallback(() => {
    if (timer.current !== null) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      setVersion((v) => v + 1);
    }, 30);
  }, []);
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  useEffect(() => {
    sigs.current = new Map();
    setVersion((v) => v + 1);
  }, [key]);

  const onThumbLoad = useCallback((id: number, img: HTMLImageElement) => {
    sigs.current.set(id, signature(img));
    bump();
  }, [signature, bump]);
  const onThumbError = useCallback((id: number) => {
    sigs.current.set(id, null);
    bump();
  }, [bump]);

  const uniformRows = useMemo(() => {
    void version; // recomputed when a batch of signatures lands
    const out = new Set<number>();
    rows.forEach((row, r) => {
      if (row.length < 2) return;
      const first = sigs.current.get(row[0]!);
      if (first && row.every((id) => sigs.current.get(id) === first)) out.add(r);
    });
    return out;
  }, [rows, version]);

  return { uniformRows, onThumbLoad, onThumbError };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run packages/ui/test/shared/useUniformRows.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/shared/useUniformRows.ts packages/ui/test/shared/useUniformRows.test.tsx
git commit -m "feat(ui): useUniformRows finds palette rows whose thumbnails are identical"
```

---

### Task 3: `PaletteFrame`, `PaletteSelection`, `FoldedGrid` and the shared CSS

**Files:**
- Create: `packages/ui/src/shared/PaletteFrame.tsx`
- Create: `packages/ui/src/shared/FoldedGrid.tsx`
- Modify: `packages/ui/src/styles.css` (append a "Plan 9F palette" block after `.palette__follow`; change `.edit-rail` width)
- Test: `packages/ui/test/shared/PaletteFrame.test.tsx`, `packages/ui/test/styles.test.ts` (new cases)

**Interfaces:**
- Produces:
  - `PaletteFrame(props: { className: string; caption?: ReactNode; selection: ReactNode; query: string; onQuery(q: string): void; follow: boolean; onFollow(on: boolean): void; children: ReactNode })`. Root `<div className={`${className} palette`}>` > `.palette__pinned` (caption `.palette__caption`, selection, `input.palette__search[placeholder="Search by hex id…"]`, `FollowHoverSwitch`) + `.palette__scroll` (children).
  - `PaletteSelection(props: { cells: readonly (number | null)[]; width: number; src(id: number): string; cellPx: number })`. Root `figure.palette__selection[aria-label="Selection"]`, caption `figcaption.palette__selection-caption` text `Selection · <caption>`.
  - `paletteHex(n: number): string` -> `0x1A`.
  - `FoldedGrid(props: { rows: readonly (readonly number[])[]; fold: number; columns: number; cellPx: number; className: string; groupLabel?: string; renderCell(id: number): ReactNode })`. Root `<div className={`${className} palette__grid`}>` (plus `role="group" aria-label={groupLabel}` when given) > `.palette__column.palette__column--left` and, only when `fold < rows.length`, `.palette__column.palette__column--right`; each column is a CSS grid `repeat(columns, cellPx px)`.

- [ ] **Step 1: Write the failing tests**

`packages/ui/test/shared/PaletteFrame.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaletteFrame, PaletteSelection, paletteHex } from "../../src/shared/PaletteFrame.js";
import { FoldedGrid } from "../../src/shared/FoldedGrid.js";

const src = (id: number) => `/t/${id}.png`;

describe("PaletteFrame (Plan 9 addendum R-F5)", () => {
  it("pins caption, selection, search and Follow hover outside the scroller; only children scroll", () => {
    const onQuery = vi.fn();
    const { container } = render(
      <PaletteFrame className="metatile-palette" caption="T · 3 metatiles" selection={<p>sel</p>} query="" onQuery={onQuery} follow onFollow={() => {}}>
        <div className="kid" />
      </PaletteFrame>,
    );
    const root = container.firstElementChild!;
    expect(root.className.split(" ")[0]).toBe("metatile-palette");
    const pinned = root.querySelector(".palette__pinned")!;
    const scroll = root.querySelector(".palette__scroll")!;
    expect(pinned.textContent).toContain("T · 3 metatiles");
    expect(pinned.textContent).toContain("sel");
    expect(pinned.querySelector('input[placeholder="Search by hex id…"]')).toBeTruthy();
    expect(pinned.querySelector('[role="switch"][aria-label="Follow hover"]')).toBeTruthy();
    expect(scroll.querySelector(".kid")).toBeTruthy();
    expect(pinned.contains(scroll)).toBe(false);
    fireEvent.change(screen.getByPlaceholderText("Search by hex id…"), { target: { value: "1a" } });
    expect(onQuery).toHaveBeenCalledWith("1a");
  });
});

describe("PaletteSelection (Plan 9 addendum R-F6)", () => {
  it("says Nothing picked and shows no image when empty", () => {
    const { container } = render(<PaletteSelection cells={[]} width={0} src={src} cellPx={16} />);
    expect(container.textContent).toBe("Selection · Nothing picked");
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows one cell with its hex id", () => {
    const { container } = render(<PaletteSelection cells={[26]} width={1} src={src} cellPx={32} />);
    expect(container.textContent).toBe("Selection · 0x1A");
    expect(container.querySelector("img")!.getAttribute("src")).toBe("/t/26.png");
  });

  it("shows a 3x2 stamp abutting, holes kept as blanks, captioned from the first id", () => {
    const { container } = render(<PaletteSelection cells={[null, 1, 2, 8, 9, 10]} width={3} src={src} cellPx={16} />);
    expect(container.textContent).toBe("Selection · 3x2 from 0x1");
    expect(container.querySelectorAll("img")).toHaveLength(5);
    expect(container.querySelectorAll(".palette__selection-hole")).toHaveLength(1);
    expect((container.querySelector(".palette__selection-grid") as HTMLElement).style.gridTemplateColumns).toBe("repeat(3, 16px)");
  });

  it("paletteHex is uppercase", () => {
    expect(paletteHex(0x2bc)).toBe("0x2BC");
  });
});

describe("FoldedGrid (Plan 9 addendum R-F2)", () => {
  const rows = [[0, 1], [2, 3], [4, 5], [6]];
  const cell = (id: number) => <span key={id} data-id={id} />;
  const ids = (el: Element | null) => [...(el?.querySelectorAll("[data-id]") ?? [])].map((e) => Number(e.getAttribute("data-id")));

  it("puts rows [0, fold) left and [fold, end) right, each a grid of `columns` cells", () => {
    const { container } = render(<FoldedGrid rows={rows} fold={2} columns={2} cellPx={16} className="metatile-palette__grid" renderCell={cell} />);
    const left = container.querySelector(".palette__column--left") as HTMLElement;
    const right = container.querySelector(".palette__column--right") as HTMLElement;
    expect(ids(left)).toEqual([0, 1, 2, 3]);
    expect(ids(right)).toEqual([4, 5, 6]);
    expect(left.style.gridTemplateColumns).toBe("repeat(2, 16px)");
    expect(container.querySelector(".metatile-palette__grid.palette__grid")).toBeTruthy();
  });

  it("renders no right column when fold >= rows.length (Review Focus 5)", () => {
    const { container } = render(<FoldedGrid rows={[[0]]} fold={1} columns={4} cellPx={32} className="g" renderCell={cell} />);
    expect(container.querySelector(".palette__column--right")).toBeNull();
    expect(ids(container.querySelector(".palette__column--left"))).toEqual([0]);
  });

  it("labels the grid as a group when asked (GBC keeps role=group, aria-label=Metatiles)", () => {
    const { container } = render(<FoldedGrid rows={rows} fold={2} columns={2} cellPx={32} className="gbc-metatile-palette__grid" groupLabel="Metatiles" renderCell={cell} />);
    const grid = container.querySelector(".gbc-metatile-palette__grid")!;
    expect(grid.getAttribute("role")).toBe("group");
    expect(grid.getAttribute("aria-label")).toBe("Metatiles");
  });
});
```

Append to `packages/ui/test/styles.test.ts`, inside the existing `describe("styles.css")` block, after the `.toolbar wraps…` case (it reuses that file's `ruleBody` helper):

```ts
  // Plan 9 addendum R-F7 / R-F5: abutting cells, inset marks, a pinned header and a rail wide enough for 256 px.
  it.each([".metatile-palette__cell", ".gbc-metatile-palette__cell"])("%s abuts its neighbours: no border, padding or radius", (sel) => {
    const body = ruleBody(sel);
    expect(body).toMatch(/border\s*:\s*(none|0)/);
    expect(body).toMatch(/padding\s*:\s*0/);
    expect(body).not.toMatch(/border-radius\s*:\s*[1-9]/);
  });
  it("palette columns have no gap between cells", () => {
    expect(ruleBody(".palette__column")).toMatch(/gap\s*:\s*0/);
  });
  it("picked marks are an inset box-shadow; hovered marks an inward dashed outline (Review Focus 4)", () => {
    expect(ruleBody(".metatile-palette__cell.metatile-palette__cell--selected")).toMatch(/box-shadow\s*:\s*inset/);
    expect(ruleBody(".gbc-metatile-palette__cell--picked")).toMatch(/box-shadow\s*:\s*inset/);
    for (const sel of [".metatile-palette__cell--hovered", ".gbc-metatile-palette__cell--selected"]) {
      const body = ruleBody(sel);
      expect(body).toMatch(/outline\s*:[^;]*dashed/);
      expect(body).toMatch(/outline-offset\s*:\s*-2px/);
      expect(body).not.toMatch(/box-shadow/);
    }
  });
  it("only .palette__scroll scrolls; the palette root does not", () => {
    expect(ruleBody(".palette__scroll")).toMatch(/overflow-y\s*:\s*auto/);
    expect(ruleBody(".palette")).not.toMatch(/overflow/);
    expect(ruleBody(".metatile-palette")).not.toMatch(/overflow/);
    expect(ruleBody(".gbc-metatile-palette")).not.toMatch(/overflow/);
  });
  it("no stale grid rule can stack the columns, and the split divider wraps", () => {
    const out = transform({ filename: "styles.css", code: css, errorRecovery: true }).code.toString();
    expect(out).not.toMatch(/(^|\})\s*\.metatile-palette__grid\s*\{/);
    expect(out).not.toMatch(/(^|\})\s*\.gbc-metatile-palette__grid\s*\{/);
    expect(ruleBody(".metatile-palette__boundary")).not.toMatch(/nowrap/);
  });
  it("the edit rail is 272 px (256 px of columns + rule + thin scrollbar + border)", () => {
    expect(ruleBody(".edit-rail")).toMatch(/width\s*:\s*272px/);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node node_modules/vitest/vitest.mjs run packages/ui/test/shared/PaletteFrame.test.tsx packages/ui/test/styles.test.ts`
Expected: PaletteFrame file FAILs to resolve its imports; the new styles cases FAIL (cells still have a 1 px border, `.palette__column` has no rule, `.metatile-palette` has `overflow-y: auto`, rail is 260 px).

- [ ] **Step 3: Implement the components and CSS**

`packages/ui/src/shared/PaletteFrame.tsx`:

```tsx
import type { ReactNode } from "react";
import { FollowHoverSwitch } from "./FollowHoverSwitch.js";

/** Uppercase hex, as both palettes' Selection captions show it. */
export const paletteHex = (n: number) => `0x${n.toString(16).toUpperCase()}`;

export interface PaletteFrameProps {
  /** The family's root class FIRST (`metatile-palette`, `gbc-metatile-palette`): the rail CSS and tests read it. */
  className: string;
  caption?: ReactNode;
  selection: ReactNode;
  query: string;
  onQuery(q: string): void;
  follow: boolean;
  onFollow(on: boolean): void;
  children: ReactNode;
}

/** Plan 9 addendum R-F5: the pinned header (caption, Selection, search, Follow hover) never scrolls; only
 *  `.palette__scroll` does, so Follow hover's `scrollIntoView({ block: "nearest" })` moves only the grid. */
export function PaletteFrame({ className, caption, selection, query, onQuery, follow, onFollow, children }: PaletteFrameProps) {
  return (
    <div className={`${className} palette`}>
      <div className="palette__pinned">
        {caption !== undefined && <div className="palette__caption">{caption}</div>}
        {selection}
        <input className="palette__search" placeholder="Search by hex id…" value={query} onChange={(e) => onQuery(e.target.value)} />
        <FollowHoverSwitch on={follow} onChange={onFollow} />
      </div>
      <div className="palette__scroll">{children}</div>
    </div>
  );
}

export interface PaletteSelectionProps {
  /** Row-major ids of the current stamp, `null` for a hole; empty = nothing picked. */
  cells: readonly (number | null)[];
  width: number;
  src(id: number): string;
  cellPx: number;
}

/** Plan 9 addendum R-F6: the picked stamp at palette scale, cells abutting. */
export function PaletteSelection({ cells, width, src, cellPx }: PaletteSelectionProps) {
  const first = cells.find((c): c is number => c !== null);
  const height = width > 0 ? Math.ceil(cells.length / width) : 0;
  const caption = first === undefined ? "Nothing picked" : cells.length === 1 ? paletteHex(first) : `${width}x${height} from ${paletteHex(first)}`;
  return (
    <figure className="palette__selection" aria-label="Selection">
      <figcaption className="palette__selection-caption">Selection · {caption}</figcaption>
      {first !== undefined && (
        <div className="palette__selection-grid" style={{ gridTemplateColumns: `repeat(${width}, ${cellPx}px)` }}>
          {cells.map((id, i) =>
            id === null ? (
              <span key={i} className="palette__selection-hole" style={{ width: cellPx, height: cellPx }} />
            ) : (
              <img key={i} src={src(id)} alt="" width={cellPx} height={cellPx} draggable={false} />
            ),
          )}
        </div>
      )}
    </figure>
  );
}
```

`packages/ui/src/shared/FoldedGrid.tsx`:

```tsx
import type { ReactNode } from "react";

export interface FoldedGridProps {
  /** Rows of ids in tileset order (`chunkRows`). */
  rows: readonly (readonly number[])[];
  /** First row of the right column (`pickFold`); `>= rows.length` renders one column. */
  fold: number;
  columns: number;
  cellPx: number;
  /** The family's grid class (`metatile-palette__grid`, `gbc-metatile-palette__grid`). */
  className: string;
  groupLabel?: string;
  /** Returns one keyed element per id. */
  renderCell(id: number): ReactNode;
}

/** Plan 9 addendum R-F2: two newspaper columns of whole rows; never re-flows a row. */
export function FoldedGrid({ rows, fold, columns, cellPx, className, groupLabel, renderCell }: FoldedGridProps) {
  const column = (part: readonly (readonly number[])[], side: "left" | "right") => (
    <div className={`palette__column palette__column--${side}`} style={{ gridTemplateColumns: `repeat(${columns}, ${cellPx}px)` }}>
      {part.flat().map((id) => renderCell(id))}
    </div>
  );
  const right = rows.slice(fold);
  return (
    <div className={`${className} palette__grid`} {...(groupLabel ? { role: "group", "aria-label": groupLabel } : {})}>
      {column(rows.slice(0, fold), "left")}
      {right.length > 0 && column(right, "right")}
    </div>
  );
}
```

`packages/ui/src/styles.css`:

1. In `.metatile-palette` remove `overflow-y: auto;` and `padding: var(--space-2);`. In `.gbc-metatile-palette` remove `overflow-y: auto;`, `width: 260px;`, `gap: var(--space-2);` and `padding: var(--space-3);`.
2. Delete the whole `.metatile-palette__grid` and `.gbc-metatile-palette__grid` rules: the wrapper is now `.palette__grid` (flex) and each column a grid from `FoldedGrid`'s inline style. A leftover `display: grid` on `.metatile-palette__grid` would stack the two columns vertically. In `.metatile-palette__boundary` change `white-space: nowrap;` to `white-space: normal;` (a 128 px column is narrower than the divider text).
3. Replace the `.metatile-palette__cell` rule body with:

```css
.metatile-palette__cell {
  position: relative;
  display: block;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  cursor: pointer;
}
```

   Delete `.metatile-palette__cell:hover:not(:disabled)` (a background change hides the abutting tile). Replace the bodies of `.metatile-palette__cell.metatile-palette__cell--selected:not(:disabled)` and `.metatile-palette__cell--hovered`, and change `.metatile-palette__cell:focus-visible`, as follows. Rename the selected rule's selector to `.metatile-palette__cell.metatile-palette__cell--selected` (the hover rule it out-specified is gone). Keep the comment above it but replace its last two sentences with "Plan 9F: an inset ring, so it reads on abutting cells and coexists with the hover outline."

```css
.metatile-palette__cell.metatile-palette__cell--selected {
  box-shadow: inset 0 0 0 2px var(--accent);
}

.metatile-palette__cell--hovered {
  outline: 2px dashed var(--accent);
  outline-offset: -2px;
}

.metatile-palette__cell:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}
```

   (`.metatile-palette__cell:focus-visible` must sit after `--hovered` in the file: move it below.)
4. Replace the `.gbc-metatile-palette__cell` body with the same body as `.metatile-palette__cell` above but `width: 32px; height: 32px;`. Replace `.gbc-metatile-palette__cell--selected` with `outline: 2px dashed var(--accent); outline-offset: -2px;` and `.gbc-metatile-palette__cell--picked` with `box-shadow: inset 0 0 0 2px var(--accent);`. Move `.gbc-metatile-palette__cell:focus-visible` below them and set `outline-offset: -2px`. Add `display: block;` to `.gbc-metatile-palette__thumb` and `.metatile-palette__thumb`.
5. Change `.edit-rail { width: 260px; }` to `width: 272px;` with the comment `/* Plan 9F: 2 x 128 px columns + 2 px rule + thin scrollbar + 1 px border. */`.
6. Append after `.palette__follow`:

```css
/* Plan 9F (addendum R-F5): one frame for both palettes. The pinned header never scrolls; only .palette__scroll does. */
.palette {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-panel);
}

.palette__pinned {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2);
  border-bottom: 1px solid var(--border);
}

.palette__caption {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.palette__search {
  background: var(--bg-panel-raised);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
}

.palette__search:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.palette__selection {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.palette__selection-caption {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.palette__selection-grid {
  display: grid;
  gap: 0;
  justify-content: start;
  max-height: 96px;
  overflow: hidden;
}

.palette__selection-grid img {
  display: block;
  image-rendering: pixelated;
}

.palette__scroll {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
}

.palette__grid {
  display: flex;
  align-items: flex-start;
}

.palette__column {
  display: grid;
  gap: 0;
  align-content: start;
}

.palette__column--right {
  border-left: 2px solid var(--border-strong);
}
```

   Delete the old `.metatile-palette__search` and `.metatile-palette__search:focus-visible` rules (replaced by `.palette__search`). Keep `.edit-rail > .metatile-palette` and `.edit-rail > .gbc-metatile-palette` (both still `flex: 1 1 0; min-width: 0; min-height: 0`).

- [ ] **Step 4: Run them to verify they pass**

Run: `node node_modules/vitest/vitest.mjs run packages/ui/test/shared/PaletteFrame.test.tsx packages/ui/test/styles.test.ts packages/ui/test/stylesContext.test.ts`
Expected: PASS. (`stylesContext.test.ts` still finds `min-width: 0` on `.edit-rail > .metatile-palette`.)

- [ ] **Step 5: Commit**

Run the full gate first (see Global Constraints). Palettes are not yet on the frame, so expect every other test unchanged: 2,789 + Task 1 (13) + Task 2 (4) + this task's new cases.

```bash
git add packages/ui/src/shared/PaletteFrame.tsx packages/ui/src/shared/FoldedGrid.tsx packages/ui/src/styles.css packages/ui/test/shared/PaletteFrame.test.tsx packages/ui/test/styles.test.ts
git commit -m "feat(ui): shared palette frame, selection box, folded grid and abutting-cell CSS"
```

---

### Task 4: GBA `MetatilePalette` on the frame, folded

**Files:**
- Modify: `packages/ui/src/components/MetatilePalette.tsx`
- Test: `packages/ui/test/MetatilePalette.test.tsx` (new cases; existing ones unchanged)

**Interfaces:**
- Consumes: `pickFold`, `chunkRows` (Task 1); `useUniformRows`, `ThumbSignature` (Task 2); `PaletteFrame`, `PaletteSelection`, `FoldedGrid` (Task 3).
- Produces: `MetatilePaletteProps` gains `thumbSignature?: ThumbSignature` (test seam; production omits it). Everything else unchanged, including `columns` (default 8) and `visibleCount`.

- [ ] **Step 1: Write the failing tests**

Append inside `describe("MetatilePalette", …)` in `packages/ui/test/MetatilePalette.test.tsx` (add `act` to its `@testing-library/react` import, and `import type { ThumbSignature } from "../src/shared/useUniformRows.js";`):

```tsx
  // Plan 9F: the pinned header, the two-column fold, the Selection box.
  const ids = (el: Element | null) => [...(el?.querySelectorAll(".metatile-palette__cell") ?? [])].map((b) => b.getAttribute("aria-label"));

  it("the header (Selection, search, Follow hover) sits outside the scroller", () => {
    const { container } = render(<MetatilePalette layoutName="L" split={SPLIT} primaryCount={16} secondaryCount={0} onSelect={() => {}} />);
    const pinned = container.querySelector(".palette__pinned")!;
    expect(pinned.querySelector('input[placeholder="Search by hex id…"]')).toBeTruthy();
    expect(pinned.querySelector('[role="switch"]')).toBeTruthy();
    expect(pinned.textContent).toContain("Selection · Nothing picked");
    expect(container.querySelector(".palette__scroll .metatile-palette__grid")).toBeTruthy();
  });

  it("folds 4 rows of 8 at the middle into two columns when no row is known uniform", () => {
    const { container } = render(<MetatilePalette layoutName="L" split={SPLIT} primaryCount={32} secondaryCount={0} onSelect={() => {}} />);
    expect(ids(container.querySelector(".palette__column--left"))).toHaveLength(16);
    expect(ids(container.querySelector(".palette__column--right"))[0]).toBe("metatile 0x10");
  });

  it("folds at the primary/secondary boundary when primaryCount is a whole number of rows", () => {
    // 2 primary rows (0-15) + 4 secondary rows (640-671): rows 6, middle 3, boundary 2 is the only candidate.
    const { container } = render(<MetatilePalette layoutName="L" split={SPLIT} primaryCount={16} secondaryCount={32} onSelect={() => {}} />);
    expect(ids(container.querySelector(".palette__column--right"))[0]).toBe("metatile 0x280");
    expect(container.querySelector(".palette__column--right .metatile-palette__boundary")).toBeTruthy();
  });

  it("folds after a row whose thumbnails turn out identical, once they load", async () => {
    // 6 rows of 8; row 1 (ids 8-15) is blank -> cut 2 (|2-3| = 1) beats nothing; then the right column starts at 0x10.
    const sig: ThumbSignature = (img) => (/\/(8|9|1[0-5])\.png$/.test(img.getAttribute("src")!) ? "blank" : img.getAttribute("src"));
    const { container } = render(<MetatilePalette layoutName="L" split={SPLIT} primaryCount={48} secondaryCount={0} onSelect={() => {}} thumbSignature={sig} />);
    expect(ids(container.querySelector(".palette__column--right"))[0]).toBe("metatile 0x18"); // middle (3) before loads
    act(() => {
      for (const img of container.querySelectorAll(".palette__scroll img")) fireEvent.load(img);
    });
    await waitFor(() => expect(ids(container.querySelector(".palette__column--right"))[0]).toBe("metatile 0x10"));
  });

  it("an active search shows one column of the matches; no matches keeps the header (Review Focus 1)", () => {
    const { container } = render(<MetatilePalette layoutName="L" split={SPLIT} primaryCount={32} secondaryCount={0} onSelect={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Search by hex id…"), { target: { value: "1" } });
    expect(container.querySelector(".palette__column--right")).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Search by hex id…"), { target: { value: "zz" } });
    expect(container.querySelectorAll(".metatile-palette__cell")).toHaveLength(0);
    expect(container.querySelector(".palette__pinned [role=switch]")).toBeTruthy();
  });

  it("the Selection box shows the picked stamp, abutting, with its caption", () => {
    const stamp = { width: 2, height: 1, cells: [{ metatileId: 3 }, { metatileId: 4 }] };
    const { container } = render(<MetatilePalette layoutName="L" split={SPLIT} primaryCount={8} secondaryCount={0} onSelect={() => {}} selected={stamp} />);
    expect(container.querySelector(".palette__selection")!.textContent).toBe("Selection · 2x1 from 0x3");
    expect([...container.querySelectorAll(".palette__selection img")].map((i) => i.getAttribute("src"))).toEqual(["/api/metatile/L/3.png", "/api/metatile/L/4.png"]);
  });

  it("a cell both picked and hovered carries both classes (Review Focus 4)", () => {
    render(<MetatilePalette layoutName="L" split={SPLIT} primaryCount={8} secondaryCount={0} onSelect={() => {}} selected={{ width: 1, height: 1, cells: [{ metatileId: 2 }] }} highlightId={2} />);
    const cls = screen.getByRole("button", { name: "metatile 0x2" }).className;
    expect(cls).toContain("metatile-palette__cell--selected");
    expect(cls).toContain("metatile-palette__cell--hovered");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node node_modules/vitest/vitest.mjs run packages/ui/test/MetatilePalette.test.tsx`
Expected: the 7 new cases FAIL (no `.palette__pinned`, no columns); every existing case PASSES. (`thumbSignature` is only a type error until Step 3; vitest does not typecheck.)

- [ ] **Step 3: Implement**

In `packages/ui/src/components/MetatilePalette.tsx`:

1. Imports: add
```ts
import { chunkRows, pickFold } from "../shared/paletteFold.js";
import { useUniformRows, type ThumbSignature } from "../shared/useUniformRows.js";
import { PaletteFrame, PaletteSelection } from "../shared/PaletteFrame.js";
import { FoldedGrid } from "../shared/FoldedGrid.js";
```
   and remove the `FollowHoverSwitch` import (the frame renders it).
2. `MetatilePaletteProps`: add
```ts
  /** Test seam for the fold's uniform-row check (Plan 9F); production uses the canvas pixel signature. */
  thumbSignature?: ThumbSignature;
```
   and destructure `thumbSignature` in the component's parameter list.
3. After `const visible = …`, add:
```ts
  const searching = normalizedQuery !== "";
  const rows = useMemo(() => chunkRows(visible, columns), [visible, columns]);
  const src = (id: number) => `/api/metatile/${encodeURIComponent(layoutName)}/${id}.png`;
  const { uniformRows, onThumbLoad, onThumbError } = useUniformRows(searching ? [] : rows, layoutName, thumbSignature);
  // The primary/secondary boundary is a safe cut only when secondary starts a fresh row in the index order.
  const boundaryRow = visibleCount === undefined && secondaryCount > 0 && primaryCount % columns === 0 ? primaryCount / columns : undefined;
  const fold = searching ? rows.length : pickFold(rows.length, uniformRows, boundaryRow);
  const selectionCells = selected ? Array.from({ length: selected.width * selected.height }, (_, i) => selected.cells[i]?.metatileId ?? null) : [];
```
   `visible` must be memoised for `rows` to be stable: wrap the existing `visible` expression in `useMemo(() => …, [ids, normalizedQuery])`.
4. Replace the returned JSX's outer `<div className="metatile-palette">`, the `<FollowHoverSwitch …/>`, the `<input className="metatile-palette__search" …/>` and the `<div className="metatile-palette__grid" style=…>{visible.map(…)}</div>` with:
```tsx
    <PaletteFrame
      className="metatile-palette"
      selection={<PaletteSelection cells={selectionCells} width={selected?.width ?? 0} src={src} cellPx={16} />}
      query={query}
      onQuery={setQuery}
      follow={follow}
      onFollow={setFollow}
    >
      <FoldedGrid
        rows={rows}
        fold={fold}
        columns={columns}
        cellPx={16}
        className="metatile-palette__grid"
        renderCell={(id) => {
          /* the existing body of the old visible.map((id) => { … }) callback, unchanged, except the <img>: */
        }}
      />
    </PaletteFrame>
```
   Move the old `visible.map` callback body (the `const outOfRange …` lines and the returned `<Fragment key={id}>…</Fragment>`) into `renderCell` verbatim, keeping its comments. In its `<img>` change `src={…}` to `src={src(id)}` and add `onLoad={(e) => onThumbLoad(id, e.currentTarget)}` and `onError={() => onThumbError(id)}`.

- [ ] **Step 4: Run them to verify they pass**

Run: `node node_modules/vitest/vitest.mjs run packages/ui/test/MetatilePalette.test.tsx packages/ui/test/MapEditingWorkspace.test.tsx packages/ui/test/App.test.tsx packages/ui/test/AppContextEdit.test.tsx`
Expected: PASS, all existing cases unchanged (drag-rect math still uses indices into `visible`; `columns={2}`/`{4}`/`{1}` tests fold into two columns but their ids and rects are the same).

If an existing case fails, fix the implementation, not the test. Retarget a test only when the spec changed what it pins, and name the reason in the commit message.

- [ ] **Step 5: Commit**

Full gate, then:

```bash
git add packages/ui/src/components/MetatilePalette.tsx packages/ui/test/MetatilePalette.test.tsx
git commit -m "feat(ui): GBA palette on the shared frame: pinned header, two-column fold, Selection box"
```

---

### Task 5: GBC `GbcMetatilePalette` on the frame, 4 per row, folded, with search

**Files:**
- Modify: `packages/ui/src/gbc/GbcMetatilePalette.tsx`
- Test: `packages/ui/test/gbc/GbcMetatilePalette.test.tsx` (new cases; one retarget), `packages/ui/test/gbc/GbcMetatilePaletteSelect.test.tsx` (unchanged)

**Interfaces:**
- Consumes: Tasks 1-3 as in Task 4.
- Produces: `GbcMetatilePaletteProps` gains `thumbSignature?: ThumbSignature`. Row width constant `GBC_ROW = 4`.

- [ ] **Step 1: Write the failing tests and the one retarget**

Retarget, in `renders metatileCount cells, with the exact src for one id`: replace `expect(img?.getAttribute("loading")).toBe("lazy");` with `expect(img?.getAttribute("loading")).toBeNull();`. Reason (commit message): the fold's uniform-row check needs every thumbnail's pixels, and a lazy thumbnail below the fold never loads; at most 256 GBC thumbnails, cached server-side.

Append inside `describe("GbcMetatilePalette", …)` (add `act`, `fireEvent`, `waitFor` to its `@testing-library/react` import and `import type { ThumbSignature } from "../../src/shared/useUniformRows.js";`):

```tsx
  // Plan 9F
  const labels = (el: Element | null) => [...(el?.querySelectorAll(".gbc-metatile-palette__cell") ?? [])].map((b) => b.getAttribute("aria-label"));

  it("rows of 4, folded at the middle into two columns; caption, Selection, search and switch pinned", () => {
    const { container } = render(<GbcMetatilePalette mapName="M" time="day" tilesetName="T" metatileCount={16} />);
    expect(labels(container.querySelector(".palette__column--left"))).toEqual(["metatile 0x0", "metatile 0x1", "metatile 0x2", "metatile 0x3", "metatile 0x4", "metatile 0x5", "metatile 0x6", "metatile 0x7"]);
    expect(labels(container.querySelector(".palette__column--right"))[0]).toBe("metatile 0x8");
    expect((container.querySelector(".palette__column--left") as HTMLElement).style.gridTemplateColumns).toBe("repeat(4, 32px)");
    const pinned = container.querySelector(".palette__pinned")!;
    expect(pinned.textContent).toContain("T · 16 metatiles");
    expect(pinned.textContent).toContain("Selection · Nothing picked");
    expect(pinned.querySelector('input[placeholder="Search by hex id…"]')).toBeTruthy();
    expect(container.querySelector(".palette__scroll .gbc-metatile-palette__grid")).toBeTruthy();
  });

  it("one row of blocks is one column, no empty right column (Review Focus 5)", () => {
    const { container } = render(<GbcMetatilePalette mapName="M" time="day" tilesetName="T" metatileCount={3} />);
    expect(container.querySelector(".palette__column--right")).toBeNull();
  });

  it("folds after a uniform row once thumbnails load; a time-of-day change starts over (Review Focus 2)", async () => {
    // 6 rows of 4; row 0 (ids 0-3) is blank -> cut 1? |1-3| = 2 -> it is the only candidate -> right column starts at 0x4.
    const sig: ThumbSignature = (img) => (/\/[0-3]\.png/.test(img.getAttribute("src")!) ? "blank" : img.getAttribute("src"));
    const { container, rerender } = render(<GbcMetatilePalette mapName="M" time="day" tilesetName="T" metatileCount={24} thumbSignature={sig} />);
    expect(labels(container.querySelector(".palette__column--right"))[0]).toBe("metatile 0xc");
    act(() => {
      for (const img of container.querySelectorAll(".palette__scroll img")) fireEvent.load(img);
    });
    await waitFor(() => expect(labels(container.querySelector(".palette__column--right"))[0]).toBe("metatile 0x4"));
    rerender(<GbcMetatilePalette mapName="M" time="nite" tilesetName="T" metatileCount={24} thumbSignature={sig} />);
    await waitFor(() => expect(labels(container.querySelector(".palette__column--right"))[0]).toBe("metatile 0xc"));
  });

  it("search filters by hex id into one column", () => {
    const { container } = render(<GbcMetatilePalette mapName="M" time="day" tilesetName="T" metatileCount={32} />);
    fireEvent.change(screen.getByPlaceholderText("Search by hex id…"), { target: { value: "1f" } });
    expect(labels(container)).toEqual(["metatile 0x1f"]);
    expect(container.querySelector(".palette__column--right")).toBeNull();
  });

  it("the Selection box shows the picked block at 32 px", () => {
    const { container } = render(<GbcMetatilePalette mapName="M" time="day" tilesetName="T" metatileCount={8} onSelect={() => {}} selected={5} />);
    expect(container.querySelector(".palette__selection")!.textContent).toBe("Selection · 0x5");
    const img = container.querySelector(".palette__selection img")!;
    expect(img.getAttribute("src")).toBe("/api/metatile/M/5.png?time=day");
    expect(img.getAttribute("width")).toBe("32");
  });

  it("a block both picked and hovered carries both classes (Review Focus 4)", () => {
    render(<GbcMetatilePalette mapName="M" time="day" tilesetName="T" metatileCount={8} onSelect={() => {}} selected={2} highlightId={2} />);
    const cls = screen.getByRole("button", { name: "metatile 0x2" }).className;
    expect(cls).toContain("gbc-metatile-palette__cell--picked");
    expect(cls).toContain("gbc-metatile-palette__cell--selected");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node node_modules/vitest/vitest.mjs run packages/ui/test/gbc/GbcMetatilePalette.test.tsx packages/ui/test/gbc/GbcMetatilePaletteSelect.test.tsx`
Expected: the 6 new cases and the retargeted one FAIL; the rest PASS.

- [ ] **Step 3: Implement**

Replace the body of `GbcMetatilePalette` in `packages/ui/src/gbc/GbcMetatilePalette.tsx` (keep the file's doc comment; add one line to it: "Plan 9F: on the shared PaletteFrame, rows of 4 (Polished Map's METATILES_PER_ROW) folded into two columns, with the hex search."). Imports become:

```ts
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { GbcStamp } from "@pokemap/core/src/gbc/edit/paint.js";
import type { GbcTimeOfDay } from "./time.js";
import { useFollowHover } from "../shared/useFollowHover.js";
import { chunkRows, pickFold } from "../shared/paletteFold.js";
import { useUniformRows, type ThumbSignature } from "../shared/useUniformRows.js";
import { PaletteFrame, PaletteSelection } from "../shared/PaletteFrame.js";
import { FoldedGrid } from "../shared/FoldedGrid.js";
```

Add to `GbcMetatilePaletteProps`:

```ts
  /** Test seam for the fold's uniform-row check (Plan 9F); production uses the canvas pixel signature. */
  thumbSignature?: ThumbSignature;
```

Component:

```tsx
/** Polished Map's fixed sidebar width (`main-window.h` METATILES_PER_ROW): the view Crystal blocksets are authored for. */
const GBC_ROW = 4;

// Memoised like MapTree (Plan 9 follow-up O2); GbcMapEditing passes a stable onSelect.
export const GbcMetatilePalette = memo(function GbcMetatilePalette({ mapName, time, tilesetName, metatileCount, highlightId = null, onSelect, selected = null, thumbSignature }: GbcMetatilePaletteProps) {
  const cellRefs = useRef(new Map<number, HTMLButtonElement>());
  const [follow, setFollow] = useFollowHover();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!follow || highlightId === null) return;
    cellRefs.current.get(highlightId)?.scrollIntoView({ block: "nearest" });
  }, [highlightId, follow]);

  const q = query.trim().toLowerCase();
  const searching = q !== "";
  const visible = useMemo(() => {
    const all = Array.from({ length: metatileCount }, (_, i) => i);
    return searching ? all.filter((id) => hex(id).includes(q)) : all;
  }, [metatileCount, searching, q]);
  const rows = useMemo(() => chunkRows(visible, GBC_ROW), [visible]);
  const src = (id: number) => `/api/metatile/${encodeURIComponent(mapName)}/${id}.png?time=${time}`;
  const { uniformRows, onThumbLoad, onThumbError } = useUniformRows(searching ? [] : rows, `${mapName}:${time}`, thumbSignature);
  const fold = searching ? rows.length : pickFold(rows.length, uniformRows);

  // One handler for all cells (the id rides on `data-id`), not 500+ closures rebuilt on every hover re-render.
  const pick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onSelect?.({ width: 1, height: 1, cells: [{ metatileId: Number(e.currentTarget.dataset.id) }] });
  };

  return (
    <PaletteFrame
      className="gbc-metatile-palette"
      caption={<span className="gbc-metatile-palette__header">{tilesetName} · {metatileCount} metatiles</span>}
      selection={<PaletteSelection cells={selected === null ? [] : [selected]} width={selected === null ? 0 : 1} src={src} cellPx={32} />}
      query={query}
      onQuery={setQuery}
      follow={follow}
      onFollow={setFollow}
    >
      <FoldedGrid
        rows={rows}
        fold={fold}
        columns={GBC_ROW}
        cellPx={32}
        className="gbc-metatile-palette__grid"
        groupLabel="Metatiles"
        renderCell={(id) => {
          const hovered = id === highlightId;
          const picked = id === selected;
          return (
            <button
              key={id}
              type="button"
              data-id={id}
              ref={(el) => {
                if (el) cellRefs.current.set(id, el);
                else cellRefs.current.delete(id);
              }}
              className={`gbc-metatile-palette__cell${hovered ? " gbc-metatile-palette__cell--selected" : ""}${picked ? " gbc-metatile-palette__cell--picked" : ""}`}
              aria-label={`metatile ${hex(id)}`}
              aria-pressed={picked}
              aria-current={picked ? "true" : undefined}
              disabled={!onSelect}
              onClick={pick}
            >
              <img
                className="gbc-metatile-palette__thumb"
                src={src(id)}
                alt=""
                width={32}
                height={32}
                draggable={false}
                onLoad={(e) => onThumbLoad(id, e.currentTarget)}
                onError={() => onThumbError(id)}
              />
            </button>
          );
        }}
      />
    </PaletteFrame>
  );
});
```

(`hex` stays the file's lowercase `0x${n.toString(16)}`: the cell aria-labels that tests pin use it. The Selection caption uses the shared uppercase `paletteHex`.)

- [ ] **Step 4: Run them to verify they pass**

Run: `node node_modules/vitest/vitest.mjs run packages/ui/test/gbc`
Expected: PASS (every file under `test/gbc`; `GbcApp.test.tsx`'s scroll-spy case still sees `scrollIntoView` once per highlight change).

- [ ] **Step 5: Commit**

Full gate, then:

```bash
git add packages/ui/src/gbc/GbcMetatilePalette.tsx packages/ui/test/gbc/GbcMetatilePalette.test.tsx
git commit -m "feat(ui): GBC palette on the shared frame: 4 per row, two-column fold, search, Selection box

Retargets one test: thumbnails are no longer loading=lazy, because the fold's uniform-row
check needs every thumbnail's pixels (at most 256 GBC thumbnails, cached by the server)."
```

---

### Task 6: DESIGN.md and live acceptance

**Files:**
- Modify: `packages/ui/DESIGN.md` ("Edit layout (Plan 9, D4/D5)")
- Create: `docs/superpowers/task-reports/pokemap-plan-9-family-shell/followup-F-live.md` (+ screenshots in the same directory)

- [ ] **Step 1: DESIGN.md**

In the ASCII diagram change `edit-rail (260 px)` to `edit-rail (272 px)`. Replace the `**Rail palette**` bullet with:

```markdown
- **Rail palette** (Plan 9F, addendum `specs/2026-10-15-pokemap-plan-9-palette-addendum.md`): always shown; a pick while another tool is active only sets the stamp. One frame for both families (`shared/PaletteFrame.tsx`): a pinned header (GBC caption, Selection box with the picked stamp at palette scale, hex search, Follow hover) above `.palette__scroll`, the only scroller. Cells abut (no gap, border or radius) in the tileset's own rows (GBA 8, GBC 4: Polished Map's width), folded into two newspaper columns (`shared/FoldedGrid.tsx`): GBA 2 x 8 x 16 px, GBC 2 x 4 x 32 px. The fold (`shared/paletteFold.ts`) cuts after the pixel-identical row nearest the middle (`shared/useUniformRows.ts`), or GBA's primary/secondary boundary, else at the middle; one column while searching. Picked = inset accent ring, hovered = inward dashed outline, so both read on abutting cells.
```

In the `**Rail**` bullet change `260 px` to `272 px`.

- [ ] **Step 2: Live check (both families)**

Per `docs/superpowers/LESSONS.md` "Live Browser Verification". Before starting, record `git status --porcelain | sha256sum` and the sha256 of `maps/Route29.blk` (PerfPlus) and `data/layouts/Route29/map.bin` (GBA game); compare after. Nothing is saved in this check.
- Hub on 5184 (`node --import tsx --import <scratch>/live/preload.mjs packages/server/src/serve.ts "<project>"`), Vite on 5183 (`live/vite.mjs`), Chromium over CDP 9333, `playwright-core` (`live/pw.mjs`).
- For GBA (`C:\Programming Projects\Pokemon Game\game`, Route29) and GBC (`C:\Programming Projects\pokecrystal-PerfPlus`, GoldenrodCity and Route29), at 1280x800 and 1024x800, Map view and in-context:
  1. `document.documentElement.scrollWidth === clientWidth` (no page overflow).
  2. Two `.palette__column` elements; left column `getBoundingClientRect().width` 128; `.palette__grid` width 258; `.palette__scroll` has no horizontal overflow (`scrollWidth === clientWidth`).
  3. Hover a map cell whose id sits far down the palette with Follow hover on: `.palette__scroll.scrollTop > 0`, the hovered cell is inside the scroller's rect, `.palette__pinned` top unchanged, `.edit-rail.scrollTop === 0`, `document.scrollingElement.scrollTop === 0`.
  4. Pick a cell (GBA: drag a 2x2 rect): the Selection box shows it with the right caption.
  5. Note the chosen fold row and whether it was a uniform-row cut, the boundary, or the middle.
  6. Screenshot the rail (`followup-F-<family>-<width>.png`). Look at it: buildings (GBA Pokemon Center, GBC Radio Tower) whole within one column.
- [ ] **Step 3: Write `followup-F-live.md`** with each item's numbers, the fold choices and screenshot names, and the before/after hash comparison. Stop servers by port (5183, 5184, 9333).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/DESIGN.md docs/superpowers/task-reports/pokemap-plan-9-family-shell/followup-F-live.md docs/superpowers/task-reports/pokemap-plan-9-family-shell/followup-F-*.png
git commit -m "docs: Plan 9F palette in DESIGN.md; live acceptance report"
```

Then push `plan-9-family-shell` (PR #19 picks it up) only after the user says so.
