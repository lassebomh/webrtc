import { init, render, tick } from "./game/game.js";
import { run } from "./lib/rollback.js";
import { assert, fail, setupCanvas, sleep } from "./lib/utils.js";
import "./lib/inputs.js";

// setupConnection("debug", () => {});

let username = sessionStorage.getItem("username") ?? "Anonymous";
sessionStorage.setItem("username", username);

const usernameInput = /** @type {HTMLInputElement} */ (document.getElementById("username") ?? fail());
usernameInput.value = username;
usernameInput.addEventListener("input", () => {
  if (usernameInput.value) {
    username = usernameInput.value;
    sessionStorage.setItem("username", username);
  }
});

const createGameForm = /** @type {HTMLFormElement} */ (document.getElementById("create-game") ?? fail());
const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("canvas") ?? fail());
const publicRoomsTable = /** @type {HTMLTableElement} */ (document.getElementById("public-rooms-table") ?? fail());
const publicRooms = /** @type {HTMLElement} */ (document.getElementById("public-rooms") ?? fail());
const server = new WebSocket(`ws${window.location.protocol === "https:" ? "s" : ""}://${window.location.host}/`);

document.body.style.opacity = "0";

/**
 * @param {ServerRequestPayload} payload
 */
function send(payload) {
  server.send(JSON.stringify(payload));
}
server.addEventListener(
  "open",
  () => {
    if (location.search) {
      send({
        type: "joinRoom",
        data: {
          roomID: location.search.slice(1),
          username: username,
        },
      });
    } else {
      send({ type: "roomsList", data: true });
    }
  },
  { once: true }
);

if (location.hostname === "localhost") {
  server.addEventListener("close", () => {
    sleep(100).then(() => {
      window.location.reload();
    });
  });
}

createGameForm.addEventListener("submit", (e) => {
  e.preventDefault();
  /** @type {Record<string, string>} */
  const formData = {};

  new FormData(createGameForm).forEach((value, key) => {
    const textValue = value.valueOf();
    if (typeof textValue !== "string") return;
    formData[key] = textValue;
  });

  const connectionLimit = parseInt(formData["connectionLimit"] ?? fail());
  assert(Number.isFinite(connectionLimit));
  const name = formData["name"] ?? fail();
  assert(name.length > 3);
  const isPublic = formData["public"] === "on";

  send({
    type: "createRoom",
    data: {
      name,
      connectionLimit,
      isPublic: isPublic,
    },
  });
});

server.addEventListener("message", async (event) => {
  const raw =
    typeof event.data === "string" ? event.data : event.data instanceof Blob ? await event.data.text() : fail();

  /** @type {ServerResponsePayload} */
  const payload = JSON.parse(raw);

  switch (payload.type) {
    case "roomCreated": {
      location.search = "?" + payload.data.roomID;
      break;
    }

    case "roomJoined": {
      const newRoom = payload.data;
      if (location.search !== "?" + newRoom.roomID) {
        location.search = "?" + newRoom.roomID;
      } else {
        document.body.style.opacity = "1";
        canvas.style.display = "initial";
        const ctx = setupCanvas(canvas);
        run({ tick, render, init, ctx, server });
      }
      break;
    }

    case "roomDisconnected": {
      location.search = "";
      break;
    }

    case "roomsList": {
      document.body.style.opacity = "1";
      publicRooms.style.display = payload.data.length ? "flex" : "none";
      publicRoomsTable.replaceChildren();

      for (const room of payload.data) {
        const tr = document.createElement("tr");

        const nametd = document.createElement("td");
        const playerstd = document.createElement("td");
        const linktd = document.createElement("td");

        nametd.textContent = room.name;
        playerstd.textContent = `${room.connections}/${room.connectionLimit}`;
        if (room.connections < room.connectionLimit) {
          const linkanchor = document.createElement("a");
          linkanchor.textContent = "Join";
          linkanchor.href = "?" + room.roomID;
          linktd.appendChild(linkanchor);
          linkanchor.rel = "nofollow";
        }

        tr.appendChild(nametd);
        tr.appendChild(playerstd);
        tr.appendChild(linktd);

        publicRoomsTable.appendChild(tr);
      }
      break;
    }

    default:
      break;
  }
});
