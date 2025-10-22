import { Net, randomPeerID, serverPeerId } from "./shared/net.js";
import { fail } from "./shared/utils.js";

const peerID = /** @type {PeerID} */ (sessionStorage.peerID ||= randomPeerID());

class ServerNet {
  /** @type {Net<ServerPackets>} */
  #server;
  /** @type {WebSocket} */
  #ws;

  /** @type {Room | undefined} */
  room;
  /** @type {Record<PeerID, RTCDataChannel>} */
  #channels = {};
  /** @type {Record<PeerID, RTCPeerConnection>} */
  #peers = {};

  constructor() {
    this.#ws = new WebSocket(`ws${window.location.protocol === "https:" ? "s" : ""}://${window.location.host}/`);

    this.#server = new Net(
      peerID,
      (packet) => {
        this.#ws.send(JSON.stringify(packet));
      },
      {
        greet: (_) => fail(),
        broadcast: (_) => fail(),
        createRoom: (_) => fail(),
        joinRoom: (_) => fail(),
        roomsList: (_) => fail(),
        disconnectRoom: (_) => fail(),
        roomRtcOffer: async (peerID, _) => {
          const peer = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
          });
          this.#peers[peerID] = peer;

          peer.addEventListener("icecandidate", ({ candidate }) => {
            this.#server.send("roomRtcIceCandidate", peerID, candidate);
          });

          const channel = peer.createDataChannel("default");
          this.#channels[peerID] = channel;

          channel.addEventListener("message", (e) => {
            console.log(JSON.parse(e.data));
          });

          channel.addEventListener("close", () => {
            channel?.close();
            peer?.close();
            delete this.#channels[peerID];
            delete this.#peers[peerID];
          });

          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);

          return offer.sdp;
        },
        roomRtcAnswer: async (peerID, request) => {
          const peer = this.#peers[peerID] ?? fail();
          await peer.setRemoteDescription({ type: "answer", sdp: request });
        },
        roomRtcIceCandidate: async (peerID, request) => {
          const peer = this.#peers[peerID] ?? fail();
          await peer.addIceCandidate(request);
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
        fail();
      }

      /** @type {PacketRequest<ServerPackets> | PacketResponse<ServerPackets>} */
      const packet = JSON.parse(raw);

      this.#server.receiveRaw(packet);
    });
  }

  async ready() {
    await new Promise((res) => {
      this.#ws.addEventListener("open", res, { once: true });
    });
    await this.#server.send("greet", serverPeerId, null);
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

    const roomNet = new RoomNet(room, this.#server, receiver);

    const offers = await this.#server.requestAll("roomRtcOffer", null, 500);

    for (const [pid, offer] of Object.entries(offers)) {
      const peerID = /** @type {PeerID} */ (pid);
      const peer = this.#peers[peerID] ?? fail();

      peer.ondatachannel = (event) => {
        const channel = event.channel;
        this.#channels[peerID] = channel;

        channel.addEventListener("message", (e) => {
          console.log(JSON.parse(e.data));
        });

        channel.addEventListener("close", () => {
          peer.close();
          channel.close();
          delete this.#channels[peerID];
          delete this.#peers[peerID];
        });
      };

      await peer.setRemoteDescription({ type: "offer", sdp: offer });
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      this.#server.send("roomRtcAnswer", peerID, answer.sdp);
    }

    return roomNet;
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
}

/**
 * @template {Packets} TPackets
 * @extends Net<TPackets>
 */
class RoomNet extends Net {
  /** @type {Room} */
  room;

  /** @type {Net<ServerPackets>} */
  #server;
  /** @type {Record<PeerID, RTCDataChannel>} */
  #channels = {};
  /** @type {Record<PeerID, RTCPeerConnection>} */
  #peers = {};

  /**
   * @param {Room} room
   * @param {Net<ServerPackets>} server
   * @param {{ [K in keyof TPackets]: (peer: PeerID, request: TPackets[K]["request"]) => Promise<TPackets[K]["response"]>; }} receiver
   */
  constructor(room, server, receiver) {
    super(server.peerId, (packet) => {}, receiver);
    this.room = room;
    this.#server = server;
  }
}

const server = new ServerNet();

await server.ready();

const roomID = await server.createRoom("New room", 16, true);

/**
 * @typedef {{ foo: {request: number; response: number;} }} MyRoomPackets
 */

/** @type {RoomNet<MyRoomPackets> | undefined} */
const roomNet = await server.joinRoom(roomID, {
  async foo(peer, request) {
    return 2;
  },
});
