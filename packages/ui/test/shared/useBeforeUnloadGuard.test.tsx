import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useBeforeUnloadGuard } from "../../src/shared/useBeforeUnloadGuard.js";

describe("useBeforeUnloadGuard", () => {
  it("prevents navigation only while dirty", () => {
    const { rerender, unmount } = renderHook(({ dirty }) => useBeforeUnloadGuard(dirty), { initialProps: { dirty: true } });

    const dirtyEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);

    rerender({ dirty: false });
    const cleanEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);

    rerender({ dirty: true });
    unmount();
    const unmountedEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unmountedEvent);
    expect(unmountedEvent.defaultPrevented).toBe(false);
  });
});
