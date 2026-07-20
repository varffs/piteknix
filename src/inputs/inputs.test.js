import { test } from "node:test";
import assert from "node:assert/strict";
import { createButton } from "./index.js";

process.env.VIRTUAL_MODE = "true";

test("virtual button simulatePress fires watcher with rising edge", async () => {
  const button = createButton({ gpio: 27, virtualKey: "1" });
  let fired = null;
  button.watch((err, value) => { fired = { err, value }; });
  button.simulatePress();
  assert.deepEqual(fired, { err: null, value: 1 });
  await button.cleanup();
});
