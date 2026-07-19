import readline from "readline";

// Global keyboard listener state
let keyboardInitialized = false;
const keyCallbacks = new Map();
let debugCallback = null;

/**
 * Create a virtual button triggered by keyboard
 */
export const createKeyboardInput = (config) => {
  const { gpio, virtualKey, debounce = 50 } = config;
  const key = virtualKey || String(gpio);

  const watchers = [];
  let lastPressTime = 0;

  // Register this button's key
  if (!keyCallbacks.has(key)) {
    keyCallbacks.set(key, []);
  }

  const triggerWatchers = () => {
    const now = Date.now();
    if (now - lastPressTime < debounce) return;
    lastPressTime = now;

    watchers.forEach((callback) => {
      callback(null, 1); // Simulate rising edge
    });
  };

  keyCallbacks.get(key).push(triggerWatchers);

  return {
    type: "keyboard",
    gpio,
    key,
    isVirtual: true,

    watch(callback) {
      watchers.push(callback);
    },

    read() {
      return 0; // Virtual buttons are momentary
    },

    simulatePress() {
      triggerWatchers();
    },

    async cleanup() {
      // Remove from callbacks
      const callbacks = keyCallbacks.get(key);
      if (callbacks) {
        const index = callbacks.indexOf(triggerWatchers);
        if (index > -1) callbacks.splice(index, 1);
      }
    },
  };
};

/**
 * Set up the global keyboard listener for virtual mode
 * Call this once at app startup
 *
 * @param {Object} options - Configuration options
 * @param {Function} [options.onDebug] - Callback for 'd' key (debug)
 * @param {Function} [options.onQuit] - Callback for 'q' key (quit)
 */
export const setupKeyboardListener = (options = {}) => {
  if (keyboardInitialized) return;

  const { onDebug, onQuit } = options;
  debugCallback = onDebug;

  readline.emitKeypressEvents(process.stdin);

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  process.stdin.on("keypress", (str, key) => {
    if (!key) return;

    // Handle Ctrl+C
    if (key.ctrl && key.name === "c") {
      process.emit("SIGINT");
      return;
    }

    // Handle quit
    if (key.name === "q") {
      if (onQuit) {
        onQuit();
      } else {
        process.emit("SIGINT");
      }
      return;
    }

    // Handle debug
    if (key.name === "d") {
      if (debugCallback) {
        debugCallback();
      }
      return;
    }

    // Trigger registered button callbacks
    const keyName = key.name || str;
    const callbacks = keyCallbacks.get(keyName);
    if (callbacks) {
      callbacks.forEach((cb) => cb());
    }
  });

  process.stdin.resume();
  keyboardInitialized = true;
};

/**
 * Clean up keyboard listener
 */
export const cleanupKeyboardListener = () => {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  keyboardInitialized = false;
  keyCallbacks.clear();
};
