export const point = {
  /**
   *
   * @param {number} x
   * @param {number} y
   * @returns {Point}
   */
  create(x, y) {
    return { x, y, px: x, py: y, ppx: x, ppy: y };
  },

  /**
   *
   * @param {Point} a
   * @param {Point} b
   * @returns {number}
   */
  dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  },
};
