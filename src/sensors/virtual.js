import { createDriftGenerator, createHumidityGenerator } from "../utils/data-generators.js";

/**
 * Default virtual configurations by sensor type
 */
const VIRTUAL_DEFAULTS = {
  ds18b20: {
    temperature: { min: 10, max: 40, drift: 0.3, initialValue: 22 },
  },
  aht20: {
    temperature: { min: 15, max: 35, drift: 0.2, initialValue: 22 },
    humidity: { min: 30, max: 80 },
  },
  bme280: {
    temperature: { min: 15, max: 35, drift: 0.2, initialValue: 22 },
    humidity: { min: 30, max: 80 },
    pressure: { min: 980, max: 1030, drift: 0.5, initialValue: 1013 },
  },
};

/**
 * Create a virtual sensor for development/testing
 */
export const createVirtualSensor = async (config) => {
  const { type, virtual = {}, calibrationOffset = 0 } = config;

  const defaults = VIRTUAL_DEFAULTS[type] || VIRTUAL_DEFAULTS.ds18b20;
  const mergedConfig = {
    temperature: { ...defaults.temperature, ...virtual.temperature },
    humidity: { ...defaults.humidity, ...virtual.humidity },
    pressure: { ...defaults.pressure, ...virtual.pressure },
  };

  // Create generators
  const tempGenerator = createDriftGenerator(mergedConfig.temperature);
  const humidityGenerator = mergedConfig.humidity
    ? createHumidityGenerator({ ...mergedConfig.humidity, tempGenerator })
    : null;
  const pressureGenerator = mergedConfig.pressure
    ? createDriftGenerator(mergedConfig.pressure)
    : null;

  return {
    type: `virtual-${type}`,
    isVirtual: true,

    async read() {
      const result = {
        temperature: tempGenerator() + calibrationOffset,
      };

      if (humidityGenerator) {
        result.humidity = humidityGenerator();
      }

      if (pressureGenerator) {
        result.pressure = pressureGenerator();
      }

      return result;
    },

    async readTemperature() {
      return tempGenerator() + calibrationOffset;
    },

    async readHumidity() {
      if (!humidityGenerator) {
        throw new Error(`Sensor type ${type} does not support humidity`);
      }
      return humidityGenerator();
    },

    async readPressure() {
      if (!pressureGenerator) {
        throw new Error(`Sensor type ${type} does not support pressure`);
      }
      return pressureGenerator();
    },

    async listSensors() {
      // Return fake sensor IDs for virtual mode
      return ["virtual-sensor-001"];
    },

    async cleanup() {
      // No cleanup needed for virtual sensors
    },
  };
};
