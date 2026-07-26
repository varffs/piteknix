import { test } from "node:test";
import assert from "node:assert/strict";
import { cjsDefault } from "./cjs.js";

test("plain CJS: module.exports = X → default is X", () => {
  class X {}
  assert.equal(cjsDefault({ default: X }), X);
});

test("transpiled CJS: module.exports = { default: X } → unwraps twice", () => {
  class X {
    static open() {}
  }
  assert.equal(cjsDefault({ default: { default: X, __esModule: true } }), X);
});

test("bare object without default passes through", () => {
  const api = { temperature() {} };
  assert.equal(cjsDefault(api), api);
});
