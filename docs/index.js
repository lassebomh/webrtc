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

const DELAY_TICK = 2;

/** @type {RollbackEngine<Game> | undefined} */
let wrongTimeline;
/** @type {number | undefined} */
let wrongTimelineStart;
/** @type {number | undefined} */
let wrongTimelineEnd;

let timeline = new RollbackEngine([{ inputs: {}, mergedInputs: {}, state: init(), tick: 0 }], tick);
let originTime = now();

/** @type {number} */
let inputFlushTick = 0;

/** @type {Array<{tick: number; peerID: PeerID, inputEntry: NewInputEntry}> | undefined} */
let inputBuffer = [];

/**
 * @param {number} t
 * @param {PeerID} peerID
 * @param {NewInputEntry} inputs
 */
function addTimelineInputs(t, peerID, inputs) {
  const [wrongHistoryStart, wrongHistory] = timeline.addInputs(t, peerID, inputs, true, wrongTimeline === undefined);
  const behindMs = wrongHistoryStart ? (getRealTick() - wrongHistoryStart - DELAY_TICK) * TICK_RATE : 0;

  if (wrongHistoryStart !== undefined && wrongHistory !== undefined) {
    if (behindMs > 50) {
      console.warn(behindMs);
      if (!wrongTimeline) {
        wrongTimeline = new RollbackEngine(wrongHistory, tick);
        wrongTimelineStart = getRealTick();
      }

      assert(wrongTimelineStart);
      wrongTimelineEnd = wrongTimelineStart + (getRealTick() - wrongHistoryStart);
    }
  }

  wrongTimeline?.addInputs(t, peerID, inputs, peerID === roomNet.peerId, false);
}

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
    inputs: async (peerID, { tick, inputEntry }) => {
      if (inputBuffer) {
        inputBuffer.push({ peerID, tick, inputEntry });
      } else {
        addTimelineInputs(tick, peerID, inputEntry);
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

      addTimelineInputs(inputFlushTick, roomNet.peerId, inputEntry);
      roomNet.sendAll("inputs", { tick: inputFlushTick, inputEntry });
      while (timeline.history.length > 400) {
        timeline.history.shift();
      }
    }

    let frontFrameTick = Math.floor(realTick);
    const alpha = realTick - frontFrameTick;
    frontFrameTick -= DELAY_TICK;
    const backFrameTick = frontFrameTick - 1;

    let usedWrongTimeline = false;

    if (false && wrongTimeline) {
      assert(wrongTimelineStart && wrongTimelineEnd);
      const alpha = (realTick - wrongTimelineStart) / (wrongTimelineEnd - wrongTimelineStart);

      if (alpha < 1) {
        usedWrongTimeline = true;
        const deleteTo = wrongTimeline.history.findIndex((x) => x.tick < backFrameTick);
        wrongTimeline.history.splice(0, deleteTo);
        const backFrameState = wrongTimeline.getState(frontFrameTick);
        const frontFrameState = timeline.getState(frontFrameTick);
        assert(backFrameState?.state && frontFrameState?.state);
        render(ctx, backFrameState.state, frontFrameState.state, Math.pow(alpha, 0.9));
      }
    }

    if (!usedWrongTimeline) {
      if (wrongTimeline) {
        wrongTimeline = undefined;
        wrongTimelineStart = undefined;
        wrongTimelineEnd = undefined;
      }
      const backFrameState = timeline.getState(backFrameTick);
      const frontFrameState = timeline.getState(frontFrameTick);

      assert(frontFrameState?.state);

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
    ((oldestHistory.history[0] ?? fail()).tick > (timeline.history[0] ?? fail()).tick ||
      oldestHistory.originTime < originTime)
  ) {
    console.warn("using", oldestHistory.originTime, "instead of", originTime);

    originTime = oldestHistory.originTime;
    timeline = new RollbackEngine(oldestHistory.history, tick);
  }
  wrongTimeline = undefined;
  wrongTimelineStart = undefined;
  wrongTimelineEnd = undefined;

  if (inputBuffer) {
    while (inputBuffer.length) {
      const { tick, peerID, inputEntry } = inputBuffer.pop() ?? fail();
      try {
        addTimelineInputs(tick, peerID, inputEntry);
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

await historyHardSync();
