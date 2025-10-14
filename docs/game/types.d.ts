type Player = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  wallLeft: boolean;
  wallRight: boolean;
  wallBottom: boolean;
  wallTop: boolean;
  jumpHeld: number;
  fallingTicks: number;

  color: string;
  facing: number;

  face: string;
  faceTicks: number;

  health: number;

  feet: {
    angle: number;
    leftX: number;
    leftY: number;
    leftStartX: number;
    leftStartY: number;
    leftKneeX: number;
    leftKneeY: number;
    rightX: number;
    rightY: number;
    rightStartX: number;
    rightStartY: number;
    rightKneeX: number;
    rightKneeY: number;
  };

  gun: {
    angle: number;
    x: number;
    y: number;
    dm: number;
    da: number;
    cooldown: number;
  };
  body: {
    angle: number;
    x: number;
    y: number;
    dx: number;
    dy: number;
  };
};

type Bullet = {
  x: number;
  y: number;
  dx: number;
  dy: number;
};

type Level = {
  width: number;
  height: number;
  tiles: number[][];
  canvas: OffscreenCanvas;
  spawnPoints: { x: number; y: number }[];
};

interface Game extends IGame {
  autoid: number;

  players: Record<DeviceID, Player>;
  bullets: Record<string, Bullet>;
  playerCount: number;
  camera: {
    x: number;
    y: number;
  };
  level: number;
  debug_points: [number, number][];
}
