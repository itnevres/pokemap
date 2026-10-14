import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStrokeChain, type StrokeSession } from "../../src/shared/useStrokeChain.js";

function held() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => act(async () => {});

type Held = ReturnType<typeof held>;
/** A session whose every call is logged and held until the test releases it. */
function heldSession(log: string[]) {
  const begins: Held[] = [], applies: Held[] = [], ends: Held[] = [];
  const session: StrokeSession<number> = {
    beginStroke() { const h = held(); begins.push(h); log.push("begin"); return h.promise; },
    applyPaint(b: number) { const h = held(); applies.push(h); log.push(`apply:${b}`); return h.promise; },
    endStroke() { const h = held(); ends.push(h); log.push("end"); return h.promise; },
  };
  return { session, begins, applies, ends };
}

function setup(visitKey = "A", onError: (m: string) => void = () => {}) {
  return renderHook(({ k }) => useStrokeChain<number>(k, onError), { initialProps: { k: visitKey } });
}

describe("useStrokeChain", () => {
  it("runs begin, each apply round trip, then end, strictly in order", async () => {
    const log: string[] = [];
    const s = heldSession(log);
    const { result } = setup();
    act(() => { result.current.start(s.session, 1); result.current.queue(2); result.current.queue(3); result.current.finish(4); });
    await flush();
    expect(log).toEqual(["begin"]);
    await flush(); s.begins[0]!.resolve(); await flush();
    expect(log).toEqual(["begin", "apply:1"]);
    await flush(); s.applies[0]!.resolve(); await flush();
    expect(log).toEqual(["begin", "apply:1", "apply:2"]);
    await flush(); s.applies[1]!.resolve(); await flush();
    expect(log).toEqual(["begin", "apply:1", "apply:2", "apply:3"]);
    await flush(); s.applies[2]!.resolve(); await flush();
    expect(log).toEqual(["begin", "apply:1", "apply:2", "apply:3", "apply:4"]);
    await flush(); s.applies[3]!.resolve(); await flush();
    expect(log).toEqual(["begin", "apply:1", "apply:2", "apply:3", "apply:4", "end"]);
    await flush(); s.ends[0]!.resolve(); await flush();
    expect(result.current.isOpen()).toBe(false);
  });

  it("a null first and null last issue only begin and end", async () => {
    const log: string[] = [];
    const s = heldSession(log);
    const { result } = setup();
    act(() => { result.current.start(s.session, null); result.current.finish(null); });
    await flush();
    await flush(); s.begins[0]!.resolve(); await flush();
    expect(log).toEqual(["begin", "end"]);
  });

  it("the next stroke begin waits for the previous end", async () => {
    const log: string[] = [];
    const s = heldSession(log);
    const { result } = setup();
    act(() => { result.current.start(s.session, null); result.current.finish(null); });
    await flush(); s.begins[0]!.resolve(); await flush();
    act(() => { result.current.start(s.session, null); });
    await flush();
    expect(log).toEqual(["begin", "end"]);
    await flush(); s.ends[0]!.resolve(); await flush();
    expect(log).toEqual(["begin", "end", "begin"]);
  });

  it("a lost mouseup: start while open ends the old stroke before the new begin", async () => {
    const log: string[] = [];
    const s = heldSession(log);
    const { result } = setup();
    act(() => { result.current.start(s.session, 1); });
    await flush(); s.begins[0]!.resolve(); await flush();
    await flush(); s.applies[0]!.resolve(); await flush();
    act(() => { result.current.start(s.session, 2); });
    await flush();
    expect(log).toEqual(["begin", "apply:1", "end"]);
    await flush(); s.ends[0]!.resolve(); await flush();
    expect(log).toEqual(["begin", "apply:1", "end", "begin"]);
    expect(result.current.isOpen()).toBe(true);
  });

  it("queue and finish without an open stroke are no-ops, even after an earlier stroke finished", async () => {
    const log: string[] = [];
    const s = heldSession(log);
    const { result } = setup();
    act(() => { result.current.start(s.session, null); result.current.finish(null); });
    await flush(); s.begins[0]!.resolve(); await flush(); s.ends[0]!.resolve(); await flush();
    expect(log).toEqual(["begin", "end"]);
    act(() => { result.current.queue(1); result.current.finish(2); });
    await flush();
    expect(log).toEqual(["begin", "end"]);
    expect(result.current.isOpen()).toBe(false);
  });

  describe("retirement", () => {
    type R = ReturnType<typeof setup>;
    const retire: Record<string, (r: R) => void> = {
      "map change": (r) => r.rerender({ k: "B" }),
      "A -> B -> A": (r) => { r.rerender({ k: "B" }); r.rerender({ k: "A" }); },
      "unmount": (r) => r.unmount(),
    };
    for (const [label, go] of Object.entries(retire)) {
      it(`${label} during begin: nothing paints, the begun stroke still ends, no error`, async () => {
        const log: string[] = [];
        const onError = vi.fn();
        const s = heldSession(log);
        const r = setup("A", onError);
        act(() => { r.result.current.start(s.session, 1); r.result.current.queue(2); });
        await flush();
        go(r);
        await flush(); s.begins[0]!.resolve(); await flush();
        expect(log).toEqual(["begin", "end"]);
        await flush(); s.ends[0]!.reject(new Error("late")); await flush();
        expect(onError).not.toHaveBeenCalled();
      });

      it(`${label} during an apply: queued applies drop, end still issues, no error`, async () => {
        const log: string[] = [];
        const onError = vi.fn();
        const s = heldSession(log);
        const r = setup("A", onError);
        act(() => { r.result.current.start(s.session, 1); r.result.current.queue(2); r.result.current.queue(3); });
        await flush(); s.begins[0]!.resolve(); await flush();
        go(r);
        await flush(); s.applies[0]!.reject(new Error("late")); await flush();
        expect(log).toEqual(["begin", "apply:1", "end"]);
        expect(onError).not.toHaveBeenCalled();
      });

      it(`${label} during end: the end is not reported`, async () => {
        const log: string[] = [];
        const onError = vi.fn();
        const s = heldSession(log);
        const r = setup("A", onError);
        act(() => { r.result.current.start(s.session, null); r.result.current.finish(null); });
        await flush(); s.begins[0]!.resolve(); await flush();
        go(r);
        await flush(); s.ends[0]!.reject(new Error("late")); await flush();
        expect(log).toEqual(["begin", "end"]);
        expect(onError).not.toHaveBeenCalled();
      });
    }

    it("a retired stroke whose begin failed issues no end", async () => {
      const log: string[] = [];
      const s = heldSession(log);
      const r = setup();
      act(() => { r.result.current.start(s.session, 1); });
      await flush();
      act(() => r.rerender({ k: "B" }));
      await flush(); s.begins[0]!.reject(new Error("x")); await flush();
      expect(log).toEqual(["begin"]);
    });

    it("retired before the begin link runs (queued behind a held previous end): no begin, no end", async () => {
      const log: string[] = [];
      const s = heldSession(log);
      const r = setup();
      act(() => { r.result.current.start(s.session, null); r.result.current.finish(null); });
      await flush(); s.begins[0]!.resolve(); await flush();
      expect(log).toEqual(["begin", "end"]); // previous end held
      act(() => { r.result.current.start(s.session, 1); });
      await flush();
      r.rerender({ k: "B" });
      await flush(); s.ends[0]!.resolve(); await flush();
      expect(log).toEqual(["begin", "end"]);
      expect(r.result.current.isOpen()).toBe(false);
    });

    it("a new visit stroke waits behind the retired visit end", async () => {
      const log: string[] = [];
      const s = heldSession(log);
      const r = setup();
      act(() => { r.result.current.start(s.session, null); });
      await flush(); s.begins[0]!.resolve(); await flush();
      act(() => r.rerender({ k: "B" }));
      act(() => { r.result.current.start(s.session, null); });
      await flush();
      expect(log).toEqual(["begin", "end"]);
      await flush(); s.ends[0]!.resolve(); await flush();
      expect(log).toEqual(["begin", "end", "begin"]);
    });
  });

  describe("errors", () => {
    it("a begin failure reports once, drops queued applies, and finish still ends", async () => {
      const log: string[] = [];
      const onError = vi.fn();
      const s = heldSession(log);
      const { result } = setup("A", onError);
      act(() => { result.current.start(s.session, 1); result.current.queue(2); result.current.finish(3); });
      await flush(); s.begins[0]!.reject(new Error("no begin")); await flush();
      expect(log).toEqual(["begin", "end"]);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith("no begin");
    });

    it("an apply failure is reported; later applies still run and end still waits", async () => {
      const log: string[] = [];
      const onError = vi.fn();
      const s = heldSession(log);
      const { result } = setup("A", onError);
      act(() => { result.current.start(s.session, 1); result.current.queue(2); result.current.finish(null); });
      await flush(); s.begins[0]!.resolve(); await flush();
      await flush(); s.applies[0]!.reject(new Error("bad")); await flush();
      expect(onError).toHaveBeenCalledWith("bad");
      expect(log).toEqual(["begin", "apply:1", "apply:2"]);
      await flush(); s.applies[1]!.resolve(); await flush();
      expect(log).toEqual(["begin", "apply:1", "apply:2", "end"]);
    });

    it("a non-Error rejection reports the generic message", async () => {
      const onError = vi.fn();
      const s: StrokeSession<number> = { beginStroke: () => Promise.reject("x"), applyPaint: () => Promise.resolve(), endStroke: () => Promise.resolve() };
      const { result } = setup("A", onError);
      act(() => { result.current.start(s, null); });
      await flush();
      expect(onError).toHaveBeenCalledWith("Paint failed.");
    });

    it("a throwing onError on the last apply still lets end go out, reported once (M3, finish path)", async () => {
      const log: string[] = [];
      const onError = vi.fn(() => { throw new Error("ui broke"); });
      const s = heldSession(log);
      const { result } = setup("A", onError);
      act(() => { result.current.start(s.session, null); result.current.finish(5); });
      await flush(); s.begins[0]!.resolve(); await flush();
      s.applies[0]!.reject(new Error("rect failed")); await flush();
      expect(log).toEqual(["begin", "apply:5", "end"]);
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it("a throwing onError does not poison the chain (M3)", async () => {
      const log: string[] = [];
      const onError = vi.fn(() => { throw new Error("ui broke"); });
      const bad: StrokeSession<number> = {
        beginStroke: () => { log.push("begin"); return Promise.reject(new Error("x")); },
        applyPaint: (b) => { log.push(`apply:${b}`); return Promise.resolve(); },
        endStroke: () => { log.push("end"); return Promise.resolve(); },
      };
      const { result } = setup("A", onError);
      act(() => { result.current.start(bad, 1); result.current.finish(null); });
      await flush();
      expect(onError).toHaveBeenCalled();
      const good: StrokeSession<number> = {
        beginStroke: () => { log.push("begin2"); return Promise.resolve(); },
        applyPaint: (b) => { log.push(`apply2:${b}`); return Promise.resolve(); },
        endStroke: () => { log.push("end2"); return Promise.resolve(); },
      };
      act(() => { result.current.start(good, 7); result.current.finish(null); });
      await flush();
      expect(log).toEqual(["begin", "end", "begin2", "apply2:7", "end2"]);
    });
  });

  it("settled() waits for a held apply", async () => {
    const log: string[] = [];
    const s = heldSession(log);
    const { result } = setup();
    act(() => { result.current.start(s.session, 1); });
    await flush(); s.begins[0]!.resolve(); await flush();
    let done = false;
    void result.current.settled().then(() => { done = true; });
    await flush();
    expect(done).toBe(false);
    await flush(); s.applies[0]!.resolve(); await flush();
    expect(done).toBe(true);
  });
});
