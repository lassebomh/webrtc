import { server } from "./lib/server.js";
import { Net } from "./lib/shared/net.js";
import { assert, fail } from "./lib/shared/utils.js";
import { init, render, tick } from "./game/game.js";
import { InputController, RollbackEngine } from "./lib/inputs.js";
import { setupCanvas } from "./lib/utils.js";

let roomID = (await server.listRooms())[0]?.roomID;

console.log(roomID);

if (!roomID) roomID = await server.createRoom("New room", 16, true);

/**
 * @typedef {{ sync: {request: null; response: RollbackEngine<Game>['history'] }; inputs: {request: {tick: number; inputEntry: NewInputEntry}, response: void;}}} MyRoomPackets
 */

const ctx = setupCanvas(document.getElementById("canvas"));
const inputController = new InputController(ctx.canvas);
const rollback = new RollbackEngine({ inputs: {}, state: init(), tick: 0 }, tick);

let isSynced = false;

/** @type {Net<MyRoomPackets> | undefined} */
const roomNet = await server.joinRoom(roomID, {
  sync: async (peer, request) => {
    console.warn(rollback.history);
    return rollback.history;
  },
  inputs: async (peerID, { tick, inputEntry }) => {
    if (isSynced) rollback.addInputs(tick, { [peerID]: inputEntry });
  },
});

assert(roomNet);

const existingHistory = Object.values(await roomNet.requestAll("sync", null, 500)).at(0);

console.log(existingHistory);

if (existingHistory) {
  rollback.history = existingHistory;
}

isSynced = true;

let t = rollback.history.findLast((x) => x.state !== null && x.mergedInputs !== null)?.tick ?? fail("blamo");

setInterval(() => {
  t++;

  if (rollback.history.length > 60) rollback.history.shift();

  const inputEntry = inputController.flush();

  rollback.addInputs(t + 2, { [roomNet.peerId]: inputEntry });
  roomNet.sendAll("inputs", { tick: t + 2, inputEntry: inputEntry });

  const state = rollback.getState(t);

  render(ctx, state, state, 1);
}, 1000 / 30);
