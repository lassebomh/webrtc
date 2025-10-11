import { fail, now, lin } from "../lib/utils.js";
import { run } from "../lib/rollback.js";
import { levels } from "./levels.js";

const CANVAS_SCALE = 30;

/** @type {GameFunc<Game>} */
const tick = (game, inputs) => {
  const level = levels[game.level] ?? fail();

  for (const deviceID in inputs) {
    game.players[deviceID] ??= { x: 0, y: 0, dx: 0, dy: 0 };
    const player = game.players[deviceID];
    const device = inputs[deviceID] ?? fail();

    if (device.a) {
      player.dx = -0.2;
    } else if (device.d) {
      player.dx = +0.2;
    } else {
      player.dx = 0;
    }
    if (device.w) {
      player.dy = -0.2;
    } else if (device.s) {
      player.dy = +0.2;
    } else {
      player.dy = 0;
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
    ctx.fillRect(x, y, 1, 1);
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
