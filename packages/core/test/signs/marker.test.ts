import { describe, expect, it } from "vitest";
import { formatMarker, parseMarker, signHash } from "../../src/signs/marker.js";

describe("sign markers", () => {
  it("reads both families' markers and refuses malformed metadata", () => {
    expect(parseMarker("; pokemap:sign name 1a2b3c4d")).toEqual({ mode: "name", hash: "1a2b3c4d" });
    expect(parseMarker("@ pokemap:sign species 0123abcd")).toEqual({ mode: "species", hash: "0123abcd" });
    for (const junk of ["junk", "; pokemap:sign other 12345678", "; pokemap:sign free xyz", "; pokemap:sign free 12345678 extra"]) {
      expect(parseMarker(junk)).toBeNull();
    }
    expect(formatMarker("gbc", "free", "12345678")).toBe("; pokemap:sign free 12345678");
    expect(formatMarker("gba", "name", "12345678")).toBe("@ pokemap:sign name 12345678");
  });

  it("hashes with FNV-1a and normalizes line endings", () => {
    expect(signHash("")).toBe("811c9dc5");
    expect(signHash("hello")).toBe("4f9f2cab");
    expect(signHash("a\r\nb")).toBe(signHash("a\nb"));
    expect(signHash("a\rb")).toBe(signHash("a\nb"));
    expect(signHash("changed")).not.toBe(signHash("hello"));
  });
});
