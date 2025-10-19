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
    damage: number;
  };
  gun?: Gun | undefined;
  rope: {
    box: Box;
    active: boolean;
    grabbingAvatarID?: string | undefined;
    grabbingGunID?: string | undefined;
    grabbingWall?: boolean | undefined;
  };
  grabbedByAvatarID?: string | undefined;

  body: {
    angle: number;
    x: number;
    y: number;
    dx: number;
    dy: number;
  };
  primaryCooldown: number;
  secondaryCooldown: number;
};

type Bullet = {
  x: number;
  y: number;
  dx: number;
  dy: number;
};

type Gun = {
  ticksUntilPickup: number;
  bullets: number;
  type: number;
  box: Box;
  cooldown: number;
  automatic: boolean;
  damage: number;
  barrelLength: number;
};

type Level = {
  box: Box;
  tiles: number[][];
  canvas: OffscreenCanvas;
  spawnPoints: { x: number; y: number }[];
  gunLocations: { x: number; y: number }[];
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
  camera: {
    x: number;
    y: number;
    scale: number;
  };
  level: number;
  guns: Record<string, Gun>;
  allowedGuns: number;
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
  bounce: number;

  wallTop?: number;
  wallBottom?: number;
  wallLeft?: number;
  wallRight?: number;
  wall?: number;
}
