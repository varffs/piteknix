import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createSsd1306Emulator } from "./ssd1306-emu.js";

const require = createRequire(import.meta.url);
const Oled = require("oled-i2c-bus");
const font = require("oled-font-5x7");

const settle = () => new Promise((r) => setTimeout(r, 5));
const setup = () => {
  const emu = createSsd1306Emulator({ width: 128, height: 64 });
  const oled = new Oled(emu.wire, { width: 128, height: 64, address: 0x3c });
  return { emu, oled };
};
const lit = (emu) => {
  const s = emu.snapshot();
  const out = [];
  for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) if (s.pixels[y * s.width + x]) out.push(`${x},${y}`);
  return out;
};

test("init_leaves_display_on_blank_and_normal", () => {
  const { emu } = setup();
  const s = emu.snapshot();
  assert.equal(s.on, true);
  assert.equal(s.inverted, false);
  assert.equal(s.pixels.length, 128 * 64);
  assert.equal(lit(emu).length, 0);
});

test("synced_draw_lands_in_display_ram_at_the_right_pixels", async () => {
  const { emu, oled } = setup();
  oled.fillRect(10, 20, 3, 2, 1); // sync defaults to true: dirty bytes sent per page/column, after the busy poll
  await settle();
  assert.deepEqual(lit(emu), ["10,20", "11,20", "12,20", "10,21", "11,21", "12,21"]);
});

test("unsynced_draw_is_invisible_until_update", async () => {
  const { emu, oled } = setup();
  oled.drawPixel([[5, 9, 1]], false);
  assert.deepEqual(lit(emu), [], "the chip never received it");
  oled.update(); // full-frame horizontal-mode write, after the busy poll
  await settle();
  assert.deepEqual(lit(emu), ["5,9"]);
});

test("text_renders_with_the_real_font", async () => {
  const { emu, oled } = setup();
  oled.setCursor(0, 0);
  oled.writeString(font, 1, "I", 1, false);
  await settle();
  const px = lit(emu);
  assert.ok(px.length > 4, "the glyph lit some pixels");
  assert.ok(px.every((p) => Number(p.split(",")[1]) < 8), "size-1 glyph stays in the top 8 rows");
});

test("invert_off_and_dim_commands_are_tracked", () => {
  const { emu, oled } = setup();
  oled.invertDisplay(true);
  assert.equal(emu.snapshot().inverted, true);
  oled.turnOffDisplay();
  assert.equal(emu.snapshot().on, false);
  oled.turnOnDisplay();
  oled.dimDisplay(true);
  assert.equal(emu.snapshot().on, true);
  assert.equal(emu.snapshot().contrast, 0);
});

test("on_change_fires_once_per_burst", async () => {
  const { emu, oled } = setup();
  let n = 0;
  emu.onChange(() => n++);
  oled.invertDisplay(true);
  oled.dimDisplay(true);
  oled.turnOnDisplay();
  await settle();
  assert.equal(n, 1);
});
