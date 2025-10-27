import { Net, randomPeerID, serverPeerId } from "./shared/net.js";
import { assert, fail, now, sleep } from "./shared/utils.js";
import { LOCALHOST } from "./utils.js";

export const localPeerID = /** @type {PeerID} */ (sessionStorage.peerID ||= randomPeerID());

let SIMULATE_LAG = 0;

if (LOCALHOST) {
  setInterval(() => {
    SIMULATE_LAG = 30 + Math.random() * 70;
  }, 250);
}

export class ServerNet {
  /** @type {Net<ServerPackets>} */
  #server;
  /** @type {WebSocket} */
  #ws;

  /** @type {Net<*> | undefined} */
  #roomNet;
  /** @type {Record<PeerID, RTCDataChannel>} */
  #channels = {};
  /** @type {Record<PeerID, RTCPeerConnection>} */
  #peers = {};
  /** @type {Record<PeerID, (RTCIceCandidate | null)[]>} */
  #peerIceCandidateQueue = {};

  #serverTimeDiff = 0;

  /**
   * @param {PeerID} peerID
   */
  async flushPeerIceCandidateQueue(peerID) {
    const peer = this.#peers[peerID] ?? fail();
    const iceCandidateQueue = this.#peerIceCandidateQueue[peerID];
    while (iceCandidateQueue?.length) {
      const iceCandidate = iceCandidateQueue.shift();
      await peer.addIceCandidate(iceCandidate);
    }
  }

  /**
   * @param {PeerID} peerID
   */
  deletePeer(peerID) {
    console.warn("deleting peer", peerID);
    this.#channels[peerID]?.close();
    this.#peers[peerID]?.close();
    delete this.#channels[peerID];
    delete this.#peers[peerID];
    delete this.#peerIceCandidateQueue[peerID];
  }

  /**
   *
   * @param {PeerID} peerID
   * @param {RTCDataChannel} channel
   */
  addChannel(peerID, channel) {
    this.#channels[peerID] = channel;

    channel.addEventListener("message", async (e) => {
      if (SIMULATE_LAG) {
        await sleep(SIMULATE_LAG);
      }
      /** @type {PacketRequest<any> | PacketResponse<any>} */
      const packet = JSON.parse(e.data);
      if (packet.sender !== peerID) {
        console.warn("peer", peerID, "is trying to spoof", packet.sender, packet);
      }
      (this.#roomNet ?? fail()).receiveRaw(packet);
    });

    channel.addEventListener("close", () => this.deletePeer(peerID));
  }

  constructor() {
    this.#ws = new WebSocket(`ws${window.location.protocol === "https:" ? "s" : ""}://${window.location.host}/`);

    // if (LOCALHOST) {
    this.#ws.onclose = async () => {
      await sleep(75 + Math.random() * 150);
      window.location.reload();
    };
    // }
    this.#server = new Net(
      localPeerID,
      (packet) => {
        this.#ws.send(JSON.stringify(packet));
      },
      {
        greet: (_) => fail(),
        createRoom: (_) => fail(),
        joinRoom: (_) => fail(),
        roomsList: (_) => fail(),
        disconnectRoom: (_) => fail(),
        timeSync: (_) => fail(),
        roomRtcOffer: async (peerID, _) => {
          const peer = this.#peers[peerID] ?? fail();
          this.addChannel(
            peerID,
            peer.createDataChannel("default", {
              ordered: false,
            })
          );
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          return offer.sdp;
        },
        roomRtcAnswer: async (peerID, request) => {
          const peer = this.#peers[peerID] ?? fail();
          if (peer.signalingState !== "have-local-offer") {
            console.warn("Ignoring unexpected answer for", peerID, "in state", peer.signalingState);
            return null;
          }
          await peer.setRemoteDescription({ type: "answer", sdp: request });
          await this.flushPeerIceCandidateQueue(peerID);
          return null;
        },
        roomRtcIceCandidate: async (peerID, request) => {
          const peer = this.#peers[peerID] ?? fail();
          if (peer.remoteDescription) {
            await this.flushPeerIceCandidateQueue(peerID);
            await peer.addIceCandidate(request);
          } else {
            this.#peerIceCandidateQueue[peerID] ??= [];
            this.#peerIceCandidateQueue[peerID].push(request);
          }
        },
      }
      // true
    );

    this.#ws.addEventListener("message", async (event) => {
      /** @type {string} */
      let raw;
      if (typeof event.data === "string") {
        raw = event.data;
      } else if (event.data instanceof Blob) {
        raw = await event.data.text();
      } else {
        fail("invalid message type from websocket");
      }

      /** @type {PacketRequest<ServerPackets> | PacketResponse<ServerPackets>} */
      const packet = JSON.parse(raw);
      const peerID = packet.sender;

      if (peerID !== serverPeerId) {
        let peer = this.#peers[peerID];

        if (peer === undefined) {
          peer = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
          });
          peer.addEventListener("connectionstatechange", () => {
            if (peer?.connectionState === "disconnected" || peer?.connectionState === "failed") {
              this.deletePeer(peerID);
            }
          });

          peer.addEventListener("icecandidate", ({ candidate }) => {
            this.#server.send("roomRtcIceCandidate", peerID, candidate);
          });

          this.#peers[peerID] = peer;
        }
      }

      this.#server.receiveRaw(packet);
    });
  }

  async timeSync() {
    const rounds = 5;
    let avgTimeDiff = 0;
    let avgPing = 0;

    for (let i = 0; i < rounds; i++) {
      const t0 = now();
      const originPeerNow = await this.#server.request("timeSync", serverPeerId, null);
      const t1 = now();
      const rtt = t1 - t0;
      const timeDiff = (t1 + t0) / 2 - originPeerNow;

      avgTimeDiff += timeDiff / rounds;
      avgPing += rtt / rounds;
    }

    console.log(`Server ping=${avgPing.toFixed(0)} timeDiff=${avgTimeDiff.toFixed(3)}`);
    this.#serverTimeDiff = avgTimeDiff;
  }

  time() {
    return now() - this.#serverTimeDiff;
  }

  async ready() {
    await new Promise((res) => {
      this.#ws.addEventListener("open", res, { once: true });
    });
    await this.#server.request("greet", serverPeerId, null);
    await this.timeSync();
  }

  /**
   * @param {string} name
   * @param {number} connectionLimit
   * @param {boolean} isPublic
   */
  async createRoom(name, connectionLimit, isPublic) {
    const room = await this.#server.request("createRoom", serverPeerId, { name, connectionLimit, isPublic });
    return room.roomID;
  }

  listRooms() {
    return this.#server.request("roomsList", serverPeerId, null, 500);
  }

  /**
   * @template {Packets} TPackets
   * @param {string} roomID
   * @param {{ [K in keyof TPackets]: (peer: PeerID, request: TPackets[K]["request"]) => Promise<TPackets[K]["response"]>; }} receiver
   */
  async joinRoom(roomID, receiver) {
    const room = await this.#server.request("joinRoom", serverPeerId, roomID);

    if (!room) {
      return;
    }

    assert(this.#roomNet === undefined);

    /** @type {Net<TPackets>} */
    const roomNet = new Net(
      localPeerID,
      (packet) => {
        if (packet.receiver !== null) {
          const channel = this.#channels[packet.receiver] ?? fail(`channel for peer ${packet.receiver} doesn't exist`);
          if (channel.readyState === "open") {
            channel.send(JSON.stringify(packet));
          } else {
            // fail("not ready");
          }
        } else {
          for (const [peerID, channel] of Object.entries(this.#channels)) {
            if (channel.readyState === "open") {
              packet.receiver = peerID;
              channel.send(JSON.stringify(packet));
            } else {
              // fail("not ready");
            }
          }
        }
      },
      receiver
      // true
    );

    this.#roomNet = roomNet;

    const offers = await this.#server.requestAll("roomRtcOffer", null, 500);

    await Promise.all(
      Object.entries(offers).map(async ([pid, offer]) => {
        const peerID = /** @type {PeerID} */ (pid);
        const peer = this.#peers[peerID] ?? fail();

        peer.addEventListener("datachannel", ({ channel }) => this.addChannel(peerID, channel));

        await peer.setRemoteDescription({ type: "offer", sdp: offer });
        await this.flushPeerIceCandidateQueue(peerID);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await this.#server.request("roomRtcAnswer", peerID, answer.sdp);
      })
    );

    return roomNet;
  }
}

const server = new ServerNet();

await server.ready();

export { server };
