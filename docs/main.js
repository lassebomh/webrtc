import { setupConnection } from "./conn.js";

const roomId = parseInt(window.location.pathname.slice(1));
const send = setupConnection(roomId, (data) => {
  console.log(data);
});

// await sleep(1500);

setInterval(() => {
  send("hello world" + Math.random());
}, 1000);
