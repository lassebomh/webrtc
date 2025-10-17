type Player = {
  color: string;
  avatarID: string | undefined;
};

type Avatar = {
  id: string;
  color: string;

  box: Box;
  jumpHeld: number;
  fallingTicks: number;
  crouching: boolean;
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

  primaryArm: {
    vx: number;
    vy: number;
    distance: number;
    dangle: number;
    ddistance: number;
  };
  gun: Gun | undefined;
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

type Gun = {
  ticksUntilPickup: number;
  type: number;
  box: Box;
  cooldown: number;
};

type Level = {
  width: number;
  height: number;
  tiles: number[][];
  canvas: OffscreenCanvas;
  spawnPoints: { x: number; y: number }[];
};

type Particle = {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  size: number;
  sizeDiv: number;
  speedDiv: number;
  speedRandom: number;
  color: string;
};

interface Game extends IGame {
  autoid: number;
  random: number;
  players: Record<DeviceID, Player>;
  avatars: Record<string, Avatar>;
  bullets: Record<string, Bullet>;
  avatarCount: number;
  camera: {
    x: number;
    y: number;
  };
  level: number;
  guns: Record<string, Gun>;
  particles: Record<string, Particle>;

  debug_points: [number, number][];
}

interface Box {
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
  height: number;

  // maxSpeed: number;
  bounce: number;
  // gravity: number;
  // airFriction: number;
  // wallFriction: number;

  wallTop: boolean;
  wallBottom: boolean;
  wallLeft: boolean;
  wallRight: boolean;
  // airTime: number;
}
