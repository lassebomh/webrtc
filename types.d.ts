type Prettify<T> = {
  [K in keyof T]: T[K];
} & unknown;

type Exclusive<T> = Prettify<
  { [K in keyof T]: { [X in K]: T[K] } & { [X in Exclude<keyof T, K>]?: undefined } }[keyof T]
>;

type GameState = {
  players: { id: number; x: number; y: number; dx: number; dy: number; keysdown: string[] }[];
  tick: number;
  created: number;
};

type Input = Exclusive<{
  playerJoin: number;
  playerLeave: number;
  keydown: {
    playerId: number;
    key: string;
  };
  keyup: {
    playerId: number;
    key: string;
  };
}> & { time: number };

type Message = Exclusive<{
  inputs: Input[];
  staterequest: true;
  stateresponse: GameState;
}>;
