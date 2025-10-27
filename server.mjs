/// <reference path="./docs/lib/shared/index.d.ts" />

import { WebSocket, WebSocketServer } from "ws";
import http from "http";
import { extname, join } from "path";
import { fileURLToPath } from "url";
import { createReadStream, statSync } from "fs";
import { serverPeerId } from "./docs/lib/shared/net.js";
import { assert, fail, isUnreachable, now } from "./docs/lib/shared/utils.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const PORT = 8080;
const PUBLIC_DIR = join(__dirname, "./docs");

/** @type {Record<string, string>} */
const mimeTypes = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  let safePath = decodeURIComponent((req.url ?? "").split("?")[0] || "");
  if (safePath.endsWith("/")) {
    safePath += "index.html";
  }

  const filePath = join(PUBLIC_DIR, safePath);

  try {
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const ext = extname(filePath);
    const contentType = mimeTypes[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    createReadStream(filePath).pipe(res);
  } catch (err) {
    res.writeHead(404);
    res.end("Not Found");
  }
});

const wss = new WebSocketServer({ server });

/** @type {WeakMap<WebSocket, PeerID>} */
const peers = new WeakMap();

/** @type {Set<PeerID>} */
const allPeerIDs = new Set([serverPeerId]);

/** @typedef {Room & { connections: WebSocket[]; }} RoomConnections */

/** @type {Map<string, RoomConnections>} */
const rooms = new Map();

wss.on("connection", (ws, req) => {
  /** @type {PeerID | undefined} */
  let peerID;

  /** @type {RoomConnections | undefined} */
  let currentRoom;

  ws.on("close", () => {
    peers.delete(ws);
    if (peerID) {
      allPeerIDs.delete(peerID);

      if (currentRoom) {
        const index = currentRoom.connections.indexOf(ws);
        assert(index !== -1);
        currentRoom.connections.splice(index, 1);
        currentRoom = undefined;
      }
    }
  });

  /**
   * @param {PacketRequest<ServerPackets>} packet
   * @returns {PacketResponse<ServerPackets>['response']}
   */
  function onserverrequest(packet) {
    switch (packet.type) {
      case "createRoom": {
        const { connectionLimit, isPublic, name } = packet.request;
        const roomID = crypto.randomUUID();

        /** @type {Room} */
        const room = {
          roomID,
          name,
          isPublic,
          connectionLimit,
        };

        /** @type {RoomConnections} */
        const roomConnections = {
          ...room,
          connections: [],
        };

        rooms.set(roomID, roomConnections);

        return room;
      }

      case "joinRoom": {
        const room = rooms.get(packet.request);
        assert(currentRoom === undefined);

        if (room) {
          currentRoom = room;
          room.connections.push(ws);
        }

        return room
          ? {
              connectionLimit: room.connectionLimit,
              isPublic: room.isPublic,
              name: room.name,
              roomID: room.roomID,
            }
          : null;

        break;
      }

      case "disconnectRoom": {
        if (currentRoom) {
          const index = currentRoom.connections.indexOf(ws);
          assert(index !== -1);
          currentRoom.connections.splice(index, 1);
          currentRoom = undefined;
        }

        return;
      }

      case "roomsList":
        return [...rooms.values()]
          .filter((x) => x.isPublic)
          .map((x) => ({
            name: x.name,
            connectionLimit: x.connectionLimit,
            connections: x.connections.length,
            roomID: x.roomID,
          }));

      case "timeSync":
        return now();

      case "greet":
      case "roomRtcOffer":
      case "roomRtcAnswer":
      case "roomRtcIceCandidate":
        fail();

      default:
        isUnreachable(packet, JSON.stringify(packet));
        break;
    }
  }

  ws.on("message", (message) => {
    const packet = /** @type {PacketRequest<ServerPackets> | PacketResponse<ServerPackets>} */ (
      JSON.parse(message.toString())
    );

    // console.log("received", packet);

    try {
      if (peerID === undefined) {
        assert(packet.type === "greet", "peer has to send a greeting first");
        const requestedPeerID = packet.sender;
        if (allPeerIDs.has(requestedPeerID)) {
          fail("id is already used");
        }
        peerID = requestedPeerID;
        peers.set(ws, peerID);
        allPeerIDs.add(peerID);
        /** @type {PacketResponse<ServerPackets, 'greet'>} */
        const response = {
          id: packet.id,
          type: packet.type,
          sender: serverPeerId,
          receiver: packet.sender,
          response: null,
        };
        ws.send(JSON.stringify(response));
        return;
      }

      assert(packet.type !== "greet", "peer has already been assigned an id");
      assert(packet.sender === peerID, "cheat!");

      if (packet.receiver === serverPeerId) {
        assert("request" in packet);

        /** @type {PacketResponse<ServerPackets, any>} */
        const response = {
          id: packet.id,
          type: packet.type,
          sender: serverPeerId,
          receiver: packet.sender,
          response: onserverrequest(packet),
        };

        // console.log("sending", response);

        ws.send(JSON.stringify(response));
      } else {
        assert(currentRoom);

        for (const peerWS of currentRoom.connections) {
          const recieverID = peers.get(peerWS) ?? fail();
          if (ws === peerWS || (packet.receiver !== null && packet.receiver !== recieverID)) continue;
          peerWS.send(JSON.stringify(packet));
        }
      }
    } catch (error) {
      console.log(packet);
      throw error;
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
