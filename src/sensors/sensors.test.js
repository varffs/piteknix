import { test } from "node:test";
import assert from "node:assert/strict";
import { createSensor } from "./index.js";

// Force virtual mode regardless of host
process.env.VIRTUAL_MODE = "true";

test("aht20 virtual read applies calibration offset and returns humidity", async () => {
  const sensor = await createSensor({
    type: "aht20",
    calibrationOffset: 1.2,
    virtual: {
      temperature: { min: 20, max: 20, initialValue: 20 },
      humidity: { min: 50, max: 50 },
    },
  });
  const data = await sensor.read();
  assert.equal(data.temperature, 21.2); // 20 + 1.2
  assert.equal(data.humidity, 50);
  await sensor.cleanup();
});
