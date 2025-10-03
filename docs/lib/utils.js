/**
 * @param {string | undefined} msg
 * @returns {never}
 */
export function fail(msg = undefined) {
  throw new Error(msg);
}

/**
 * @param {any} value
 * @param {string | undefined} msg
 * @returns {asserts value}
 */
export function assert(value, msg = undefined) {
  if (!value) {
    throw new Error(msg);
  }
}

export function now() {
  return performance.timeOrigin + performance.now();
}

/** @type {(ms: number) => Promise<void>} */
export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
