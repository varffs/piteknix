import { isVirtualMode } from "../env.js";
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

  const LCD = (await import("raspberrypi-liquid-crystal")).default;
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
      if (on) {
        lcd.backlightSync();
      } else {
        lcd.noBacklightSync();
      }
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

  const i2c = (await import("i2c-bus")).default;
  const Oled = (await import("oled-i2c-bus")).default;
  const font = (await import("oled-font-5x7")).default;

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
