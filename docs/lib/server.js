import { Net, randomPeerID, serverPeerId } from "./shared/net.js";
import { assert, fail } from "./shared/utils.js";

const peerID = /** @type {PeerID} */ (sessionStorage.peerID ||= randomPeerID());

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

  /**
   *
   * @param {PeerID} peerID
   * @param {RTCDataChannel} channel
   */
  addChannel(peerID, channel) {
    this.#channels[peerID] = channel;

    channel.addEventListener("message", (e) => {
      /** @type {PacketRequest<any> | PacketResponse<any>} */
      const packet = JSON.parse(e.data);
      if (packet.sender !== peerID) {
        console.warn("peer", peerID, "is trying to spoof", packet.sender, packet);
      }
      (this.#roomNet ?? fail()).receiveRaw(packet);
    });

    channel.addEventListener("close", () => {
      channel?.close();
      this.#peers[peerID]?.close();
      delete this.#channels[peerID];
      delete this.#peers[peerID];
      delete this.#peerIceCandidateQueue[peerID];
    });
  }

  constructor() {
    this.#ws = new WebSocket(`ws${window.location.protocol === "https:" ? "s" : ""}://${window.location.host}/`);

    this.#server = new Net(
      peerID,
      (packet) => {
        this.#ws.send(JSON.stringify(packet));
      },
      {
        greet: (_) => fail(),
        createRoom: (_) => fail(),
        joinRoom: (_) => fail(),
        roomsList: (_) => fail(),
        disconnectRoom: (_) => fail(),
        roomRtcOffer: async (peerID, _) => {
          const peer = this.#peers[peerID] ?? fail();
          this.addChannel(peerID, peer.createDataChannel("default"));
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          return offer.sdp;
        },
        roomRtcAnswer: async (peerID, request) => {
          const peer = this.#peers[peerID] ?? fail();
          await peer.setRemoteDescription({ type: "answer", sdp: request });
          const iceCandidateQueue = this.#peerIceCandidateQueue[peerID];
          while (iceCandidateQueue?.length) {
            const iceCandidate = iceCandidateQueue.pop();
            await peer.addIceCandidate(iceCandidate);
          }
          return null;
        },
        roomRtcIceCandidate: async (peerID, request) => {
          const peer = this.#peers[peerID] ?? fail();
          if (peer.remoteDescription) {
            await peer.addIceCandidate(request);
          } else {
            this.#peerIceCandidateQueue[peerID] ??= [];
            this.#peerIceCandidateQueue[peerID].push(request);
          }
        },
      }
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

      if (packet.sender !== serverPeerId) {
        let peer = this.#peers[packet.sender];

        if (peer === undefined) {
          peer = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
          });

          peer.addEventListener("icecandidate", ({ candidate }) => {
            this.#server.send("roomRtcIceCandidate", packet.sender, candidate);
          });

          this.#peers[packet.sender] = peer;
        }
      }

      this.#server.receiveRaw(packet);
    });
  }

  async ready() {
    await new Promise((res) => {
      this.#ws.addEventListener("open", res, { once: true });
    });
    await this.#server.request("greet", serverPeerId, null);
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
      peerID,
      (packet) => {
        const raw = JSON.stringify(packet);
        if (packet.receiver !== null) {
          const channel = this.#channels[packet.receiver] ?? fail(`channel for peer ${packet.receiver} doesn't exist`);
          if (channel.readyState === "open") {
            channel.send(raw);
          }
          channel.send(raw);
        } else {
          for (const channel of Object.values(this.#channels)) {
            if (channel.readyState === "open") {
              channel.send(raw);
            }
          }
        }
      },
      receiver
    );

    this.#roomNet = roomNet;

    const offers = await this.#server.requestAll("roomRtcOffer", null, 500);

    for (const [pid, offer] of Object.entries(offers)) {
      const peerID = /** @type {PeerID} */ (pid);
      const peer = this.#peers[peerID] ?? fail();

      peer.addEventListener("datachannel", (e) => this.addChannel(peerID, e.channel));

      await peer.setRemoteDescription({ type: "offer", sdp: offer });
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await this.#server.request("roomRtcAnswer", peerID, answer.sdp);
    }

    return roomNet;
  }
}

const server = new ServerNet();

await server.ready();

export { server };
