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

/**
 * @param {HTMLElement | null | undefined} canvas
 */
export function setupCanvas(canvas) {
  assert(canvas && canvas instanceof HTMLCanvasElement);
  const ctx = canvas.getContext("2d") ?? fail();

  const observer = new ResizeObserver((entries) => {
    for (const { contentRect } of entries) {
      canvas.width = contentRect.width;
      canvas.height = contentRect.height;
    }
  });

  observer.observe(canvas);

  return ctx;
}

/**
 * @param {number | undefined} start
 * @param {number} end
 * @param {number} alpha
 */
export function lin(start, end, alpha) {
  return start === undefined ? end : start + (end - start) * alpha;
}

/** @type {DeviceID} */
export const tabID = (sessionStorage.tabId ??= crypto.randomUUID());
