import { sleep } from "../shared/utils.js";

export const LOCALHOST = window.location.hostname === "localhost";

export function autoreload() {
  const ws = new WebSocket(`ws${window.location.protocol === "https:" ? "s" : ""}://${window.location.host}/`);

  ws.onclose = async () => {
    await sleep(75 + Math.random() * 150);
    window.location.reload();
  };
}
