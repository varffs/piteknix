import { test } from "node:test";
import assert from "node:assert/strict";
import { createVirtualOled, terminalFrame } from "./virtual-oled.js";

const settle = () => new Promise((r) => setTimeout(r, 10));
const litCount = (d) => d._emulator.snapshot().pixels.reduce((a, b) => a + b, 0);

test("draws_through_the_real_driver_into_the_emulated_chip", async () => {
  const d = await createVirtualOled({ type: "oled", width: 128, height: 64 }, { env: { PITEKNIX_PREVIEW: "none" } });
  try {
    assert.equal(d.type, "oled");
    d.clear();
    d.setCursor(1, 1);
    d.writeText("Hi", { size: 2 });
    await settle();
    assert.ok(litCount(d) > 20);
    d.invert(true);
    assert.equal(d._emulator.snapshot().inverted, true);
    d.turnOff();
    assert.equal(d._emulator.snapshot().on, false);
  } finally {
    await d.cleanup();
  }
});

test("web_preview_serves_while_running_and_stops_on_cleanup", async () => {
  const d = await createVirtualOled(
    { type: "oled", width: 128, height: 64 },
    { env: { PITEKNIX_PREVIEW: "web", PITEKNIX_PREVIEW_PORT: "0" }, log: () => {} },
  );
  const res = await fetch(d.preview.url);
  assert.equal(res.status, 200);
  await d.cleanup();
  await assert.rejects(fetch(d.preview.url));
});

test("terminal_frame_is_bordered_half_blocks", () => {
  const pixels = new Uint8Array(4 * 4);
  pixels[0] = 1;
  const out = terminalFrame({ width: 4, height: 4, pixels, on: true, inverted: false }, "footer");
  assert.deepEqual(out.split("\n"), ["┌────┐", "│▀   │", "│    │", "└────┘", "footer"]);
});
