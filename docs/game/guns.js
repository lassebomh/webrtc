export const BULLET = {
  SPEED: 1.5,
  GRAVITY: 0.0,
};

export const GUN_TYPES = /** @type {const} */ ([
  {
    cooldown: 1,
    damage: 1,
    bullets: 15,
    barrelLength: 0.25,
    automatic: false,
  },
  {
    cooldown: 5,
    damage: 0.5,
    bullets: 60,
    barrelLength: 0.3,
    automatic: true,
  },
]);

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
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} angle
 */
export function uziRender(ctx, x, y, angle) {
  const forwardX = Math.cos(angle);
  const forwardY = Math.sin(angle);
  const downX = Math.cos(angle + Math.PI / 2);
  const downY = Math.sin(angle + Math.PI / 2);

  const barrelLength = GUN_TYPES[1].barrelLength;

  ctx.strokeStyle = "#999";

  ctx.lineWidth = 0.17;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + downX * 0.3 * forwardX, y + downY * 0.3 * forwardX);
  ctx.stroke();

  ctx.lineWidth = 0.1;
  ctx.beginPath();
  ctx.moveTo(x + forwardX * 0.02, y + forwardY * 0.02);
  ctx.lineTo(x + downX * 0.5 * forwardX + forwardX * 0.02, y + downY * 0.5 * forwardX + forwardY * 0.02);
  ctx.stroke();

  ctx.lineWidth = 0.23;
  ctx.beginPath();
  ctx.moveTo(x - forwardX * 0.2, y - forwardY * 0.2);
  ctx.lineTo(x + forwardX * barrelLength - forwardX * 0.1, y + forwardY * barrelLength - forwardY * 0.1);
  ctx.stroke();

  ctx.lineWidth = 0.089;
  ctx.beginPath();
  ctx.moveTo(x - forwardX * 0.2 + downX * -forwardX * 0.02, y - forwardY * 0.2 + downY * -forwardX * 0.02);
  ctx.lineTo(
    x + forwardX * (barrelLength + 0.1) - forwardX * 0.1 + downX * -forwardX * 0.02,
    y + forwardY * (barrelLength + 0.1) - forwardY * 0.1 + downY * -forwardX * 0.02
  );
  ctx.stroke();
}

/**
 * @param {Game} game
 * @param {number} x
 * @param {number} y
 * @param {number} type
 * @returns {Gun}
 */
export function gunCreate(game, x, y, type) {
  return (game.guns[game.autoid++] = /** @type {Gun} */ ({
    box: {
      x: x,
      y: y,
      dx: 0,
      dy: 0,
      width: 0.7,
      height: 0.7,
      bounce: 0.5,
    },
    ticksUntilPickup: 0,
    type: type,
    ...GUN_TYPES[type],
  }));
}
