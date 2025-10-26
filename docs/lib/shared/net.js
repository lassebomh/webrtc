import { fail, randInt } from "./utils.js";

const DEBUG = false;
export function randomPeerID() {
  return /** @type {PeerID} */ (Math.floor(Math.random() * Math.pow(2, 32)).toString());
}

export const serverPeerId = /** @type {PeerID} */ ("0000000000");

/**
 * @template {Packets} TPackets
 */
export class Net {
  /** @type {Map<number, (sender: PeerID, response: PacketResponse<TPackets>['response']) => void>} */
  #requestResolvers = new Map();

  /**
   * @param {PacketRequest<TPackets> | PacketResponse<TPackets>} packet
   */
  async receiveRaw(packet) {
    if (packet.receiver !== null && packet.receiver != this.peerId) return;

    if (DEBUG) {
      console.debug(
        `${packet.receiver?.slice(0, 3).toUpperCase() ?? "ALL"} ${packet.sender
          .slice(0, 3)
          .toUpperCase()} %c<|| ${packet.type.toString()}`,
        "font-weight: bold;"
      );
      console.debug("request" in packet ? packet.request : packet.response);
    }
    if ("request" in packet) {
      const response = await this.receiver[packet.type](packet.sender, packet.request);
      if (response !== undefined) {
        this.sender({
          id: packet.id,
          type: packet.type,
          sender: this.peerId,
          receiver: packet.sender,
          response,
        });
      }
    } else {
      const resolver = this.#requestResolvers.get(packet.id) ?? fail();
      resolver(packet.sender, packet.response);
    }
  }

  /**
   * @param {PeerID} peerId
   * @param {(packet: PacketRequest<TPackets> | PacketResponse<TPackets>) => void} sender
   * @param {{[K in keyof TPackets]: (peer: PeerID, request: TPackets[K]['request']) => Promise<TPackets[K]['response']>}} receiver
   */
  constructor(peerId, sender, receiver) {
    this.peerId = peerId;
    this.sender = /** @type {typeof sender} */ (packet) => {
      if (DEBUG) {
        console.debug(
          `${packet.sender.slice(0, 3).toUpperCase()} ${
            packet.receiver?.slice(0, 3).toUpperCase() ?? "ALL"
          } %c||> ${packet.type.toString()}`,
          "font-weight: bold;"
        );
        console.debug("request" in packet ? packet.request : packet.response);
      }
      sender(packet);
    };
    this.receiver = receiver;
  }

  /**
   * @template {keyof TPackets} T
   * @param {T} type
   * @param {PeerID} receiver
   * @param {TPackets[T]['request']} data
   */
  send(type, receiver, data) {
    this.sender({
      id: randInt(),
      type,
      sender: this.peerId,
      receiver,
      request: data,
    });
  }

  /**
   * @template {keyof TPackets} T
   * @param {T} type
   * @param {TPackets[T]['request']} data
   */
  sendAll(type, data) {
    const id = randInt();

    /** @type {PacketRequest<TPackets, T>} */
    const request = {
      id,
      type,
      request: data,
      sender: this.peerId,
      receiver: null,
    };

    this.sender(request);
  }

  /**
   * @template {keyof TPackets} T
   * @param {T} type
   * @param {TPackets[T]['request']} data
   * @param {number} timeoutMs
   * @returns {Promise<Record<PeerID, TPackets[T]['response']>>}
   */
  requestAll(type, data, timeoutMs) {
    const id = randInt();

    /** @type {PacketRequest<TPackets, T>} */
    const request = {
      id,
      type,
      request: data,
      sender: this.peerId,
      receiver: null,
    };

    this.sender(request);

    /** @type {Record<PeerID, PacketResponse<TPackets, T>>} */
    const responses = {};

    const { promise, resolve } = Promise.withResolvers();

    setTimeout(() => {
      resolve(responses);
      this.#requestResolvers.delete(id);
    }, timeoutMs);

    this.#requestResolvers.set(id, (sender, response) => {
      responses[sender] = response;
    });

    return promise;
  }

  /**
   * @template {keyof TPackets} T
   * @param {T} type
   * @param {PeerID} receiver
   * @param {TPackets[T]['request']} data
   * @returns {Promise<TPackets[T]['response']>}
   * @param {number} timeoutMs
   */
  request(type, receiver, data, timeoutMs = 500) {
    const id = randInt();

    /** @type {PacketRequest<TPackets, T>} */
    const request = {
      id,
      type,
      sender: this.peerId,
      receiver,
      request: data,
    };

    this.sender(request);

    const { promise, reject, resolve } = Promise.withResolvers();

    const timeout = setTimeout(() => {
      console.warn(request);
      reject(new Error(`Request ${request.type.toString()}#${request.id} timeout`));
      this.#requestResolvers.delete(id);
    }, timeoutMs);

    this.#requestResolvers.set(id, (sender, response) => {
      clearTimeout(timeout);
      resolve(response);
      this.#requestResolvers.delete(id);
    });

    return promise;
  }
}
