import { test } from "node:test";
import assert from "node:assert/strict";
import { createSensor, createAht20Sensor } from "./index.js";

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

// Mirrors the real driver's shape (aht20-sensor/AHT20.js): readData() is one
// measurement returning both values; temperature()/humidity() each take their
// own full measurement and discard the half not asked for; open() opens a new
// i2c bus handle per call and the instance exposes it as `bus` — the class has
// no close of its own.
const makeFakeAht20 = () => {
  let measurements = 0;
  let opens = 0;
  let closes = 0;
  let failNextRead = false;
  const sensor = {
    bus: {
      async close() {
        closes++;
      },
    },
    async readData() {
      if (failNextRead) {
        failNextRead = false;
        throw new Error("i2c read failed");
      }
      measurements++;
      return { temperature: 20, humidity: 50 };
    },
    async temperature() {
      const { temperature } = await sensor.readData();
      return temperature;
    },
    async humidity() {
      const { humidity } = await sensor.readData();
      return humidity;
    },
  };
  return {
    module: {
      open: async () => {
        opens++;
        return sensor;
      },
    },
    measurements: () => measurements,
    opens: () => opens,
    closes: () => closes,
    failNextRead: () => {
      failNextRead = true;
    },
  };
};

test("aht20 hardware read takes one measurement and returns the atomic pair", async () => {
  const fake = makeFakeAht20();
  const sensor = await createAht20Sensor({ calibrationOffset: 1.2, driver: fake.module });
  const data = await sensor.read();
  assert.equal(data.temperature, 21.2); // 20 + 1.2
  assert.equal(data.humidity, 50);
  assert.equal(fake.measurements(), 1);
  await sensor.cleanup();
});

test("aht20 hardware readTemperature costs a single measurement", async () => {
  const fake = makeFakeAht20();
  const sensor = await createAht20Sensor({ driver: fake.module });
  assert.equal(await sensor.readTemperature(), 20);
  assert.equal(fake.measurements(), 1);
  await sensor.cleanup();
});

test("aht20 hardware read closes every bus handle it opens", async () => {
  const fake = makeFakeAht20();
  const sensor = await createAht20Sensor({ driver: fake.module });
  await sensor.read();
  await sensor.read();
  assert.equal(fake.opens(), 2);
  assert.equal(fake.closes(), 2);
  await sensor.cleanup();
});

test("aht20 hardware read closes the bus even when the measurement throws", async () => {
  const fake = makeFakeAht20();
  const sensor = await createAht20Sensor({ driver: fake.module });
  fake.failNextRead();
  await assert.rejects(() => sensor.read(), /i2c read failed/);
  assert.equal(fake.closes(), 1);
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
