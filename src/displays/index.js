import { isVirtualMode } from "../env.js";
import { cjsDefault } from "../utils/cjs.js";
import { createTerminalDisplay } from "./terminal.js";
import { wrapOled } from "./oled-wrap.js";
import { createVirtualOled } from "./virtual-oled.js";

/**
 * Create a display with automatic hardware/virtual mode detection
 *
 * @param {Object} config - Display configuration
 * @param {string} config.type - Display type: "lcd" | "oled"
 * @param {number} [config.width] - Display width (chars for LCD, pixels for OLED)
 * @param {number} [config.height] - Display height (lines for LCD, pixels for OLED)
 * @param {number} [config.address] - I2C address
 * @param {number} [config.bus] - I2C bus number (default: 1)
 * @returns {Promise<Display>} Display instance
 */
export const createDisplay = async (config) => {
  if (isVirtualMode()) {
    // OLEDs: the real driver on an emulated chip, previewed pixel-exact (browser + terminal).
    // Falls back to the text-only terminal display if the driver isn't installed.
    if (config.type === "oled") {
      const emulated = await createVirtualOled(config);
      if (emulated) return emulated;
    }
    return createTerminalDisplay(config);
  }

  return createHardwareDisplay(config);
};

/**
 * Create a hardware display (Pi only)
 */
const createHardwareDisplay = async (config) => {
  const { type } = config;

  switch (type) {
    case "lcd":
      return createLcdDisplay(config);

    case "oled":
      return createOledDisplay(config);

    default:
      throw new Error(`Unknown display type: ${type}`);
  }
};

/**
 * LCD 16x2 (or similar) character display
 */
const createLcdDisplay = async (config) => {
  const { width = 16, height = 2, address = 0x27, bus = 1 } = config;

  const LCD = cjsDefault(await import("raspberrypi-liquid-crystal"));
  const lcd = new LCD(bus, address, width, height);

  lcd.beginSync();
  lcd.displaySync();

  return {
    type: "lcd",
    width,
    height,

    clear() {
      lcd.clearSync();
    },

    setCursor(col, row) {
      lcd.setCursorSync(col, row);
    },

    print(text) {
      lcd.printSync(text);
    },

    printLine(line, text) {
      lcd.printLineSync(line, text);
    },

    setBacklight(on) {
      // raspberrypi-liquid-crystal (<=1.20.0) has no backlight API. The
      // PCF8574 backlight bit lives in displayPorts.backlight and is OR'd
      // into every I2C write, so mutate it and latch it onto the bus with a
      // benign command write. noDisplaySync() would also drop the bit, but
      // it blanks the LCD content too — we want text visible while dark.
      lcd.displayPorts.backlight = on ? 0x08 : 0x00;
      lcd.noCursorSync();
    },

    async cleanup() {
      lcd.clearSync();
      lcd.noDisplaySync();
    },
  };
};

/**
 * OLED display (SSD1306 or similar)
 */
const createOledDisplay = async (config) => {
  const { width = 128, height = 64, address = 0x3c, bus = 1 } = config;

  const i2c = cjsDefault(await import("i2c-bus"));
  const Oled = cjsDefault(await import("oled-i2c-bus"));
  const font = cjsDefault(await import("oled-font-5x7"));

  const i2cBus = i2c.openSync(bus);
  const oled = new Oled(i2cBus, { width, height, address });

  oled.clearDisplay();

  return {
    ...wrapOled({ oled, font, width, height }),
    _i2cBus: i2cBus,
    async cleanup() {
      oled.clearDisplay();
      oled.turnOffDisplay();
      i2cBus.closeSync();
    },
  };
};

export { createTerminalDisplay } from "./terminal.js";
export { createVirtualOled } from "./virtual-oled.js";
