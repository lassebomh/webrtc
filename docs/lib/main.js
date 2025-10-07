import { setupConnection } from "./conn.js";
import { createInputEntry, Input } from "./inputs.js";
import { fail, now, sleep } from "./utils.js";

const TICK_RATE = 1000 / 2;
const DELAY_TICKS = 2;
const SIMULATED_LATENCY = 50;

const DefaultInputID = Math.random();

/** @type {GameState[]} */
const gameStateHistory = [];

/** @type {GameState | undefined} */
let prevGameState;
/** @type {GameState | undefined} */
let gameState;

/**
 * @param {GameState} prevGameState
 * @param {GameState} gameState
 * @param {number} alpha
 */
function render(prevGameState, gameState, alpha) {}

/** @type {InputEntry[]} */
const inputs = [];

/** @type {(data: Message) => void} */
const send = setupConnection(
  "roomId",
  (/** @type {Message} */ data) => {
    const { stateresponse, staterequest, inputs: inputBuffer } = data;

    if (staterequest && gameState) {
      send({ stateresponse: gameState });
    } else if (stateresponse) {
      gameState = stateresponse;
    } else if (inputBuffer) {
      inputs.push(...inputBuffer);

      if (gameState) {
        const minTime = inputBuffer[0][Input.Time];

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

let defaultInputEntry = createInputEntry(DefaultInputID);

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  let key = e.code;

  console.log(key);

  if (key in Input) {
    defaultInputEntry[Input[/** @type {keyof (typeof Input)} */ (key)]] = 1;
  }
});

window.addEventListener("keyup", (e) => {
  const key = e.key.toLowerCase();
  if (key in Input) {
    defaultInputEntry[Input[/** @type {keyof (typeof Input)} */ (key)]] = 0;
  }
});

/**
 * @param {GameState} prevGameState
 * @param {InputEntry[]} inputs
 */
function tick(prevGameState, inputs) {
  const gameState = structuredClone(prevGameState);

  gameState.tick++;

  console.log(inputs);

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

function mainloop() {
  send({ inputs: [defaultInputEntry] });
  inputs.push(defaultInputEntry);
  defaultInputEntry = createInputEntry(DefaultInputID);

  inputs.sort((a, b) => a[Input.Time] - b[Input.Time]);

  if (gameState) {
    while (true) {
      const currentGameTime = gameState.created + TICK_RATE * gameState.tick;

      if (currentGameTime > now() - TICK_RATE * (1 + DELAY_TICKS)) {
        break;
      }

      const currentInputs = inputs.filter(
        (x) => x[Input.Time] >= currentGameTime && x[Input.Time] < currentGameTime + TICK_RATE
      );

      prevGameState = gameState;
      gameState = tick(gameState, currentInputs);
    }
  }
}

mainloop();

setInterval(mainloop, TICK_RATE);

function renderloop() {
  requestAnimationFrame(renderloop);

  if (!gameState) return;

  if (prevGameState) {
    const prevGameStateTime = prevGameState.created + prevGameState.tick * TICK_RATE;
    const gameStateTime = gameState.created + gameState.tick * TICK_RATE;
    const alpha = (now() - TICK_RATE * (1 + DELAY_TICKS) - prevGameStateTime) / (gameStateTime - prevGameStateTime);

    render(prevGameState, gameState, alpha);
  } else {
    render(gameState, gameState, 1);
  }
}

renderloop();
