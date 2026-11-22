# piteknix

Hardware abstraction library for Raspberry Pi IoT projects. Develop and test on any machine, deploy to Pi.

## Features

- **Hardware abstraction** - Same API for real hardware and virtual mode
- **Auto-detection** - Automatically detects Pi vs development machine
- **Virtual mode** - Terminal display rendering, keyboard input, simulated sensor data
- **Redux-friendly** - Designed to work with Redux Toolkit patterns

## Installation

```bash
# From GitHub
npm install github:USERNAME/piteknix

# Local development (from worldofpi root)
npm install ./piteknix
```

## Quick Start

```javascript
import {
  isVirtualMode,
  createSensor,
  createDisplay,
  createButton,
  setupKeyboardListener,
} from "piteknix";

// Auto-detects environment
console.log(`Running in ${isVirtualMode() ? "virtual" : "hardware"} mode`);

// Create hardware (works on Pi or dev machine)
const sensor = await createSensor({ type: "ds18b20", id: "28-xxx" });
const display = await createDisplay({ type: "lcd", width: 16, height: 2 });
const button = createButton({ gpio: 17, virtualKey: "1" });

// Set up keyboard input for virtual mode
if (isVirtualMode()) {
  setupKeyboardListener();
}

// Use unified API
const data = await sensor.read();
display.printLine(0, `Temp: ${data.temperature}c`);

button.watch(() => {
  console.log("Button pressed!");
});
```

## Environment Detection

```javascript
import { isVirtualMode, isRaspberryPi, getMode } from "piteknix";

isVirtualMode();   // true on dev machine, false on Pi
isRaspberryPi();   // true if /sys/class/gpio exists
getMode();         // "virtual" or "hardware"

// Force mode via environment variable
// VIRTUAL_MODE=true node app.js   (force virtual)
// VIRTUAL_MODE=false node app.js  (force hardware)
```

## OLED preview (virtual mode)

In virtual mode an OLED is the real `oled-i2c-bus` driver drawing into a software
SSD1306 (`src/displays/ssd1306-emu.js`), so what you see is exactly what the
chip would receive: real font, sizes, lines, bitmaps, invert, on/off and dim.
A draw the driver never flushes stays invisible, as on the device.

- **Browser:** `http://127.0.0.1:8130/` (next free port if taken): zoom, pixel
  grid, pixel coordinates on hover, white / blue / yellow-blue tint, save PNG,
  and a button per virtual key. Keys typed in the page work too.
- **Terminal:** the frame in `▀▄█` characters (needs a terminal ≥ 130 columns).

`PITEKNIX_PREVIEW=web,terminal` (default), `web`, `terminal` or `none`;
`PITEKNIX_PREVIEW_PORT` (default 8130). Name buttons with
`createButton({ ..., label: "Left" })` and app-only keys with
`registerVirtualKey("h", "HA down/up")` so the page shows them.
Without `oled-i2c-bus` installed it falls back to the old text-only terminal display.

## Sensors

### Supported Types

| Type | Hardware | Readings |
|------|----------|----------|
| `ds18b20` | 1-Wire temperature | temperature |
| `aht20` | I2C temp/humidity | temperature, humidity |
| `bme280` | I2C temp/humidity/pressure | temperature, humidity, pressure |

### Usage

```javascript
import { createSensor } from "piteknix";

const sensor = await createSensor({
  type: "ds18b20",
  id: "28-0301a279e8e6",       // Sensor ID (ds18b20)
  address: 0x76,               // I2C address (bme280)
  bus: 1,                      // I2C bus number
  calibrationOffset: 1.2,      // Temperature offset

  // Virtual mode configuration
  virtual: {
    min: 15,
    max: 35,
    drift: 0.5,
    initialValue: 22,
  },
});

// Read all values
const data = await sensor.read();
// { temperature: 22.5, humidity: 65.2, pressure: 1013.25 }

// Read individual values
const temp = await sensor.readTemperature();
const humidity = await sensor.readHumidity();

// Cleanup
await sensor.cleanup();
```

## Displays

### Supported Types

| Type | Hardware | Description |
|------|----------|-------------|
| `lcd` | HD44780 via I2C | 16x2 or 20x4 character LCD |
| `oled` | SSD1306 via I2C | 128x64 pixel OLED |

### LCD Usage

```javascript
import { createDisplay } from "piteknix";

const lcd = await createDisplay({
  type: "lcd",
  width: 16,
  height: 2,
  address: 0x27,
  bus: 1,
});

lcd.clear();
lcd.printLine(0, "Hello World!");
lcd.printLine(1, "Temperature: 22c");
lcd.setBacklight(true);

await lcd.cleanup();
```

### OLED Usage

```javascript
const oled = await createDisplay({
  type: "oled",
  width: 128,
  height: 64,
  address: 0x3c,
});

oled.clear();
oled.setCursor(1, 1);
oled.writeText("Hello", { size: 2 });
oled.invert(true);

await oled.cleanup();
```

### Virtual Mode Rendering

In virtual mode, displays render to the terminal:

```
┌────────────────┐
│Hello World!    │
│Temperature: 22c│
└────────────────┘
[LCD Virtual Mode] Keys: 1=btn1 2=btn2 d=debug q=quit
```

## Inputs

### Buttons

```javascript
import { createButton, setupKeyboardListener } from "piteknix";

const button = createButton({
  gpio: 17,
  edge: "rising",      // "rising" | "falling" | "both"
  debounce: 50,        // ms
  virtualKey: "1",     // Key trigger in virtual mode
});

button.watch((err, value) => {
  if (!err) {
    console.log("Button pressed!");
  }
});

// Virtual mode only: programmatic trigger
button.simulatePress();

await button.cleanup();
```

### LEDs

```javascript
import { createLed } from "piteknix";

const led = await createLed({ gpio: 17 });

await led.on();
await led.off();
await led.toggle();
await led.write(1);  // 1 = on, 0 = off
const state = await led.read();

await led.cleanup();
```

### Keyboard Listener (Virtual Mode)

```javascript
import { setupKeyboardListener, isVirtualMode } from "piteknix";

if (isVirtualMode()) {
  setupKeyboardListener({
    onDebug: () => console.log(store.getState()),
    onQuit: () => process.exit(),
  });
}

// Default key mappings:
// 1, 2, 3... - Trigger buttons with matching virtualKey
// d          - Call onDebug callback
// q          - Call onQuit callback (or SIGINT)
// Ctrl+C     - SIGINT
```

## Utilities

```javascript
import {
  formatFloat,
  clamp,
  sleep,
  minutesToMs,
  getTempStatus,
} from "piteknix";

formatFloat(22.567, 1);     // "22.6"
formatFloat(null);          // "0"

clamp(150, 0, 100);         // 100

await sleep(1000);          // Wait 1 second

minutesToMs(5);             // 300000

getTempStatus(25);          // ":]"
getTempStatus(35);          // ":!"
```

## Data Generators

For custom virtual sensor behavior:

```javascript
import {
  createDriftGenerator,
  createDiurnalGenerator,
  createRandomGenerator,
} from "piteknix";

// Gradual changes (realistic)
const tempGen = createDriftGenerator({
  min: 15,
  max: 35,
  drift: 0.5,
  initialValue: 22,
});
tempGen(); // 22.3
tempGen(); // 22.1

// Time-of-day based (cooler at night)
const diurnalGen = createDiurnalGenerator({
  min: 15,
  max: 30,
  peakHour: 14,
});

// Pure random
const randomGen = createRandomGenerator({ min: 0, max: 100 });
```

## Redux Integration

piteknix is designed for Redux Toolkit with listener middleware:

```javascript
import pkg from "@reduxjs/toolkit";
const { configureStore, createListenerMiddleware } from pkg;
import { createSensor, createDisplay, formatFloat } from "piteknix";

// Hardware
const sensor = await createSensor({ type: "ds18b20", id: "28-xxx" });
const display = await createDisplay({ type: "lcd" });

// State
const initialState = { data: { temperature: null } };

function reducer(state = initialState, action) {
  switch (action.type) {
    case "data/temperature":
      return { ...state, data: { ...state.data, temperature: action.payload } };
    default:
      return state;
  }
}

// Side effects via listener
const listenerMiddleware = createListenerMiddleware();

listenerMiddleware.startListening({
  type: "data/temperature",
  effect: (action, api) => {
    const state = api.getState();
    display.printLine(0, `Temp: ${formatFloat(state.data.temperature)}c`);
  },
});

// Store
const store = configureStore({
  reducer,
  middleware: (getDefault) => getDefault().prepend(listenerMiddleware.middleware),
});

// Polling
setInterval(async () => {
  const data = await sensor.read();
  store.dispatch({ type: "data/temperature", payload: data.temperature });
}, 60000);
```

## Development

```bash
# Run demo
npm run demo

# Run tests
npm test
```

## License

MIT
