import { fail } from "../lib/shared/utils.js";
import { lin } from "../lib/utils.js";
import { avatarRender, avatarTakeDamage, avatarTick } from "./avatar.js";

import { boxLevelTick, boxOnBoxCollision, boxOnPointCollision, boxRender } from "./collision.js";
import { BULLET, gunCreate, pistolRender, uziRender } from "./guns.js";
import { getTile, levels } from "./levels.js";
import { particleCreate, particleRender, particleTick } from "./particle.js";
import { peerPlayersTick } from "./player.js";
import { random } from "./utils.js";

// MARK: Todo add params
export const init = () => {
  const levelIndex = 0;
  const level = levels[levelIndex] ?? fail();

  return /** @type {Game} */ ({
    players: {},
    avatars: {},
    bullets: {},
    particles: {},
    autoid: 0,
    random: 0,
    camera: {
      x: level.box.width / 2,
      y: level.box.height / 2,
      scale: 1000 / level.box.width,
    },
    level: levelIndex,
    guns: {},
    debug_points: [],
  });
};

/** @type {StateFunc<Game>} */
export const tick = (game, peerInputs) => {
  const level = levels[game.level] ?? fail();

  let gunsCount = Object.keys(game.guns).length;

  for (const peerID in peerInputs) {
    const inputs = peerInputs[peerID] ?? fail();
    peerPlayersTick(game, level, peerID, inputs);
  }

  let avatarMeanX = 0;
  let avatarMeanY = 0;
  let avatarCount = 0;
  let highestDistanceToCamera = 0;

  for (const avatarID in game.avatars) {
    const avatar = game.avatars[avatarID] ?? fail();
    avatarTick(game, level, avatar);

    avatarMeanX += avatar.body.x;
    avatarMeanY += avatar.body.y;
    avatarCount += 1;

    const distanceToCamera = Math.hypot(avatar.body.x - game.camera.x, avatar.body.y - game.camera.y);

    if (distanceToCamera > highestDistanceToCamera) {
      highestDistanceToCamera = distanceToCamera;
    }

    if (avatar.gun) {
      gunsCount++;
    }
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

  // MARK: todo fix gun spawn
  while (level.gunLocations.length - gunsCount > 0) {
    gunsCount++;

    const gunLocations = level.gunLocations
      .map((gunLocation) => {
        const guns = Object.values(game.guns);
        const distances = guns.map((g) => Math.hypot(g.box.x - gunLocation.x, g.box.y - gunLocation.y));
        return /** @type {const} */ ([gunLocation, Math.min(...distances)]);
      })
      .toSorted(([_, aDist], [__, bDist]) => bDist - aDist);

    const { x, y } = gunLocations[0]?.[0] ?? fail();
    gunCreate(game, x, y, 1); //  Math.floor(random(game, 0, GUN_TYPES.length)));
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
    targetScale = Math.min(targetScale, 90);
    game.camera.scale -= (game.camera.scale - targetScale) / 50;
  }
};

/** @type {RenderFunc<Game>} */
export const render = (ctx, prev, curr, peerID, alpha) => {
  const prevPeerPlayers = prev.players[peerID];
  const peerPlayers = curr.players[peerID];

  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  const level = levels[curr.level] ?? fail();
  /** @type {number} */
  let cameraX;
  /** @type {number} */
  let cameraY;
  /** @type {number} */
  let cameraScale;

  if (peerPlayers) {
    cameraX = lin(prevPeerPlayers?.camera.x, peerPlayers.camera.x, alpha);
    cameraY = lin(prevPeerPlayers?.camera.y, peerPlayers.camera.y, alpha);
    cameraScale = lin(prevPeerPlayers?.camera.scale, peerPlayers.camera.scale, alpha);
  } else {
    cameraX = lin(prev?.camera.x, curr.camera.x, alpha);
    cameraY = lin(prev?.camera.y, curr.camera.y, alpha);
    cameraScale = lin(prev?.camera.scale, curr.camera.scale, alpha);
  }

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
