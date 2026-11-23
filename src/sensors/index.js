import { isVirtualMode } from "../env.js";
import { cjsDefault } from "../utils/cjs.js";
import { createVirtualSensor } from "./virtual.js";

/**
 * Create a sensor with automatic hardware/virtual mode detection
 *
 * @param {Object} config - Sensor configuration
 * @param {string} config.type - Sensor type: "ds18b20" | "aht20" | "bme280"
 * @param {string} [config.id] - Sensor ID (for ds18b20)
 * @param {number} [config.address] - I2C address (for I2C sensors)
 * @param {number} [config.bus] - I2C bus number (default: 1)
 * @param {number} [config.calibrationOffset] - Temperature calibration offset
 * @param {Object} [config.virtual] - Virtual mode configuration
 * @returns {Promise<Sensor>} Sensor instance
 */
export const createSensor = async (config) => {
  if (isVirtualMode()) {
    return createVirtualSensor(config);
  }

  return createHardwareSensor(config);
};

/**
 * Create a hardware sensor (Pi only)
 */
const createHardwareSensor = async (config) => {
  const { type, id, address, bus = 1, calibrationOffset = 0 } = config;

  switch (type) {
    case "ds18b20":
      return createDs18b20Sensor({ id, calibrationOffset });

    case "aht20":
      return createAht20Sensor({ calibrationOffset });

    case "bme280":
      return createBme280Sensor(address, bus, calibrationOffset);

    default:
      throw new Error(`Unknown sensor type: ${type}`);
  }
};

/**
 * DS18B20 1-Wire temperature sensor
 *
 * Exported for direct use and testing; `driver` injects the ds18b20 module
 * API (`temperature(id, cb)`, `sensors(cb)`) in place of the real import.
 */
export const createDs18b20Sensor = async ({ id: sensorId, calibrationOffset = 0, driver } = {}) => {
  const ds18b20 = driver ?? cjsDefault(await import("ds18b20"));

  // The driver signals a failed CRC by "succeeding" with `false`, not with an
  // error. Passed through, `false + offset` is a number: a noisy line would be
  // reported as a genuine 0 C reading. Anything that isn't a finite number is
  // a failed read.
  const rawRead = () =>
    new Promise((resolve, reject) => {
      ds18b20.temperature(sensorId, (err, value) => {
        if (err) return reject(err);
        if (typeof value !== "number" || !Number.isFinite(value)) {
          return reject(Object.assign(new Error("ds18b20 CRC check failed (corrupt read)"), { code: "ECRC" }));
        }
        resolve(value);
      });
    });

  const listSensors = () =>
    new Promise((resolve, reject) => {
      ds18b20.sensors((err, ids) => (err ? reject(err) : resolve(ids)));
    });

  return {
    type: "ds18b20",

    async read() {
      return { temperature: (await rawRead()) + calibrationOffset };
    },

    async readTemperature() {
      return (await rawRead()) + calibrationOffset;
    },

    listSensors,

    async diagnose() {
      const { classifyDs18b20 } = await import("./diagnose.js");
      let busDevices = [];
      try {
        busDevices = await listSensors();
      } catch (e) {
        return { status: "error", detail: `1-wire bus error: ${e.message}`, busDevices: [], targetPresent: false, lastError: { code: e.code ?? null, message: e.message } };
      }
      let reading = null;
      let error = null;
      try {
        reading = await rawRead(); // raw: the 85.0 power-on check must not see the offset
      } catch (e) {
        error = e;
      }
      return classifyDs18b20({ id: sensorId, busDevices, reading, error });
    },

    async cleanup() {
      // No cleanup needed for 1-Wire
    },
  };
};

/**
 * AHT20 I2C temperature/humidity sensor
 *
 * Exported for direct use and testing; `driver` injects the aht20-sensor
 * module API (its `open()` entry point) in place of the real import.
 * Options object rather than positional args so a driver-only call can't be
 * silently taken as a numeric offset.
 */
export const createAht20Sensor = async ({ calibrationOffset = 0, driver } = {}) => {
  // aht20-sensor is transpiled CJS (module.exports = { default: API }) —
  // needs the double unwrap; verified against the real sensor on-device
  const aht20 = driver ?? cjsDefault(await import("aht20-sensor"));

  return {
    type: "aht20",

    async read() {
      const sensor = await aht20.open();
      try {
        // One measurement for the pair. The driver's temperature()/humidity()
        // accessors each take a full ~80ms measurement and discard the half
        // not asked for — calling both doubled the poll time and paired values
        // from different measurements.
        const { temperature, humidity } = await sensor.readData();

        return {
          temperature: temperature + calibrationOffset,
          humidity,
        };
      } finally {
        // open() opens a fresh /dev/i2c-1 handle every call and the AHT20
        // class has no close of its own — without this every read leaks an
        // fd, hitting EMFILE after ~3.5 days at a 5-min poll (#3). Open per
        // read is kept deliberately: holding a handle from the factory would
        // move bus failure to boot and crash-loop an unattended device that
        // currently just reports the fault. The catch keeps a close failure
        // (likely correlated with a read failure — bus gone) from masking
        // the read error the caller actually needs.
        await sensor.bus.close().catch((e) => console.error(`aht20 bus close failed: ${e.message}`));
      }
    },

    async readTemperature() {
      const data = await this.read();
      return data.temperature;
    },

    async readHumidity() {
      const data = await this.read();
      return data.humidity;
    },

    async cleanup() {
      // Nothing held between reads — each read opens and closes its own
      // bus handle.
    },
  };
};

/**
 * BME280 I2C temperature/humidity/pressure sensor
 */
const createBme280Sensor = async (address = 0x76, bus = 1, calibrationOffset) => {
  const bme280 = cjsDefault(await import("bme280-sensor"));

  const sensor = await bme280.open({
    i2cBusNumber: bus,
    i2cAddress: address,
  });

  return {
    type: "bme280",

    async read() {
      const reading = await sensor.read();
      return {
        temperature: reading.temperature + calibrationOffset,
        humidity: reading.humidity,
        pressure: reading.pressure,
      };
    },

    async readTemperature() {
      const data = await this.read();
      return data.temperature;
    },

    async readHumidity() {
      const data = await this.read();
      return data.humidity;
    },

    async readPressure() {
      const data = await this.read();
      return data.pressure;
    },

    async cleanup() {
      await sensor.close();
    },
  };
};

export { createVirtualSensor } from "./virtual.js";
