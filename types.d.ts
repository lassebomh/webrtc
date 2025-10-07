type Prettify<T> = {
  [K in keyof T]: T[K];
} & unknown;

type Exclusive<T> = Prettify<
  { [K in keyof T]: { [X in K]: T[K] } & { [X in Exclude<keyof T, K>]?: undefined } }[keyof T]
>;

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
