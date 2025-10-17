import { fail, lin, now } from "../lib/utils.js";
import { AVATAR, avatarRender, avatarTick } from "./avatar.js";
import { BULLET } from "./bullet.js";
import { boxLevelTick, boxOnPointCollision } from "./collision.js";
import { renderGun as renderPistol } from "./guns.js";
import { getTile, levels } from "./levels.js";

const CANVAS_SCALE = 40;

export const init = () =>
  /** @type {Game} */ ({
    tick: 0,
    originTime: now(),
    avatarCount: 0,
    avatars: {},
    bullets: {},
    autoid: 0,
    random: 0,
    camera: {
      x: 0,
      y: 0,
    },
    level: 1,
    guns: {},
    debug_points: [],
  });

/** @type {GameFunc<Game>} */
export const tick = (game, inputs) => {
  const level = levels[game.level] ?? fail();

  if (game.tick === 1) {
    game.camera.x = level.width / 2;
    game.camera.y = level.height / 2;
  } else {
    let meanX = 0;
    let meanY = 0;
    let count = 0;
    for (const deviceID in game.avatars) {
      const avatar = game.avatars[deviceID] ?? fail();
      meanX += avatar.box.x;
      meanY += avatar.box.y;
      count += 1;
    }
    if (count) {
      meanX /= count;
      meanY /= count;
      game.camera.x -= (game.camera.x - meanX) / 32;
      game.camera.y -= (game.camera.y - meanY) / 32;
    }
  }

  bulletLoop: for (const bulletId in game.bullets) {
    const bullet = game.bullets[bulletId] ?? fail();
    bullet.dy += BULLET.GRAVITY;
    bullet.x += bullet.dx;
    bullet.y += bullet.dy;

    if (
      Math.floor(bullet.x) <= 0 ||
      Math.floor(bullet.x) >= level.width - 1 ||
      Math.floor(bullet.y) <= 0 ||
      Math.floor(bullet.y) >= level.height - 1 ||
      getTile(level, bullet.x, bullet.y) === 1
    ) {
      delete game.bullets[bulletId];
      continue;
    }

    for (const deviceID in game.avatars) {
      const avatar = game.avatars[deviceID] ?? fail();

      if (boxOnPointCollision(avatar.box, bullet.x, bullet.y)) {
        avatar.body.dx += bullet.dx;
        avatar.body.dy += bullet.dy;
        avatar.face = AVATAR.FACE.DAMAGE;
        avatar.faceTicks = 30;
        avatar.health--;

        if (avatar.health <= 0) {
          delete game.avatars[deviceID];
        }

        delete game.bullets[bulletId];
        continue bulletLoop;
      }
    }
  }

  for (const deviceID in inputs) {
    if (game.avatars[deviceID] === undefined) {
      const spawnPointAvatarDistances = level.spawnPoints
        .map((spawnPoint) => {
          const avatars = Object.values(game.avatars);
          const distances = avatars.map((p) => Math.hypot(p.box.x - spawnPoint.x, p.box.y - spawnPoint.y));
          return /** @type {const} */ ([spawnPoint, Math.min(...distances)]);
        })
        .toSorted(([_, aDist], [__, bDist]) => bDist - aDist);

      const safestSpawnPoint = spawnPointAvatarDistances[0]?.[0] ?? fail();

      const color = AVATAR.COLORS[++game.avatarCount % AVATAR.COLORS.length] ?? fail();

      game.avatars[deviceID] = {
        box: {
          x: safestSpawnPoint.x,
          y: safestSpawnPoint.y,
          dx: 0,
          dy: 0,
          width: AVATAR.WIDTH,
          height: AVATAR.HEIGHT,

          bounce: 0,

          wallTop: false,
          wallBottom: false,
          wallLeft: false,
          wallRight: false,
        },
        gun: undefined,

        jumpHeld: 0,
        fallingTicks: 0,
        color,
        facing: 1,
        face: AVATAR.FACE.PASSIVE,
        faceTicks: -1,
        health: 8,
        crouching: false,

        feet: {
          angle: 0,
          leftX: safestSpawnPoint.x,
          leftY: safestSpawnPoint.y,
          rightX: safestSpawnPoint.x,
          rightY: safestSpawnPoint.y,
          leftStartX: safestSpawnPoint.x,
          leftStartY: safestSpawnPoint.y,

          rightStartX: safestSpawnPoint.x,
          rightStartY: safestSpawnPoint.y,
          leftKneeX: safestSpawnPoint.x,
          leftKneeY: safestSpawnPoint.y,
          rightKneeX: safestSpawnPoint.x,
          rightKneeY: safestSpawnPoint.y,
        },
        primaryArm: {
          vx: 1,
          vy: 0,
          dangle: 0,
          ddistance: 0,
          distance: 0,
        },
        body: {
          angle: 0,
          x: safestSpawnPoint.x,
          y: safestSpawnPoint.y,
          dx: 0,
          dy: 0,
        },
      };

      game.guns[game.autoid++] = {
        box: {
          x: safestSpawnPoint.x,
          y: safestSpawnPoint.y,
          dx: 0,
          dy: 0,
          width: 0.7,
          height: 0.7,
          bounce: 0.5,
          wallBottom: false,
          wallLeft: false,
          wallRight: false,
          wallTop: false,
        },
        cooldown: 0,
        ticksUntilPickup: 0,
        type: 0,
      };
    }

    const avatar = game.avatars[deviceID];
    const device = inputs[deviceID] ?? fail();

    if (device.is_gamepad) {
      let aimX = device.rstickx ?? 0;
      let aimY = device.rsticky ?? 0;
      const aimDist = Math.hypot(aimX, aimY);

      let moveX = device.lstickx ?? 0;
      let moveY = device.lsticky ?? 0;
      const moveDist = Math.hypot(moveX, moveY);

      if (moveDist < 0.15) {
        moveX = 0;
        moveY = 0;
      }

      if (aimDist > 0.5) {
        aimX /= aimDist;
        aimY /= aimDist;
      } else if (moveDist >= 0.15) {
        aimX = moveX / moveDist;
        aimY = moveY / moveDist;
      } else {
        aimX = avatar.primaryArm.vx;
        aimY = avatar.primaryArm.vy;
      }

      avatarTick(
        game,
        level,
        avatar,
        moveX,
        moveY,
        aimX,
        aimY,
        device.buttona === 1 || device.lt === 1,
        device.buttonb === 1,
        device.rt === 1
      );
    } else {
      const mouseX = (device.mousex ?? 0) / CANVAS_SCALE + game.camera.x;
      const mouseY = (device.mousey ?? 0) / CANVAS_SCALE + game.camera.y;

      let aimX = mouseX - avatar.body.x;
      let aimY = mouseY - avatar.body.y;
      const aimDist = Math.hypot(aimX, aimY);

      aimX /= aimDist;
      aimY /= aimDist;

      avatarTick(
        game,
        level,
        avatar,
        (device?.d ?? 0) - (device?.a ?? 0),
        (device?.s ?? 0) - (device?.w ?? 0),
        aimX,
        aimY,
        Boolean(device.space || device.w),
        Boolean(device.r),
        Boolean(device.mouseleftbutton)
      );
    }
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

    boxLevelTick(level, gun.box);
  }
};

/** @type {RenderFunc<Game>} */
export const render = (ctx, prev, curr, alpha) => {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  const level = levels[curr.level] ?? fail();

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(width / 2, height / 2);
  ctx.scale(CANVAS_SCALE, CANVAS_SCALE);
  ctx.translate(-lin(prev.camera.x, curr.camera.x, alpha), -lin(prev.camera.y, curr.camera.y, alpha));

  ctx.drawImage(level.canvas, 0, 0);

  for (const gunID in curr.guns) {
    const prevGun = prev.guns[gunID];
    const gun = curr.guns[gunID] ?? fail();
    const x = lin(prevGun?.box.x, gun.box.x, alpha);
    const y = lin(prevGun?.box.y, gun.box.y, alpha);

    // boxRender(ctx, prevGun?.box, gun.box, "red", alpha);
    renderPistol(ctx, x + gun.box.width / 2, y + gun.box.height / 2, x);
  }

  for (const deviceID in curr.avatars) {
    const avatar = curr.avatars[deviceID] ?? fail();
    const prevAvatar = prev.avatars[deviceID];

    // boxRender(ctx, prevAvatar?.box, avatar.box, "red", alpha);
    avatarRender(ctx, prevAvatar, avatar, alpha);
  }

  for (const bulletId in curr.bullets) {
    const prevBullet = prev.bullets[bulletId];
    const bullet = curr.bullets[bulletId] ?? fail();

    ctx.fillStyle = "red";
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 0.1;
    ctx.beginPath();
    if (prevBullet) {
      ctx.fillStyle = "white";
      ctx.strokeStyle = ctx.fillStyle;
      const bulletSize = 0.05;
      const dx = bullet.dx;
      const dy = bullet.dy;
      const bulletAngle = Math.atan2(dy, dx);
      const mag = Math.hypot(dx, dy);
      ctx.ellipse(
        lin(prevBullet.x, bullet.x, alpha),
        lin(prevBullet.y, bullet.y, alpha),
        bulletSize,
        Math.max(bulletSize, mag / 1.5),
        bulletAngle + Math.PI / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  for (const [x, y] of curr.debug_points) {
    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.arc(x, y, 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
};
