import { isVirtualMode } from "../env.js";
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
      return createDs18b20Sensor(id, calibrationOffset);

    case "aht20":
      return createAht20Sensor(calibrationOffset);

    case "bme280":
      return createBme280Sensor(address, bus, calibrationOffset);

    default:
      throw new Error(`Unknown sensor type: ${type}`);
  }
};

/**
 * DS18B20 1-Wire temperature sensor
 */
const createDs18b20Sensor = async (sensorId, calibrationOffset) => {
  const ds18b20 = (await import("ds18b20")).default;

  return {
    type: "ds18b20",

    async read() {
      return new Promise((resolve, reject) => {
        ds18b20.temperature(sensorId, (err, value) => {
          if (err) {
            reject(err);
            return;
          }
          resolve({
            temperature: value + calibrationOffset,
          });
        });
      });
    },

    async readTemperature() {
      const data = await this.read();
      return data.temperature;
    },

    async listSensors() {
      return new Promise((resolve, reject) => {
        ds18b20.sensors((err, ids) => {
          if (err) reject(err);
          else resolve(ids);
        });
      });
    },

    async diagnose() {
      const { classifyDs18b20 } = await import("./diagnose.js");
      let busDevices = [];
      try {
        busDevices = await this.listSensors();
      } catch (e) {
        return { status: "error", detail: `1-wire bus error: ${e.message}`, busDevices: [], targetPresent: false, lastError: { code: e.code ?? null, message: e.message } };
      }
      let reading = null;
      let error = null;
      try {
        // read() adds calibrationOffset; subtract it back for raw 85.0 detection
        const raw = await new Promise((res, rej) => this._rawRead ? this._rawRead(res, rej) : rej(new Error("no raw read")));
        reading = raw;
      } catch (e) {
        error = e;
      }
      return classifyDs18b20({ id: sensorId, busDevices, reading, error });
    },

    _rawRead(resolve, reject) {
      ds18b20.temperature(sensorId, (err, value) => (err ? reject(err) : resolve(value)));
    },

    async cleanup() {
      // No cleanup needed for 1-Wire
    },
  };
};

/**
 * AHT20 I2C temperature/humidity sensor
 */
const createAht20Sensor = async (calibrationOffset) => {
  const aht20 = (await import("aht20-sensor")).default;

  return {
    type: "aht20",

    async read() {
      const sensor = await aht20.open();
      const temperature = await sensor.temperature();
      const humidity = await sensor.humidity();

      return {
        temperature: temperature + calibrationOffset,
        humidity,
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

    async cleanup() {
      // Sensor auto-closes after read
    },
  };
};

/**
 * BME280 I2C temperature/humidity/pressure sensor
 */
const createBme280Sensor = async (address = 0x76, bus = 1, calibrationOffset) => {
  const bme280 = (await import("bme280-sensor")).default;

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
