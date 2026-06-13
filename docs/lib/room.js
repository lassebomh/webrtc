import { Net } from "../shared/net.js";
import { getDefaultIdentity } from "./keys.js";
import { createRTCRoom } from "./rtc.js";

/**
 * @param {string} str
 * @returns {string}
 */
function toSortableKey(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return String(hash >>> 0);
}

/**
 * @template {Packets} TPackets
 * @param {string} roomId
 * @param {{ [K in keyof TPackets]: (peer: PeerID, request: TPackets[K]["request"]) => Promise<TPackets[K]["response"]>; }} receiver
 */
async function joinRoom(roomId, receiver) {
  const identity = await getDefaultIdentity();

  /** @type {Map<string, string>} */
  const idToPeer = new Map();
  /** @type {Map<string, string>} */
  const peerToId = new Map();
  /** @type {Map<string, RTCDataChannel>} */
  const peerChannels = new Map();
  /** @type {Map<string, (label: string) => Promise<RTCDataChannel>>} */
  const peerOpen = new Map();

  /** @type {Net<TPackets> | null} */
  let net = null;

  /**
   * @param {RTCDataChannel} dc
   */
  function attachChannelListener(dc) {
    dc.addEventListener("message", async (e) => {
      try {
        const packet = JSON.parse(e.data);
        await net?.receiveRaw(packet);
      } catch (err) {
        console.warn("Failed to handle incoming message", err);
      }
    });
  }

  /**
   * @param {string} peerId
   * @returns {Promise<RTCDataChannel>}
   */
  async function getOrOpenChannel(peerId) {
    const existing = peerChannels.get(peerId);
    if (existing && existing.readyState === "open") {
      return existing;
    }

    const open = peerOpen.get(peerId);
    if (!open) throw new Error("No channel opener for peer " + peerId);

    const dc = await open("net");
    attachChannelListener(dc);
    dc.addEventListener(
      "close",
      () => {
        if (peerChannels.get(peerId) === dc) {
          peerChannels.delete(peerId);
        }
      },
      { once: true },
    );
    peerChannels.set(peerId, dc);
    return dc;
  }

  const { localId, disconnect } = createRTCRoom({
    identity,
    roomId,
    onpeerjoined(peerId, open) {
      const id = toSortableKey(peerId);
      idToPeer.set(id, peerId);
      peerToId.set(peerId, id);
      peerOpen.set(peerId, open);

      return {
        onclose(error) {
          const id = peerToId.get(peerId);
          if (id) idToPeer.delete(id);
          peerToId.delete(peerId);
          peerOpen.delete(peerId);
          peerChannels.delete(peerId);
        },
        ondatachannel(dc) {
          attachChannelListener(dc);
        },
      };
    },
  });

  const localPeerId = toSortableKey(localId);

  net = new Net(
    localPeerId,
    async (packet) => {
      const receiverId = packet.receiver;
      if (receiverId == null) {
        for (const [id, peerId] of idToPeer) {
          try {
            const dc = await getOrOpenChannel(peerId);
            dc.send(JSON.stringify(packet));
          } catch (err) {
            console.warn("Failed to broadcast to peer", id, err);
          }
        }
      } else {
        const peerId = idToPeer.get(receiverId);
        if (!peerId) {
          console.warn("Unknown receiver", receiverId);
          return;
        }
        try {
          const dc = await getOrOpenChannel(peerId);
          dc.send(JSON.stringify(packet));
        } catch (err) {
          console.warn("Failed to send to peer", receiverId, err);
        }
      }
    },
    receiver,
  );

  return net;
}

export { joinRoom };
