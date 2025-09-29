import { setupConnection, sleep } from "./conn.js";
import { fail } from "./utils.js";

const roomId = parseInt(window.location.pathname.slice(1));

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("canvas"));
const ctx = canvas.getContext("2d") ?? fail();

let width = 0;
let height = 0;

/** @type {GameState | undefined} */
let gameState;

/**
 * @param {GameState} gameState
 */
function render(gameState) {
  ctx.clearRect(0, 0, width, height);
  for (const player of gameState.players) {
    ctx.fillStyle = "red";
    ctx.fillRect(player.x, player.y, 5, 5);
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

/** @type {(data: Message) => void} */
const send = setupConnection(roomId, (/** @type {Message} */ data) => {
  const { stateresponse, staterequest } = data;

  if (staterequest && gameState) {
    send({ stateresponse: gameState });
  }

  if (stateresponse) {
    gameState = stateresponse;
  }
});

// wait for connection
await sleep(500);

send({ staterequest: true });

// wait for responses to state request
await sleep(500);

if (gameState === undefined) {
  gameState = {
    created: performance.timeOrigin,
    players: [
      {
        id: Math.random(),
        x: 100,
        y: 100,
      },
    ],
    tick: 0,
  };

  send({ stateresponse: gameState });
}

setInterval(() => {
  console.log(gameState);
}, 500);
