import { test } from "node:test";
import assert from "node:assert/strict";
import { createSensor, createAht20Sensor, createDs18b20Sensor } from "./index.js";

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
  let failClose = false;
  const sensor = {
    bus: {
      async close() {
        if (failClose) throw new Error("close failed");
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
    failClose: () => {
      failClose = true;
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

test("aht20 hardware read error is not masked by a close failure", async () => {
  const fake = makeFakeAht20();
  const sensor = await createAht20Sensor({ driver: fake.module });
  fake.failNextRead();
  fake.failClose();
  await assert.rejects(() => sensor.read(), /i2c read failed/);
  await sensor.cleanup();
});

test("aht20 hardware read still returns data when only the close fails", async () => {
  const fake = makeFakeAht20();
  const sensor = await createAht20Sensor({ driver: fake.module });
  fake.failClose();
  const data = await sensor.read();
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

// Mirrors the real driver (ds18b20/lib/ds18b20.js): temperature() calls back
// (err, value); on a failed CRC it calls back (null, false) rather than erroring.
const makeFakeDs18b20 = (value, ids = ["28-x"]) => ({
  temperature: (_id, cb) => (value instanceof Error ? cb(value) : cb(null, value)),
  sensors: (cb) => cb(null, ids),
});

test("ds18b20 hardware read applies the calibration offset", async () => {
  const s = await createDs18b20Sensor({ id: "28-x", calibrationOffset: -0.5, driver: makeFakeDs18b20(21.4) });
  assert.deepEqual(await s.read(), { temperature: 20.9 });
  assert.equal(await s.readTemperature(), 20.9);
});

test("ds18b20 hardware read rejects a failed CRC instead of reporting 0 degrees", async () => {
  const s = await createDs18b20Sensor({ id: "28-x", calibrationOffset: 1.2, driver: makeFakeDs18b20(false) });
  await assert.rejects(() => s.read(), (err) => err.code === "ECRC");
  await assert.rejects(() => s.readTemperature(), (err) => err.code === "ECRC");
});

test("ds18b20 hardware read passes a genuine 0 degrees through", async () => {
  const s = await createDs18b20Sensor({ id: "28-x", driver: makeFakeDs18b20(0) });
  assert.deepEqual(await s.read(), { temperature: 0 });
});

test("ds18b20 hardware diagnose: failed CRC -> error, not ok", async () => {
  const s = await createDs18b20Sensor({ id: "28-x", driver: makeFakeDs18b20(false) });
  const d = await s.diagnose();
  assert.equal(d.status, "error");
  assert.equal(d.lastError.code, "ECRC");
  assert.match(d.detail, /CRC/);
});

test("ds18b20 hardware diagnose checks the raw reading for 85.0, ignoring the offset", async () => {
  const s = await createDs18b20Sensor({ id: "28-x", calibrationOffset: -3, driver: makeFakeDs18b20(85) });
  assert.match((await s.diagnose()).detail, /85\.0/);
  const { diagnose } = s; // must not depend on `this`
  assert.equal((await diagnose()).status, "error");
});

test("ds18b20 virtual fault 'crc' rejects like the hardware and diagnoses as CRC", async () => {
  const s = await createSensor({ type: "ds18b20", id: "28-x", virtual: { fault: "crc" } });
  await assert.rejects(() => s.read(), (err) => err.code === "ECRC");
  assert.equal((await s.diagnose()).lastError.code, "ECRC");
});

test("virtual sensors report only the quantities the real sensor has", async () => {
  const ds = await createSensor({ type: "ds18b20", id: "28-x" });
  assert.deepEqual(Object.keys(await ds.read()), ["temperature"]);
  await assert.rejects(() => ds.readHumidity(), /does not support humidity/);
  await assert.rejects(() => ds.readPressure(), /does not support pressure/);

  const aht = await createSensor({ type: "aht20" });
  assert.deepEqual(Object.keys(await aht.read()).sort(), ["humidity", "temperature"]);

  const bme = await createSensor({ type: "bme280" });
  const data = await bme.read();
  assert.deepEqual(Object.keys(data).sort(), ["humidity", "pressure", "temperature"]);
  for (const v of Object.values(data)) assert.ok(Number.isFinite(v));
});

test("virtual humidity follows the temperature of the same reading", async () => {
  // Fixed temperature at the top of the generator's 15-35 range: humidity must
  // sit at the dry end. Before, a second temperature sample was drawn for it.
  const s = await createSensor({
    type: "aht20",
    virtual: { temperature: { min: 35, max: 35, initialValue: 35 }, humidity: { min: 0, max: 100 } },
  });
  for (let i = 0; i < 20; i++) assert.ok((await s.read()).humidity <= 45 + 1e-9);
});

test("unknown sensor type is rejected in virtual mode, as on hardware", async () => {
  await assert.rejects(() => createSensor({ type: "nonsense" }), /Unknown sensor type: nonsense/);
});
