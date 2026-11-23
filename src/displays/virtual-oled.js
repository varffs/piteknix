import { cjsDefault } from "../utils/cjs.js";
import { createSsd1306Emulator } from "./ssd1306-emu.js";
import { wrapOled } from "./oled-wrap.js";
import { toHalfBlocks } from "./frame-render.js";
import { startPreviewServer } from "./preview-server.js";
import { virtualKeys, pressVirtualKey } from "../inputs/keyboard.js";

/** The terminal view: the frame in ▀▄█ characters inside a border, then a footer line. */
export const terminalFrame = (snapshot, footer) => {
  const bar = "─".repeat(snapshot.width);
  return [`┌${bar}┐`, ...toHalfBlocks(snapshot).map((l) => `│${l}│`), `└${bar}┘`, footer].join("\n");
};

/**
 * Virtual-mode OLED: the real oled-i2c-bus driver drawing into an emulated
 * SSD1306, so the preview is pixel-exact with the device.
 *
 * Views, from PITEKNIX_PREVIEW (comma list; "none" for neither). Default is
 * "web,terminal" in an interactive terminal and "none" otherwise (tests, pipes,
 * pm2), so nothing opens a port or holds the process open unless asked:
 *   web       local browser page (PITEKNIX_PREVIEW_PORT, default 8130, next free if taken)
 *   terminal  the frame in half-block characters (needs a terminal ≥ width + 2 columns)
 *
 * A web preview that can't start (ports taken, bad port) is logged and skipped:
 * the display still works.
 *
 * Returns null if the driver or font isn't installed (caller falls back to text).
 */
export const createVirtualOled = async (config, { env = process.env, log = console.log, stdout = process.stdout } = {}) => {
  const { width = 128, height = 64, address = 0x3c } = config;
  let Oled, font;
  try {
    Oled = cjsDefault(await import("oled-i2c-bus"));
    font = cjsDefault(await import("oled-font-5x7"));
  } catch {
    return null;
  }

  const emu = createSsd1306Emulator({ width, height });
  const oled = new Oled(emu.wire, { width, height, address });
  oled.clearDisplay();

  const defaultViews = stdout.isTTY ? "web,terminal" : "none";
  const views = new Set((env.PITEKNIX_PREVIEW ?? defaultViews).split(",").map((v) => v.trim()));
  let server = null;
  let offTerminal = null;

  if (views.has("web")) {
    try {
      server = await startPreviewServer({
        source: emu,
        onKey: pressVirtualKey,
        keys: virtualKeys,
        port: Number(env.PITEKNIX_PREVIEW_PORT ?? 8130),
      });
      log(`[OLED preview] ${server.url}`);
    } catch (e) {
      log(`[OLED preview] web preview not started: ${e.message}`);
    }
  }

  if (views.has("terminal")) {
    const footer = () =>
      `${server ? `preview ${server.url}  ·  ` : ""}keys: ${virtualKeys().map((k) => k.key).join(" ")} q`;
    const paint = () => stdout.write(`\x1B[H\x1B[2J${terminalFrame(emu.snapshot(), footer())}\n`);
    offTerminal = emu.onChange(paint);
    if ((stdout.columns ?? Infinity) < width + 2) log(`[OLED preview] widen the terminal to ${width + 2} columns for the pixel view`);
  }

  return {
    ...wrapOled({ oled, font, width, height }),
    _emulator: emu,
    preview: server ? { url: server.url } : null,
    async cleanup() {
      oled.clearDisplay();
      oled.turnOffDisplay();
      offTerminal?.();
      await server?.close();
    },
  };
};
