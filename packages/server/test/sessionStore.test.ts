import { describe, expect, it } from "vitest";
import { createSessionStore } from "../src/sessionStore.js";

// The store is family-neutral: an entry is anything with `session.isDirty`.
interface Entry { id: number; session: { isDirty: boolean } }

const make = () => {
  const opened: string[] = [];
  const store = createSessionStore<Entry>("/root", (name) => {
    if (name === "Nope") throw new Error("unknown map Nope");
    opened.push(name);
    return { id: opened.length, session: { isDirty: false } };
  });
  return { store, opened };
};

describe("createSessionStore (Plan H I2a)", () => {
  it("opens lazily and returns the same entry until closed", () => {
    const { store, opened } = make();
    expect(store.has("A")).toBe(false);
    const first = store.open("A");
    expect(store.has("A")).toBe(true);
    expect(store.open("A")).toBe(first);
    expect(opened).toEqual(["A"]);
  });

  it("close drops the entry; the next open builds a fresh one", () => {
    const { store, opened } = make();
    const first = store.open("A");
    store.close("A");
    expect(store.has("A")).toBe(false);
    const second = store.open("A");
    expect(second).not.toBe(first);
    expect(opened).toEqual(["A", "A"]);
  });

  it("an opener that throws stores nothing and a retry opens again", () => {
    const { store } = make();
    expect(() => store.open("Nope")).toThrow("unknown map Nope");
    expect(store.has("Nope")).toBe(false);
    expect(store.entries()).toEqual([]);
    expect(() => store.open("Nope")).toThrow("unknown map Nope");
  });

  it("dirty lists only dirty sessions, sorted", () => {
    const { store } = make();
    for (const name of ["Zed", "Alpha", "Mid"]) store.open(name);
    expect(store.dirty()).toEqual([]);
    store.open("Zed").session.isDirty = true;
    store.open("Alpha").session.isDirty = true;
    expect(store.dirty()).toEqual(["Alpha", "Zed"]);
    store.open("Alpha").session.isDirty = false;
    expect(store.dirty()).toEqual(["Zed"]);
  });

  it("closeAll drops every session", () => {
    const { store } = make();
    store.open("A"); store.open("B");
    store.closeAll();
    expect(store.has("A")).toBe(false);
    expect(store.has("B")).toBe(false);
    expect(store.entries()).toEqual([]);
    expect(store.dirty()).toEqual([]);
  });

  it("entries returns [name, entry] pairs in open order, as a copy", () => {
    const { store } = make();
    const a = store.open("A"); const b = store.open("B");
    const list = store.entries();
    expect(list).toEqual([["A", a], ["B", b]]);
    list.length = 0;
    expect(store.entries()).toHaveLength(2);
  });

  it("exposes the root it was built with", () => {
    expect(make().store.root).toBe("/root");
  });
});
