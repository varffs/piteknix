// Environment detection
export { isRaspberryPi, isVirtualMode, getMode } from "./env.js";

// Sensors
export { createSensor, createVirtualSensor } from "./sensors/index.js";

// Displays
export { createDisplay, createTerminalDisplay, createVirtualOled } from "./displays/index.js";

// Inputs
export {
  createButton,
  createLed,
  createKeyboardInput,
  setupKeyboardListener,
} from "./inputs/index.js";
export { registerVirtualKey, virtualKeys, pressVirtualKey } from "./inputs/keyboard.js";

// Utilities
export { formatFloat, clamp, sleep, minutesToMs, getTempStatus } from "./utils/index.js";

// Data generators (for custom virtual sensors)
export {
  createRandomGenerator,
  createDriftGenerator,
  createDiurnalGenerator,
  createHumidityGenerator,
} from "./utils/data-generators.js";

// Keyboard cleanup
export { cleanupKeyboardListener } from "./inputs/keyboard.js";
