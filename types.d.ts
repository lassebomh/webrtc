type Prettify<T> = {
  [K in keyof T]: T[K];
} & unknown;

type TaggedUnion<T> = Prettify<{ [K in keyof T]: { type: K; data: T[K] } }[keyof T]>;

interface IGame {
  tick: number;
  originTime: number;
}

type InputEntry = { deviceID: DeviceID; key: string; value: number; time: number };

type TickInput = Record<string, number>;
type TickInputMap = Record<DeviceID, TickInput>;

type DeviceID = string & {};

type GameFunc<TGame extends IGame> = (prev: TGame, inputs: TickInputMap) => void;
type RenderFunc<TGame extends IGame> = (
  ctx: CanvasRenderingContext2D,
  prev: TGame,
  current: TGame,
  alpha: number
) => void;

type Message<TGame extends IGame> = TaggedUnion<{
  input: InputEntry;
  syncRequest: true;
  syncResponse: {
    game: TGame;
    baseTickInputMap: TickInputMap;
    inputEntries: InputEntry[];
  };
}>;
