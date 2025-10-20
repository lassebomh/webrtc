/// <reference path="./server.d.ts" />

import { WebSocket, WebSocketServer } from "ws";
import http from "http";
import { extname, join } from "path";
import { fileURLToPath } from "url";
import { createReadStream, statSync } from "fs";
import assert from "assert";

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

/**
 * @typedef {{ name: string }} User
 * @typedef {{roomID: string, name: string, created: number, isPublic: boolean, connectionLimit: number, connections: Map<WebSocket, User>}} Room
 */

/** @type {Map<string, Room>} */
const rooms = new Map();

rooms.set("test", {
  connectionLimit: 16,
  connections: new Map(),
  created: Date.now(),
  isPublic: true,
  name: "Test room",
  roomID: "test",
});

wss.on("connection", (ws, req) => {
  /** @type {Room | undefined} */
  let room;

  ws.on("close", () => {
    if (room) {
      room.connections.delete(ws);

      setTimeout(() => {
        if (room && room.connections.size === 0) {
          rooms.delete(room.roomID);
        }
      }, 1000 * 60 * 2);
    }
  });

  ws.on("message", (message) => {
    const payload = /** @type {unknown} */ (JSON.parse(message.toString()));

    try {
      assert(
        payload &&
          typeof payload === "object" &&
          "type" in payload &&
          typeof payload.type === "string" &&
          "data" in payload &&
          payload.data
      );

      switch (payload.type) {
        case "createRoom": {
          assert(
            typeof payload.data === "object" &&
              "name" in payload.data &&
              typeof payload.data.name === "string" &&
              payload.data.name.length >= 3 &&
              payload.data.name.length <= 40
          );
          const name = payload.data.name;
          assert("isPublic" in payload.data && typeof payload.data.isPublic === "boolean");
          const isPublic = payload.data.isPublic;
          assert(
            "connectionLimit" in payload.data &&
              typeof payload.data.connectionLimit === "number" &&
              payload.data.connectionLimit >= 1 &&
              payload.data.connectionLimit <= 16
          );
          const connectionLimit = payload.data.connectionLimit;

          const uuid = crypto.randomUUID().toUpperCase().replace("-", "");

          let roomID = "";
          for (let i = 6; i < uuid.length; i++) {
            roomID = uuid.slice(0, i);
            if (!rooms.has(roomID)) break;
          }

          rooms.set(roomID, {
            roomID: roomID,
            connectionLimit,
            connections: new Map(),
            created: Date.now(),
            isPublic,
            name,
          });

          /** @type {ServerResponsePayload} */
          const response = { type: "roomCreated", data: { roomID, connectionLimit, isPublic, name } };
          ws.send(JSON.stringify(response));

          break;
        }

        case "joinRoom": {
          assert(
            typeof payload.data === "object" && "roomID" in payload.data && typeof payload.data.roomID === "string"
          );

          assert(
            "username" in payload.data && typeof payload.data.username === "string" && payload.data.username.length >= 3
          );

          if (room) {
            room.connections.delete(ws);
          }

          room = rooms.get(payload.data.roomID);

          if (room && room.connections.size < room.connectionLimit) {
            /** @type {ServerResponsePayload} */
            const response = {
              type: "roomJoined",
              data: {
                roomID: room.roomID,
                connectionLimit: room.connectionLimit,
                name: room.name,
                isPublic: room.isPublic,
              },
            };

            room.connections.set(ws, {
              name: payload.data.username,
            });

            ws.send(JSON.stringify(response));
          } else {
            /** @type {ServerResponsePayload} */
            const response = {
              type: "roomDisconnected",
              data: true,
            };

            ws.send(JSON.stringify(response));
          }

          break;
        }

        case "broadcast": {
          if (room !== undefined) {
            for (const [client] of room.connections) {
              if (client !== ws && client.readyState === ws.OPEN) {
                client.send(message);
              }
            }
          }
          break;
        }

        case "roomsList": {
          /** @type {ServerResponsePayload} */
          const response = {
            type: "roomsList",
            data: [...rooms.entries()]
              .filter((x) => x[1].isPublic)
              .map(([roomID, { connectionLimit, connections, name }]) => ({
                roomID,
                name,
                connectionLimit,
                connections: connections.size,
              })),
          };

          ws.send(JSON.stringify(response));

          break;
        }

        default:
          break;
      }
    } catch (error) {
      console.log(payload);
      throw error;
    }
  });

  // let room = rooms.get(roomId);
  // if (room === undefined) {
  //   room = new Set();
  //   rooms.set(roomId, room);
  // }
  // room.add(ws);
  // ws.on("message", (message) => {
  // for (const client of room) {
  //   if (client !== ws && client.readyState === ws.OPEN) {
  //     client.send(message);
  //   }
  // }
  // });
  // ws.on("close", () => {
  //   room.delete(ws);
  //   if (room.size === 0) {
  //     rooms.delete(roomId);
  //   }
  // });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
