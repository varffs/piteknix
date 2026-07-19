/**
 * Format a number to fixed decimal places
 * Returns "0" for null/undefined values
 */
export const formatFloat = (number, decimalPlaces = 1) => {
  if (number === null || number === undefined) return "0";
  const rounded = Math.round((number + Number.EPSILON) * 100) / 100;
  return rounded.toFixed(decimalPlaces);
};

/**
 * Clamp a value between min and max
 */
export const clamp = (value, min, max) => {
  return Math.max(min, Math.min(max, value));
};

/**
 * Sleep for a given number of milliseconds
 */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Convert minutes to milliseconds
 */
export const minutesToMs = (minutes) => minutes * 60 * 1000;

/**
 * Get temperature-based status emoji/text
 */
export const getTempStatus = (temp, thresholds = {}) => {
  const { hot = 33, warm = 30, comfortable = 23, cool = 18 } = thresholds;

  if (temp > hot) return ":!";
  if (temp > warm) return ":/";
  if (temp > comfortable) return ":]";
  if (temp > cool) return ":|";
  return ":(";
};
