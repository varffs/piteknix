/**
 * A software SSD1306: the chip on the 128x64 OLEDs, not a drawing model.
 *
 * `wire` stands in for an i2c-bus handle, so the real `oled-i2c-bus` driver
 * runs unchanged against it in virtual mode. The emulator decodes the bytes
 * the driver sends exactly as the chip would (commands, column/page address
 * windows, horizontal addressing, data) into display RAM. What the preview
 * shows is therefore what the chip received: a draw the driver never flushed
 * stays invisible here too, as it would on the device.
 *
 * Scrolling commands are accepted and ignored.
 */

// Bytes of arguments that follow each multi-byte command.
const ARGS = {
  0x20: 1, // memory mode
  0x21: 2, // column address window
  0x22: 2, // page address window
  0x26: 6, 0x27: 6, 0x29: 5, 0x2a: 5, // scroll setup
  0x81: 1, // contrast
  0x8d: 1, // charge pump
  0xa3: 2, // vertical scroll area
  0xa8: 1, // multiplex
  0xd3: 1, // display offset
  0xd5: 1, // clock divide
  0xd9: 1, // precharge
  0xda: 1, // COM pins
  0xdb: 1, // VCOM detect
};

export const createSsd1306Emulator = ({ width = 128, height = 64 } = {}) => {
  const pages = height / 8;
  const ram = new Uint8Array(width * pages); // byte = 8 vertical pixels, LSB on top
  const st = { on: false, inverted: false, contrast: 0x7f, colStart: 0, colEnd: width - 1, pageStart: 0, pageEnd: pages - 1, col: 0, page: 0 };
  let pending = null; // { cmd, args: [] } while a command's arguments are arriving
  const listeners = new Set();
  let notifyQueued = false;

  const changed = () => {
    if (notifyQueued) return;
    notifyQueued = true;
    setImmediate(() => {
      notifyQueued = false;
      for (const fn of listeners) fn();
    });
  };

  const runCommand = (cmd, args) => {
    switch (cmd) {
      case 0x21:
        st.colStart = st.col = args[0] % width;
        st.colEnd = args[1] % width;
        return;
      case 0x22:
        st.pageStart = st.page = args[0] % pages;
        st.pageEnd = args[1] % pages;
        return;
      case 0x81:
        st.contrast = args[0];
        return changed();
      case 0xa6:
      case 0xa7:
        st.inverted = cmd === 0xa7;
        return changed();
      case 0xae:
      case 0xaf:
        st.on = cmd === 0xaf;
        return changed();
      default:
        if (cmd >= 0xb0 && cmd <= 0xb7) st.page = cmd & 0x07; // page-mode page select
        else if (cmd <= 0x0f) st.col = (st.col & 0xf0) | cmd; // page-mode column, low nibble
        else if (cmd >= 0x10 && cmd <= 0x1f) st.col = ((cmd & 0x0f) << 4) | (st.col & 0x0f);
    }
  };

  const command = (byte) => {
    if (pending) {
      pending.args.push(byte);
      if (pending.args.length === ARGS[pending.cmd]) {
        const { cmd, args } = pending;
        pending = null;
        runCommand(cmd, args);
      }
      return;
    }
    if (ARGS[byte]) pending = { cmd: byte, args: [] };
    else runCommand(byte, []);
  };

  const data = (byte) => {
    ram[st.page * width + st.col] = byte;
    // Horizontal addressing: step right, wrap to the next page inside the window.
    if (st.col >= st.colEnd) {
      st.col = st.colStart;
      st.page = st.page >= st.pageEnd ? st.pageStart : st.page + 1;
    } else st.col++;
  };

  const wire = {
    i2cWriteSync(_addr, length, buffer) {
      const control = buffer[0];
      const body = buffer.subarray(1, length);
      if (control === 0x40) {
        for (const b of body) data(b);
        changed();
      } else for (const b of body) command(b);
      return length;
    },
    // The driver polls a status byte before full updates; bit 7 clear = not busy.
    i2cReadSync(_addr, length, buffer) {
      buffer.fill(0, 0, length);
      return length;
    },
    closeSync() {},
  };

  return {
    width,
    height,
    wire,
    /** Current visible state. `pixels` is row-major, 1 = lit in RAM (before invert/off). */
    snapshot() {
      const pixels = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        const row = ram.subarray((y >> 3) * width, ((y >> 3) + 1) * width);
        const bit = 1 << (y & 7);
        for (let x = 0; x < width; x++) pixels[y * width + x] = row[x] & bit ? 1 : 0;
      }
      return { width, height, pixels, on: st.on, inverted: st.inverted, contrast: st.contrast };
    },
    /** Called once after each burst of changes (coalesced on setImmediate). */
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
};
