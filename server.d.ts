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

type ServerRequest = {
  createRoom: Omit<Room, "roomID">;
  joinRoom: {
    username: string;
    roomID: string;
  };
  roomsList: true;
  broadcast: unknown;
};

type ServerRequestPayload = TaggedUnion<ServerRequest>;

type ServerResponse = {
  roomCreated: Room;
  roomJoined: Room;
  roomDisconnected: true;
  roomsList: Array<{
    roomID: string;
    name: string;
    connectionLimit: number;
    connections: number;
  }>;
  broadcast: unknown;
};

type ServerResponsePayload = TaggedUnion<ServerResponse>;
