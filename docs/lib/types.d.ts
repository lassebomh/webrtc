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

type KeyboardInput = {
  a?: number;
  b?: number;
  c?: number;
  d?: number;
  e?: number;
  f?: number;
  g?: number;
  h?: number;
  i?: number;
  j?: number;
  k?: number;
  l?: number;
  m?: number;
  n?: number;
  o?: number;
  p?: number;
  q?: number;
  r?: number;
  s?: number;
  t?: number;
  u?: number;
  v?: number;
  w?: number;
  x?: number;
  y?: number;
  z?: number;
  space?: number;
};

type MouseInput = {
  x?: number;
  y?: number;
  left?: number;
  right?: number;
};

type GamepadInput = {
  leftStickX?: number;
  leftStickY?: number;
  rightStickX?: number;
  rightStickY?: number;
  leftTrigger?: number;
  rightTrigger?: number;
  leftShoulder?: number;
  rightShoulder?: number;
  a?: number;
  b?: number;
  x?: number;
  y?: number;
};

type Input = { [K in InputKey]?: number };

type PeerInputs = {
  canvasWidth?: number;
  canvasHeight?: number;
  keyboard: KeyboardInput;
  mouse: MouseInput;
  gamepadInputs: (GamepadInput | null)[];
};

type StateFunc<TState> = (previous: TState, inputs: Record<PeerID, PeerInputs>) => void;
type RenderFunc<TState> = (
  ctx: CanvasRenderingContext2D,
  previous: TState,
  current: TState,
  peerID: PeerID,
  alpha: number
) => void;

type HistoryEntry<TState> = {
  tick: number;
  inputs: Record<PeerID, PeerInputs>;
  mergedInputs: Record<PeerID, PeerInputs> | null;
  state: TState | null;
};

type Store<T> = (() => T) & {
  subscribe(listener: (value: T) => void): () => void;
  notify(): void;
  set(value: T): void;
  bind(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void;
};
