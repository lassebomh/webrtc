import { fail, lin, now } from "../lib/utils.js";
import { boxLevelTick, boxOnBoxCollision, boxOnPointCollision, boxRender } from "./collision.js";
import { getTile, levels } from "./levels.js";

const CANVAS_SCALE = 30;
const PLAYER = {
  SPEED: 0.04,
  HORIZONTAL_FRICTION: 1.2,
  VERTICAL_FRICTION: 1.2,
  CROUCH_GRAVITY: 0.06,
  HELD_GRAVITY: 0.02,
  GRAVITY: 0.05,
  MAX_FALL_SPEED: 0.8,
  WIDTH: 0.85,
  HEIGHT: 1.1,
  CROUCH_HEIGHT: 0.9,
  LEG_LENGTH: 0.5,
  ARM_LENGTH: 1,
  JUMP: 0.4,
  JUMP_EASE_BOUNCE_TICKS: 6,
  JUMP_EASE_EDGE_TICKS: 6,
  COLORS: ["red", "green", "orange", "blue"],
  FACE: {
    PASSIVE: ":|",
    DAMAGE: ":o",
  },
};

const BULLET = {
  SPEED: 0.8,
  GRAVITY: 0.03,
};

export const init = () =>
  /** @type {Game} */ ({
    tick: 0,
    originTime: now(),
    playerCount: 0,
    players: {},
    bullets: {},
    autoid: 0,
    random: 0,
    camera: {
      x: 0,
      y: 0,
    },
    level: 0,
    guns: {},
    debug_points: [],
  });

/** @type {GameFunc<Game>} */
export const tick = (game, inputs) => {
  const level = levels[game.level] ?? fail();

  if (game.tick === 1) {
    game.camera.x = level.width / 2;
    game.camera.y = level.height / 2;

    game.guns[game.autoid++] = {
      box: {
        x: 3,
        y: 3,
        dx: 0,
        dy: 0,
        width: 0.5,
        height: 0.4,
        bounce: 0.2,
        wallBottom: false,
        wallLeft: false,
        wallRight: false,
        wallTop: false,
      },
      ticksUntilPickup: 0,
      type: 0,
    };
  } else {
    // let meanX = 0;
    // let meanY = 0;
    // let count = 0;
    // for (const deviceID in game.players) {
    //   const player = game.players[deviceID] ?? fail();
    //   meanX += player.x;
    //   meanY += player.y;
    //   count += 1;
    // }
    // if (count) {
    //   meanX /= count;
    //   meanY /= count;
    //   game.camera.x -= (game.camera.x - meanX) / 32;
    //   game.camera.y -= (game.camera.y - meanY) / 32;
    // }
  }

  /**
   * @param {number} a
   * @param {number} b
   * @returns {number}
   */
  function random(a = 0, b = 1) {
    let t = (game.random += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return a + (b - a) * r;
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

    for (const deviceID in game.players) {
      const player = game.players[deviceID] ?? fail();

      if (boxOnPointCollision(player.box, bullet.x, bullet.y)) {
        player.body.dx += bullet.dx;
        player.body.dy += bullet.dy;
        player.face = PLAYER.FACE.DAMAGE;
        player.faceTicks = 30;
        player.health--;

        if (player.health <= 0) {
          delete game.players[deviceID];
        }

        delete game.bullets[bulletId];
        continue bulletLoop;
      }
    }
  }

  for (const deviceID in inputs) {
    if (game.players[deviceID] === undefined) {
      const spawnPointPlayerDistances = level.spawnPoints
        .map((spawnPoint) => {
          const players = Object.values(game.players);
          const distances = players.map((p) => Math.hypot(p.box.x - spawnPoint.x, p.box.y - spawnPoint.y));
          return /** @type {const} */ ([spawnPoint, Math.min(...distances)]);
        })
        .toSorted(([_, aDist], [__, bDist]) => bDist - aDist);

      const safestSpawnPoint = spawnPointPlayerDistances[0]?.[0] ?? fail();

      const color = PLAYER.COLORS[++game.playerCount % PLAYER.COLORS.length] ?? fail();

      game.players[deviceID] = {
        box: {
          x: safestSpawnPoint.x,
          y: safestSpawnPoint.y,
          dx: 0,
          dy: 0,
          width: PLAYER.WIDTH,
          height: PLAYER.HEIGHT,

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
        face: PLAYER.FACE.PASSIVE,
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
          angle: 0,
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
        // gun: {
        //   cooldown: 0,
        //   angle: 0,
        //   x: safestSpawnPoint.x,
        //   y: safestSpawnPoint.y,
        //   da: 0,
        //   dm: 0,
        // },
      };
    }

    const player = game.players[deviceID];
    const device = inputs[deviceID] ?? fail();

    const mouseX = (device.mousex ?? 0) / CANVAS_SCALE + game.camera.x;
    const mouseY = (device.mousey ?? 0) / CANVAS_SCALE + game.camera.y;

    const pressingJump = device[" "] || device["w"];

    const pressingCrouch = device.s;

    const targetHeight = pressingCrouch ? PLAYER.CROUCH_HEIGHT : PLAYER.HEIGHT;
    const heightDiff = player.box.height - targetHeight;

    if (heightDiff !== 0) {
      player.box.height = targetHeight;
      player.box.y += heightDiff;
    }

    if (pressingJump) {
      if (player.jumpHeld !== -1) {
        player.jumpHeld += 1;
      }
    } else {
      player.jumpHeld = 0;
    }

    if (player.box.wallBottom || player.box.wallLeft || player.box.wallRight) {
      player.fallingTicks = 0;
    } else {
      player.fallingTicks++;
    }

    if (!player.box.wallBottom) {
      if (!pressingCrouch && (player.jumpHeld || player.box.dy >= 0)) {
        player.box.dy += PLAYER.HELD_GRAVITY;
      } else {
        player.box.dy += PLAYER.GRAVITY;
      }

      if (player.box.dy > PLAYER.MAX_FALL_SPEED) {
        player.box.dy = PLAYER.MAX_FALL_SPEED;
      }
    }

    const canJump =
      player.jumpHeld > 0 &&
      player.jumpHeld <= PLAYER.JUMP_EASE_BOUNCE_TICKS &&
      player.fallingTicks <= PLAYER.JUMP_EASE_EDGE_TICKS;

    if (canJump) {
      player.box.dy = -PLAYER.JUMP;

      if (player.box.wallLeft) {
        player.box.dx = PLAYER.JUMP;
      } else if (player.box.wallRight) {
        player.box.dx = -PLAYER.JUMP;
      }

      player.jumpHeld = -1;
    }

    if (!player.box.wallLeft && device?.a) {
      player.box.dx -= PLAYER.SPEED;
    }
    if (!player.box.wallRight && device?.d) {
      player.box.dx += PLAYER.SPEED;
    }

    player.box.dx /= PLAYER.HORIZONTAL_FRICTION;

    if (!pressingCrouch && (player.box.wallLeft || player.box.wallRight) && player.box.dy > 0) {
      player.box.dy /= PLAYER.VERTICAL_FRICTION;
    }

    if (player.box.dx !== 0) {
      player.facing = Math.sign(player.box.dx);
    }

    player.body.dx -= (player.body.dx - player.box.dx * 2) / 3;
    player.body.dy -= (player.body.dy - player.box.dy * 2) / 3;

    player.body.x += player.body.dx;
    player.body.y += player.body.dy;

    player.body.x -= (player.body.x - (player.box.x + player.box.width / 2 - player.box.dx)) / 3;
    player.body.y -= (player.body.y - (player.box.y + player.box.width / 2 - player.box.dy)) / 3;

    const gaitAngle = player.box.x * 2;
    const gaitMagnitudeHorizontal = 0.3;
    const gaitMagnitudeVertical = 0.2;
    const legStartDistanceFromBody = 1 / 4;

    const movingLegAlpha = Math.max(0, Math.min(Math.abs(player.box.dx * 5) - player.fallingTicks / 15, 1));

    const baseLeftX = player.box.x + player.box.width * legStartDistanceFromBody;
    const baseLeftY = player.box.y + player.box.height;

    player.body.y += lin(0, Math.cos(gaitAngle) / 50, movingLegAlpha);

    player.feet.leftX = lin(baseLeftX, baseLeftX + Math.cos(gaitAngle) * gaitMagnitudeHorizontal, movingLegAlpha);
    player.feet.leftY = Math.min(
      baseLeftY,
      lin(baseLeftY, baseLeftY + Math.sin(gaitAngle) * gaitMagnitudeVertical, movingLegAlpha)
    );

    player.feet.leftStartX = player.body.x - player.box.width / 3;
    player.feet.leftStartY = player.body.y + player.box.width / 3;

    const baseRightX = player.box.x + player.box.width * (1 - legStartDistanceFromBody);
    const baseRightY = player.box.y + player.box.height;

    player.feet.rightX = lin(
      baseRightX,
      baseRightX + Math.cos(Math.PI + gaitAngle) * gaitMagnitudeHorizontal,
      movingLegAlpha
    );
    player.feet.rightY = Math.min(
      baseRightY,
      lin(baseRightY, baseRightY + Math.sin(Math.PI + gaitAngle) * gaitMagnitudeVertical, movingLegAlpha)
    );

    player.feet.rightStartX = player.body.x + player.box.width / 3;
    player.feet.rightStartY = player.body.y + player.box.width / 3;

    if (player.facing === 1) {
      [player.feet.leftKneeX, player.feet.leftKneeY] = getPointAtDistance(
        player.feet.leftX,
        player.feet.leftY,
        player.feet.leftStartX,
        player.feet.leftStartY,
        PLAYER.LEG_LENGTH
      );

      [player.feet.rightKneeX, player.feet.rightKneeY] = getPointAtDistance(
        player.feet.rightX,
        player.feet.rightY,
        player.feet.rightStartX,
        player.feet.rightStartY,
        PLAYER.LEG_LENGTH
      );
    } else {
      [player.feet.leftKneeX, player.feet.leftKneeY] = getPointAtDistance(
        player.feet.leftStartX,
        player.feet.leftStartY,
        player.feet.leftX,
        player.feet.leftY,
        PLAYER.LEG_LENGTH
      );
      [player.feet.rightKneeX, player.feet.rightKneeY] = getPointAtDistance(
        player.feet.rightStartX,
        player.feet.rightStartY,
        player.feet.rightX,
        player.feet.rightY,
        PLAYER.LEG_LENGTH
      );
    }

    // const gunDistance = 0.8;
    // let firing = false;
    // if (device.mouseleftbutton && player.gun.cooldown === 0) {
    //   player.gun.da += Math.sign(Math.sin(player.gun.angle));
    //   player.gun.dm += 0.6;
    //   player.gun.cooldown = 10;
    //   firing = true;
    // }

    // if (player.gun.cooldown > 1) {
    //   player.gun.cooldown--;
    // } else if (player.gun.cooldown === 1 && !device.mouseleftbutton) {
    //   player.gun.cooldown = 0;
    // }

    // if (firing) {
    //   game.bullets[game.autoid++] = {
    //     x: player.gun.x,
    //     y: player.gun.y,
    //     dx: Math.sin(player.gun.angle) * BULLET.SPEED,
    //     dy: Math.cos(player.gun.angle) * BULLET.SPEED,
    //   };
    // }
    // player.gun.angle = Math.atan2(mouseX - player.body.x, mouseY - player.body.y) + player.gun.da;

    // player.gun.x -=
    //   (player.gun.x - (player.body.x + Math.sin(player.gun.angle) * (gunDistance - player.gun.dm))) / 3 - player.dx / 3;
    // player.gun.y -=
    //   (player.gun.y - (player.body.y + Math.cos(player.gun.angle) * (gunDistance - player.gun.dm))) / 3 - player.dy / 3;

    // player.gun.da /= 1.5;
    // player.gun.dm /= 1.5;

    const primaryArmAngle = Math.atan2(mouseX - player.body.x, mouseY - player.body.y);
    const primaryArmDistance = Math.hypot(mouseX - player.body.x, mouseY - player.body.y);

    player.primaryArm.angle = primaryArmAngle;
    player.primaryArm.distance = primaryArmDistance;

    // player.x += player.dx;
    // player.y += player.dy;

    boxLevelTick(level, player.box);

    if (player.faceTicks === 0) {
      player.face = PLAYER.FACE.PASSIVE;
      player.faceTicks = -1;
    } else if (player.faceTicks > 0) {
      player.faceTicks--;
    }

    if (player.gun === undefined) {
      for (const gunID in game.guns) {
        const gun = game.guns[gunID] ?? fail();
        if (gun.ticksUntilPickup !== 0) continue;
        if (boxOnBoxCollision(player.box, gun.box)) {
          player.gun = gun;
          delete game.guns[gunID];
        }
      }
    }

    if (player.gun !== undefined && device.r) {
      game.guns[game.autoid++] = player.gun;
      player.gun.box.x = player.body.x;
      player.gun.box.y = player.body.y;
      player.gun.box.dx = Math.sin(player.primaryArm.angle);
      player.gun.box.dy = Math.cos(player.primaryArm.angle);
      player.gun.ticksUntilPickup = 30;
      player.gun = undefined;
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
/**
 * @param {number} startX
 * @param {number} startY
 * @param {number} endX
 * @param {number} endY
 * @param {number} value
 * @returns {[number, number]}
 */
function getPointAtDistance(startX, startY, endX, endY, value) {
  const halfDist = value / 2;

  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;

  const dx = endX - startX;
  const dy = endY - startY;
  const segmentLength = Math.hypot(dx, dy);

  if (segmentLength === 0) {
    return [startX + halfDist, startY];
  }

  let offset = Math.sqrt(Math.pow(halfDist, 2) - Math.pow(segmentLength / 2, 2));

  if (!Number.isFinite(offset)) {
    offset = 0;
  }

  let orthoX = -dy / segmentLength;
  let orthoY = dx / segmentLength;

  const pointX = midX + orthoX * offset;
  const pointY = midY + orthoY * offset;

  return [pointX, pointY];
}

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

    boxRender(ctx, prevGun?.box, gun.box, "orange", alpha);
  }

  for (const deviceID in curr.players) {
    const player = curr.players[deviceID] ?? fail();
    const prevPlayer = prev.players[deviceID];

    boxRender(ctx, prevPlayer?.box, player.box, "red", alpha);

    const bodyX = lin(prevPlayer?.body.x, player.body.x, alpha);
    const bodyY = lin(prevPlayer?.body.y, player.body.y, alpha);
    const primaryArmAngle = lin(prevPlayer?.primaryArm.angle, player.primaryArm.angle, 1);
    const primaryArmDistance = lin(prevPlayer?.primaryArm.distance, player.primaryArm.distance, 1);

    const feetLeftStartX = lin(prevPlayer?.feet.leftStartX, player.feet.leftStartX, alpha);
    const feetLeftStartY = lin(prevPlayer?.feet.leftStartY, player.feet.leftStartY, alpha);
    const feetLeftEndX = lin(prevPlayer?.feet.leftX, player.feet.leftX, alpha);
    const feetLeftEndY = lin(prevPlayer?.feet.leftY, player.feet.leftY, alpha);
    const feetLeftKneeX = lin(prevPlayer?.feet.leftKneeX, player.feet.leftKneeX, alpha);
    const feetLeftKneeY = lin(prevPlayer?.feet.leftKneeY, player.feet.leftKneeY, alpha);

    const feetRightStartX = lin(prevPlayer?.feet.rightStartX, player.feet.rightStartX, alpha);
    const feetRightStartY = lin(prevPlayer?.feet.rightStartY, player.feet.rightStartY, alpha);
    const feetRightEndX = lin(prevPlayer?.feet.rightX, player.feet.rightX, alpha);
    const feetRightEndY = lin(prevPlayer?.feet.rightY, player.feet.rightY, alpha);
    const feetRightKneeX = lin(prevPlayer?.feet.rightKneeX, player.feet.rightKneeX, alpha);
    const feetRightKneeY = lin(prevPlayer?.feet.rightKneeY, player.feet.rightKneeY, alpha);

    ctx.fillStyle = player.color;
    ctx.strokeStyle = player.color;
    ctx.lineWidth = 0.1;

    ctx.beginPath();
    ctx.arc(bodyX, bodyY, player.box.width / 1.9, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(feetLeftStartX, feetLeftStartY);
    ctx.quadraticCurveTo(feetLeftKneeX, feetLeftKneeY, feetLeftEndX, feetLeftEndY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(feetRightStartX, feetRightStartY);
    ctx.quadraticCurveTo(feetRightKneeX, feetRightKneeY, feetRightEndX, feetRightEndY);
    ctx.stroke();

    {
      const primaryArmVecX = Math.sin(primaryArmAngle);
      const primaryArmVecY = Math.cos(primaryArmAngle);
      const armStartX = bodyX + primaryArmVecX * (player.box.width / 4);
      const armStartY = bodyY + primaryArmVecY * (player.box.width / 4);
      const armEndX = bodyX + primaryArmVecX * primaryArmDistance;
      const armEndY = bodyY + primaryArmVecY * primaryArmDistance;

      let armElbowX;
      let armElbowY;

      const armLength = PLAYER.ARM_LENGTH * primaryArmVecX;

      if (primaryArmAngle < 0) {
        [armElbowX, armElbowY] = getPointAtDistance(armEndX, armEndY, armStartX, armStartY, armLength);
      } else {
        [armElbowX, armElbowY] = getPointAtDistance(armStartX, armStartY, armEndX, armEndY, armLength);
      }

      ctx.beginPath();
      ctx.moveTo(armStartX, armStartY);
      ctx.quadraticCurveTo(armElbowX, armElbowY, armEndX, armEndY);
      ctx.stroke();
    }

    // const gunX = lin(prevPlayer?.gun.x, player.gun.x, alpha);
    // const gunY = lin(prevPlayer?.gun.y, player.gun.y, alpha);
    // let gunAngle;

    // if (prevPlayer?.gun.angle && Math.abs(prevPlayer.gun.angle - player.gun.angle) < Math.PI / 2) {
    //   gunAngle = lin(prevPlayer?.gun.angle, player.gun.angle, alpha);
    // } else {
    //   gunAngle = player.gun.angle;
    // }

    // const forwardX = Math.sin(gunAngle);
    // const forwardY = Math.cos(gunAngle);
    // const downX = Math.sin(gunAngle - Math.PI / 2);
    // const downY = Math.cos(gunAngle - Math.PI / 2);
    // {
    // const armStartX = bodyX + forwardX * (player.width / 3);
    // const armStartY = bodyY + forwardY * (player.width / 3);
    // const armEndX = lin(prevPlayer?.gun.x, player.gun.x, alpha);
    // const armEndY = lin(prevPlayer?.gun.y, player.gun.y, alpha);

    // let armElbowX;
    // let armElbowY;

    // const armLength = PLAYER.ARM_LENGTH * Math.sin(player.gun.angle);

    // if (player.gun.angle < 0) {
    //   [armElbowX, armElbowY] = getPointAtDistance(armEndX, armEndY, armStartX, armStartY, armLength);
    // } else {
    //   [armElbowX, armElbowY] = getPointAtDistance(armStartX, armStartY, armEndX, armEndY, armLength);
    // }

    // ctx.beginPath();
    // ctx.moveTo(armStartX, armStartY);
    // ctx.quadraticCurveTo(armElbowX, armElbowY, armEndX, armEndY);
    // ctx.stroke();

    //   ctx.lineWidth = 0.2;

    //   const gunLength = 0.4;

    //   ctx.strokeStyle = "#999";
    //   ctx.beginPath();
    //   ctx.moveTo(
    //     gunX + forwardX * (ctx.lineWidth / 2) - forwardX * 0.1,
    //     gunY + forwardY * (ctx.lineWidth / 2) - forwardY * 0.1
    //   );
    //   ctx.lineTo(
    //     gunX + downX * gunLength * 0.6 * forwardX + forwardX * (ctx.lineWidth / 2) - forwardX * 0.1,
    //     gunY + downY * gunLength * 0.6 * forwardX + forwardY * (ctx.lineWidth / 2) - forwardY * 0.1
    //   );

    //   ctx.moveTo(gunX - forwardX * 0.1, gunY - forwardY * 0.1);
    //   ctx.lineTo(gunX + forwardX * gunLength - forwardX * 0.1, gunY + forwardY * gunLength - forwardY * 0.1);
    //   ctx.stroke();
    // }

    ctx.save();
    ctx.textAlign = "end";
    ctx.translate(bodyX + player.body.dx / 2 - 0.12, bodyY + player.body.dy / 2 + 0.2);
    ctx.rotate(Math.PI / 2);
    ctx.font = "normal 0.5px sans-serif";
    ctx.fillStyle = "black";
    ctx.fillText(player.face, 0, 0);
    ctx.restore();
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
