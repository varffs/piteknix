/**
 * Terminal-based display for virtual mode
 * Renders LCD/OLED output as ASCII art in the terminal
 */

/**
 * Create a terminal display that mimics hardware displays
 */
export const createTerminalDisplay = async (config) => {
  const { type, width, height } = config;

  if (type === "lcd") {
    return createTerminalLcd(width || 16, height || 2);
  }

  return createTerminalOled(width || 128, height || 64);
};

/**
 * Terminal LCD display (character-based)
 */
const createTerminalLcd = (width, height) => {
  // Buffer to store display content
  const buffer = Array(height)
    .fill(null)
    .map(() => " ".repeat(width));

  let cursorCol = 0;
  let cursorRow = 0;
  let backlightOn = true;
  let renderPending = false;

  const render = () => {
    // Move cursor to top-left and clear
    process.stdout.write("\x1B[H\x1B[2J");

    // Draw LCD frame
    const topBorder = "┌" + "─".repeat(width) + "┐";
    const bottomBorder = "└" + "─".repeat(width) + "┘";

    console.log(backlightOn ? "\x1B[44m\x1B[37m" : "\x1B[40m\x1B[90m"); // Blue bg or dim
    console.log(topBorder);
    buffer.forEach((line) => {
      console.log("│" + line + "│");
    });
    console.log(bottomBorder);
    console.log("\x1B[0m"); // Reset colors
    console.log("[LCD Virtual Mode] Keys: 1=btn1 2=btn2 d=debug q=quit");
  };

  // Debounced render - batches multiple updates into single frame
  const scheduleRender = () => {
    if (renderPending) return;
    renderPending = true;
    setImmediate(() => {
      renderPending = false;
      render();
    });
  };

  return {
    type: "terminal-lcd",
    width,
    height,
    isVirtual: true,

    clear() {
      for (let i = 0; i < height; i++) {
        buffer[i] = " ".repeat(width);
      }
      cursorCol = 0;
      cursorRow = 0;
      scheduleRender();
    },

    setCursor(col, row) {
      cursorCol = col;
      cursorRow = row;
    },

    print(text) {
      const row = buffer[cursorRow] || "";
      const before = row.substring(0, cursorCol);
      const after = row.substring(cursorCol + text.length);
      buffer[cursorRow] = (before + text + after).substring(0, width).padEnd(width);
      cursorCol += text.length;
      scheduleRender();
    },

    printLine(line, text) {
      buffer[line] = text.substring(0, width).padEnd(width);
      scheduleRender();
    },

    setBacklight(on) {
      backlightOn = on;
      scheduleRender();
    },

    async cleanup() {
      process.stdout.write("\x1B[0m\x1B[2J\x1B[H"); // Reset and clear
    },
  };
};

/**
 * Terminal OLED display (simplified text mode)
 * Real OLED is pixel-based, but we approximate with text
 */
const createTerminalOled = (width, height) => {
  // Approximate character dimensions
  const charWidth = Math.floor(width / 6); // ~6 pixels per char
  const charHeight = Math.floor(height / 10); // ~10 pixels per char row

  // Text buffer (simplified from pixel buffer)
  const buffer = Array(charHeight)
    .fill(null)
    .map(() => ({ text: "", x: 0, size: 1 }));

  let cursorX = 0;
  let cursorY = 0;
  let inverted = false;
  let renderPending = false;

  const render = () => {
    process.stdout.write("\x1B[H\x1B[2J");

    // OLED frame (double-line box drawing)
    const topBorder = "╔" + "═".repeat(charWidth) + "╗";
    const bottomBorder = "╚" + "═".repeat(charWidth) + "╝";

    // Color scheme
    const fg = inverted ? "\x1B[30m" : "\x1B[37m"; // Black or white text
    const bg = inverted ? "\x1B[47m" : "\x1B[40m"; // White or black bg

    console.log(fg + bg);
    console.log(topBorder);

    for (let row = 0; row < charHeight; row++) {
      const line = buffer[row];
      const content = line.text.substring(0, charWidth).padEnd(charWidth);
      console.log("║" + content + "║");
    }

    console.log(bottomBorder);
    console.log("\x1B[0m"); // Reset
    console.log("[OLED Virtual Mode] Keys: 1=btn1 2=btn2 d=debug q=quit");
  };

  // Debounced render - batches multiple updates into single frame
  const scheduleRender = () => {
    if (renderPending) return;
    renderPending = true;
    setImmediate(() => {
      renderPending = false;
      render();
    });
  };

  // Map pixel Y to text row
  const pixelToRow = (y) => Math.floor(y / 10);

  return {
    type: "terminal-oled",
    width,
    height,
    charWidth,
    charHeight,
    isVirtual: true,

    // Provide a fake font for compatibility
    font: { width: 5, height: 7 },

    clear() {
      for (let i = 0; i < charHeight; i++) {
        buffer[i] = { text: "", x: 0, size: 1 };
      }
      cursorX = 0;
      cursorY = 0;
      scheduleRender();
    },

    setCursor(x, y) {
      cursorX = x;
      cursorY = y;
    },

    writeString(font, size, text, color = 1, wrap = true) {
      const row = pixelToRow(cursorY);
      if (row < charHeight) {
        // For larger sizes, we just use the text as-is (can't really scale in terminal)
        const col = Math.floor(cursorX / 6);
        const existing = buffer[row].text;
        buffer[row].text = existing.padEnd(col) + text;
        buffer[row].size = size;
      }
      scheduleRender();
    },

    writeText(text, options = {}) {
      this.writeString(null, options.size || 1, text, options.color || 1, options.wrap ?? true);
    },

    drawLine(x0, y0, x1, y1, color = 1) {
      // Simplified: just note that a line was drawn
      // Terminal can't really render pixel graphics
    },

    drawRect(x, y, w, h, color = 1) {
      // Simplified
    },

    fillRect(x, y, w, h, color = 1) {
      // Simplified
    },

    drawBitmap(data) {
      // Can't render bitmaps in terminal text mode
      const row = Math.floor(charHeight / 2);
      buffer[row].text = "[bitmap image]";
      scheduleRender();
    },

    invert(inv) {
      inverted = inv;
      scheduleRender();
    },

    turnOff() {
      process.stdout.write("\x1B[2J\x1B[H");
      console.log("[OLED Display Off]");
    },

    turnOn() {
      render();
    },

    async cleanup() {
      process.stdout.write("\x1B[0m\x1B[2J\x1B[H");
    },
  };
};
