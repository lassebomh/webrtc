import { server } from "./lib/server.js";
import { Net } from "./lib/shared/net.js";
import { assert, fail, now, sleep } from "./lib/shared/utils.js";
import { init, render, tick } from "./game/game.js";
import { CanvasController } from "./lib/inputs.js";
import { Timeline, DesyncError } from "./lib/timeline.js";

const TICK_RATE = 1000 / 60;

let roomID = (await server.listRooms())[0]?.roomID;

if (!roomID) roomID = await server.createRoom("New room", 16, true);

await sleep(1000 * Math.random());

const inputController = new CanvasController(document.getElementById("render") ?? fail());
const ctx = inputController.ctx;

const DELAY_TICK = 2;

let timeline = new Timeline([{ inputs: {}, mergedInputs: {}, state: init(), tick: 0 }], tick);
let originTime = now();

/** @type {number} */
let inputFlushTick = 0;

/** @type {Array<{tick: number; peerID: PeerID, inputs: PeerInputs}> | undefined} */
let inputBuffer = [];

/** @type {Net<GamePackets>} */
const roomNet =
  (await server.joinRoom(roomID, {
    sync: async (peer, request) => {
      const [firstHistoryEntry, ...historyEntries] = structuredClone(timeline.history);
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
    inputs: async (peerID, { tick, inputs }) => {
      if (inputBuffer) {
        inputBuffer.push({ peerID, tick, inputs });
      } else {
        timeline.addInputs(tick, peerID, inputs);
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
      const inputs = inputController.flush();
      inputFlushTick = Math.floor(realTick);

      timeline.addInputs(inputFlushTick, roomNet.peerId, inputs);
      roomNet.sendAll("inputs", { tick: inputFlushTick, inputs });
      while (timeline.history.length > 400) {
        timeline.history.shift();
      }
    }

    let frontFrameTick = Math.floor(realTick);
    const alpha = realTick - frontFrameTick;
    frontFrameTick -= DELAY_TICK;
    const backFrameTick = frontFrameTick - 1;

    const backFrameState = timeline.getState(backFrameTick);
    const frontFrameState = timeline.getState(frontFrameTick);

    assert(frontFrameState?.state);

    if (backFrameState?.state) {
      render(ctx, backFrameState.state, frontFrameState.state, alpha);
    } else {
      render(ctx, frontFrameState.state, frontFrameState.state, 1);
    }

    mainAnimationFrameRequest = requestAnimationFrame(mainLoop);
  } catch (error) {
    if (error instanceof DesyncError) {
      console.warn(error);
      hardSyncTimeline();
    } else {
      throw error;
    }
  }
}

async function hardSyncTimeline() {
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
    ((oldestHistory.history[0] ?? fail()).tick > (timeline.history[0] ?? fail()).tick ||
      oldestHistory.originTime < originTime)
  ) {
    console.warn("using", oldestHistory.originTime, "instead of", originTime);

    originTime = oldestHistory.originTime;
    timeline = new Timeline(oldestHistory.history, tick);
  }

  if (inputBuffer) {
    while (inputBuffer.length) {
      const { tick, peerID, inputs } = inputBuffer.pop() ?? fail();
      try {
        timeline.addInputs(tick, peerID, inputs);
        console.log("adding from input buffer");
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

await hardSyncTimeline();
