import { fail, now } from "./utils.js";
import { lin, run } from "./rollback.js";

/** @typedef {{tick: number;originTime: number;players: Record<DeviceID, { x: number; y: number; dx: number; dy: number }>;}} Game */

/** @type {GameFunc<Game>} */
const tick = (game, inputs) => {
  for (const deviceID in inputs) {
    game.players[deviceID] ??= { x: 400, y: 400, dx: 0, dy: 0 };
    const player = game.players[deviceID];
    const device = inputs[deviceID] ?? fail();

    if (device.a) {
      player.dx = -10;
    } else if (device.d) {
      player.dx = +10;
    } else {
      player.dx = 0;
    }
    if (device.w) {
      player.dy = -10;
    } else if (device.s) {
      player.dy = +10;
    } else {
      player.dy = 0;
    }

    player.x += player.dx;
    player.y += player.dy;
  }
};

/** @type {RenderFunc<Game>} */
const render = (ctx, prev, current, alpha) => {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (const deviceID in current.players) {
    const player = current.players[deviceID] ?? fail();
    const lastPlayer = prev.players[deviceID];
    const x = lin(lastPlayer?.x, player.x, alpha);
    const y = lin(lastPlayer?.y, player.y, alpha);
    ctx.fillStyle = "red";
    ctx.fillRect(x, y, 30, 30);
  }
};

run(tick, render, {
  tick: 0,
  originTime: now(),
  players: {},
});
