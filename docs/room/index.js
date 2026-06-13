import { Net } from "../shared/net.js";
import { assert, fail, lin, now, sleep } from "../shared/utils.js";
import { init, render, tick } from "../game/game.js";
import { IOController } from "../lib/inputs.js";
import { DesyncError, Timeline } from "../lib/timeline.js";
import "../lib/ui.js";
import { joinRoom } from "../lib/room.js";
import { createRelay } from "../lib/relay.js";

const TICK_RATE = 1000 / 60;

const timeOffsetInterval = 1000;
let lastOffsetTime = now();
let prevOffset = 0;
let currOffset = 0;

function synced_time() {
  const t = now();
  if (t >= lastOffsetTime + timeOffsetInterval) {
    return t + currOffset;
  } else {
    return t + lin(prevOffset, currOffset, (t - lastOffsetTime) / timeOffsetInterval);
  }
}

const params = new URLSearchParams(location.search);
const roomId = params.get("id") ?? fail("missing id param");
const roomTitle = params.get("title") ?? "untitled";
const roomMap = params.get("map") ?? "1";
const roomIsPublic = params.get("public") === "true";

await sleep(1000 * Math.random());

const inputController = new IOController(document.getElementById("render") ?? fail());
const ctx = inputController.ctx;

const DELAY_TICK = 1;

let timeline = new Timeline([{ inputs: {}, mergedInputs: {}, state: init(), tick: 0 }], tick);
let originTime = synced_time();

/** @type {number} */
let inputFlushTick = 0;

/** @type {Array<{tick: number; peerID: PeerID, inputs: PeerInputs}> | undefined} */
let inputBuffer = [];

function getRealTick() {
  return (synced_time() - originTime) / TICK_RATE;
}

/** @type {Net<GamePackets>} */
const roomNet =
  (await joinRoom(roomId, {
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
    getTime: async (localPeerID) => {
      return now();
    },
  })) ?? fail();

// Broadcast room to public listing
if (roomIsPublic) {
  const relay = createRelay(() => new WebSocket("wss://relay.final.zip"));
  const publicRoomsTopic = relay.topic("webrtc-game-public-rooms");

  function broadcast() {
    publicRoomsTopic.send?.({
      id: roomId,
      title: roomTitle,
      map: roomMap,
    });
  }

  broadcast();
  setInterval(broadcast, 5000);
}

/** @type {string[]} */
let peerIds = [];

setInterval(async () => {
  peerIds = Object.keys(await roomNet.requestAll("getTime", null, 1000));
}, 3000);

setInterval(async () => {
  const timeDiffs = (
    await Promise.all(
      peerIds.map(async (peerId) => {
        const t0 = now();
        const peertime = await roomNet.request("getTime", peerId, null, 500).catch(() => null);
        if (peertime === null) return null;
        const t1 = now();

        const rtt = t1 - t0;
        const latency = rtt / 2;
        const timeTiff = peertime - (t0 + latency);
        return timeTiff;
      }),
    )
  ).filter((x) => x !== null);

  prevOffset = currOffset;
  currOffset = timeDiffs.reduce((acc, x) => acc + x / (timeDiffs.length + 1), 0);
  lastOffsetTime = now();
}, timeOffsetInterval);

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

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    if (backFrameState?.state) {
      render(ctx, backFrameState.state, frontFrameState.state, roomNet.peerId, alpha);
    } else {
      render(ctx, frontFrameState.state, frontFrameState.state, roomNet.peerId, 1);
    }

    mainAnimationFrameRequest = requestAnimationFrame(mainLoop);
  } catch (error) {
    if (error instanceof DesyncError) {
      // console.warn(error);
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
    await roomNet.requestAll("stateSync", null, 500),
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
          // console.warn(error);
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
