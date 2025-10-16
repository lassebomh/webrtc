import { EPSILON, lin } from "../lib/utils.js";
import { getTile } from "./levels.js";

/**
 * @param {Level} level
 * @param {Box} box
 */
export function boxLevelTick(level, box) {
  let dx = box.dx;
  let dy = box.dy;

  {
    const l = box.x - EPSILON + box.dx;
    const tl = getTile(level, l, box.y + EPSILON);
    const ml = getTile(level, l, box.y + box.height / 2);
    const bl = getTile(level, l, box.y + box.height - EPSILON);

    box.wallLeft = ml === 1 || bl === 1 || tl === 1;

    if (box.wallLeft) {
      box.x = Math.ceil(l);
      box.dx = box.dx * -box.bounce;
    }
  }

  {
    const r = box.x + box.width + box.dx + EPSILON;

    const tr = getTile(level, r, box.y + EPSILON);
    const mr = getTile(level, r, box.y + box.height / 2);
    const br = getTile(level, r, box.y + box.height - EPSILON);

    box.wallRight = mr === 1 || br === 1 || tr === 1;

    if (box.wallRight) {
      box.x = Math.floor(r) - box.width;
      box.dx = box.dx * -box.bounce;
    }
  }

  {
    const b = box.y + box.height + EPSILON + box.dy;
    const bl = getTile(level, box.x + EPSILON, b);
    const br = getTile(level, box.x + box.width - EPSILON, b);

    box.wallBottom = bl === 1 || br === 1;

    if (box.wallBottom) {
      box.y = Math.floor(b) - box.height;
      box.dy = box.dy * -box.bounce;
    }
  }

  {
    const t = box.y - EPSILON + box.dy;
    const tl = getTile(level, box.x + EPSILON, t);
    const tr = getTile(level, box.x + box.width - EPSILON, t);

    box.wallTop = tl === 1 || tr === 1;

    if (box.wallTop) {
      box.y = Math.ceil(t);
      box.dy = box.dy * -box.bounce;
    }
  }

  // if (!(box.wallBottom || box.wallTop || box.wallLeft || box.wallRight)) {
  //   box.airTime++;
  //   // box.dx /= box.airFriction;
  //   // box.dy /= box.airFriction;
  // } else {
  //   box.airTime = 0;
  //   // box.dx /= box.wallFriction;
  //   // box.dy /= box.wallFriction;
  // }

  // const speed = Math.hypot(box.dx, box.dy);

  // if (speed > box.maxSpeed) {
  //   const reduction = (speed - box.maxSpeed) / 4;
  //   const targetSpeed = speed - reduction;
  //   const scale = targetSpeed / speed;

  //   box.dx *= scale;
  //   box.dy *= scale;
  // }

  box.x += box.dx;
  box.y += box.dy;

  // box.dy += box.gravity;
}

/**
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Box | undefined} prev
 * @param {Box} curr
 * @param {string} color
 * @param {number} alpha
 */
export function boxRender(ctx, prev, curr, color, alpha) {
  const x = lin(prev?.x, curr.x, alpha);
  const y = lin(prev?.y, curr.y, alpha);
  const width = lin(prev?.width, curr.width, alpha);
  const height = lin(prev?.height, curr.height, alpha);

  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
}

/**
 * @param {Box} a
 * @param {Box} b
 * @returns {boolean}
 */
export function boxOnBoxCollision(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * @param {Box} box
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function boxOnPointCollision(box, x, y) {
  return box.x < x && box.x + box.width > x && box.y < y && box.y + box.height > y;
}
