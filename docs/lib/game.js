import { fail, now } from "./utils.js";

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("canvas"));
const ctx = canvas.getContext("2d") ?? fail();

let width = 0;
let height = 0;

const TICK_RATE = 1000 / 45;
const DELAY_TICKS = 2;

/** @type {GameFunc} */
const tick = (game, inputs) => {
  const PLAYER_SPEED = 0.4 * TICK_RATE;

  for (const deviceID in inputs) {
    game.players[deviceID] ??= { x: 400, y: 400, dx: 0, dy: 0 };
    const player = game.players[deviceID];
    const device = inputs[deviceID] ?? fail();

    if (device.a) {
      player.dx = -PLAYER_SPEED;
    } else if (device.d) {
      player.dx = +PLAYER_SPEED;
    } else {
      player.dx = 0;
    }
    if (device.w) {
      player.dy = -PLAYER_SPEED;
    } else if (device.s) {
      player.dy = +PLAYER_SPEED;
    } else {
      player.dy = 0;
    }

    // player.dx /= 1.1;
    // player.dy /= 1.1;
    player.x += player.dx;
    player.y += player.dy;
  }
};

/**
 * @param {number | undefined} start
 * @param {number} end
 * @param {number} alpha
 */
function lin(start, end, alpha) {
  return start === undefined ? end : start + (end - start) * alpha;
}

/** @type {RenderFunc} */
const renderFunc = (prev, current, alpha) => {
  ctx.clearRect(0, 0, width, height);

  for (const deviceID in current.players) {
    const player = current.players[deviceID] ?? fail();
    const lastPlayer = prev.players[deviceID];
    const x = lin(lastPlayer?.x, player.x, alpha);
    const y = lin(lastPlayer?.y, player.y, alpha);
    ctx.fillStyle = "red";
    ctx.fillRect(x, y, 30, 30);
  }
};

/** @type {InputEntry[]} */
const inputEntries = [];

/** @type {Game} */
let game = {
  originTime: now(),
  tick: 0,
  players: {},
};

/** @type {Game | undefined} */
let prevGame;

const observer = new ResizeObserver((entries) => {
  for (const { contentRect } of entries) {
    width = contentRect.width;
    height = contentRect.height;
    canvas.width = width;
    canvas.height = height;
  }
});

observer.observe(canvas);

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  /** @type {InputEntry} */

  const input = {
    time: now(),
    key: e.key.toLowerCase(),
    deviceID: "default",
    value: 1,
  };
  inputEntries.push(input);
});

window.addEventListener("keyup", (e) => {
  const input = {
    time: now(),
    key: e.key.toLowerCase(),
    deviceID: "default",
    value: 0,
  };
  inputEntries.push(input);
});

function mainloop() {
  const currentTime = now();

  while (game.tick < (currentTime - game.originTime) / TICK_RATE - DELAY_TICKS) {
    prevGame = game;

    const tickStartTime = game.originTime + (game.tick - 1) * TICK_RATE;
    const tickEndTime = tickStartTime + TICK_RATE;

    inputEntries.sort((a, b) => a.time - b.time);

    // const inputEntriesInTimeWindow = inputEntries.filter((x) => x.time >= tickStartTime && x.time < tickEndTime);
    const inputEntriesInTimeWindow = inputEntries.filter((x) => x.time < tickEndTime);

    /** @type {TickInputMap} */
    const combinedInputs = {};

    for (const inputEntry of inputEntriesInTimeWindow) {
      combinedInputs[inputEntry.deviceID] ??= {};

      combinedInputs[inputEntry.deviceID][inputEntry.key] = inputEntry.value;
    }

    game = structuredClone(game);
    game.tick++;
    tick(game, combinedInputs);
  }

  const currentTimeTick = (now() - game.originTime) / TICK_RATE - DELAY_TICKS;

  if (prevGame !== undefined) {
    const alpha = (currentTimeTick - prevGame.tick) / (game.tick - prevGame.tick);
    renderFunc(prevGame, game, alpha);
  } else {
    renderFunc(game, game, 1);
  }

  requestAnimationFrame(mainloop);
}

mainloop();
