import { isVirtualMode } from "../env.js";
import { cjsDefault } from "../utils/cjs.js";
import { createTerminalDisplay } from "./terminal.js";

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
    type: "oled",
    width,
    height,
    font,
    _oled: oled,
    _i2cBus: i2cBus,

    clear() {
      oled.clearDisplay();
    },

    setCursor(x, y) {
      oled.setCursor(x, y);
    },

    writeString(fontObj, size, text, color = 1, wrap = true) {
      oled.writeString(fontObj || font, size, text, color, wrap);
    },

    writeText(text, options = {}) {
      const { size = 1, color = 1, wrap = true } = options;
      oled.writeString(font, size, text, color, wrap);
    },

    drawLine(x0, y0, x1, y1, color = 1) {
      oled.drawLine(x0, y0, x1, y1, color);
    },

    drawRect(x, y, w, h, color = 1) {
      oled.drawLine(x, y, x + w, y, color);
      oled.drawLine(x + w, y, x + w, y + h, color);
      oled.drawLine(x + w, y + h, x, y + h, color);
      oled.drawLine(x, y + h, x, y, color);
    },

    fillRect(x, y, w, h, color = 1) {
      oled.fillRect(x, y, w, h, color);
    },

    drawBitmap(data) {
      oled.drawBitmap(data);
    },

    invert(inverted) {
      oled.invertDisplay(inverted);
    },

    turnOff() {
      oled.turnOffDisplay();
    },

    turnOn() {
      oled.turnOnDisplay();
    },

    async cleanup() {
      oled.clearDisplay();
      oled.turnOffDisplay();
      i2cBus.closeSync();
    },
  };
};

export { createTerminalDisplay } from "./terminal.js";
