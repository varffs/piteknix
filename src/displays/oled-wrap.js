/**
 * The piteknix OLED API over an oled-i2c-bus instance. Shared by the hardware
 * display and the virtual one (same driver on an emulated chip), so both run
 * exactly the same drawing code. Callers add `cleanup`.
 */
export const wrapOled = ({ oled, font, width, height }) => ({
  type: "oled",
  width,
  height,
  font,
  _oled: oled,

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

  // Outline of the same w x h pixels fillRect fills: corners at (x, y) and (x+w-1, y+h-1).
  drawRect(x, y, w, h, color = 1) {
    if (w < 1 || h < 1) return;
    const x1 = x + w - 1;
    const y1 = y + h - 1;
    oled.drawLine(x, y, x1, y, color);
    oled.drawLine(x1, y, x1, y1, color);
    oled.drawLine(x1, y1, x, y1, color);
    oled.drawLine(x, y1, x, y, color);
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
});
