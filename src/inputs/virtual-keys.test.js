import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  createKeyboardInput, setupKeyboardListener, cleanupKeyboardListener, registerVirtualKey, virtualKeys, pressVirtualKey,
} from "./keyboard.js";

after(() => {
  cleanupKeyboardListener();
  process.stdin.pause();
});

test("buttons_and_app_keys_are_listed_with_labels", async () => {
  const b = createKeyboardInput({ gpio: 17, virtualKey: "1", label: "Left" });
  const c = createKeyboardInput({ gpio: 27, virtualKey: "2" });
  registerVirtualKey("h", "HA down/up");
  const keys = virtualKeys();
  assert.deepEqual(keys.find((k) => k.key === "1"), { key: "1", label: "Left" });
  assert.deepEqual(keys.find((k) => k.key === "2"), { key: "2", label: "GPIO27" });
  assert.deepEqual(keys.find((k) => k.key === "h"), { key: "h", label: "HA down/up" });
  assert.deepEqual(keys.at(-1), { key: "d", label: "dump state" });
  await b.cleanup();
  await c.cleanup();
});

test("press_goes_through_the_same_path_as_typing", async () => {
  setupKeyboardListener({});
  const b = createKeyboardInput({ gpio: 5, virtualKey: "7" });
  let pressed = 0;
  b.watch(() => pressed++);
  let typed = null;
  const spy = (_s, key) => (typed = key?.name);
  process.stdin.on("keypress", spy);
  pressVirtualKey("7");
  assert.equal(pressed, 1);
  assert.equal(typed, "7", "app-level keypress listeners hear it too");
  process.stdin.off("keypress", spy);
  await b.cleanup();
});
