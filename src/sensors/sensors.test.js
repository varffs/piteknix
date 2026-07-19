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

test("ds18b20 virtual fault 'enoent' makes read reject with ENOENT", async () => {
  const sensor = await createSensor({
    type: "ds18b20",
    virtual: { fault: "enoent" },
  });
  await assert.rejects(() => sensor.read(), (err) => err.code === "ENOENT");
  await sensor.cleanup();
});

test("ds18b20 virtual fault 'stuck85' returns raw 85.0", async () => {
  const sensor = await createSensor({
    type: "ds18b20",
    calibrationOffset: 1.2,
    virtual: { fault: "stuck85" },
  });
  const data = await sensor.read();
  assert.equal(data.temperature, 85); // raw, offset not applied to fault
  await sensor.cleanup();
});

test("ds18b20 virtual fault 'absent' lists no sensors", async () => {
  const sensor = await createSensor({
    type: "ds18b20",
    virtual: { fault: "absent" },
  });
  assert.deepEqual(await sensor.listSensors(), []);
  await assert.rejects(() => sensor.read(), (err) => err.code === "ENOENT");
  await sensor.cleanup();
});

test("diagnose: healthy virtual ds18b20 -> ok", async () => {
  const s = await createSensor({ type: "ds18b20", id: "28-x", virtual: { temperature: { min: 22, max: 22, initialValue: 22 } } });
  const d = await s.diagnose();
  assert.equal(d.status, "ok");
  assert.equal(d.targetPresent, true);
});

test("diagnose: absent -> status absent, empty bus", async () => {
  const s = await createSensor({ type: "ds18b20", id: "28-x", virtual: { fault: "absent" } });
  const d = await s.diagnose();
  assert.equal(d.status, "absent");
  assert.deepEqual(d.busDevices, []);
  assert.equal(d.targetPresent, false);
});

test("diagnose: stuck85 -> error flagged for wiring/power", async () => {
  const s = await createSensor({ type: "ds18b20", id: "28-x", virtual: { fault: "stuck85" } });
  const d = await s.diagnose();
  assert.equal(d.status, "error");
  assert.match(d.detail, /85\.0/);
});

test("diagnose: enoent -> error, dropped off bus", async () => {
  const s = await createSensor({ type: "ds18b20", id: "28-x", virtual: { fault: "enoent" } });
  const d = await s.diagnose();
  assert.equal(d.status, "error");
  assert.equal(d.lastError.code, "ENOENT");
});
