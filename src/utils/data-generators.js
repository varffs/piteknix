import { clamp } from "./index.js";

/**
 * Create a simple random value generator within a range
 */
export const createRandomGenerator = (config) => {
  const { min, max } = config;
  return () => min + Math.random() * (max - min);
};

/**
 * Create a drift-based generator that changes gradually
 * More realistic for temperature/humidity simulation
 */
export const createDriftGenerator = (config) => {
  const { min, max, drift = 0.5, initialValue } = config;
  let currentValue = initialValue ?? (min + max) / 2;

  return () => {
    const change = (Math.random() - 0.5) * 2 * drift;
    currentValue = clamp(currentValue + change, min, max);
    return currentValue;
  };
};

/**
 * Create a diurnal (time-of-day) based generator
 * Simulates natural temperature patterns (cooler at night, warmer midday)
 */
export const createDiurnalGenerator = (config) => {
  const { min, max, peakHour = 14, noise = 0.5 } = config;
  const range = max - min;
  const midpoint = (min + max) / 2;

  return () => {
    const hour = new Date().getHours();
    // Sine wave centered on peakHour
    const phase = ((hour - peakHour + 12) % 24) - 12;
    const timeMultiplier = Math.cos((phase * Math.PI) / 12);

    // Base value from time of day
    const baseValue = midpoint + (range * 0.4 * timeMultiplier);

    // Add small random noise
    const noiseValue = (Math.random() - 0.5) * 2 * noise;

    return clamp(baseValue + noiseValue, min, max);
  };
};

/**
 * Create a humidity generator that inversely correlates with temperature
 */
export const createHumidityGenerator = (config) => {
  const { min = 30, max = 80, tempGenerator } = config;
  const range = max - min;

  return () => {
    // If we have a temp generator, inversely correlate
    if (tempGenerator) {
      // Assuming temp is roughly 15-35 range
      const temp = tempGenerator();
      const normalizedTemp = (temp - 15) / 20; // 0-1 range
      const baseHumidity = max - normalizedTemp * range * 0.6;
      const noise = (Math.random() - 0.5) * 10;
      return clamp(baseHumidity + noise, min, max);
    }

    // Otherwise just random within range
    return min + Math.random() * range;
  };
};
