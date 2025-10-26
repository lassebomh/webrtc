import { fail } from "../lib/shared/utils.js";
import { lin } from "../lib/utils.js";
import { AVATAR, avatarRender, avatarTakeDamage, avatarTick, createAvatar } from "./avatar.js";

import { boxLevelTick, boxOnBoxCollision, boxOnPointCollision, boxRender } from "./collision.js";
import { BULLET, GUN_TYPES, gunCreate, pistolRender, uziRender } from "./guns.js";
import { getTile, levels } from "./levels.js";
import { particleCreate, particleRender, particleTick } from "./particle.js";
import { random } from "./utils.js";

// MARK: Todo add params
export const init = () =>
  /** @type {Game} */ ({
    players: {},
    avatars: {},
    bullets: {},
    particles: {},
    autoid: 0,
    random: 0,
    camera: {
      x: 0,
      y: 0,
      scale: 1,
    },
    level: 1,
    guns: {},
    allowedGuns: 4,
    debug_points: [],
  });

/** @type {StateFunc<Game>} */
export const tick = (game, peerInputs) => {
  const level = levels[game.level] ?? fail();

  let gunsCount = Object.keys(game.guns).length;

  let avatarMeanX = 0;
  let avatarMeanY = 0;
  let avatarCount = 0;
  let highestDistanceToCamera = 0;

  for (const peerID in peerInputs) {
    game.players[peerID] ??= {
      keyboardPlayer: {
        avatarID: undefined,
        color: AVATAR.COLORS[Object.keys(game.players).length % AVATAR.COLORS.length] ?? fail(),
      },
      gamepadPlayers: [], // MARK: Todo controller
      // gamepadPlayers:
    };
    // playerInputs[playerID] = inputs[peerID]?.standardInput ?? fail();
    // MARK: TODO controller
  }

  for (const particleID in game.particles) {
    const particle = game.particles[particleID] ?? fail();
    particleTick(game, particle);
  }

  bulletLoop: for (const bulletId in game.bullets) {
    const bullet = game.bullets[bulletId] ?? fail();
    bullet.dy += BULLET.GRAVITY;
    for (let i = 0; i < 3; i++) {
      bullet.x += bullet.dx / 3;
      bullet.y += bullet.dy / 3;

      if (
        Math.floor(bullet.x) <= 0 ||
        Math.floor(bullet.x) >= level.box.width - 1 ||
        Math.floor(bullet.y) <= 0 ||
        Math.floor(bullet.y) >= level.box.height - 1 ||
        getTile(level, bullet.x, bullet.y) === 1
      ) {
        for (let i = 0; i < 2; i++) {
          particleCreate(
            game,
            bullet.x,
            bullet.y,
            -bullet.dx / 4 + random(game, -0.1, 0.1),
            -bullet.dy / 4 + random(game, -0.1, 0.1),
            0.05,
            1.3,
            1.15,
            0.1,
            "white"
          );
        }
        delete game.bullets[bulletId];
        continue;
      }

      for (const avatarID in game.avatars) {
        const avatar = game.avatars[avatarID] ?? fail();

        if (boxOnPointCollision(avatar.box, bullet.x, bullet.y)) {
          avatar.body.dx += bullet.dx;
          avatar.body.dy += bullet.dy;

          avatarTakeDamage(game, avatar, 1, bullet.dx / 3, bullet.dy / 3);
          delete game.bullets[bulletId];
          continue bulletLoop;
        }
      }
    }
  }

  for (const peerID in game.players) {
    const peerPlayers = game.players[peerID] ?? fail();
    const inputs = peerInputs[peerID] ?? fail();

    {
      const keyboardPlayer = peerPlayers.keyboardPlayer;
      const keyboard = inputs.standardInput;

      /** @type {Avatar | undefined} */
      let avatar;

      if (keyboardPlayer.avatarID !== undefined) {
        avatar = game.avatars[keyboardPlayer.avatarID] ?? fail();
      }

      if (keyboardPlayer.avatarID === undefined && keyboard.mouseleftbutton) {
        const spawnPointAvatarDistances = level.spawnPoints
          .map((spawnPoint) => {
            const avatars = Object.values(game.avatars);
            const distances = avatars.map((p) => Math.hypot(p.box.x - spawnPoint.x, p.box.y - spawnPoint.y));
            return /** @type {const} */ ([spawnPoint, Math.min(...distances)]);
          })
          .toSorted(([_, aDist], [__, bDist]) => bDist - aDist);

        const safestSpawnPoint = spawnPointAvatarDistances[0]?.[0] ?? fail();

        avatar = createAvatar(game, safestSpawnPoint.x, safestSpawnPoint.y, keyboardPlayer.color);
        keyboardPlayer.avatarID = avatar.id;
      }

      if (avatar) {
        const moveX = (keyboard?.d ?? 0) - (keyboard?.a ?? 0);
        const moveY = (keyboard?.s ?? 0) - (keyboard?.w ?? 0);

        const mouseX = (keyboard.mousex ?? 0) / game.camera.scale + game.camera.x;
        const mouseY = (keyboard.mousey ?? 0) / game.camera.scale + game.camera.y;

        const aimX = mouseX - avatar.body.x;
        const aimY = mouseY - avatar.body.y;

        const jump = Boolean(keyboard.space || keyboard.w);
        const secondary = Boolean(keyboard.r || keyboard.mouserightbutton);
        const primary = Boolean(keyboard.mouseleftbutton);

        avatarTick(game, level, avatar, moveX, moveY, aimX, aimY, jump, primary, secondary);

        if (avatar.gun) {
          gunsCount++;
        }

        avatarMeanX += avatar.body.x;
        avatarMeanY += avatar.body.y;
        avatarCount += 1;

        const distanceToCamera = Math.hypot(avatar.body.x - game.camera.x, avatar.body.y - game.camera.y);

        if (distanceToCamera > highestDistanceToCamera) {
          highestDistanceToCamera = distanceToCamera;
        }
      }
    }

    // const input = playerInputs[playerID] ?? fail();
    // const player = game.players[playerID] ?? fail();

    // const start = input.mouseleftbutton || input.buttona;

    // let avatar = player.avatarID ? game.avatars[player.avatarID] ?? fail() : undefined;

    // if (player.avatarID === undefined && start) {
    //   const spawnPointAvatarDistances = level.spawnPoints
    //     .map((spawnPoint) => {
    //       const avatars = Object.values(game.avatars);
    //       const distances = avatars.map((p) => Math.hypot(p.box.x - spawnPoint.x, p.box.y - spawnPoint.y));
    //       return /** @type {const} */ ([spawnPoint, Math.min(...distances)]);
    //     })
    //     .toSorted(([_, aDist], [__, bDist]) => bDist - aDist);

    //   const safestSpawnPoint = spawnPointAvatarDistances[0]?.[0] ?? fail();

    //   keyboardPlayer: ;
    //   avatar = createAvatar(game, safestSpawnPoint.x, safestSpawnPoint.y, player.color);
    //   player.avatarID = avatar.id,
    //   // gamepadPlayers:

    // gamepadPlayers: [] // MARK: Todo controller  player.avatarID = avatar.id;

    // // if (!avatar) continue;

    // /** @type {number} */
    // let moveX;
    // /** @type {number} */
    // let moveY;
    // /** @type {number} */
    // let aimX;
    // /** @type {number} */
    // let aimY;
    // /** @type {boolean} */
    // let jump;
    // /** @type {boolean} */
    // let secondary;
    // /** @type {boolean} */
    // let primary;

    // if (input.is_gamepad) {
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
    // } else {
    //   moveX = (input?.d ?? 0) - (input?.a ?? 0);
    //   moveY = (input?.s ?? 0) - (input?.w ?? 0);

    //   const mouseX = (input.mousex ?? 0) / game.camera.scale + game.camera.x;
    //   const mouseY = (input.mousey ?? 0) / game.camera.scale + game.camera.y;

    //   aimX = mouseX - avatar.body.x;
    //   aimY = mouseY - avatar.body.y;

    //   jump = Boolean(input.space || input.w);
    //   secondary = Boolean(input.r || input.mouserightbutton);
    //   primary = Boolean(input.mouseleftbutton);
    // }

    // avatarTick(game, level, avatar, moveX, moveY, aimX, aimY, jump, primary, secondary);

    // if (avatar.gun) {
    //   gunsCount++;
    // }

    // avatarMeanX += avatar.body.x;
    // avatarMeanY += avatar.body.y;
    // avatarCount += 1;

    // const distanceToCamera = Math.hypot(avatar.body.x - game.camera.x, avatar.body.y - game.camera.y);

    // if (distanceToCamera > highestDistanceToCamera) {
    //   highestDistanceToCamera = distanceToCamera;
    // }
  }

  while (game.allowedGuns - gunsCount > 0) {
    gunsCount++;

    const gunLocations = level.gunLocations
      .map((gunLocation) => {
        const guns = Object.values(game.guns);
        const distances = guns.map((g) => Math.hypot(g.box.x - gunLocation.x, g.box.y - gunLocation.y));
        return /** @type {const} */ ([gunLocation, Math.min(...distances)]);
      })
      .toSorted(([_, aDist], [__, bDist]) => bDist - aDist);

    const { x, y } = gunLocations[0]?.[0] ?? fail();
    gunCreate(game, x, y, Math.floor(random(game, 0, GUN_TYPES.length)));
  }

  for (const gunID in game.guns) {
    const gun = game.guns[gunID] ?? fail();
    if (gun.ticksUntilPickup > 0) {
      gun.ticksUntilPickup--;
    }

    gun.box.dy += 0.02;
    gun.box.dy /= 1.01;
    if (gun.box.wallBottom) {
      gun.box.dx /= 1.1;
    }

    if (!boxOnBoxCollision(gun.box, level.box)) {
      delete game.guns[gunID];
    } else if (gun.bullets) {
      boxLevelTick(level, gun.box);

      if (gun.box.wallBottom === 2) {
        delete game.guns[gunID];
      }
    } else {
      gun.box.x += gun.box.dx;
      gun.box.y += gun.box.dy;
    }
  }
  if (avatarCount) {
    avatarMeanX /= avatarCount;
    avatarMeanY /= avatarCount;

    const targetX = avatarMeanX;
    const targetY = avatarMeanY;
    game.camera.x -= (game.camera.x - targetX) / 32;
    game.camera.y -= (game.camera.y - targetY) / 32;
    let targetScale = 400 / highestDistanceToCamera;
    targetScale = Math.min(targetScale, 50);
    game.camera.scale -= (game.camera.scale - targetScale) / 50;
  }
};

/** @type {RenderFunc<Game>} */
export const render = (ctx, prev, curr, alpha) => {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  const level = levels[curr.level] ?? fail();
  const cameraX = lin(prev.camera.x, curr.camera.x, alpha);
  const cameraY = lin(prev.camera.y, curr.camera.y, alpha);
  const cameraScale = lin(prev.camera.scale, curr.camera.scale, alpha);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(width / 2, height / 2);
  ctx.scale(cameraScale, cameraScale);
  ctx.translate(-cameraX, -cameraY);

  ctx.drawImage(level.canvas, 0, 0);

  for (const gunID in curr.guns) {
    const prevGun = prev.guns[gunID];
    const gun = curr.guns[gunID] ?? fail();
    const x = lin(prevGun?.box.x, gun.box.x, alpha);
    const y = lin(prevGun?.box.y, gun.box.y, alpha);

    // boxRender(ctx, prevGun?.box, gun.box, "red", alpha);
    if (gun.type === 0) {
      pistolRender(ctx, x + gun.box.width / 2, y + gun.box.height / 2, x);
    } else if (gun.type === 1) {
      uziRender(ctx, x + gun.box.width / 2, y + gun.box.height / 2, x);
    } else {
      boxRender(ctx, prevGun?.box, gun.box, "red", alpha);
    }
  }

  for (const avatarID in curr.avatars) {
    const avatar = curr.avatars[avatarID] ?? fail();
    const prevAvatar = prev.avatars[avatarID];

    // boxRender(ctx, prevAvatar?.box, avatar.box, "red", alpha);
    avatarRender(ctx, curr, prevAvatar, avatar, alpha);
  }

  for (const bulletId in curr.bullets) {
    const prevBullet = prev.bullets[bulletId];
    const bullet = curr.bullets[bulletId] ?? fail();

    ctx.beginPath();
    const x = lin(prevBullet?.x, bullet.x, alpha);
    const y = lin(prevBullet?.y, bullet.y, alpha);
    const dx = lin(prevBullet?.dx, bullet.dx, alpha);
    const dy = lin(prevBullet?.dy, bullet.dy, alpha);
    const size = 0.05;
    const particleAngle = Math.atan2(dy, dx);
    const mag = Math.hypot(dx, dy);
    if (size <= 0 || Math.max(size, mag / 1.3, 0) <= 0) continue;
    ctx.ellipse(x + dx / 2, y + dy / 2, size, Math.max(size, mag / 1.3), particleAngle + Math.PI / 2, 0, Math.PI * 2);
    ctx.fillStyle = "yellow";
    ctx.fill();
  }

  for (const particleId in curr.particles) {
    const prevParticle = prev.particles[particleId];
    const particle = curr.particles[particleId] ?? fail();

    particleRender(ctx, prevParticle, particle, alpha);
  }

  for (const [x, y] of curr.debug_points) {
    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.arc(x, y, 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
};
