import { setupConnection, sleep } from "./conn.js";
import { fail, now } from "./utils.js";

const roomId = parseInt(window.location.pathname.slice(1));

if (!location.hash) {
  location.hash = Math.floor(Math.random() * 10000000).toString();
}

const playerId = parseInt(location.hash.slice(1));

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

      const minTime = inputBuffer[0].time;

      if (minTime < gameState.created + gameState.tick * gameState.tickRate) {
        const index = gameStateHistory.findLastIndex((x) => minTime > x.created + x.tick * x.tickRate);
        if (index === -1) {
          fail("cannot recover");
        }
        gameState = gameStateHistory[index];
        gameStateHistory.splice(index + 1, gameStateHistory.length - index);
      }
    }
  },
  400
);

// wait for connection
await sleep(500);

send({ staterequest: true });

// wait for responses to state request
await sleep(300 + 200 * Math.random());

if (gameState === undefined) {
  gameState = {
    created: now(),
    tickRate: 1000 / 30,
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
      const playerId = keydown?.playerId ?? keyup?.playerId;
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
    const SPEED = 0.02;
    const FRICTION = 1.02;
    const MAX_SPEED = 12;

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

    player.x += player.dx * SPEED * gameState.tickRate;
    player.y += player.dy * SPEED * gameState.tickRate;
  }

  return gameState;
}

setInterval(() => {
  gameStateHistory.push(structuredClone(gameState));
  while (gameStateHistory.length > 16) {
    gameStateHistory.shift();
  }
}, 500);

function main() {
  if (inputBuffer.length) {
    send({ inputs: inputBuffer });
    inputs.push(...inputBuffer);
    inputBuffer = [];
  }
  inputs.sort((a, b) => a.time - b.time);

  while (true) {
    const currentGameTime = gameState.created + gameState.tickRate * gameState.tick;

    if (currentGameTime > now() - gameState.tickRate) {
      break;
    }

    const currentInputs = inputs.filter(
      (x) => x.time >= currentGameTime && x.time < currentGameTime + gameState.tickRate
    );

    gameState = tick(gameState, currentInputs);
  }

  render(gameState);

  const delay = gameState.created + gameState.tickRate * (gameState.tick + 1) - now();

  setTimeout(main, delay);
}

main();
