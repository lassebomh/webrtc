import { lin } from "../lib/utils.js";
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
  const x = lin(prevParticle?.x, particle.x, alpha);
  const y = lin(prevParticle?.y, particle.y, alpha);
  const dx = lin(prevParticle?.dx, particle.dx, alpha);
  const dy = lin(prevParticle?.dy, particle.dy, alpha);
  const size = lin(prevParticle?.size, particle.size, alpha);
  const particleAngle = Math.atan2(dy, dx);
  const mag = Math.hypot(dx, dy);

  if (size <= 0 || Math.max(size, mag / 1.5, 0) <= 0) return;

  ctx.ellipse(x + dx / 2, y + dy / 2, size, Math.max(size, mag / 1.5, 0), particleAngle + Math.PI / 2, 0, Math.PI * 2);

  ctx.shadowBlur = mag * 20;
  ctx.shadowColor = particle.color;

  ctx.fillStyle = particle.color;
  ctx.fill();
}

/**
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
  if (particle.size < 0.001) {
    delete game.particles[particle.id];
  }
}

/**
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
