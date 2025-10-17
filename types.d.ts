type InputKey =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z"
  | "space"
  | "mousex"
  | "mousey"
  | "mouseleftbutton"
  | "lstickx"
  | "lsticky"
  | "rstickx"
  | "rsticky"
  | "lt"
  | "rt"
  | "buttona"
  | "buttonb"
  | "buttonx"
  | "buttony"
  | "is_gamepad";

type Prettify<T> = {
  [K in keyof T]: T[K];
} & unknown;

type TaggedUnion<T> = Prettify<{ [K in keyof T]: { type: K; data: T[K] } }[keyof T]>;

interface IGame {
  tick: number;
  originTime: number;
}

type InputEntry = { deviceID: DeviceID; key: InputKey; value: number; time: number };

type TickInput = { [K in InputKey]?: number };
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
  input: InputEntry[];
  syncRequest: true;
  syncResponse: {
    game: TGame;
    baseTickInputMap: TickInputMap;
    inputEntries: InputEntry[];
  };
}>;
