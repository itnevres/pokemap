import { StrictMode } from "react";
import { act, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { useRestoreFocus } from "../../src/shared/dialogFocus.js";

function Dialog({ name }: { name: string }) {
  useRestoreFocus();
  return <div role="dialog" aria-modal="true" aria-label={name}><button autoFocus>{name} control</button></div>;
}

it.each([false, true])("removing an older dialog keeps focus in the newer dialog (strict=%s)", async (strict) => {
  const content = (older: boolean, newer: boolean) => <>
    <button autoFocus>Opener</button>
    {older && <Dialog key="older" name="Older" />}
    {newer && <Dialog key="newer" name="Newer" />}
  </>;
  const tree = (older: boolean, newer: boolean) => strict
    ? <StrictMode>{content(older, newer)}</StrictMode> : content(older, newer);
  const view = render(tree(false, false));
  const opener = screen.getByRole("button", { name: "Opener" });
  expect(document.activeElement).toBe(opener);
  view.rerender(tree(true, false));
  await act(async () => {});
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Older control" }));
  view.rerender(tree(true, true));
  await act(async () => {});
  const newer = screen.getByRole("button", { name: "Newer control" });
  expect(document.activeElement).toBe(newer);
  view.rerender(tree(false, true));
  await act(async () => {});
  expect(screen.queryByRole("dialog", { name: "Older" })).toBeNull();
  expect(document.activeElement).toBe(newer);
  view.rerender(tree(false, false));
  await act(async () => {});
  expect(document.activeElement).toBe(opener);
});
