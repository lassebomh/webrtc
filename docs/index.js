import { server } from "./lib/server.js";
import { Net } from "./shared/net.js";
import { assert, fail, sleep } from "./shared/utils.js";
import { init, render, tick } from "./game/game.js";
import { IOController } from "./lib/inputs.js";
import { DesyncError, Timeline } from "./lib/timeline.js";
import "./lib/ui.js";

const TICK_RATE = 1000 / 60;

let roomID = (await server.listRooms())[0]?.roomID;

if (!roomID) roomID = await server.createRoom("New room", 16, true);

await sleep(1000 * Math.random());

const inputController = new IOController(document.getElementById("render") ?? fail());
const ctx = inputController.ctx;

const DELAY_TICK = 2;

let timeline = new Timeline([{ inputs: {}, mergedInputs: {}, state: init(), tick: 0 }], tick);
let originTime = server.time();

/** @type {number} */
let inputFlushTick = 0;

/** @type {Array<{tick: number; peerID: PeerID, inputs: PeerInputs}> | undefined} */
let inputBuffer = [];

function getRealTick() {
  return (server.time() - originTime) / TICK_RATE;
}

/** @type {Net<GamePackets>} */
const roomNet =
  (await server.joinRoom(roomID, {
    stateSync: async (peer, request) => {
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
      while (timeline.history.length > 200) {
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
      render(ctx, backFrameState.state, frontFrameState.state, roomNet.peerId, alpha);
    } else {
      render(ctx, frontFrameState.state, frontFrameState.state, roomNet.peerId, 1);
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

  for (const [peerID, { originTime: otherOriginTime, history: otherHistory }] of Object.entries(
    await roomNet.requestAll("stateSync", null, 500)
  )) {
    const currentFirstHistoryEntry = timeline.history[0] ?? fail();
    const firstHistoryEntry = otherHistory[0] ?? fail();

    if (currentFirstHistoryEntry.tick < firstHistoryEntry.tick || otherOriginTime < originTime) {
      timeline.history = otherHistory;
      originTime = otherOriginTime;
    }
  }

  if (inputBuffer) {
    while (inputBuffer.length) {
      const { tick, peerID, inputs } = inputBuffer.pop() ?? fail();
      try {
        timeline.addInputs(tick, peerID, inputs);
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
