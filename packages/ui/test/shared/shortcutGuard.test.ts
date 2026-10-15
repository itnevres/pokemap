import { describe, it, expect, afterEach } from "vitest";
import { isTextTarget } from "../../src/shared/shortcutGuard.js";

afterEach(() => {
  document.body.innerHTML = "";
});

/** Mounts `html` and returns the innermost `#t` (the event target). */
function target(html: string): Element {
  document.body.innerHTML = html;
  return document.getElementById("t")!;
}

describe("isTextTarget (Plan 9 final review m4)", () => {
  it.each([
    ['<input id="t">'],
    ['<textarea id="t"></textarea>'],
    ['<select id="t"></select>'],
    ['<div id="t" contenteditable=""></div>'],
    ['<div id="t" contenteditable="true"></div>'],
    ['<div id="t" contenteditable="plaintext-only"></div>'],
    ['<div contenteditable="plaintext-only"><span id="t">x</span></div>'],
  ])("typing into %s is a text target", (html) => {
    expect(isTextTarget(target(html))).toBe(true);
  });

  it.each([
    ['<button id="t">x</button>'],
    ['<div id="t" contenteditable="false"></div>'],
    ['<div id="t"></div>'],
  ])("%s is not a text target", (html) => {
    expect(isTextTarget(target(html))).toBe(false);
  });

  it("a null or non-element target is not a text target", () => {
    expect(isTextTarget(null)).toBe(false);
    expect(isTextTarget(window)).toBe(false);
  });
});
