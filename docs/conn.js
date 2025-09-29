/**
 * @param {number} roomId
 * @param {(data: any) => any} onmessage
 */
export function setupConnection(roomId, onmessage) {
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

      peers.set(from, peer);
    }

    switch (msg.type) {
      case "init": {
        const channel = peer.createDataChannel("default");
        channels.set(from, channel);

        channel.addEventListener("message", (e) => {
          onmessage(JSON.parse(e.data));
        });

        channel.addEventListener("close", () => {
          peer.close();
          channel.close();
          peers.delete(from);
          channels.delete(from);
        });

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        send({ type: "offer", sdp: offer.sdp }, from);
        break;
      }

      case "offer": {
        peer.ondatachannel = (event) => {
          const channel = event.channel;
          channels.set(from, channel);

          channel.addEventListener("message", (e) => {
            onmessage(JSON.parse(e.data));
          });

          channel.addEventListener("close", () => {
            peer.close();
            channel.close();
            peers.delete(from);
            channels.delete(from);
          });
        };

        await peer.setRemoteDescription({ type: "offer", sdp: msg.sdp });
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        send({ type: "answer", sdp: answer.sdp }, from);
        break;
      }

      case "answer": {
        await peer.setRemoteDescription({ type: "answer", sdp: msg.sdp });
        break;
      }

      case "ice-candidate": {
        await peer.addIceCandidate(msg.candidate);
        break;
      }
    }
  });

  return (data) => {
    for (const [k, v] of channels) {
      v.send(JSON.stringify(data));
    }
  };
}

export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
