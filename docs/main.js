const roomId = parseInt(window.location.pathname.slice(1));

if (!Number.isSafeInteger(roomId)) {
  throw new Error("Invalid room id");
}

const id = Math.trunc(Math.random() * Number.MAX_SAFE_INTEGER);

const signal = new WebSocket(`ws://localhost:8080/${roomId}`);

/** @type {Map<number, RTCDataChannel>} */
const channels = new Map();

/** @type {Map<number, RTCPeerConnection>} */
const peers = new Map();

function send(data, to) {
  signal.send(JSON.stringify({ from: id, to, ...data }));
}

signal.addEventListener("open", (e) => {
  send({ type: "init" });
});

signal.addEventListener("message", async (e) => {
  const { from, to, ...msg } = JSON.parse(await /** @type {Blob} */ (e.data).text());

  if (to !== undefined && to !== id) return;

  let peer = peers.get(from);

  if (peer === undefined && from !== undefined) {
    peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peer.addEventListener("icecandidate", ({ candidate }) => {
      send({ type: "ice-candidate", candidate }, from);
    });

    const channel = peer.createDataChannel("default");
    channels.set(from, channel);

    channel.addEventListener("close", (e) => {
      peer.close();
      channel.close();
      peers.delete(from);
      channels.delete(from);
    });
    channel.addEventListener("message", (e) => {
      console.log(e.data);
    });

    peers.set(from, peer);
  }

  switch (msg.type) {
    case "init":
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      send({ type: "offer", sdp: offer.sdp }, from);
      break;

    case "offer":
      await peer.setRemoteDescription({ type: "offer", sdp: msg.sdp });
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      send({ type: "answer", sdp: answer.sdp }, from);
      break;

    case "answer":
      await peer.setRemoteDescription({ type: "answer", sdp: msg.sdp });
      break;

    case "ice-candidate":
      await peer.addIceCandidate(msg.candidate);
      break;
  }
});

function sendJSON() {
  console.log("hello");

  for (const [k, v] of channels) {
    v.send("hello " + k);
  }
}
