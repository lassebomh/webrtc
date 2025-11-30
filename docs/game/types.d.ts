type FaceType = "passive" | "angry" | "hurt";

interface IObject<T extends string> {
  type: T;
  id: string;
  mass: number;
  fixed: boolean;
}

interface Point {
  x: number;
  y: number;
  px: number;
  py: number;
  ppx: number;
  ppy: number;
}

interface Box extends IObject<"box"> {
  a: Point;
  b: Point;
  c: Point;
  d: Point;
  w: number;
  h: number;
}

interface Circle extends Point, IObject<"circle"> {
  radius: number;
}

interface State {
  autoid: number;
  random: number;
  objects: Record<string, Circle | Box>;
}

type GamePackets = {
  stateSync: {
    request: null;
    response: {
      originTime: number;
      history: HistoryEntry<State>[];
    };
  };
  inputs: {
    request: {
      tick: number;
      inputs: PeerInputs;
    };
    response: void;
  };
};
