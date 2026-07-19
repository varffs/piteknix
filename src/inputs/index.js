import { isVirtualMode } from "../env.js";
import { createKeyboardInput, setupKeyboardListener } from "./keyboard.js";

/**
 * Create a button/input with automatic hardware/virtual mode detection
 *
 * @param {Object} config - Button configuration
 * @param {number} config.gpio - GPIO pin number
 * @param {string} [config.edge] - Edge detection: "rising" | "falling" | "both"
 * @param {number} [config.debounce] - Debounce timeout in ms
 * @param {string} [config.virtualKey] - Key to trigger this button in virtual mode
 * @returns {Button} Button instance
 */
export const createButton = (config) => {
  if (isVirtualMode()) {
    return createKeyboardInput(config);
  }

  return createGpioButton(config);
};

/**
 * Create a hardware GPIO button (Pi only)
 */
const createGpioButton = (config) => {
  const { gpio, edge = "rising", debounce = 50 } = config;

  // Lazy load onoff (only available on Pi)
  let Gpio;
  let button;

  const ensureInitialized = async () => {
    if (!button) {
      Gpio = (await import("onoff")).Gpio;
      button = new Gpio(gpio, "in", edge, { debounceTimeout: debounce });
    }
  };

  const watchers = [];

  return {
    type: "gpio",
    gpio,

    async watch(callback) {
      await ensureInitialized();
      watchers.push(callback);
      button.watch((err, value) => {
        callback(err, value);
      });
    },

    async read() {
      await ensureInitialized();
      return button.readSync();
    },

    // No-op for hardware (only virtual supports this)
    simulatePress() {
      console.warn("simulatePress() is only available in virtual mode");
    },

    async cleanup() {
      if (button) {
        button.unexport();
      }
    },
  };
};

/**
 * Create an LED output
 *
 * @param {Object} config - LED configuration
 * @param {number} config.gpio - GPIO pin number
 * @returns {LED} LED instance
 */
export const createLed = (config) => {
  if (isVirtualMode()) {
    return createVirtualLed(config);
  }

  return createGpioLed(config);
};

/**
 * Create a hardware GPIO LED (Pi only)
 */
const createGpioLed = (config) => {
  const { gpio } = config;

  let Gpio;
  let led;

  const ensureInitialized = async () => {
    if (!led) {
      Gpio = (await import("onoff")).Gpio;
      led = new Gpio(gpio, "out");
    }
  };

  return {
    type: "gpio-led",
    gpio,

    async on() {
      await ensureInitialized();
      led.writeSync(1);
    },

    async off() {
      await ensureInitialized();
      led.writeSync(0);
    },

    async toggle() {
      await ensureInitialized();
      led.writeSync(led.readSync() ^ 1);
    },

    async write(value) {
      await ensureInitialized();
      led.writeSync(value ? 1 : 0);
    },

    async read() {
      await ensureInitialized();
      return led.readSync();
    },

    async cleanup() {
      if (led) {
        led.writeSync(0);
        led.unexport();
      }
    },
  };
};

/**
 * Create a virtual LED (logs state changes)
 */
const createVirtualLed = (config) => {
  const { gpio } = config;
  let state = 0;

  const logState = () => {
    const icon = state ? "🔴" : "⚫";
    console.log(`[LED GPIO ${gpio}] ${icon} ${state ? "ON" : "OFF"}`);
  };

  return {
    type: "virtual-led",
    gpio,
    isVirtual: true,

    async on() {
      state = 1;
      logState();
    },

    async off() {
      state = 0;
      logState();
    },

    async toggle() {
      state = state ^ 1;
      logState();
    },

    async write(value) {
      state = value ? 1 : 0;
      logState();
    },

    async read() {
      return state;
    },

    async cleanup() {
      state = 0;
    },
  };
};

export { createKeyboardInput, setupKeyboardListener } from "./keyboard.js";
