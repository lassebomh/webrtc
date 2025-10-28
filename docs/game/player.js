import { fail } from "../shared/utils.js";
import { AVATAR, createAvatar } from "./avatar.js";

import "./faces.js";
import { FACES } from "./faces.js";

/**
 * @param {Game} game
 * @param {Level} level
 * @param {PeerID} peerID
 * @param {PeerInputs} inputs
 */
export function peerPlayersTick(game, level, peerID, inputs) {
  const playersCount = Object.keys(game.players).length;
  const players = (game.players[peerID] ??= {
    keyboard: {
      avatarID: undefined,
      color: AVATAR.COLORS[playersCount % AVATAR.COLORS.length] ?? fail(),
      face: playersCount % FACES.length,
    },
    gamepads: [], // MARK: Todo controller
    camera: {
      x: game.camera.x,
      y: game.camera.y,
      scale: game.camera.scale,
    },
  });

  /** @type {Avatar | undefined} */
  let avatar;

  if (players.keyboard.avatarID !== undefined) {
    avatar = game.avatars[players.keyboard.avatarID] ?? fail();
  }

  if (players.keyboard.avatarID === undefined && inputs.mouse.left) {
    const spawnPointAvatarDistances = level.spawnPoints
      .map((spawnPoint) => {
        const avatars = Object.values(game.avatars);
        const distances = avatars.map((p) => Math.hypot(p.box.x - spawnPoint.x, p.box.y - spawnPoint.y));
        return /** @type {const} */ ([spawnPoint, Math.min(...distances)]);
      })
      .toSorted(([_, aDist], [__, bDist]) => bDist - aDist);

    const safestSpawnPoint = spawnPointAvatarDistances[0]?.[0] ?? fail();

    avatar = createAvatar(game, safestSpawnPoint.x, safestSpawnPoint.y, players.keyboard.color, players.keyboard.face);
    players.keyboard.avatarID = avatar.id;
  }

  if (avatar) {
    avatar.inputs.moveX = (inputs.keyboard?.d ?? 0) - (inputs.keyboard?.a ?? 0);
    avatar.inputs.moveY = (inputs.keyboard?.s ?? 0) - (inputs.keyboard?.w ?? 0);

    const mouseX = ((inputs.mouse.x ?? 0) - (inputs.canvasWidth ?? 0) / 2) / players.camera.scale + players.camera.x;
    const mouseY = ((inputs.mouse.y ?? 0) - (inputs.canvasHeight ?? 0) / 2) / players.camera.scale + players.camera.y;

    avatar.inputs.aimX = mouseX - avatar.body.x;
    avatar.inputs.aimY = mouseY - avatar.body.y;

    avatar.inputs.jump = Boolean(inputs.keyboard.space || inputs.keyboard.w);
    avatar.inputs.secondary = Boolean(inputs.keyboard.r || inputs.mouse.right);
    avatar.inputs.primary = Boolean(inputs.mouse.left);
  }

  //   aimX = input.rstickx ?? 0;
  //   aimY = input.rsticky ?? 0;
  //   const aimDist = Math.hypot(aimX, aimY);

  //   moveX = input.lstickx ?? 0;
  //   moveY = input.lsticky ?? 0;
  //   const moveDist = Math.hypot(moveX, moveY);

  //   if (moveDist < 0.15) {
  //     moveX = 0;
  //     moveY = 0;
  //   }

  //   if (aimDist > 0.5) {
  //     aimX /= aimDist;
  //     aimY /= aimDist;
  //   } else if (moveDist >= 0.15) {
  //     aimX = moveX / moveDist;
  //     aimY = moveY / moveDist;
  //   } else {
  //     aimX = avatar.primaryArm.vx;
  //     aimY = avatar.primaryArm.vy;
  //   }
  //   if (Math.abs(aimY) <= 0.1) {
  //     aimY /= 3;
  //   }

  //   jump = input.buttona === 1 || input.lshoulder === 1;
  //   secondary = input.buttonb === 1 || (input.ltrigger ?? 0) > 0.5;
  //   primary = input.rshoulder === 1;

  players.camera.x = game.camera.x;
  players.camera.y = game.camera.y;
  players.camera.scale = game.camera.scale;
}
