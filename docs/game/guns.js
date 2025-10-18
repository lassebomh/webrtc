/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} angle
 */
export function pistolRender(ctx, x, y, angle) {
  const forwardX = Math.cos(angle);
  const forwardY = Math.sin(angle);
  const downX = Math.cos(angle + Math.PI / 2);
  const downY = Math.sin(angle + Math.PI / 2);

  ctx.lineWidth = 0.2;

  const gunLength = 0.4;

  ctx.strokeStyle = "#999";
  ctx.beginPath();
  ctx.moveTo(x + forwardX * (ctx.lineWidth / 2) - forwardX * 0.1, y + forwardY * (ctx.lineWidth / 2) - forwardY * 0.1);
  ctx.lineTo(
    x + downX * gunLength * 0.6 * forwardX + forwardX * (ctx.lineWidth / 2) - forwardX * 0.1,
    y + downY * gunLength * 0.6 * forwardX + forwardY * (ctx.lineWidth / 2) - forwardY * 0.1
  );

  ctx.moveTo(x - forwardX * 0.1, y - forwardY * 0.1);
  ctx.lineTo(x + forwardX * gunLength - forwardX * 0.1, y + forwardY * gunLength - forwardY * 0.1);
  ctx.stroke();
}

/**
 * @param {Game} game
 * @param {number} x
 * @param {number} y
 * @returns {Gun}
 */
export function gunCreate(game, x, y) {
  return (game.guns[game.autoid++] = {
    box: {
      x: x,
      y: y,
      dx: 0,
      dy: 0,
      width: 0.7,
      height: 0.7,
      bounce: 0.5,
      wallBottom: false,
      wallLeft: false,
      wallRight: false,
      wallTop: false,
    },
    bullets: 8,
    cooldown: 10,
    ticksUntilPickup: 0,
    type: 0,
  });
}
