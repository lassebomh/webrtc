/**
 * @param {string | undefined} msg
 * @returns {never}
 */
export function fail(msg = undefined) {
  throw new Error(msg);
}
