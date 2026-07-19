import { test } from "node:test";
import assert from "node:assert/strict";
import { createTerminalDisplay } from "./terminal.js";

test("terminal lcd printLine truncates and pads to width", async () => {
  const lcd = await createTerminalDisplay({ type: "lcd", width: 16, height: 2 });
  lcd.printLine(0, "hello");
  lcd.printLine(1, "this is way too long for sixteen chars");
  const lines = lcd.getLines();
  assert.equal(lines[0], "hello".padEnd(16));
  assert.equal(lines[1], "this is way too ".padEnd(16)); // 16 chars, no pad needed
});
