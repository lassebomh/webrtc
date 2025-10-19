import { fail, lin } from "../lib/utils.js";

import { boxLevelTick, boxOnBoxCollision } from "./collision.js";
import { BULLET, pistolRender } from "./guns.js";
import { particleCreate } from "./particle.js";
import { getPointAtDistance, random } from "./utils.js";

export const AVATAR = {
  SPEED: 0.04,
  HORIZONTAL_FRICTION: 1.2,
  VERTICAL_FRICTION: 1.2,
  CROUCH_GRAVITY: 0.06,
  HELD_GRAVITY: 0.02,
  GRAVITY: 0.05,
  MAX_FALL_SPEED: 0.7,
  MAX_WALK_SPEED: 0.2,
  WIDTH: 0.85,
  HEIGHT: 1.1,
  CROUCH_HEIGHT: 0.9,
  LEG_LENGTH: 0.5,
  ARM_LENGTH: 1,
  JUMP: 0.42,
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
 * @param {boolean} primary
 * @param {boolean} secondary
 */
export function avatarTick(game, level, avatar, moveX, moveY, aimX, aimY, jump, primary, secondary) {
  const aimDist = Math.hypot(aimX, aimY);
  if (aimDist !== 0) {
    aimX /= aimDist;
    aimY /= aimDist;
  }

  const moveDist = Math.hypot(moveX, moveY);
  if (moveDist !== 0) {
    moveX /= moveDist;
    moveY /= moveDist;
  }

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
    if ((avatar.jumpHeld || avatar.box.dy >= 0) && !pressingCrouch && !avatar.rope.grabbingWall) {
      avatar.box.dy += AVATAR.HELD_GRAVITY;
    } else {
      avatar.box.dy += AVATAR.GRAVITY;
    }

    if (Math.abs(avatar.box.dy) > AVATAR.MAX_FALL_SPEED) {
      avatar.box.dy = AVATAR.MAX_FALL_SPEED * Math.sign(avatar.box.dy);
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

  if (Math.abs(moveX) > 0.2) {
    const dx = AVATAR.SPEED * moveX;
    const movingOpposite = Math.sign(dx) !== Math.sign(avatar.box.dx);
    const atMaxSpeed = Math.abs(avatar.box.dx) > AVATAR.MAX_WALK_SPEED;
    if (movingOpposite || !atMaxSpeed) {
      avatar.box.dx += dx;
    }
  }

  // if (avatar.box.wallBottom) {
  //   avatar.box.dx /= 1.15;
  // }

  avatar.box.dx /= 1.2;

  if (!pressingCrouch && (avatar.box.wallLeft || avatar.box.wallRight) && avatar.box.dy > 0) {
    avatar.box.dy /= AVATAR.VERTICAL_FRICTION;
  }

  if (avatar.box.dx !== 0) {
    avatar.facing = Math.sign(avatar.box.dx);
  }

  avatar.primaryArm.vx -= (avatar.primaryArm.vx - aimX) / 2;
  avatar.primaryArm.vy -= (avatar.primaryArm.vy - aimY) / 2;

  const primaryArmDistance = avatar.gun !== undefined ? 0.8 : 0;

  if (avatar.primaryCooldown > 1) {
    avatar.primaryCooldown--;
  } else if (avatar.primaryCooldown === 1 && !primary) {
    avatar.primaryCooldown = 0;
  }
  if (avatar.secondaryCooldown > 1) {
    avatar.secondaryCooldown--;
  } else if (avatar.secondaryCooldown === 1 && !secondary) {
    avatar.secondaryCooldown = 0;
  }

  if (avatar.primaryCooldown === 0 && primary) {
    if (avatar.gun) {
      avatar.primaryArm.dangle -= Math.sign(aimX) * random(game, 0.5, 1.5);
      avatar.primaryArm.ddistance -= random(game, 0.5, 0.5);

      const aimAngle = Math.atan2(aimY, aimX);
      const startX = avatar.body.x + aimX * (avatar.primaryArm.distance + avatar.gun.barrelLength);
      const startY = avatar.body.y + aimY * (avatar.primaryArm.distance + avatar.gun.barrelLength);
      game.bullets[game.autoid++] = {
        x: startX,
        y: startY,
        dx: aimX * BULLET.SPEED,
        dy: aimY * BULLET.SPEED,
      };
      avatar.gun.bullets--;
      avatar.primaryCooldown = avatar.gun.cooldown;

      particleCreate(game, startX, startY, aimX, aimY, 0.3, 3, 1, 0.0, "yellow");
      // for (let i = 0; i < 4; i++) {
      //   const angle = aimAngle + random(game, -1, 1) * (Math.PI / 4);
      //   particleCreate(game, startX, startY, Math.cos(angle), Math.sin(angle), 0.4, 2, 1, 0.0, "yellow");
      // }
      if (avatar.gun.bullets <= 0) {
        avatarDropWeapon(game, avatar, random(game, -0.1, 0.1), -random(game, 0.2, 0.3));
      }
    } else {
      avatar.primaryArm.ddistance += 2;
      avatar.box.dx += avatar.primaryArm.vx / 10;
      avatar.box.dy += avatar.primaryArm.vy / 10;
      avatar.body.dx += avatar.primaryArm.vx;
      avatar.body.dy += avatar.primaryArm.vy / (avatar.box.wallBottom ? 1 : 3);
      avatar.primaryArm.damage = 1;
      avatar.primaryCooldown = 10;
    }
  }

  if (avatar.secondaryCooldown === 0 && secondary) {
    if (avatar.gun !== undefined) {
      avatarDropWeapon(game, avatar, aimX / 1.3, aimY / 1.3);
      avatar.secondaryCooldown = 1;
    } else if (!avatar.rope.active) {
      avatar.rope.active = true;
      avatar.rope.box.dx = aimX;
      avatar.rope.box.dy = aimY;
      avatar.secondaryCooldown = 7;
    }
  }

  if (!secondary && avatar.rope.active) {
    if (avatar.rope.grabbingAvatarID) {
      const otherAvatar = game.avatars[avatar.rope.grabbingAvatarID];
      if (otherAvatar) {
        otherAvatar.grabbedByAvatarID = undefined;
      }
    }

    avatar.rope.active = false;
    avatar.rope.grabbingGunID = undefined;
    avatar.rope.grabbingAvatarID = undefined;
    avatar.rope.grabbingWall = undefined;
  }

  if (!avatar.rope.active) {
    if (
      Math.hypot(
        avatar.body.x - (avatar.rope.box.x + avatar.rope.box.width / 2),
        avatar.body.y - (avatar.rope.box.y + avatar.rope.box.height / 2)
      ) > 2
    ) {
      avatar.rope.box.x -= (avatar.rope.box.x - (avatar.box.x + avatar.box.width / 2 - avatar.rope.box.width / 2)) / 4;
      avatar.rope.box.y -=
        (avatar.rope.box.y - (avatar.box.y + avatar.box.height / 2 - avatar.rope.box.height / 2)) / 4;
    } else {
      avatar.rope.box.x = avatar.box.x + avatar.box.width / 2 - avatar.rope.box.width / 2;
      avatar.rope.box.y = avatar.box.y + avatar.box.width / 2 - avatar.rope.box.height / 2;
    }
  } else if (avatar.rope.grabbingAvatarID) {
    const otherAvatar = game.avatars[avatar.rope.grabbingAvatarID];
    if (!otherAvatar) {
      avatar.rope.grabbingAvatarID = undefined;
      avatar.rope.active = false;
    } else {
      let dx = avatar.body.x - otherAvatar.box.x + otherAvatar.box.width / 2;
      let dy = avatar.body.y - otherAvatar.box.y + otherAvatar.box.height / 2;
      const distance = Math.hypot(dx, dy);
      if (distance < 2) {
        otherAvatar.grabbedByAvatarID = undefined;
        avatar.rope.grabbingAvatarID = undefined;
        avatar.rope.active = false;
      } else {
        const dist = (distance + 1) * 10;

        if (dist !== 0) {
          otherAvatar.box.dx += dx / dist;
          otherAvatar.box.dy += dy / dist;
        }

        avatar.rope.box.x = otherAvatar.body.x - avatar.rope.box.width / 2 + 0.2;
        avatar.rope.box.y = otherAvatar.body.y - avatar.rope.box.height / 2 + 0.2;
      }
    }
  } else if (avatar.rope.grabbingGunID) {
    const gun = game.guns[avatar.rope.grabbingGunID];

    if (!gun) {
      avatar.rope.grabbingGunID = undefined;
      avatar.rope.active = false;
    } else {
      let dx = avatar.body.x - gun.box.x + gun.box.width / 2 - gun.box.dx * 2;
      let dy = avatar.body.y - gun.box.y + gun.box.height / 2 - gun.box.dy * 2;
      const dist = (Math.hypot(dx, dy) + 1) * 10;

      if (dist !== 0) {
        gun.box.dx += dx / dist;
        gun.box.dy += dy / dist;
      }

      avatar.rope.box.x = gun.box.x - gun.box.width / 2 + avatar.rope.box.width / 2;
      avatar.rope.box.y = gun.box.y - gun.box.height / 2 + avatar.rope.box.height / 2;
    }
  } else if (avatar.rope.grabbingWall) {
    let dx = avatar.rope.box.x + avatar.rope.box.width / 2 - avatar.body.x - avatar.box.dx * 2;
    let dy = avatar.rope.box.y + avatar.rope.box.height / 2 - avatar.body.y - avatar.box.dy * 2;
    const dist = (Math.hypot(dx, dy) + 1) * 10;

    if (dist !== 0) {
      avatar.box.dx += dx / dist;
      avatar.box.dy += dy / dist;
    }
  } else {
    boxLevelTick(level, avatar.rope.box);

    const touchingWall =
      avatar.rope.box.wallBottom || avatar.rope.box.wallLeft || avatar.rope.box.wallRight || avatar.rope.box.wallTop;

    if (touchingWall) {
      if (avatar.rope.box.wallBottom) {
        avatar.rope.box.y += avatar.rope.box.height / 2;
      }
      if (avatar.rope.box.wallTop) {
        avatar.rope.box.y -= avatar.rope.box.height / 2;
      }
      if (avatar.rope.box.wallLeft) {
        avatar.rope.box.x -= avatar.rope.box.width / 2;
      }
      if (avatar.rope.box.wallRight) {
        avatar.rope.box.x += avatar.rope.box.width / 2;
      }
      avatar.rope.grabbingWall = true;
    }

    if (!avatar.rope.grabbingWall) {
      for (const gunID in game.guns) {
        const gun = game.guns[gunID] ?? fail();

        if (boxOnBoxCollision(gun.box, avatar.rope.box)) {
          avatar.rope.grabbingGunID = gunID;
          break;
        }
      }
    }

    if (!avatar.rope.grabbingWall && !avatar.rope.grabbingGunID) {
      for (const otherAvatarID in game.avatars) {
        if (otherAvatarID === avatar.id) continue;
        const otherAvatar = game.avatars[otherAvatarID] ?? fail();

        if (boxOnBoxCollision(otherAvatar.box, avatar.rope.box)) {
          avatar.rope.grabbingAvatarID = otherAvatarID;
          otherAvatar.grabbedByAvatarID = avatar.id;
          break;
        }
      }
    }

    if (
      !avatar.rope.grabbingWall &&
      !avatar.rope.grabbingGunID &&
      !avatar.rope.grabbingAvatarID &&
      Math.hypot(
        avatar.body.x - (avatar.rope.box.x + avatar.rope.box.width / 2),
        avatar.body.y - (avatar.rope.box.y + avatar.rope.box.height / 2)
      ) > 12
    ) {
      avatar.rope.active = false;
    }
  }

  if (avatar.primaryArm.damage) {
    if (avatar.primaryCooldown === 1) {
      avatar.primaryArm.damage = 0;
    } else {
      for (const otherAvatarID in game.avatars) {
        if (otherAvatarID === avatar.id) continue;
        const otherAvatar = game.avatars[otherAvatarID] ?? fail();

        const primaryArmDistance = avatar.primaryArm.distance + avatar.primaryArm.ddistance;

        const armEndX = avatar.body.x + avatar.primaryArm.vx * primaryArmDistance;
        const armEndY = avatar.body.y + avatar.primaryArm.vy * primaryArmDistance;

        const distanceToArm = Math.hypot(otherAvatar.body.x - armEndX, otherAvatar.body.y - armEndY);
        const distanceToBody = Math.hypot(otherAvatar.body.x - avatar.body.x, otherAvatar.body.y - avatar.body.y);

        const distance = Math.min(distanceToArm, distanceToBody);

        if (distance < 0.75) {
          avatarTakeDamage(game, otherAvatar, 1, avatar.primaryArm.vx, avatar.primaryArm.vy);
          otherAvatar.box.dx += avatar.primaryArm.vx / 2;
          otherAvatar.box.dy += avatar.primaryArm.vy / 2;
          otherAvatar.body.dx += avatar.primaryArm.vx * 2;
          otherAvatar.body.dy += avatar.primaryArm.vy * 2;
          avatar.box.dx -= avatar.primaryArm.vx / 3;
          avatar.box.dy -= avatar.primaryArm.vy / 3;
          // avatar.body.dx -= avatar.primaryArm.vx * 2;
          // avatar.body.dy -= avatar.primaryArm.vy * 2;
          avatar.primaryArm.damage = 0;
        }
      }
    }
  }

  avatar.primaryArm.distance -= (avatar.primaryArm.distance - primaryArmDistance) / 4;

  avatar.primaryArm.ddistance /= 1.3;
  avatar.primaryArm.dangle /= 1.3;

  avatar.body.dx -= (avatar.body.dx - avatar.box.dx * 2) / 3;
  avatar.body.dy -= (avatar.body.dy - avatar.box.dy * 2) / 3;

  avatar.body.x += avatar.body.dx;
  avatar.body.y += avatar.body.dy;

  avatar.body.x -= (avatar.body.x - (avatar.box.x + avatar.box.width / 2 - avatar.box.dx)) / 2.5;
  avatar.body.y -= (avatar.body.y - (avatar.box.y + avatar.box.width / 2 - avatar.box.dy)) / 2.5;

  const gaitAngle = avatar.body.x * 2.5;
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

  boxLevelTick(level, avatar.box);

  if (avatar.faceTicks === 0) {
    avatar.face = AVATAR.FACE.PASSIVE;
    avatar.faceTicks = -1;
  } else if (avatar.faceTicks > 0) {
    avatar.faceTicks--;
  }

  for (const gunID in game.guns) {
    const gun = game.guns[gunID] ?? fail();
    if (gun.ticksUntilPickup !== 0 || gun.bullets === 0) continue;

    if (boxOnBoxCollision(avatar.box, gun.box)) {
      if (Math.hypot(gun.box.dx, gun.box.dy) > 0.6 && gunID !== avatar.rope.grabbingGunID) {
        avatar.body.dx += gun.box.dx;
        avatar.body.dy += gun.box.dy;
        avatar.box.dx += gun.box.dx / 2;
        avatar.box.dy += gun.box.dy / 2;
        avatarTakeDamage(game, avatar, 1, gun.box.dx, gun.box.dy);
        if (Math.abs(gun.box.dx) > Math.abs(gun.box.dy)) {
          gun.box.dx *= -gun.box.bounce;
        } else {
          gun.box.dy *= -gun.box.bounce;
        }
        avatar.health -= 4;
        gun.ticksUntilPickup = 10;
      } else if (
        avatar.gun === undefined &&
        ((avatar.rope.grabbingGunID === undefined &&
          avatar.rope.grabbingAvatarID === undefined &&
          avatar.rope.grabbingWall === undefined) ||
          gunID === avatar.rope.grabbingGunID)
      ) {
        avatar.gun = gun;
        delete game.guns[gunID];
      }
    }
  }
}

/**
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Game} game
 * @param {Avatar | undefined} prevAvatar
 * @param {Avatar} avatar
 * @param {number} alpha
 */
export function avatarRender(ctx, game, prevAvatar, avatar, alpha) {
  const bodyX = lin(prevAvatar?.body.x, avatar.body.x, alpha);
  const bodyY = lin(prevAvatar?.body.y, avatar.body.y, alpha);
  const primaryArmVX = lin(prevAvatar?.primaryArm.vx, avatar.primaryArm.vx, alpha);
  const primaryArmVY = lin(prevAvatar?.primaryArm.vy, avatar.primaryArm.vy, alpha);
  const primaryArmAngle =
    Math.atan2(primaryArmVY, primaryArmVX) + lin(prevAvatar?.primaryArm.dangle, avatar.primaryArm.dangle, alpha);
  const primaryArmDistance =
    lin(prevAvatar?.primaryArm.distance, avatar.primaryArm.distance, alpha) +
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

  const armStartX = bodyX + primaryArmVX * (avatar.box.width / 4);
  const armStartY = bodyY + primaryArmVY * (avatar.box.width / 4);
  const armEndX = bodyX + primaryArmVX * primaryArmDistance;
  const armEndY = bodyY + primaryArmVY * primaryArmDistance;

  // boxRender(ctx, avatar.box, avatar.box, "green", 1);
  // boxRender(ctx, avatar.rope.box, avatar.rope.box, "white", 1);

  const ropeX = lin(prevAvatar?.rope?.box.x, avatar.rope.box.x, alpha) + avatar.rope.box.width / 2;
  const ropeY = lin(prevAvatar?.rope?.box.y, avatar.rope.box.y, alpha) + avatar.rope.box.height / 2;
  const angle = Math.atan2(ropeY - bodyY, ropeX - bodyX);
  const vx = Math.cos(angle);
  const vy = Math.sin(angle);
  const ox = Math.cos(angle - Math.PI / 2);
  const oy = Math.sin(angle - Math.PI / 2);
  const ropeStartX = bodyX;
  const ropeStartY = bodyY;
  const distance = Math.hypot(ropeY - ropeStartY, ropeX - ropeStartX);

  ctx.lineWidth = 0.05;
  ctx.strokeStyle = "#fff5";
  ctx.setLineDash([0.05, 0.05]);
  ctx.beginPath();
  ctx.moveTo(bodyX + primaryArmVX * (avatar.box.width / 2 + 2), bodyY + primaryArmVY * (avatar.box.width / 2 + 2));
  ctx.lineTo(bodyX + primaryArmVX * (avatar.box.width / 2 + 2.2), bodyY + primaryArmVY * (avatar.box.width / 2 + 2.2));
  ctx.stroke();
  ctx.setLineDash([]);

  if (
    distance > avatar.box.width * 2 ||
    avatar.rope.grabbingWall ||
    avatar.rope.grabbingAvatarID ||
    avatar.rope.grabbingGunID
  ) {
    const width = Math.max(Math.min(3 / distance - 0.3, 3), 0);
    const leftX = ropeStartX + vx * (distance / 3) + ox * width;
    const leftY = ropeStartY + vy * (distance / 3) + oy * width;
    const rightX = ropeStartX + vx * (distance * (2 / 3)) - ox * width;
    const rightY = ropeStartY + vy * (distance * (2 / 3)) - oy * width;

    ctx.beginPath();
    if (avatar.rope.grabbingWall || avatar.rope.grabbingAvatarID || avatar.rope.grabbingGunID) {
      ctx.moveTo(ropeX, ropeY);
      ctx.lineTo(ropeStartX, ropeStartY);
    } else {
      ctx.moveTo(ropeX, ropeY);
      ctx.bezierCurveTo(rightX, rightY, leftX, leftY, ropeStartX, ropeStartY);
    }
    ctx.lineWidth = 0.15;
    ctx.strokeStyle = "#63351eff";
    ctx.stroke();
    ctx.strokeStyle = "#804f37ff";
    ctx.setLineDash([0.5, 0.5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

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

  let armElbowX;
  let armElbowY;

  const armLength = AVATAR.ARM_LENGTH * Math.sign(primaryArmVX) * Math.pow(Math.abs(primaryArmVX), 0.2);

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

  if (avatar.grabbedByAvatarID) {
    const otherAvatar = game.avatars[avatar.grabbedByAvatarID];
    if (otherAvatar) {
      const v = avatar.box.width / 2;
      ctx.beginPath();
      ctx.moveTo(bodyX - v, bodyY + 0.2);
      ctx.lineTo(bodyX + v, bodyY + 0.2);
      ctx.lineWidth = 0.15;
      ctx.strokeStyle = "#63351eff";
      ctx.stroke();
      ctx.strokeStyle = "#804f37ff";
      ctx.setLineDash([0.5, 0.5]);
      ctx.stroke();
    }
  }

  if (avatar.gun) {
    pistolRender(ctx, armEndX, armEndY, primaryArmAngle);
  }
}

/**
 * @param {Game} game
 * @param {Avatar} avatar
 * @param {number} dx
 * @param {number} dy
 */
export function avatarDropWeapon(game, avatar, dx, dy) {
  const gun = avatar.gun;
  if (gun) {
    gun.ticksUntilPickup = 3;
    avatar.gun = undefined;
    game.guns[game.autoid++] = gun;

    gun.box.x = avatar.box.x + (avatar.box.width - gun.box.width) / 2;
    gun.box.y = avatar.box.y + (avatar.box.height - gun.box.height) / 2;
    gun.box.dx = dx;
    gun.box.dy = dy;
  }
}
/**
 * @param {Game} game
 * @param {Avatar} avatar
 * @param {number} damage
 * @param {number} dx
 * @param {number} dy
 */
export function avatarTakeDamage(game, avatar, damage, dx, dy) {
  avatar.face = AVATAR.FACE.DAMAGE;
  avatar.faceTicks = 30;
  avatar.health -= damage;

  for (let i = 0; i < 3; i++) {
    const radius = random(game, 0.2, 0.5) * (avatar.box.width / 2);
    particleCreate(
      game,
      avatar.body.x + dx,
      avatar.body.y + dy,
      random(game, -0.2, 0.2) + dx,
      random(game, -0.2, 0.2) + dy,
      radius,
      1.2,
      1.1,
      0.01,
      avatar.color
    );
  }

  if (avatar.health <= 0) {
    for (const deviceID in game.players) {
      const player = game.players[deviceID] ?? fail();
      if (player.avatarID === avatar.id) {
        player.avatarID = undefined;
        break;
      }
    }
    for (let i = 0; i < 10; i++) {
      const angle = random(game, 0, Math.PI * 2);
      const radius = random(game, 0.3, 0.7) * (avatar.box.width / 2);
      particleCreate(
        game,
        avatar.body.x + Math.cos(angle) * (avatar.box.width / 2 - radius),
        avatar.body.y + Math.sin(angle) * (avatar.box.width / 2 - radius),
        random(game, -0.3, 0.3) + dx / 4,
        random(game, -0.3, 0.3) + dy / 4,
        radius,
        1.05,
        1.1,
        0.05,
        avatar.color
      );
    }
    for (let i = 0; i < 3; i++) {
      particleCreate(
        game,
        avatar.body.x,
        avatar.body.y,
        dx / 4,
        random(game, -0.2, 0.2) + dy / 4,
        avatar.box.width / 2,
        1.05,
        1.1,
        0.05,
        avatar.color
      );
    }
    if (avatar.gun) {
      avatarDropWeapon(game, avatar, dx / 3 + random(game, -0.2, 0.2), dy / 3 - random(game, 0.2, 0.5));
    }
    delete game.avatars[avatar.id];
  }
}

/**
 * @param {Game} game
 * @param {number} x
 * @param {number} y
 * @param {string} color
 * @returns {Avatar}
 */
export function createAvatar(game, x, y, color) {
  /** @type {Avatar} */
  const avatar = {
    id: (game.autoid++).toString(),
    box: {
      x: x,
      y: y,
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
    rope: {
      active: false,
      box: {
        x: x,
        y: y,
        dx: 0,
        dy: 0,
        width: 0.8,
        height: 0.8,
        bounce: 0,
      },
    },
    primaryCooldown: 0,
    secondaryCooldown: 0,
    jumpHeld: 0,
    fallingTicks: 0,
    color,
    facing: 1,
    face: AVATAR.FACE.PASSIVE,
    faceTicks: -1,
    health: 5,
    crouching: false,
    feet: {
      angle: 0,
      leftX: x,
      leftY: y,
      rightX: x,
      rightY: y,
      leftStartX: x,
      leftStartY: y,

      rightStartX: x,
      rightStartY: y,
      leftKneeX: x,
      leftKneeY: y,
      rightKneeX: x,
      rightKneeY: y,
    },
    primaryArm: {
      vx: 1,
      vy: 0,
      dangle: 0,
      ddistance: 0,
      distance: 0,
      damage: 0,
    },
    body: {
      angle: 0,
      x: x,
      y: y,
      dx: 0,
      dy: 0,
    },
  };

  game.avatars[avatar.id] = avatar;
  return avatar;
}
