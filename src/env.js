import fs from "fs";

/**
 * Check if running on a Raspberry Pi (or Linux with GPIO)
 */
export const isRaspberryPi = () => {
  try {
    return fs.existsSync("/sys/class/gpio");
  } catch {
    return false;
  }
};

/**
 * Check if virtual mode is enabled
 * Virtual mode is enabled if:
 * - VIRTUAL_MODE env var is "true"
 * - OR not running on a Raspberry Pi
 */
export const isVirtualMode = () => {
  if (process.env.VIRTUAL_MODE === "true") return true;
  if (process.env.VIRTUAL_MODE === "false") return false;
  return !isRaspberryPi();
};

/**
 * Get current mode as string for logging
 */
export const getMode = () => {
  return isVirtualMode() ? "virtual" : "hardware";
};
