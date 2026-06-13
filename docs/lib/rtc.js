// @ts-check

import { createRelay, DisconnectedError } from "./relay.js";
import { race, sleep, withResolvers } from "../shared/utils.js";

/**
 * @typedef {import("./keys").ID} ID
 * @typedef {import("./keys").IdentityHandler} IdentityHandler
 */

/** @type {RTCConfiguration} */
const rtcConfig = {
  iceServers: [
    {
      urls: ["turn:relay.final.zip:3478", "stun:relay.final.zip:3478"],
      credential: "relay-final-zip",
      username: "relay-final-zip",
    },
  ],
};

export const CHUNK_BYTES = 16_000;
export class ClosedError extends Error {}

/**
 * @param {object} options
 * @param {string} options.roomId
 * @param {IdentityHandler} options.identity
 * @param {(peerId: ID, open: (label: string) => Promise<RTCDataChannel>) => { onclose?: (error: DisconnectedError) => unknown; ondatachannel?: (datachannel: RTCDataChannel) => unknown } | undefined} [options.onpeerjoined]
 * @param {() => WebSocket} [options._createRelaySocket]
 * @param {(peer: RTCPeerConnection) => WebSocket} [options._onRtcConnection]
 */
export function createRTCRoom(options) {
  const createRelaySocket = options._createRelaySocket ?? (() => new WebSocket("wss://relay.final.zip"));
  const identity = options.identity;

  const relay = createRelay(createRelaySocket);

  const localId = options.identity.id;
  const localTopic = relay.topic(localId);

  const roomTopic = relay.topic(options.roomId);

  /** @type {Map<string, (reason: string) => void>} */
  const peers = new Map();

  function roomTopicMessage() {
    return [localId, ...peers.keys()].join(";");
  }

  /**
   * @param {ID} peerId
   */
  async function createPeer(peerId) {
    /** @type {PromiseWithResolvers<never>} */
    const { promise: peerDisconnected, reject } = withResolvers();
    const peer = new RTCPeerConnection(rtcConfig);
    options._onRtcConnection?.(peer);

    // A data channel has to always run, otherwise the ice gathering state is stuck at 'new'.
    peer.createDataChannel("", { id: 0, negotiated: true, ordered: true });

    /** @type {Map<number, RTCDataChannel>} */
    const openChannels = new Map();

    const handlers = options?.onpeerjoined?.(peerId, async (label) => {
      // Delay creation to guarantee 25 below the limit
      while (openChannels.size + 25 > 128) {
        await sleep(1);
      }
      const dc = peer.createDataChannel(label);

      return new Promise((res, rej) => {
        dc.addEventListener(
          "open",
          () => {
            openChannels.set(/** @type {number} */ (dc.id), dc);
            res(dc);
          },
          {
            once: true,
          },
        );
        dc.addEventListener(
          "error",
          (e) => {
            rej(new ClosedError("DataChannelError", { cause: /** @type {RTCErrorEvent} */ (e).error }));
          },
          { once: true },
        );
        dc.addEventListener("close", () => openChannels.delete(/** @type {number} */ (dc.id)), { once: true });
      });
    });

    function onconnectionstatechange() {
      if (peer.connectionState === "failed" || peer.connectionState === "closed") {
        closePeer(`rtc peer connection ${peer.connectionState.toUpperCase()}`);
      }
    }

    peer.addEventListener("connectionstatechange", onconnectionstatechange);

    /**
     * @param {RTCDataChannelEvent} e
     */
    function ondatachannel(e) {
      const dc = e.channel;

      dc.addEventListener("close", () => openChannels.delete(/** @type {number} */ (dc.id)), { once: true });
      dc.addEventListener(
        "open",
        () => {
          openChannels.set(/** @type {number} */ (dc.id), dc);
          handlers?.ondatachannel?.(dc);
        },
        { once: true },
      );
    }

    peer.addEventListener("datachannel", ondatachannel);

    /**
     * @param {RTCPeerConnectionIceEvent} e
     */
    function onicecandidate(e) {
      outgoingIceCandidates.push(e.candidate);
      if (allowIceOutgoing) {
        flushIceOutgoing();
      }
    }

    peer.addEventListener("icecandidate", onicecandidate);

    let closed = false;
    /**
     * @param {string} reason
     */
    function closePeer(reason) {
      if (closed) {
        identity.debug(peerId, "cannot close twice");
        return;
      }
      closed = true;
      const error = new DisconnectedError("", { cause: reason });
      peers.delete(peerId);
      peer.close();
      handlers?.onclose?.(error);
      peer.removeEventListener("connectionstatechange", onconnectionstatechange);
      peer.removeEventListener("datachannel", ondatachannel);
      peer.removeEventListener("icecandidate", onicecandidate);
      reject(error);
    }

    peers.set(peerId, closePeer);

    const sharedSecret = await options.identity.derivedSharedId(peerId);

    const sharedTopic = relay.topic(sharedSecret);
    const sharedIceTopic = relay.topic(sharedSecret + "__ice");

    sharedIceTopic
      .listen(async (next) => {
        while (true) {
          /** @type {RTCIceCandidateInit | null | undefined} */
          const candidate = await race(next(), peerDisconnected);
          incomingIceCandidates.push(candidate);
          if (allowIceIncoming) {
            flushIceIncoming();
          }
          if (!candidate) return;
        }
      })
      .catch((e) => {
        if (!(e instanceof DisconnectedError)) {
          throw e;
        }
      });

    /** @type {Array<RTCIceCandidateInit | null | undefined>} */
    const incomingIceCandidates = [];
    let allowIceIncoming = false;

    function flushIceIncoming() {
      allowIceIncoming = true;
      for (const candidate of incomingIceCandidates) {
        peer.addIceCandidate(candidate);
      }
      incomingIceCandidates.length = 0;
    }

    /** @type {Array<RTCIceCandidate | null>} */
    const outgoingIceCandidates = [];
    let allowIceOutgoing = false;

    function flushIceOutgoing() {
      allowIceOutgoing = true;
      for (const candidate of outgoingIceCandidates) {
        sharedIceTopic.queue(candidate);
      }
      outgoingIceCandidates.length = 0;
    }

    return { peer, peerDisconnected, sharedTopic, flushIceOutgoing, flushIceIncoming };
  }

  localTopic
    .listen(async (next) => {
      while (true) {
        const peerId = /** @type {ID} */ (await next());

        const existingPeer = peers.get(peerId);

        if (existingPeer) {
          existingPeer("reconnection");
        }

        const { peer, peerDisconnected, sharedTopic, flushIceOutgoing, flushIceIncoming } = await createPeer(peerId);

        flushIceOutgoing();

        sharedTopic
          .listen(async (next) => {
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            await sharedTopic.queue(offer);
            const answer = /** @type {RTCSessionDescriptionInit} */ (await race(next(), peerDisconnected));
            await peer.setRemoteDescription(answer);
            await flushIceIncoming();
          })
          .catch((e) => {
            if (!(e instanceof DisconnectedError)) {
              throw e;
            }
          });
      }
    })
    .catch((e) => {
      if (!(e instanceof DisconnectedError)) {
        throw e;
      }
    });

  roomTopic
    .listen(async (next) => {
      while (true) {
        const raw = /** @type {string} */ (await next());
        const parts = raw.split(";");
        const peerId = /** @type {ID} */ (parts[0]);
        const peerKnownIds = /** @type {ID[]} */ (parts.slice(1));

        const closePeer = peers.get(peerId);

        if (closePeer) {
          if (peerKnownIds.includes(localId)) {
            identity.debug(peerId, "already connected");
            continue;
          }
          closePeer("Reconnection");
        }

        if (localId.localeCompare(peerId) > 0) {
          identity.debug(peerId, "is new. returning message so they can message me");
          roomTopic.queue(roomTopicMessage()); // unawaited
          continue;
        }

        const { peer, peerDisconnected, sharedTopic, flushIceOutgoing, flushIceIncoming } = await createPeer(peerId);

        sharedTopic
          .listen(async (next) => {
            const offer = /** @type {RTCSessionDescriptionInit} */ (await race(next(), peerDisconnected));
            await peer.setRemoteDescription(offer);
            flushIceOutgoing();
            flushIceIncoming();
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            await sharedTopic.queue(answer);
          })
          .catch((e) => {
            if (!(e instanceof DisconnectedError)) {
              throw e;
            }
          });

        const peerTopic = relay.topic(peerId);
        peerTopic.queue(localId); // unawaited
      }
    })
    .catch((e) => {
      if (!(e instanceof DisconnectedError)) {
        throw e;
      }
    });

  roomTopic.queue(roomTopicMessage()); // unawaited

  const roomBeaconInterval = setInterval(() => {
    const msg = roomTopicMessage();
    identity.debug("broadcasting", msg);
    roomTopic.send?.(msg);
  }, 10_000);

  function disconnect() {
    clearInterval(roomBeaconInterval);
    relay.disconnect();
    for (const cleanupPeer of peers.values()) {
      cleanupPeer("Locally initiated disconnect");
    }
    peers.clear();
  }

  return {
    localId,
    disconnect,
  };
}
