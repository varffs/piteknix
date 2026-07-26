/**
 * Unwrap a dynamic import of a CommonJS module.
 *
 * Plain CJS (`module.exports = X`): `(await import(m)).default` is X.
 * Transpiled-ESM CJS (`module.exports = { default: X }`, e.g.
 * aht20-sensor): one more unwrap is needed — X lives at `.default.default`.
 * This helper handles both shapes.
 */
export const cjsDefault = (mod) => {
  const d = mod?.default ?? mod;
  return d?.default ?? d;
};
