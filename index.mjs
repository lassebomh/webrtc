import { WebSocket, WebSocketServer } from "ws";
import http from "http";
import { extname, join } from "path";
import { fileURLToPath } from "url";
import { createReadStream, statSync } from "fs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const PORT = 8080;
const PUBLIC_DIR = join(__dirname, "docs");

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
  const safePath = decodeURIComponent((req.url ?? "").split("?")[0]);
  const filePath = join(PUBLIC_DIR, safePath === "/" ? "/index.html" : safePath);

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

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
