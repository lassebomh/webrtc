import { server } from "./lib/server.js";
import { Net } from "./lib/shared/net.js";
import { assert, fail, now, sleep } from "./lib/shared/utils.js";
import { init, render, tick } from "./game/game.js";
import { InputController, RollbackEngine } from "./lib/inputs.js";
import { setupCanvas } from "./lib/utils.js";

const TICK_RATE = 1000 / 60;

let roomID = (await server.listRooms())[0]?.roomID;

if (!roomID) roomID = await server.createRoom("New room", 16, true);

await sleep(1000 * Math.random());

const ctx = setupCanvas(document.getElementById("canvas"));
const inputController = new InputController(document.body);

let rollback = new RollbackEngine([{ inputs: {}, mergedInputs: {}, state: init(), tick: 0 }], tick);
let originTime = now();

/** @type {number} */
let inputFlushTick = 0;

/** @type {Array<{tick: number; peerID: PeerID, inputEntry: NewInputEntry}> | undefined} */
let inputBuffer = [];

/** @type {Net<GamePackets>} */
const roomNet =
  (await server.joinRoom(roomID, {
    sync: async (peer, request) => {
      return {
        originTime: originTime,
        history: rollback.history,
      };
    },
    inputs: async (peerID, { tick, inputEntry }) => {
      if (inputBuffer) {
        inputBuffer.push({ peerID, tick, inputEntry });
      } else {
        rollback.addInputs(tick, { [peerID]: inputEntry });
      }
    },
  })) ?? fail();

await sleep(1000);

function getRealTick() {
  return (now() - originTime) / TICK_RATE;
}

async function historyHardSync() {
  if (!inputBuffer) {
    inputBuffer = [];
  }

  const existingHistories = Object.values(await roomNet.requestAll("sync", null, 500)).toSorted(
    (a, b) => a.originTime - b.originTime
  );

  const oldestHistory = existingHistories.at(0);

  if (oldestHistory && oldestHistory.originTime < originTime) {
    console.warn("using", oldestHistory.originTime, "instead of", originTime);

    originTime = oldestHistory.originTime;
    rollback = new RollbackEngine(oldestHistory.history, tick);
  }

  if (inputBuffer) {
    while (inputBuffer.length) {
      const { tick, peerID, inputEntry } = inputBuffer.pop() ?? fail();
      rollback.addInputs(tick, { [peerID]: inputEntry });
    }
    inputBuffer = undefined;
  }
  inputFlushTick = Math.floor(getRealTick());
}

await historyHardSync();

// inputLoop();

function mainLoop() {
  const realTick = getRealTick();

  if (Math.floor(realTick) > inputFlushTick) {
    const inputEntry = inputController.flush();
    inputFlushTick = Math.floor(realTick);

    rollback.addInputs(inputFlushTick, { [roomNet.peerId]: inputEntry });
    roomNet.sendAll("inputs", { tick: inputFlushTick, inputEntry });
  }

  let frontFrameTick = Math.floor(realTick);
  const alpha = realTick - frontFrameTick;
  frontFrameTick -= 2; // Delay ticks
  const backFrameTick = frontFrameTick - 1;

  {
    const backFrameState = rollback.getState(backFrameTick);
    const frontFrameState = rollback.getState(frontFrameTick);

    assert(frontFrameState?.state && frontFrameState.mergedInputs);
    // console.log(JSON.stringify(frontFrameState.mergedInputs));

    if (backFrameState?.state) {
      render(ctx, backFrameState.state, frontFrameState.state, alpha);
    } else {
      render(ctx, frontFrameState.state, frontFrameState.state, 1);
    }
  }

  // if (now() < originTime + 4000) {
  requestAnimationFrame(mainLoop);
  // }
}

mainLoop();

// let t = rollback.history.findLast((x) => x.state !== null && x.mergedInputs !== null)?.tick ?? fail("blamo");

// const interval = setInterval(() => {
//   t++;

//   if (rollback.history.length > 60) rollback.history.shift();

//   const inputEntry = inputController.flush();

//   rollback.addInputs(t + 2, { [roomNet.peerId]: inputEntry });
//   roomNet.sendAll("inputs", { tick: t + 2, inputEntry: inputEntry });

//   const state = rollback.getState(t);

//   render(ctx, state, state, 1);
// }, 1000 / 30);
