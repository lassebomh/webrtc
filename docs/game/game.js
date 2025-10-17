import { fail, lin, now } from "../lib/utils.js";
import { AVATAR, avatarRender, avatarTakeDamage, avatarTick, createAvatar } from "./avatar.js";
import { BULLET } from "./bullet.js";
import { boxLevelTick, boxOnPointCollision } from "./collision.js";
import { renderGun as renderPistol } from "./guns.js";
import { getTile, levels } from "./levels.js";
import { particleCreate, particleRender, particleTick } from "./particle.js";
import { random } from "./utils.js";

const CANVAS_SCALE = 60;

export const init = () =>
  /** @type {Game} */ ({
    tick: 0,
    originTime: now(),
    avatarCount: 0,
    players: {},
    avatars: {},
    bullets: {},
    particles: {},
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
    game.camera.x = level.width / 2 + 0.1;
    game.camera.y = level.height / 2 + 0.1;
  }

  let avatarMeanX = 0;
  let avatarMeanY = 0;
  let avatarCount = 0;

  for (const deviceID in inputs) {
    game.players[deviceID] ??= {
      avatarID: undefined,
      color: AVATAR.COLORS[Object.keys(game.players).length % AVATAR.COLORS.length] ?? fail(),
    };
  }

  for (const particleID in game.particles) {
    const particle = game.particles[particleID] ?? fail();
    particleTick(game, particle);
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
      for (let i = 0; i < 2; i++) {
        particleCreate(
          game,
          bullet.x,
          bullet.y,
          -bullet.dx + random(game, -0.1, 0.1),
          -bullet.dy + random(game, -0.1, 0.1),
          0.05,
          1.15,
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

  for (const deviceID in game.players) {
    const device = inputs[deviceID] ?? fail();
    const player = game.players[deviceID] ?? fail();

    const start = device.mouseleftbutton || device.buttona;

    let avatar = player.avatarID ? game.avatars[player.avatarID] ?? fail() : undefined;

    if (player.avatarID === undefined && start) {
      const spawnPointAvatarDistances = level.spawnPoints
        .map((spawnPoint) => {
          const avatars = Object.values(game.avatars);
          const distances = avatars.map((p) => Math.hypot(p.box.x - spawnPoint.x, p.box.y - spawnPoint.y));
          return /** @type {const} */ ([spawnPoint, Math.min(...distances)]);
        })
        .toSorted(([_, aDist], [__, bDist]) => bDist - aDist);

      const safestSpawnPoint = spawnPointAvatarDistances[0]?.[0] ?? fail();

      avatar = createAvatar(game, safestSpawnPoint.x, safestSpawnPoint.y, player.color);
      game.avatars[avatar.id] = avatar;
      player.avatarID = avatar.id;

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

    if (!avatar) continue;

    /** @type {number} */
    let moveX;
    /** @type {number} */
    let moveY;
    /** @type {number} */
    let aimX;
    /** @type {number} */
    let aimY;
    /** @type {boolean} */
    let jump;
    /** @type {boolean} */
    let drop;
    /** @type {boolean} */
    let fire;

    if (device.is_gamepad) {
      aimX = device.rstickx ?? 0;
      aimY = device.rsticky ?? 0;
      const aimDist = Math.hypot(aimX, aimY);

      moveX = device.lstickx ?? 0;
      moveY = device.lsticky ?? 0;
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

      jump = device.buttona === 1 || device.lt === 1;
      drop = device.buttonb === 1;
      fire = device.rt === 1;
    } else {
      moveX = (device?.d ?? 0) - (device?.a ?? 0);
      moveY = (device?.s ?? 0) - (device?.w ?? 0);

      const mouseX = (device.mousex ?? 0) / CANVAS_SCALE + game.camera.x;
      const mouseY = (device.mousey ?? 0) / CANVAS_SCALE + game.camera.y;

      aimX = mouseX - avatar.body.x;
      aimY = mouseY - avatar.body.y;
      const aimDist = Math.hypot(aimX, aimY);

      aimX /= aimDist;
      aimY /= aimDist;

      jump = Boolean(device.space || device.w);
      drop = Boolean(device.r);
      fire = Boolean(device.mouseleftbutton);
    }

    avatarTick(game, level, avatar, moveX, moveY, aimX, aimY, jump, drop, fire);

    avatarMeanX += avatar.box.x;
    avatarMeanY += avatar.box.y;
    avatarCount += 1;
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

  for (const avatarID in curr.avatars) {
    const avatar = curr.avatars[avatarID] ?? fail();
    const prevAvatar = prev.avatars[avatarID];

    // boxRender(ctx, prevAvatar?.box, avatar.box, "red", alpha);
    avatarRender(ctx, prevAvatar, avatar, alpha);
  }

  for (const bulletId in curr.bullets) {
    const prevBullet = prev.bullets[bulletId];
    const bullet = curr.bullets[bulletId] ?? fail();

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
