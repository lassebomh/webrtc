import { WebSocket, WebSocketServer } from "ws";

const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });

/** @type {Map<number, Set<WebSocket>>} */
const rooms = new Map();

function logRooms() {
  console.log(new Array(...rooms.entries()).map(([key, value]) => `#${key} => ${value.size} clients`).join("\n"));
}

wss.on("connection", (ws, req) => {
  console.log("🔌 Client connected");

  if (req.url === undefined) return;

  /** @type {number} */
  const roomId = parseInt(req.url.slice(1));

  if (!Number.isSafeInteger(roomId)) return;

  let room = rooms.get(roomId);

  if (room === undefined) {
    room = new Set();
    rooms.set(roomId, room);
  }

  room.add(ws);
  logRooms();

  ws.on("message", (message) => {
    for (const client of room) {
      if (client !== ws && client.readyState === ws.OPEN) {
        client.send(message);
      }
    }
  });

  ws.on("close", () => {
    room.delete(ws);
    if (room.size === 0) {
      rooms.delete(roomId);
    }
    logRooms();
  });
});

console.log(`✅ WebSocket signaling server running at ws://localhost:${PORT}`);
