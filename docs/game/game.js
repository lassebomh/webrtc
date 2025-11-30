import { point } from "./point.js";

export const TICK_RATE = 1000 / 60;
const dt = TICK_RATE / 1000;

const ax = 0.0;
const ay = -5;

/**
 * @param {State} state
 * @param {Partial<Box>} box_init
 */
function create_box(state, box_init) {
  /** @type {Box} */
  const box = {
    type: "box",
    mass: 0,
    fixed: false,
    id: (state.autoid++).toString(),
    a: point.create(0, 0),
    b: point.create(1, 0),
    c: point.create(0, -1),
    d: point.create(1, -1),
    w: 0,
    h: 0,
    ...box_init,
  };

  state.objects[box.id] = box;

  return box;
}

/**
 * @param {State} state
 * @param {Partial<Circle>} circle_init
 */
function create_circle(state, circle_init) {
  /** @type {Circle} */
  const circle = {
    type: "circle",
    id: (state.autoid++).toString(),
    ...point.create(circle_init.x ?? 0, circle_init.y ?? 0),
    radius: 1,
    fixed: false,
    mass: 0,
    ...circle_init,
  };

  state.objects[circle.id] = circle;

  return circle;
}

/**
 *
 * @param {Point} a
 * @param {Point} b
 * @param {number} target
 */
function constraint_dist(a, b, target) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);

  if (dist === 0) {
    return;
  }

  const diff = (target - dist) / dist;
  a.x -= 0.5 * diff * dx;
  a.y -= 0.5 * diff * dy;
  b.x += 0.5 * diff * dx;
  b.y += 0.5 * diff * dy;
}

/**
 *
 * @param {State} state
 */
function physics_tick(state) {
  for (const object of Object.values(state.objects)) {
    if (object.type === "box") {
      const { a, b, c, d } = object;
      a.ppx = a.x;
      a.ppy = a.y;
      b.ppx = b.x;
      b.ppy = b.y;
      c.ppx = c.x;
      c.ppy = c.y;
      d.ppx = d.x;
      d.ppy = d.y;
    } else if (object.type === "circle") {
      object.ppx = object.x;
      object.ppy = object.y;
    }
  }

  for (const box of Object.values(state.objects)) {
    if (box.type === "box") {
      const { a, b, c, d, w, h } = box;

      a.x += a.x - a.px + dt * dt * ax;
      a.y += a.y - a.py + dt * dt * ay;
      b.x += b.x - b.px + dt * dt * ax;
      b.y += b.y - b.py + dt * dt * ay;
      c.x += c.x - c.px + dt * dt * ax;
      c.y += c.y - c.py + dt * dt * ay;
      d.x += d.x - d.px + dt * dt * ax;
      d.y += d.y - d.py + dt * dt * ay;

      for (let i = 0; i < 5; i++) {
        constraint_dist(a, b, w);
        constraint_dist(c, d, w);
        constraint_dist(a, c, h);
        constraint_dist(b, d, h);
        constraint_dist(a, d, Math.hypot(w, h));
        constraint_dist(b, c, Math.hypot(w, h));
      }
    } else if (box.type === "circle") {
    }
  }

  for (const object of Object.values(state.objects)) {
    if (object.type === "box") {
      const { a, b, c, d } = object;
      a.px = a.ppx;
      a.py = a.ppy;
      b.px = b.ppx;
      b.py = b.ppy;
      c.px = c.ppx;
      c.py = c.ppy;
      d.px = d.ppx;
      d.py = d.ppy;
    } else if (object.type === "circle") {
      object.px = object.ppx;
      object.py = object.ppy;
    }
  }
}

export const init = () => {
  /** @type {State} */
  const game = {
    autoid: 0,
    random: 0,
    objects: {},
  };

  return game;
};

/** @type {StateFunc<State>} */
export const tick = (state, peerInputs) => {
  const first_tick = state.autoid === 0;

  if (first_tick) {
    const box = create_box(state, { w: 2.5, h: 1.5, mass: 1 });
    box.a.py -= 0.5;
    box.d.py += 0.5;

    const circle = create_circle(state, { x: 2, y: 2, radius: 1 });
  }

  physics_tick(state);
};

/** @type {RenderFunc<State>} */
export const render = (ctx, prev, curr, peerID, alpha) => {
  ctx.save();
  ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
  ctx.scale(50, -50);

  for (const object of Object.values(curr.objects)) {
    ctx.save();
    ctx.fillStyle = "darkblue";
    ctx.strokeStyle = "red";
    ctx.lineWidth = 0.03;

    ctx.beginPath();

    if (object.type === "box") {
      ctx.moveTo(object.a.x, object.a.y);
      ctx.lineTo(object.b.x, object.b.y);
      ctx.lineTo(object.d.x, object.d.y);
      ctx.lineTo(object.c.x, object.c.y);
      ctx.lineTo(object.a.x, object.a.y);
      ctx.lineTo(object.b.x, object.b.y);
    } else if (object.type === "circle") {
      ctx.moveTo(object.x, object.y);
      ctx.arc(object.x, object.y, object.radius, 0, Math.PI * 2);
    }

    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
};
