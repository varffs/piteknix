/**
 * Demo application showing piteknix usage
 * Run with: node examples/demo.js
 */

import { configureStore, createListenerMiddleware } from "@reduxjs/toolkit";

import {
  isVirtualMode,
  getMode,
  createSensor,
  createDisplay,
  createButton,
  createLed,
  setupKeyboardListener,
  formatFloat,
  minutesToMs,
} from "../src/index.js";

// Configuration
const POLLING_INTERVAL = isVirtualMode() ? 3000 : minutesToMs(5); // Faster in virtual mode
const TEMP_CALIBRATION = 1.2;

console.log(`Starting demo in ${getMode()} mode...`);

// Initialize hardware abstraction
const tempSensor = await createSensor({
  type: "ds18b20",
  id: "28-0301a279e8e6",
  calibrationOffset: TEMP_CALIBRATION,
  virtual: { min: 15, max: 30, drift: 0.5 },
});

const display = await createDisplay({
  type: "lcd",
  width: 16,
  height: 2,
});

const button1 = createButton({
  gpio: 17,
  virtualKey: "1",
  debounce: 50,
});

const button2 = createButton({
  gpio: 27,
  virtualKey: "2",
  debounce: 50,
});

const led = await createLed({ gpio: 17 });

// Set up keyboard listener for virtual mode
if (isVirtualMode()) {
  setupKeyboardListener({
    onDebug: () => {
      console.log("\n[DEBUG] Current state:", store.getState());
    },
  });
}

// Redux setup
const displayModes = ["DEFAULT", "DETAIL"];

const initialState = {
  data: {
    temperature: null,
  },
  display: {
    mode: "DEFAULT",
  },
};

const getNextMode = (current) => {
  const idx = displayModes.indexOf(current);
  return displayModes[(idx + 1) % displayModes.length];
};

function reducer(state = initialState, action) {
  switch (action.type) {
    case "data/temperature":
      return { ...state, data: { ...state.data, temperature: action.payload } };
    case "display/next":
      return { ...state, display: { ...state.display, mode: getNextMode(state.display.mode) } };
    default:
      return state;
  }
}

// Render functions
const renderDefault = (state) => {
  display.clear();
  display.printLine(0, "Temperature:");
  display.printLine(1, `${formatFloat(state.data.temperature)}c`);
};

const renderDetail = (state) => {
  display.clear();
  display.printLine(0, `Temp: ${formatFloat(state.data.temperature)}c`);
  display.printLine(1, `Mode: ${state.display.mode}`);
};

const renderDisplay = (state) => {
  switch (state.display.mode) {
    case "DEFAULT":
      renderDefault(state);
      break;
    case "DETAIL":
      renderDetail(state);
      break;
  }
};

// Listener middleware
const listenerMiddleware = createListenerMiddleware();

listenerMiddleware.startListening({
  type: "data/temperature",
  effect: (action, api) => renderDisplay(api.getState()),
});

listenerMiddleware.startListening({
  type: "display/next",
  effect: (action, api) => renderDisplay(api.getState()),
});

// Create store
const store = configureStore({
  reducer,
  middleware: (getDefault) => getDefault().prepend(listenerMiddleware.middleware),
});

// Button handlers
button1.watch((err) => {
  if (!err) {
    store.dispatch({ type: "display/next" });
  }
});

button2.watch(async (err) => {
  if (!err) {
    await led.toggle();
  }
});

// Polling
const poll = setInterval(async () => {
  try {
    const data = await tempSensor.read();
    store.dispatch({ type: "data/temperature", payload: data.temperature });
  } catch (err) {
    console.error("Sensor error:", err);
  }
}, POLLING_INTERVAL);

// Initial read
const initialData = await tempSensor.read();
store.dispatch({ type: "data/temperature", payload: initialData.temperature });

// Turn on LED
await led.on();

// Cleanup
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  clearInterval(poll);
  await led.cleanup();
  await button1.cleanup();
  await button2.cleanup();
  await display.cleanup();
  await tempSensor.cleanup();
  process.exit();
});

console.log("Demo running. Press 1/2 for buttons, d for debug, q to quit.");
