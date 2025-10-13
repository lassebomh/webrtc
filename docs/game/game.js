import { fail, lin, now } from "../lib/utils.js";
import { levels } from "./levels.js";

const EPSILON = 1e-5;
const CANVAS_SCALE = 30;
const PLAYER = {
  SPEED: 0.04,
  HORIZONTAL_FRICTION: 1.2,
  VERTICAL_FRICTION: 1.2,
  HELD_GRAVITY: 0.02,
  GRAVITY: 0.06,
  MAX_FALL_SPEED: 0.9,
  WIDTH: 0.9,
  HEIGHT: 1.1,
  LEG_LENGTH: 0.6,
  JUMP: 0.4,
  JUMP_EASE_BOUNCE_TICKS: 6,
  JUMP_EASE_EDGE_TICKS: 6,
  COLORS: ["red", "blue", "green", "orange"],
};

export const init = () => ({
  tick: 0,
  originTime: now(),
  playerCount: 0,
  players: {},
  camera: {
    x: 0,
    y: 0,
  },
  level: 0,
});

/** @type {GameFunc<Game>} */
export const tick = (game, inputs) => {
  const level = levels[game.level] ?? fail();

  /**
   * @param {number} y
   * @param {number} x
   * @returns {number}
   */
  function getTile(y, x) {
    return level.tiles[Math.floor(y)]?.[Math.floor(x)] ?? fail();
  }

  for (const deviceID in inputs) {
    if (game.players[deviceID] === undefined) {
      const spawnPointPlayerDistances = level.spawnPoints
        .map((spawnPoint) => {
          const players = Object.values(game.players);
          const distances = players.map((p) => Math.hypot(p.x - spawnPoint.x, p.y - spawnPoint.y));
          return /** @type {const} */ ([spawnPoint, Math.min(...distances)]);
        })
        .toSorted(([_, aDist], [__, bDist]) => bDist - aDist);

      const safestSpawnPoint = spawnPointPlayerDistances[0]?.[0] ?? fail();

      const color = PLAYER.COLORS[++game.playerCount % PLAYER.COLORS.length] ?? fail();

      game.players[deviceID] = {
        x: safestSpawnPoint.x,
        y: safestSpawnPoint.y,
        dx: 0,
        dy: 0,
        wallBottom: false,
        wallLeft: false,
        wallRight: false,
        wallTop: false,
        jumpHeld: 0,
        fallingTicks: 0,
        color,
        facing: 1,
        feet: {
          angle: 0,
          leftX: safestSpawnPoint.x,
          leftY: safestSpawnPoint.y,
          rightX: safestSpawnPoint.x,
          rightY: safestSpawnPoint.y,
          leftStartX: safestSpawnPoint.x,
          leftStartY: safestSpawnPoint.y,

          rightStartX: safestSpawnPoint.x,
          rightStartY: safestSpawnPoint.y,
          leftKneeX: safestSpawnPoint.x,
          leftKneeY: safestSpawnPoint.y,
          rightKneeX: safestSpawnPoint.x,
          rightKneeY: safestSpawnPoint.y,
        },
        body: {
          angle: 0,
          x: safestSpawnPoint.x,
          y: safestSpawnPoint.y,
          dx: 0,
          dy: 0,
        },
        gun: {
          angle: 0,
          x: safestSpawnPoint.x,
          y: safestSpawnPoint.y,
          dx: 0,
          dy: 0,
        },
      };
    }

    const player = game.players[deviceID];
    const device = inputs[deviceID] ?? fail();

    const pressingJump = device[" "] || device["w"];

    if (pressingJump) {
      if (player.jumpHeld !== -1) {
        player.jumpHeld += 1;
      }
    } else {
      player.jumpHeld = 0;
    }

    if (player.wallBottom || player.wallLeft || player.wallRight) {
      player.fallingTicks = 0;
    } else {
      player.fallingTicks++;
    }

    if (!player.wallBottom) {
      player.dy += player.jumpHeld || player.dy >= 0 ? PLAYER.HELD_GRAVITY : PLAYER.GRAVITY;
      if (player.dy >= PLAYER.MAX_FALL_SPEED) {
        player.dy = PLAYER.MAX_FALL_SPEED;
      }
    }

    const canJump =
      player.jumpHeld > 0 &&
      player.jumpHeld <= PLAYER.JUMP_EASE_BOUNCE_TICKS &&
      player.fallingTicks <= PLAYER.JUMP_EASE_EDGE_TICKS;

    if (canJump) {
      player.dy = -PLAYER.JUMP;

      if (player.wallLeft) {
        player.dx = PLAYER.JUMP;
      } else if (player.wallRight) {
        player.dx = -PLAYER.JUMP;
      }

      player.jumpHeld = -1;
    }

    if (!player.wallLeft && device?.a) {
      player.dx -= PLAYER.SPEED;
    }
    if (!player.wallRight && device?.d) {
      player.dx += PLAYER.SPEED;
    }

    player.dx /= PLAYER.HORIZONTAL_FRICTION;

    if ((player.wallLeft || player.wallRight) && player.dy > 0) {
      player.dy /= PLAYER.VERTICAL_FRICTION;
    }

    {
      const l = player.x - EPSILON + player.dx;
      const tl = getTile(player.y + EPSILON, l);
      const ml = getTile(player.y + PLAYER.HEIGHT / 2, l);
      const bl = getTile(player.y + PLAYER.HEIGHT - EPSILON, l);

      player.wallLeft = ml === 1 || bl === 1 || tl === 1;

      if (player.wallLeft) {
        player.x = Math.ceil(l);
        player.dx = 0;
      }
    }

    {
      const r = player.x + PLAYER.WIDTH + player.dx + EPSILON;

      const tr = getTile(player.y + EPSILON, r);
      const mr = getTile(player.y + PLAYER.HEIGHT / 2, r);
      const br = getTile(player.y + PLAYER.HEIGHT - EPSILON, r);

      player.wallRight = mr === 1 || br === 1 || tr === 1;

      if (player.wallRight) {
        player.x = Math.floor(r) - PLAYER.WIDTH;
        player.dx = 0;
      }
    }

    {
      const b = player.y + PLAYER.HEIGHT + EPSILON + player.dy;
      const bl = getTile(b, player.x + EPSILON);
      const br = getTile(b, player.x + PLAYER.WIDTH - EPSILON);

      player.wallBottom = bl === 1 || br === 1;

      if (player.wallBottom) {
        player.y = Math.floor(b) - PLAYER.HEIGHT;
        player.dy = 0;
      }
    }

    {
      const t = player.y - EPSILON + player.dy;
      const tl = getTile(t, player.x + EPSILON);
      const tr = getTile(t, player.x + PLAYER.WIDTH - EPSILON);

      player.wallTop = tl === 1 || tr === 1;

      if (player.wallTop) {
        player.y = Math.ceil(t);
        player.dy = 0;
      }
    }

    if (player.dx !== 0) {
      player.facing = Math.sign(player.dx);
    }

    player.body.dx -= (player.body.dx - player.dx * 2) / 3;
    player.body.dy -= (player.body.dy - player.dy * 2) / 3;

    player.body.x += player.body.dx;
    player.body.y += player.body.dy;

    player.body.x -= (player.body.x - (player.x + PLAYER.WIDTH / 2 - player.dx)) / 3;
    player.body.y -= (player.body.y - (player.y + PLAYER.WIDTH / 2 - player.dy)) / 3;

    const movingLegAlpha = Math.max(0, Math.min(Math.abs(player.dx * 5) - player.fallingTicks, 1));

    const baseLeftX = player.x + PLAYER.WIDTH / 5;
    const baseLeftY = player.y + PLAYER.HEIGHT;

    player.feet.leftX = lin(baseLeftX, baseLeftX + Math.cos(player.x * 2) / 4, movingLegAlpha);
    player.feet.leftY = Math.min(baseLeftY, lin(baseLeftY, baseLeftY + Math.sin(player.x * 2) / 4, movingLegAlpha));

    player.feet.leftStartX = player.body.x - PLAYER.WIDTH / 3;
    player.feet.leftStartY = player.body.y + PLAYER.WIDTH / 3;

    const baseRightX = player.x + PLAYER.WIDTH * (4 / 5);
    const baseRightY = player.y + PLAYER.HEIGHT;

    player.feet.rightX = lin(baseRightX, baseRightX + Math.cos(Math.PI + player.x * 2) / 4, movingLegAlpha);
    player.feet.rightY = Math.min(
      baseRightY,
      lin(baseRightY, baseRightY + Math.sin(Math.PI + player.x * 2) / 4, movingLegAlpha)
    );

    player.feet.rightStartX = player.body.x + PLAYER.WIDTH / 3;
    player.feet.rightStartY = player.body.y + PLAYER.WIDTH / 3;

    if (player.facing === 1) {
      [player.feet.leftKneeX, player.feet.leftKneeY] = getPointAtDistance(
        player.feet.leftX,
        player.feet.leftY,
        player.feet.leftStartX,
        player.feet.leftStartY,
        PLAYER.LEG_LENGTH
      );

      [player.feet.rightKneeX, player.feet.rightKneeY] = getPointAtDistance(
        player.feet.rightX,
        player.feet.rightY,
        player.feet.rightStartX,
        player.feet.rightStartY,
        PLAYER.LEG_LENGTH
      );
    } else {
      [player.feet.leftKneeX, player.feet.leftKneeY] = getPointAtDistance(
        player.feet.leftStartX,
        player.feet.leftStartY,
        player.feet.leftX,
        player.feet.leftY,
        PLAYER.LEG_LENGTH
      );
      [player.feet.rightKneeX, player.feet.rightKneeY] = getPointAtDistance(
        player.feet.rightStartX,
        player.feet.rightStartY,
        player.feet.rightX,
        player.feet.rightY,
        PLAYER.LEG_LENGTH
      );
    }

    player.x += player.dx;
    player.y += player.dy;
  }

  if (game.tick === 1) {
    game.camera.x = level.width / 2;
    game.camera.y = level.height / 2;
  } else {
    let meanX = 0;
    let meanY = 0;
    let count = 0;

    for (const deviceID in game.players) {
      const player = game.players[deviceID] ?? fail();
      meanX += player.x;
      meanY += player.y;
      count += 1;
    }

    if (count) {
      meanX /= count;
      meanY /= count;

      game.camera.x -= (game.camera.x - meanX) / 32;
      game.camera.y -= (game.camera.y - meanY) / 32;
    }
  }
};
/**
 * @param {number} startX
 * @param {number} startY
 * @param {number} endX
 * @param {number} endY
 * @param {number} value
 * @returns {[number, number]}
 */
function getPointAtDistance(startX, startY, endX, endY, value) {
  const halfDist = value / 2;

  // Midpoint between start and end
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;

  // Distance between start and end
  const dx = endX - startX;
  const dy = endY - startY;
  const segmentLength = Math.hypot(dx, dy);

  if (segmentLength === 0) {
    // Start and end are the same point
    return [startX + halfDist, startY];
  }

  // The distance from the midpoint to the desired point
  let offset = Math.sqrt(Math.pow(halfDist, 2) - Math.pow(segmentLength / 2, 2));

  if (!Number.isFinite(offset)) {
    offset = 0;
  }

  // Perpendicular direction (normalized)
  let orthoX = -dy / segmentLength;
  let orthoY = dx / segmentLength;

  // Move along the perpendicular direction
  const pointX = midX + orthoX * offset;
  const pointY = midY + orthoY * offset;

  return [pointX, pointY];
}

/** @type {RenderFunc<Game>} */
export const render = (ctx, prev, curr, alpha) => {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  const level = levels[curr.level] ?? fail();

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.scale(CANVAS_SCALE, CANVAS_SCALE);
  ctx.translate(-lin(prev.camera.x, curr.camera.x, alpha), -lin(prev.camera.y, curr.camera.y, alpha));

  ctx.drawImage(level.canvas, 0, 0);

  for (const deviceID in curr.players) {
    const player = curr.players[deviceID] ?? fail();
    const prevPlayer = prev.players[deviceID];

    // const x = lin(lastPlayer?.x, player.x, alpha);
    // const y = lin(lastPlayer?.y, player.y, alpha);
    // ctx.fillStyle = "red";
    // ctx.fillRect(x, y, PLAYER.WIDTH, PLAYER.HEIGHT);

    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(
      lin(prevPlayer?.body.x, player.body.x, alpha),
      lin(prevPlayer?.body.y, player.body.y, alpha),
      PLAYER.WIDTH / 1.9,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.strokeStyle = player.color;
    ctx.lineWidth = 0.1;
    {
      const leftStartX = lin(prevPlayer?.feet.leftStartX, player.feet.leftStartX, alpha);
      const leftStartY = lin(prevPlayer?.feet.leftStartY, player.feet.leftStartY, alpha);
      const leftEndX = lin(prevPlayer?.feet.leftX, player.feet.leftX, alpha);
      const leftEndY = lin(prevPlayer?.feet.leftY, player.feet.leftY, alpha);
      const leftKneeX = lin(prevPlayer?.feet.leftKneeX, player.feet.leftKneeX, alpha);
      const leftKneeY = lin(prevPlayer?.feet.leftKneeY, player.feet.leftKneeY, alpha);

      ctx.beginPath();
      ctx.moveTo(leftStartX, leftStartY);
      ctx.quadraticCurveTo(leftKneeX, leftKneeY, leftEndX, leftEndY);
      ctx.stroke();
    }
    {
      const rightStartX = lin(prevPlayer?.feet.rightStartX, player.feet.rightStartX, alpha);
      const rightStartY = lin(prevPlayer?.feet.rightStartY, player.feet.rightStartY, alpha);
      const rightEndX = lin(prevPlayer?.feet.rightX, player.feet.rightX, alpha);
      const rightEndY = lin(prevPlayer?.feet.rightY, player.feet.rightY, alpha);
      const rightKneeX = lin(prevPlayer?.feet.rightKneeX, player.feet.rightKneeX, alpha);
      const rightKneeY = lin(prevPlayer?.feet.rightKneeY, player.feet.rightKneeY, alpha);

      ctx.beginPath();
      ctx.moveTo(rightStartX, rightStartY);
      ctx.quadraticCurveTo(rightKneeX, rightKneeY, rightEndX, rightEndY);
      ctx.stroke();
    }
  }

  ctx.restore();
};
