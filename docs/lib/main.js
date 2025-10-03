import { setupConnection, sleep } from "./conn.js";
import { fail, now } from "./utils.js";

const urlParams = new URL(window.location.href).searchParams;

const roomId = parseInt(urlParams.get("room") ?? fail()) || fail();
const playerId = parseInt(urlParams.get("player") ?? fail()) || fail();

const TICK_RATE = 1000 / 60;
const SIMULATED_LATENCY = 0;
const DELAY_TICKS = 2;

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("canvas"));
const ctx = canvas.getContext("2d") ?? fail();

let width = 0;
let height = 0;

/** @type {GameState[]} */
const gameStateHistory = [];

/** @type {GameState | undefined} */
let gameState;

/**
 * @param {GameState} gameState
 */
function render(gameState) {
  ctx.clearRect(0, 0, width, height);
  for (const player of gameState.players) {
    ctx.fillStyle = "red";
    ctx.fillRect(player.x, player.y, 30, 30);
  }
}

const observer = new ResizeObserver((entries) => {
  for (const { contentRect } of entries) {
    width = contentRect.width;
    height = contentRect.height;
    canvas.width = width;
    canvas.height = height;
    if (gameState !== undefined) {
      render(gameState);
    }
  }
});

observer.observe(canvas);

/** @type {Input[]} */
const inputs = [];

/** @type {(data: Message) => void} */
const send = setupConnection(
  roomId,
  (/** @type {Message} */ data) => {
    const { stateresponse, staterequest, inputs: inputBuffer } = data;

    if (staterequest && gameState) {
      send({ stateresponse: gameState });
    } else if (stateresponse) {
      gameState = stateresponse;
    } else if (inputBuffer) {
      inputs.push(...inputBuffer);

      if (gameState) {
        const minTime = inputBuffer[0].time;

        if (minTime < gameState.created + gameState.tick * TICK_RATE) {
          const index = gameStateHistory.findLastIndex((x) => minTime > x.created + x.tick * TICK_RATE);
          if (index === -1) {
            fail("cannot recover");
          }
          gameState = gameStateHistory[index];
          gameStateHistory.splice(index + 1, gameStateHistory.length - index);
        }
      }
    }
  },
  SIMULATED_LATENCY
);

// wait for connection
await sleep(500);

send({ staterequest: true });

// wait for responses to state request
await sleep(300 + 200 * Math.random());

if (gameState === undefined) {
  gameState = {
    created: now(),
    players: [],
    tick: 0,
  };

  send({ stateresponse: gameState });
}
/** @type {Input[]} */
let inputBuffer = [];

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const input = {
    time: now(),
    keydown: { key: e.key.toLowerCase(), playerId },
  };
  inputBuffer.push(input);
});

window.addEventListener("keyup", (e) => {
  const input = {
    time: now(),
    keyup: { key: e.key.toLowerCase(), playerId },
  };
  inputBuffer.push(input);
});

/**
 * @param {GameState} prevGameState
 * @param {Input[]} inputs
 */
function tick(prevGameState, inputs) {
  const gameState = structuredClone(prevGameState);

  gameState.tick++;

  for (const input of inputs) {
    const { time, keydown, keyup, playerJoin, playerLeave } = input;

    if (keydown || keyup) {
      const playerId = keydown?.playerId ?? keyup?.playerId ?? fail();
      let player = gameState.players.find((x) => x.id === playerId);
      if (player === undefined) {
        player = {
          id: playerId,
          keysdown: [],
          x: 50,
          y: 50,
          dx: 0,
          dy: 0,
        };

        gameState.players.push(player);
      }

      if (keydown) {
        if (!player.keysdown.includes(keydown.key)) {
          player.keysdown.push(keydown.key);
        }
      } else if (keyup) {
        const index = player.keysdown.indexOf(keyup.key);
        if (index !== -1) {
          player.keysdown.splice(index, 1);
        }
      }
    }
  }

  for (const player of gameState.players) {
    const SPEED = 0.2;
    const FRICTION = 1.04;
    const MAX_SPEED = 2;

    player.dx += Number(player.keysdown.includes("d")) - Number(player.keysdown.includes("a"));
    player.dy += Number(player.keysdown.includes("s")) - Number(player.keysdown.includes("w"));

    const mag = Math.hypot(player.dx, player.dy);

    if (mag > MAX_SPEED) {
      const scale = MAX_SPEED / mag;
      player.dx *= scale;
      player.dy *= scale;
    }

    player.dx /= FRICTION;
    player.dy /= FRICTION;

    player.x += player.dx * SPEED * TICK_RATE;
    player.y += player.dy * SPEED * TICK_RATE;
  }

  return gameState;
}

setInterval(() => {
  if (gameState) {
    gameStateHistory.push(structuredClone(gameState));
  }
  while (gameStateHistory.length > 8) {
    gameStateHistory.shift();
  }
}, 100);

function main() {
  if (inputBuffer.length) {
    send({ inputs: inputBuffer });
    inputs.push(...inputBuffer);
    inputBuffer = [];
  }
  inputs.sort((a, b) => a.time - b.time);

  if (gameState) {
    while (true) {
      const currentGameTime = gameState.created + TICK_RATE * gameState.tick;

      if (currentGameTime > now() - TICK_RATE * (1 + DELAY_TICKS)) {
        break;
      }

      const currentInputs = inputs.filter((x) => x.time >= currentGameTime && x.time < currentGameTime + TICK_RATE);

      gameState = tick(gameState, currentInputs);
    }

    render(gameState);

    const delay = gameState.created + TICK_RATE * (gameState.tick + 1) - now();

    setTimeout(main, delay);
  } else {
    setTimeout(main, 500);
  }
}

main();
