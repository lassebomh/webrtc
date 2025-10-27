type FaceType = "passive" | "angry" | "hurt";

type Player = {
  color: string;
  face: number;
  avatarID: string | undefined;
};
type PeerPlayers = {
  keyboard: Player;
  gamepads: Player[];
  camera: {
    x: number;
    y: number;
    scale: number;
  };
};

type Avatar = {
  id: string;
  color: string;

  inputs: {
    moveX: number;
    moveY: number;
    aimX: number;
    aimY: number;
    jump: boolean;
    primary: boolean;
    secondary: boolean;
  };

  box: Box;
  jumpHeld: number;
  fallingTicks: number;
  crouching: boolean;
  facing: number;
  face: {
    index: number;
    type: FaceType;
    ticks: number;
  };
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

interface Game {
  autoid: number;
  random: number;
  players: Record<PeerID, PeerPlayers>;
  avatars: Record<string, Avatar>;
  bullets: Record<string, Bullet>;
  camera: {
    x: number;
    y: number;
    scale: number;
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
  bounce: number;

  wallTop?: number;
  wallBottom?: number;
  wallLeft?: number;
  wallRight?: number;
  wall?: number;
}

type Face = {
  default: [number, number];
  hurt: [number, number];
};

type GamePackets = {
  stateSync: {
    request: null;
    response: {
      originTime: number;
      history: HistoryEntry<Game>[];
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
