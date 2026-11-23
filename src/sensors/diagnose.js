/**
 * Classify a ds18b20 diagnosis from raw observations.
 * @param {Object} o
 * @param {string} o.id            - target sensor id
 * @param {string[]} o.busDevices  - ids present on the 1-wire bus
 * @param {number|null} o.reading  - raw temperature read (offset NOT applied), or null if read failed
 * @param {{code?:string,message?:string}|null} o.error - read error if any
 * @returns {{status:string,detail:string,busDevices:string[],targetPresent:boolean,lastError:object|null}}
 */
export const classifyDs18b20 = ({ id, busDevices, reading, error }) => {
  const targetPresent = !!id && busDevices.includes(id);
  const lastError = error ? { code: error.code ?? null, message: error.message ?? String(error) } : null;

  if (busDevices.length === 0) {
    return { status: "absent", detail: "no devices on 1-wire bus (check w1 enabled / data-line pull-up)", busDevices, targetPresent, lastError };
  }
  if (id && !targetPresent) {
    return { status: "absent", detail: `target ${id} not on bus (wrong id or sensor disconnected)`, busDevices, targetPresent, lastError };
  }
  if (error) {
    if (error.code === "ECRC") {
      return { status: "error", detail: "CRC check failed — corrupt read (electrical noise / long cable / weak pull-up)", busDevices, targetPresent, lastError };
    }
    if (error.code === "ENOENT") {
      return { status: "error", detail: "device dropped off bus during read (loose connection)", busDevices, targetPresent, lastError };
    }
    return { status: "error", detail: `read error: ${error.message ?? error}`, busDevices, targetPresent, lastError };
  }
  if (reading !== null && Math.abs(reading - 85) < 0.05) {
    return { status: "error", detail: "reads 85.0 power-on default — check power / data line / parasitic power", busDevices, targetPresent, lastError };
  }
  return { status: "ok", detail: `reading ${reading}c`, busDevices, targetPresent, lastError };
};
