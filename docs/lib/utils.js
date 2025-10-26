/** @type {(ms: number) => Promise<void>} */
export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * @param {number | undefined} start
 * @param {number} end
 * @param {number} alpha
 */
export function lin(start, end, alpha) {
  return start === undefined || !Number.isFinite(start) ? end : start + (end - start) * alpha;
}

export const LOCALHOST = window.location.hostname === "localhost";
