type Player = { x: number; y: number; dx: number; dy: number };

type Level = { width: number; height: number; tiles: number[][]; canvas: OffscreenCanvas };

interface Game extends IGame {
  players: Record<DeviceID, Player>;
  camera: {
    x: number;
    y: number;
  };
  level: number;
}
