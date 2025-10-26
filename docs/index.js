import { server } from "./lib/server.js";
import { Net } from "./lib/shared/net.js";
import { assert, fail, now, sleep } from "./lib/shared/utils.js";
import { init, render, tick } from "./game/game.js";
import { DesyncError, InputController, RollbackEngine } from "./lib/inputs.js";
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
      const [firstHistoryEntry, ...historyEntries] = structuredClone(rollback.history);
      assert(firstHistoryEntry?.state && firstHistoryEntry?.mergedInputs);
      for (const historyEntry of historyEntries) {
        historyEntry.state = null;
        historyEntry.mergedInputs = null;
      }
      historyEntries.unshift(firstHistoryEntry);

      return {
        originTime: originTime,
        history: historyEntries,
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

/** @type {number | undefined} */
let mainAnimationFrameRequest;

function mainLoop() {
  mainAnimationFrameRequest = undefined;
  try {
    const realTick = getRealTick();

    if (Math.floor(realTick) > inputFlushTick) {
      const inputEntry = inputController.flush();
      inputFlushTick = Math.floor(realTick);

      rollback.addInputs(inputFlushTick, { [roomNet.peerId]: inputEntry });
      roomNet.sendAll("inputs", { tick: inputFlushTick, inputEntry });
      while (rollback.history.length > 400) {
        rollback.history.shift();
      }
    }

    let frontFrameTick = Math.floor(realTick);
    const alpha = realTick - frontFrameTick;
    frontFrameTick -= 2; // Delay ticks
    const backFrameTick = frontFrameTick - 1;

    {
      const backFrameState = rollback.getState(backFrameTick);
      const frontFrameState = rollback.getState(frontFrameTick);

      assert(frontFrameState?.state && frontFrameState.mergedInputs);

      if (backFrameState?.state) {
        render(ctx, backFrameState.state, frontFrameState.state, alpha);
      } else {
        render(ctx, frontFrameState.state, frontFrameState.state, 1);
      }
    }

    mainAnimationFrameRequest = requestAnimationFrame(mainLoop);
  } catch (error) {
    if (error instanceof DesyncError) {
      console.warn(error);
      historyHardSync();
    } else {
      throw error;
    }
  }
}

async function historyHardSync() {
  if (mainAnimationFrameRequest) {
    cancelAnimationFrame(mainAnimationFrameRequest);
    mainAnimationFrameRequest = undefined;
  }
  if (!inputBuffer) {
    inputBuffer = [];
  }

  const existingHistories = Object.values(await roomNet.requestAll("sync", null, 500)).toSorted(
    (a, b) => a.originTime - b.originTime
  );

  const oldestHistory = existingHistories.at(0);

  if (
    oldestHistory &&
    ((oldestHistory.history[0] ?? fail()).tick > (rollback.history[0] ?? fail()).tick ||
      oldestHistory.originTime < originTime)
  ) {
    console.warn("using", oldestHistory.originTime, "instead of", originTime);

    originTime = oldestHistory.originTime;
    rollback = new RollbackEngine(oldestHistory.history, tick);
  }

  if (inputBuffer) {
    while (inputBuffer.length) {
      const { tick, peerID, inputEntry } = inputBuffer.pop() ?? fail();
      try {
        rollback.addInputs(tick, { [peerID]: inputEntry });
      } catch (error) {
        if (error instanceof DesyncError) {
          console.warn(error);
          continue;
        } else {
          throw error;
        }
      }
    }
    inputBuffer = undefined;
  }
  inputFlushTick = Math.floor(getRealTick());

  mainLoop();
}

await historyHardSync();
