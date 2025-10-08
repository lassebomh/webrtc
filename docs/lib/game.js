import { fail, now, setupCanvas } from "./utils.js";
import { setupConnection } from "./conn.js";

setupConnection("a", () => {});

const ctx = setupCanvas(document.getElementById("canvas"));

const TICK_RATE = 1000 / 30;
const DELAY_TICKS = 1;
const TICKS_PER_SNAPSHOT = 30;
const MAX_SNAPSHOTS = 5;

/** @type {GameFunc} */
const tick = (game, inputs) => {
  const PLAYER_SPEED = 1 * TICK_RATE;

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

/** @type {InputEntry[]} */
const inputEntries = [];

/** @type {Array<[Game, TickInputMap]>} */
const snapshots = [];

/** @type {Game} */
let game = {
  originTime: now(),
  tick: 0,
  players: {},
};

/** @type {Game | undefined} */
let prevGame;

/**
 * @param {KeyboardEvent} event
 */
function onkey(event) {
  if (event.repeat) return;
  inputEntries.push({
    time: now(),
    key: event.key.toLowerCase(),
    deviceID: "default",
    value: Number(event.type === "keydown"),
  });
}

window.addEventListener("keydown", onkey);
window.addEventListener("keyup", onkey);

setInterval(() => {
  console.log(`inputEntries=${inputEntries.length}, snapshots=${snapshots.length}`);
}, 500);

function mainloop() {
  // inputEntries.sort((a, b) => a.time - b.time);

  const currentTime = now();

  while (game.tick < (currentTime - game.originTime) / TICK_RATE - DELAY_TICKS) {
    prevGame = game;

    const tickStartTime = game.originTime + (game.tick - 1) * TICK_RATE;
    const tickEndTime = tickStartTime + TICK_RATE;

    // const inputEntriesInTimeWindow = inputEntries.filter((x) => x.time >= tickStartTime && x.time < tickEndTime);
    const inputEntriesInTimeWindow = inputEntries.filter((x) => x.time < tickEndTime);

    /** @type {TickInputMap} */
    const combinedInputs = {};

    for (const inputEntry of inputEntriesInTimeWindow) {
      const combinedInput = (combinedInputs[inputEntry.deviceID] ??= {});

      combinedInput[inputEntry.key] = inputEntry.value;
    }

    game = structuredClone(game);
    game.tick++;
    tick(game, combinedInputs);

    if (game.tick % TICKS_PER_SNAPSHOT === 0) {
      snapshots.push([game, combinedInputs]);
      if (snapshots.length > MAX_SNAPSHOTS) {
        const discardedSnapshot = snapshots.shift() ?? fail();
        const time = discardedSnapshot[0].originTime + discardedSnapshot[0].tick * TICK_RATE;

        while (inputEntries[0] && inputEntries[0].time < time) {
          inputEntries.shift();
        }
      }
    }
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
