type Prettify<T> = {
  [K in keyof T]: T[K];
} & unknown;

type TaggedUnion<T> = Prettify<{ [K in keyof T]: { type: K; data: T[K] } }[keyof T]>;

type Game = {
  tick: number;
  originTime: number;
  players: Record<DeviceID, { x: number; y: number; dx: number; dy: number }>;
};

type InputEntry = { deviceID: DeviceID; key: string; value: number; time: number };

type TickInput = Record<string, number>;
type TickInputMap = Record<DeviceID, TickInput>;

type DeviceID = string & {};

type GameFunc = (prev: Game, inputs: TickInputMap) => void;
type RenderFunc = (prev: Game, current: Game, alpha: number) => void;

type Message = TaggedUnion<{
  input: InputEntry;
  syncRequest: true;
  syncResponse: {
    game: Game;
    inputEntries: InputEntry[];
  };
}>;
