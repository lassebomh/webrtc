import { fail, now, lin } from "../lib/utils.js";
import { run } from "../lib/rollback.js";
import { levels } from "./levels.js";

const CANVAS_SCALE = 30;

const PLAYER_SPEED = 0.04;
const PLAYER_FRICTION = 1.2;
const PLAYER_WIDTH = 0.9;
const PLAYER_HEIGHT = 1.2;

/** @type {GameFunc<Game>} */
const tick = (game, inputs) => {
  const level = levels[game.level] ?? fail();

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

      game.players[deviceID] = { x: safestSpawnPoint.x, y: safestSpawnPoint.y, dx: 0, dy: 0 };
    }

    const player = game.players[deviceID];
    const device = inputs[deviceID] ?? fail();

    if (device.a) {
      player.dx -= PLAYER_SPEED;
    }
    if (device.d) {
      player.dx += PLAYER_SPEED;
    }
    if (device.w) {
      player.dy -= PLAYER_SPEED;
    }
    if (device.s) {
      player.dy += PLAYER_SPEED;
    }

    player.dx /= PLAYER_FRICTION;
    player.dy /= PLAYER_FRICTION;

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

      game.camera.x -= (game.camera.x - meanX) / 16;
      game.camera.y -= (game.camera.y - meanY) / 16;
    }
  }
};

/** @type {RenderFunc<Game>} */
const render = (ctx, prev, curr, alpha) => {
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
    ctx.fillRect(x, y, PLAYER_WIDTH, PLAYER_HEIGHT);
  }

  ctx.restore();
};

run({
  tick,
  render,
  init: () => ({
    tick: 0,
    originTime: now(),
    players: {},
    camera: {
      x: 0,
      y: 0,
    },
    level: 0,
  }),
});
