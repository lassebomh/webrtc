class AssertionError extends Error {}

/**
 * @param {string | undefined} msg
 * @returns {never}
 */
export function fail(msg = undefined) {
  throw new AssertionError(msg);
}

/**
 * @param {any} value
 * @param {string | undefined} msg
 * @returns {asserts value}
 */
export function assert(value, msg = undefined) {
  if (!value) {
    fail(msg);
  }
}

/**
 * @param {never} value
 * @param {string | undefined} msg
 * @returns {never}
 */
export function isUnreachable(value, msg = undefined) {
  fail(msg);
}

export function now() {
  return performance.timeOrigin + performance.now();
}

/** @type {(ms: number) => Promise<void>} */
export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

export const EPSILON = 1e-5;

const safeIntRange = Number.MAX_SAFE_INTEGER - Number.MIN_SAFE_INTEGER;

export const randInt = () => Math.trunc(Number.MIN_SAFE_INTEGER + Math.random() * safeIntRange);
