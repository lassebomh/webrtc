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

/**
 * @param {number | undefined} start
 * @param {number} end
 * @param {number} alpha
 */
export function lin(start, end, alpha) {
  return start === undefined || !Number.isFinite(start) ? end : start + (end - start) * alpha;
}

/**
 * @template {(...args: any[]) => any} Fn
 * @param {Fn} fn
 * @param {number} ms
 * @returns {(...args: Parameters<Fn>) => void}
 */
export function debounce(fn, ms) {
  /** @type {number | undefined} */
  let timeout;

  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
}
