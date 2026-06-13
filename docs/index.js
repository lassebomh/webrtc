import { createRelay } from "./lib/relay.js";
import { fail } from "./shared/utils.js";

const relay = createRelay(() => new WebSocket("wss://relay.final.zip"));
const publicRoomsTopic = relay.topic("webrtc-game-public-rooms");

const roomListEl = document.getElementById("room-list") ?? fail();

/** @type {Record<string, string>} */
const mapNames = { 1: "arena_small", 2: "arena_large", 3: "corridor" };

/** @type {Map<string, { id: string; title: string; map: string;  }>} */
const rooms = new Map();

function renderRooms() {
  if (rooms.size === 0) {
    roomListEl.innerHTML = `<li class="empty">no rooms found</li>`;
    return;
  }
  roomListEl.innerHTML = "";
  for (const room of rooms.values()) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `room/?id=${encodeURIComponent(room.id)}&public=true&map=${encodeURIComponent(room.map)}`;

    const name = document.createElement("span");
    name.textContent = `${room.title} · ${mapNames[room.map] ?? room.map}`;

    a.appendChild(name);
    li.appendChild(a);
    roomListEl.appendChild(li);
  }
}

publicRoomsTopic.listen(async (next) => {
  while (true) {
    /** @type {{ id: string; title: string; map: string;  }} */
    const room = await next();
    rooms.set(room.id, room);
    renderRooms();
  }
});

(document.getElementById("create-room") ?? fail()).addEventListener("submit", (e) => {
  e.preventDefault();
  /** @type {*} */
  const form = e.target;
  const title = form.title.value.trim();
  const map = form.map.value;
  const isPublic = form.public.checked;
  const id = crypto.randomUUID();

  const params = new URLSearchParams({ id, title, public: isPublic, map });
  window.location.href = `room/?${params}`;
});
