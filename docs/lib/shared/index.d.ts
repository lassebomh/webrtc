type Prettify<T> = {
  [K in keyof T]: T[K];
} & unknown;

type TaggedUnion<T> = Prettify<{ [K in keyof T]: { type: K; data: T[K] } }[keyof T]>;

type Room = {
  roomID: string;
  name: string;
  connectionLimit: number;
  isPublic: boolean;
};

type PeerID = string & Record<symbol, never>;

type Packets = { [K in string]: { request: any; response: any } };

type PacketRequest<TPackets extends Packets, TType extends keyof TPackets = keyof TPackets> = {
  [K in TType]: {
    id: number;
    type: K;
    request: TPackets[K]["request"];
    sender: PeerID;
    receiver: PeerID | null;
  };
}[TType];

type PacketResponse<TPackets extends Packets, TType extends keyof TPackets = keyof TPackets> = {
  [K in TType]: {
    id: number;
    type: K;
    response: TPackets[K]["response"];
    sender: PeerID;
    receiver: PeerID;
  };
}[TType];

type ServerPackets = {
  greet: {
    request: null;
    response: void;
  };
  createRoom: {
    request: Omit<Room, "roomID">;
    response: Room;
  };
  joinRoom: {
    request: string;
    response: Room | null;
  };
  disconnectRoom: {
    request: null;
    response: void;
  };
  roomsList: {
    request: void;
    response: Array<{
      roomID: string;
      name: string;
      connectionLimit: number;
      connections: number;
    }>;
  };
  broadcast: {
    request: string;
    response: string;
  };

  roomRtcOffer: { request: null; response: string | undefined };
  roomRtcAnswer: { request: string | undefined; response: void };
  roomRtcIceCandidate: { request: RTCIceCandidate | null; response: void };
};
