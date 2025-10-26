import { assert, fail } from "./shared/utils.js";

/** @type {(ms: number) => Promise<void>} */
export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * @param {HTMLElement | null | undefined} canvas
 * @param {() => void} onresize
 */
export function setupCanvas(canvas, onresize = () => {}) {
  assert(canvas && canvas instanceof HTMLCanvasElement);
  const ctx = canvas.getContext("2d") ?? fail();

  const observer = new ResizeObserver((entries) => {
    for (const { contentRect } of entries) {
      canvas.width = contentRect.width;
      canvas.height = contentRect.height;
      onresize();
    }
  });

  observer.observe(canvas.parentElement ?? fail());
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  return ctx;
}

/**
 * @param {number | undefined} start
 * @param {number} end
 * @param {number} alpha
 */
export function lin(start, end, alpha) {
  return start === undefined || !Number.isFinite(start) ? end : start + (end - start) * alpha;
}

export const LOCALHOST = window.location.hostname === "localhost";
