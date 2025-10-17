import { fail, lin } from "../lib/utils.js";
import { BULLET } from "./bullet.js";
import { boxLevelTick, boxOnBoxCollision } from "./collision.js";
import { renderGun } from "./guns.js";
import { getPointAtDistance, random } from "./utils.js";

export const AVATAR = {
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

/**
 *
 * @param {Game} game
 * @param {Level} level
 * @param {Avatar} avatar
 * @param {number} moveX
 * @param {number} moveY
 * @param {number} aimX
 * @param {number} aimY
 * @param {boolean} jump
 * @param {boolean} drop
 * @param {boolean} fire
 */
export function avatarTick(game, level, avatar, moveX, moveY, aimX, aimY, jump, drop, fire) {
  const pressingCrouch = moveY > 0.6;

  const targetHeight = lin(AVATAR.HEIGHT, AVATAR.CROUCH_HEIGHT, Math.min(1, Math.max(0, (moveY - 0.6) / (1 - 0.6))));
  const heightDiff = avatar.box.height - targetHeight;

  if (heightDiff !== 0) {
    avatar.box.height = targetHeight;
    avatar.box.y += heightDiff;
  }

  if (jump) {
    if (avatar.jumpHeld !== -1) {
      avatar.jumpHeld += 1;
    }
  } else {
    avatar.jumpHeld = 0;
  }

  if (avatar.box.wallBottom || avatar.box.wallLeft || avatar.box.wallRight) {
    avatar.fallingTicks = 0;
  } else {
    avatar.fallingTicks++;
  }

  if (!avatar.box.wallBottom) {
    if (avatar.jumpHeld || avatar.box.dy >= 0) {
      avatar.box.dy += AVATAR.HELD_GRAVITY;
    } else {
      avatar.box.dy += AVATAR.GRAVITY;
    }

    if (avatar.box.dy > AVATAR.MAX_FALL_SPEED) {
      avatar.box.dy = AVATAR.MAX_FALL_SPEED;
    }
  }

  const canJump =
    avatar.jumpHeld > 0 &&
    avatar.jumpHeld <= AVATAR.JUMP_EASE_BOUNCE_TICKS &&
    avatar.fallingTicks <= AVATAR.JUMP_EASE_EDGE_TICKS;

  if (canJump) {
    avatar.box.dy = -AVATAR.JUMP;

    if (avatar.box.wallLeft) {
      avatar.box.dx = AVATAR.JUMP;
    } else if (avatar.box.wallRight) {
      avatar.box.dx = -AVATAR.JUMP;
    }

    avatar.jumpHeld = -1;
  }

  if (!avatar.box.wallLeft && moveX < -0.2) {
    avatar.box.dx += AVATAR.SPEED * moveX;
  }
  if (!avatar.box.wallRight && moveX > 0.2) {
    avatar.box.dx += AVATAR.SPEED * moveX;
  }

  avatar.box.dx /= AVATAR.HORIZONTAL_FRICTION;

  if (!pressingCrouch && (avatar.box.wallLeft || avatar.box.wallRight) && avatar.box.dy > 0) {
    avatar.box.dy /= AVATAR.VERTICAL_FRICTION;
  }

  if (avatar.box.dx !== 0) {
    avatar.facing = Math.sign(avatar.box.dx);
  }

  avatar.body.dx -= (avatar.body.dx - avatar.box.dx * 2) / 3;
  avatar.body.dy -= (avatar.body.dy - avatar.box.dy * 2) / 3;

  avatar.body.x += avatar.body.dx;
  avatar.body.y += avatar.body.dy;

  avatar.body.x -= (avatar.body.x - (avatar.box.x + avatar.box.width / 2 - avatar.box.dx)) / 3;
  avatar.body.y -= (avatar.body.y - (avatar.box.y + avatar.box.width / 2 - avatar.box.dy)) / 3;

  const gaitAngle = avatar.box.x * 2;
  const gaitMagnitudeHorizontal = 0.3;
  const gaitMagnitudeVertical = 0.2;
  const legStartDistanceFromBody = 1 / 4;

  const movingLegAlpha = Math.max(0, Math.min(Math.abs(avatar.box.dx * 5) - avatar.fallingTicks / 15, 1));

  const baseLeftX = avatar.box.x + avatar.box.width * legStartDistanceFromBody;
  const baseLeftY = avatar.box.y + avatar.box.height;

  avatar.body.y += lin(0, Math.cos(gaitAngle) / 50, movingLegAlpha);

  avatar.feet.leftX = lin(baseLeftX, baseLeftX + Math.cos(gaitAngle) * gaitMagnitudeHorizontal, movingLegAlpha);
  avatar.feet.leftY = Math.min(
    baseLeftY,
    lin(baseLeftY, baseLeftY + Math.sin(gaitAngle) * gaitMagnitudeVertical, movingLegAlpha)
  );

  avatar.feet.leftStartX = avatar.body.x - avatar.box.width / 3;
  avatar.feet.leftStartY = avatar.body.y + avatar.box.width / 3;

  const baseRightX = avatar.box.x + avatar.box.width * (1 - legStartDistanceFromBody);
  const baseRightY = avatar.box.y + avatar.box.height;

  avatar.feet.rightX = lin(
    baseRightX,
    baseRightX + Math.cos(Math.PI + gaitAngle) * gaitMagnitudeHorizontal,
    movingLegAlpha
  );
  avatar.feet.rightY = Math.min(
    baseRightY,
    lin(baseRightY, baseRightY + Math.sin(Math.PI + gaitAngle) * gaitMagnitudeVertical, movingLegAlpha)
  );

  avatar.feet.rightStartX = avatar.body.x + avatar.box.width / 3;
  avatar.feet.rightStartY = avatar.body.y + avatar.box.width / 3;

  if (avatar.facing === 1) {
    [avatar.feet.leftKneeX, avatar.feet.leftKneeY] = getPointAtDistance(
      avatar.feet.leftX,
      avatar.feet.leftY,
      avatar.feet.leftStartX,
      avatar.feet.leftStartY,
      AVATAR.LEG_LENGTH
    );

    [avatar.feet.rightKneeX, avatar.feet.rightKneeY] = getPointAtDistance(
      avatar.feet.rightX,
      avatar.feet.rightY,
      avatar.feet.rightStartX,
      avatar.feet.rightStartY,
      AVATAR.LEG_LENGTH
    );
  } else {
    [avatar.feet.leftKneeX, avatar.feet.leftKneeY] = getPointAtDistance(
      avatar.feet.leftStartX,
      avatar.feet.leftStartY,
      avatar.feet.leftX,
      avatar.feet.leftY,
      AVATAR.LEG_LENGTH
    );
    [avatar.feet.rightKneeX, avatar.feet.rightKneeY] = getPointAtDistance(
      avatar.feet.rightStartX,
      avatar.feet.rightStartY,
      avatar.feet.rightX,
      avatar.feet.rightY,
      AVATAR.LEG_LENGTH
    );
  }

  avatar.primaryArm.vx -= (avatar.primaryArm.vx - aimX) / 2;
  avatar.primaryArm.vy -= (avatar.primaryArm.vy - aimY) / 2;

  const primaryArmDistance = avatar.gun !== undefined ? 0.8 : 0;

  if (avatar.gun) {
    let firing = false;
    if (fire && avatar.gun.cooldown === 0) {
      avatar.primaryArm.dangle -= Math.sign(aimX) * random(game, 0.5, 1.5);
      avatar.primaryArm.ddistance -= random(game, 0.5, 0.5);
      avatar.gun.cooldown = 10;
      firing = true;
    }

    if (avatar.gun.cooldown > 1) {
      avatar.gun.cooldown--;
    } else if (avatar.gun.cooldown === 1 && !fire) {
      avatar.gun.cooldown = 0;
    }

    if (firing) {
      game.bullets[game.autoid++] = {
        x: avatar.body.x + aimX * avatar.primaryArm.distance,
        y: avatar.body.y + aimY * avatar.primaryArm.distance,
        dx: aimX * BULLET.SPEED,
        dy: aimY * BULLET.SPEED,
      };
    }
  }

  avatar.primaryArm.distance -= (avatar.primaryArm.distance - primaryArmDistance) / 4;

  avatar.primaryArm.ddistance /= 1.3;
  avatar.primaryArm.dangle /= 1.3;

  boxLevelTick(level, avatar.box);

  if (avatar.faceTicks === 0) {
    avatar.face = AVATAR.FACE.PASSIVE;
    avatar.faceTicks = -1;
  } else if (avatar.faceTicks > 0) {
    avatar.faceTicks--;
  }

  for (const gunID in game.guns) {
    const gun = game.guns[gunID] ?? fail();
    if (gun.ticksUntilPickup !== 0) continue;

    if (boxOnBoxCollision(avatar.box, gun.box)) {
      if (Math.hypot(gun.box.dx, gun.box.dy) > 0.6) {
        avatar.body.dx += gun.box.dx;
        avatar.body.dy += gun.box.dy;
        avatar.box.dx += gun.box.dx / 4;
        avatar.box.dy += gun.box.dy / 4;
        if (Math.abs(gun.box.dx) > Math.abs(gun.box.dy)) {
          gun.box.dx *= -gun.box.bounce;
        } else {
          gun.box.dy *= -gun.box.bounce;
        }
        avatar.health -= 2;
        gun.ticksUntilPickup = 10;
      } else if (avatar.gun === undefined) {
        avatar.gun = gun;
        delete game.guns[gunID];
      }
    }
  }

  if (avatar.gun !== undefined && drop) {
    game.guns[game.autoid++] = avatar.gun;
    avatar.gun.box.x = avatar.box.x + (avatar.box.width - avatar.gun.box.width) / 2;
    avatar.gun.box.y = avatar.box.y + (avatar.box.height - avatar.gun.box.height) / 2;
    avatar.gun.box.dx = aimX / 1.3;
    avatar.gun.box.dy = aimY / 1.3;
    avatar.gun.ticksUntilPickup = 3;
    avatar.gun = undefined;
  }
}

/**
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Avatar | undefined} prevAvatar
 * @param {Avatar} avatar
 * @param {number} alpha
 */
export function avatarRender(ctx, prevAvatar, avatar, alpha) {
  const bodyX = lin(prevAvatar?.body.x, avatar.body.x, alpha);
  const bodyY = lin(prevAvatar?.body.y, avatar.body.y, alpha);
  const primaryArmVX = lin(prevAvatar?.primaryArm.vx, avatar.primaryArm.vx, alpha);
  const primaryArmVY = lin(prevAvatar?.primaryArm.vy, avatar.primaryArm.vy, alpha);
  const primaryArmAngle =
    Math.atan2(primaryArmVY, primaryArmVX) + lin(prevAvatar?.primaryArm.dangle, avatar.primaryArm.dangle, alpha);
  const primaryArmDistance =
    lin(prevAvatar?.primaryArm.distance, avatar.primaryArm.distance, 1) +
    lin(prevAvatar?.primaryArm.ddistance, avatar.primaryArm.ddistance, alpha);

  const feetLeftStartX = lin(prevAvatar?.feet.leftStartX, avatar.feet.leftStartX, alpha);
  const feetLeftStartY = lin(prevAvatar?.feet.leftStartY, avatar.feet.leftStartY, alpha);
  const feetLeftEndX = lin(prevAvatar?.feet.leftX, avatar.feet.leftX, alpha);
  const feetLeftEndY = lin(prevAvatar?.feet.leftY, avatar.feet.leftY, alpha);
  const feetLeftKneeX = lin(prevAvatar?.feet.leftKneeX, avatar.feet.leftKneeX, alpha);
  const feetLeftKneeY = lin(prevAvatar?.feet.leftKneeY, avatar.feet.leftKneeY, alpha);

  const feetRightStartX = lin(prevAvatar?.feet.rightStartX, avatar.feet.rightStartX, alpha);
  const feetRightStartY = lin(prevAvatar?.feet.rightStartY, avatar.feet.rightStartY, alpha);
  const feetRightEndX = lin(prevAvatar?.feet.rightX, avatar.feet.rightX, alpha);
  const feetRightEndY = lin(prevAvatar?.feet.rightY, avatar.feet.rightY, alpha);
  const feetRightKneeX = lin(prevAvatar?.feet.rightKneeX, avatar.feet.rightKneeX, alpha);
  const feetRightKneeY = lin(prevAvatar?.feet.rightKneeY, avatar.feet.rightKneeY, alpha);

  ctx.fillStyle = avatar.color;
  ctx.strokeStyle = avatar.color;
  ctx.lineWidth = 0.1;

  ctx.beginPath();
  ctx.arc(bodyX, bodyY, avatar.box.width / 1.9, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(feetLeftStartX, feetLeftStartY);
  ctx.quadraticCurveTo(feetLeftKneeX, feetLeftKneeY, feetLeftEndX, feetLeftEndY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(feetRightStartX, feetRightStartY);
  ctx.quadraticCurveTo(feetRightKneeX, feetRightKneeY, feetRightEndX, feetRightEndY);
  ctx.stroke();

  const armStartX = bodyX + primaryArmVX * (avatar.box.width / 4);
  const armStartY = bodyY + primaryArmVY * (avatar.box.width / 4);
  const armEndX = bodyX + primaryArmVX * primaryArmDistance;
  const armEndY = bodyY + primaryArmVY * primaryArmDistance;

  let armElbowX;
  let armElbowY;

  const armLength = AVATAR.ARM_LENGTH * primaryArmVX;

  if (primaryArmVX < 0) {
    [armElbowX, armElbowY] = getPointAtDistance(armEndX, armEndY, armStartX, armStartY, armLength);
  } else {
    [armElbowX, armElbowY] = getPointAtDistance(armStartX, armStartY, armEndX, armEndY, armLength);
  }

  ctx.beginPath();
  ctx.moveTo(armStartX, armStartY);
  ctx.quadraticCurveTo(armElbowX, armElbowY, armEndX, armEndY);
  ctx.stroke();

  ctx.save();
  ctx.textAlign = "end";
  ctx.translate(bodyX + avatar.body.dx / 2 - 0.12, bodyY + avatar.body.dy / 2 + 0.2);
  ctx.rotate(Math.PI / 2);
  ctx.font = "normal 0.5px sans-serif";
  ctx.fillStyle = "black";
  ctx.fillText(avatar.face, 0, 0);
  ctx.restore();

  if (avatar.gun) {
    renderGun(ctx, armEndX, armEndY, primaryArmAngle);
  }
}
