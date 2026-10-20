// Dependency-free assertion adapter for the new synchronous tests; not a Vitest gate.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export const hooks = [];
export let passed = 0;
export let failed = 0;
export const afterEach = (fn) => hooks.push(fn);
export const describe = (_name, fn) => fn();
export const it = (name, fn) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}\n${error.stack}`); }
  finally { for (const hook of hooks) hook(); }
};
export const expect = (actual) => {
  const matchers = (negated = false) => {
    const check = (fn) => negated ? assert.throws(fn) : fn();
    return {
      get not() { return matchers(!negated); },
      toBe: (value) => check(() => assert.strictEqual(actual, value)),
      toEqual: (value) => check(() => assert.deepStrictEqual(actual, value)),
      toHaveLength: (value) => check(() => assert.strictEqual(actual.length, value)),
      toBeNull: () => check(() => assert.strictEqual(actual, null)),
      toMatch: (regex) => check(() => assert.match(actual, regex)),
      toThrow: (message) => check(() => assert.throws(actual, (error) => typeof message === "string" ? error.message.includes(message) : message.test(error.message))),
    };
  };
  return matchers();
};
