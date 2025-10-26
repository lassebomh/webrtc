/**
 * @param {string | Error | undefined} msg
 * @returns {never}
 */
export function fail(msg = undefined) {
  if (msg instanceof Error) {
    throw msg;
  } else {
    throw new Error(msg);
  }
}

/**
 * @param {any} value
 * @param {string |  Error | undefined} msg
 * @returns {asserts value}
 */
export function assert(value, msg = undefined) {
  if (!value) {
    fail(msg);
  }
}

/**
 * @param {never} _value
 * @param {string | Error | undefined} msg
 * @returns {never}
 */
export function isUnreachable(_value, msg = undefined) {
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
