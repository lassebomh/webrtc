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
};

type Level = {
  width: number;
  height: number;
  tiles: number[][];
  canvas: OffscreenCanvas;
  spawnPoints: { x: number; y: number }[];
};

interface Game extends IGame {
  players: Record<DeviceID, Player>;
  camera: {
    x: number;
    y: number;
  };
  level: number;
}
