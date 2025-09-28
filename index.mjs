import { WebSocket, WebSocketServer } from "ws";

const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });

/** @type {Map<number, Set<WebSocket>>} */
const rooms = new Map();

wss.on("connection", (ws, req) => {
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
  });
});
