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

const lit = (d, x, y) => d._emulator.snapshot().pixels[y * d.width + x];

test("draw_rect_outlines_exactly_the_pixels_fill_rect_fills", async () => {
  const d = await createVirtualOled({ type: "oled", width: 128, height: 64 }, { env: { PITEKNIX_PREVIEW: "none" } });
  try {
    d.clear();
    d.drawRect(0, 0, 128, 64); // full-screen border: every edge must land on the panel
    await settle();
    for (const [x, y] of [[0, 0], [127, 0], [0, 63], [127, 63], [64, 63], [127, 32]]) assert.equal(lit(d, x, y), 1, `${x},${y}`);
    assert.equal(lit(d, 1, 1), 0);
    assert.equal(litCount(d), 2 * 128 + 2 * 62);

    d.clear();
    d.drawRect(10, 10, 3, 2);
    d.drawRect(50, 50, 0, 5); // nothing to draw
    await settle();
    assert.equal(litCount(d), 6);
    assert.equal(lit(d, 12, 11), 1);
    assert.equal(lit(d, 13, 12), 0);
  } finally {
    await d.cleanup();
  }
});

test("no_preview_by_default_outside_an_interactive_terminal", async () => {
  const quiet = { isTTY: false, write: () => assert.fail("painted the terminal") };
  const d = await createVirtualOled({ type: "oled" }, { env: {}, stdout: quiet, log: () => assert.fail("logged") });
  try {
    assert.equal(d.preview, null);
    d.writeText("x");
    await settle();
  } finally {
    await d.cleanup();
  }
});

test("display_still_works_when_the_web_preview_cannot_start", async () => {
  const logged = [];
  const d = await createVirtualOled(
    { type: "oled" },
    { env: { PITEKNIX_PREVIEW: "web", PITEKNIX_PREVIEW_PORT: "not-a-port" }, log: (m) => logged.push(m) },
  );
  try {
    assert.equal(d.preview, null);
    assert.match(logged.join("\n"), /web preview not started/);
    d.writeText("Hi");
    await settle();
    assert.ok(litCount(d) > 5);
  } finally {
    await d.cleanup();
  }
});
