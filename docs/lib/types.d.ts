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
  | "mouserightbutton"
  | "lstickx"
  | "lsticky"
  | "rstickx"
  | "rsticky"
  | "ltrigger"
  | "rtrigger"
  | "lshoulder"
  | "rshoulder"
  | "buttona"
  | "buttonb"
  | "buttonx"
  | "buttony"
  | "is_gamepad";

interface IGame {
  tick: number;
  originTime: number;
}

type InputEntry = { deviceID: DeviceID; key: InputKey; value: number; time: number };

type DeviceInputs = { [K in InputKey]?: number };
type InputRecord = Record<DeviceID, DeviceInputs>;

type DeviceID = string & {};

type NewInputEntry = {
  defaultInputs: DeviceInputs;
  gamepadInputs: (DeviceInputs | null)[];
};
type NewInputEntryRecord = Record<PeerID, NewInputEntry>;

type GameFunc<TGame extends IGame> = (prev: TGame, inputs: NewInputEntryRecord) => void;
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
    baseTickInputMap: InputRecord;
    inputEntries: InputEntry[];
  };
}>;
