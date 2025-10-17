/**
 * @param {number} startX
 * @param {number} startY
 * @param {number} endX
 * @param {number} endY
 * @param {number} value
 * @returns {[number, number]}
 */
export function getPointAtDistance(startX, startY, endX, endY, value) {
  const halfDist = value / 2;

  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;

  const dx = endX - startX;
  const dy = endY - startY;
  const segmentLength = Math.hypot(dx, dy);

  if (segmentLength === 0) {
    return [startX + halfDist, startY];
  }

  let offset = Math.sqrt(Math.pow(halfDist, 2) - Math.pow(segmentLength / 2, 2));

  if (!Number.isFinite(offset)) {
    offset = 0;
  }

  let orthoX = -dy / segmentLength;
  let orthoY = dx / segmentLength;

  const pointX = midX + orthoX * offset;
  const pointY = midY + orthoY * offset;

  return [pointX, pointY];
}

/**
 * @param {Game} game
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function random(game, a = 0, b = 1) {
  let t = (game.random += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return a + (b - a) * r;
}
