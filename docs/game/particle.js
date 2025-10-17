import { EPSILON, lin } from "../lib/utils.js";
import { random } from "./utils.js";

/**
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Particle | undefined} prevParticle
 * @param {Particle} particle
 * @param {number} alpha
 */
export function particleRender(ctx, prevParticle, particle, alpha) {
  ctx.beginPath();
  if (prevParticle) {
    ctx.fillStyle = particle.color;

    const dx = particle.dx;
    const dy = particle.dy;
    const particleAngle = Math.atan2(dy, dx);
    const mag = Math.hypot(dx, dy);
    ctx.ellipse(
      lin(prevParticle.x, particle.x, alpha),
      lin(prevParticle.y, particle.y, alpha),
      particle.size,
      Math.max(particle.size, mag / 1.3),
      particleAngle + Math.PI / 2,
      0,
      Math.PI * 2
    );
    ctx.fill();
  } else {
    // todo
  }
}

/**
 *
 * @param {Game} game
 * @param {Particle} particle
 */
export function particleTick(game, particle) {
  particle.size /= particle.sizeDiv;
  const angle = Math.atan2(particle.dy, particle.dx) + random(game, -particle.speedRandom, particle.speedRandom);
  const dist = Math.hypot(particle.dy, particle.dx) / particle.speedDiv;
  particle.dx = Math.cos(angle) * dist;
  particle.dy = Math.sin(angle) * dist;
  particle.x += particle.dx;
  particle.y += particle.dy;
  if (particle.size < EPSILON) {
    game.particles[particle.id];
  }
}

/**
 *
 * @param {Game} game
 * @param {number} x
 * @param {number} y
 * @param {number} dx
 * @param {number} dy
 * @param {number} size
 * @param {number} sizeDiv
 * @param {number} speedDiv
 * @param {number} speedRandom
 * @param {string} color
 */
export function particleCreate(game, x, y, dx, dy, size, sizeDiv, speedDiv, speedRandom, color) {
  const id = (game.autoid++).toString();
  game.particles[id] = {
    id,
    x,
    y,
    dx,
    dy,
    size,
    sizeDiv,
    speedDiv,
    speedRandom,
    color,
  };
}
