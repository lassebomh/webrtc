/**
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} angle
 */
export function renderGun(ctx, x, y, angle) {
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
