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
  HEIGHT: 1.2,
  JUMP: 0.4,
  JUMP_EASE_BOUNCE_TICKS: 6,
  JUMP_EASE_EDGE_TICKS: 6,
};

export const init = () => ({
  tick: 0,
  originTime: now(),
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
    const lastPlayer = prev.players[deviceID];
    const x = lin(lastPlayer?.x, player.x, alpha);
    const y = lin(lastPlayer?.y, player.y, alpha);
    ctx.fillStyle = "red";
    ctx.fillRect(x, y, PLAYER.WIDTH, PLAYER.HEIGHT);
  }

  ctx.restore();
};
