import { init, render, tick as tickFunc } from "../game/game.js";
import { IOController } from "../lib/inputs.js";
import { applyInputs, Timeline } from "../lib/timeline.js";
import { bindNumber, bindSelect, persistant, qs, syntaxHighlight } from "../lib/ui.js";
import { autoreload } from "../lib/utils.js";
import { assert, debounce, fail, sleep } from "../shared/utils.js";

autoreload();

const inputsElement = qs("#inputs", "pre");
const stateElement = qs("#state", "pre");
const renderElement = qs("#render", "div");

/** @type {Store<HistoryEntry<*>[]>} */
const timelineHistory = persistant("timelineHistory", () => [{ inputs: {}, tick: 0, mergedInputs: {}, state: init() }]);
const timelineElement = qs("#timeline", "div");
const timeline = new Timeline(timelineHistory(), tickFunc);

const io = new IOController(renderElement);

const tick = persistant("tick", () => 0);

const peerIDElement = qs("#peer-id", "select");
const peerID = persistant("currentPeerID", () => "1");
bindSelect(peerIDElement, peerID, {
  "Peer 1": "1",
  "Peer 2": "2",
  "Peer 3": "3",
  "Peer 4": "4",
});

const clearButton = qs("#clear", "button");
clearButton.addEventListener("click", () => {
  timelineElement.innerHTML = "";
  timeline.history = [{ inputs: {}, tick: 0, mergedInputs: {}, state: init() }];
  tick.set(0);
});

const cameraOverlayElement = qs("#camera-overlay", "div");
let camera = persistant("camera", () => ({ x: 0, y: 0, scalePos: 0 }));

const resetCamera = qs("#reset-camera", "button");
resetCamera.addEventListener("click", () => {
  camera.set({ x: 0, y: 0, scalePos: 0 });
});

cameraOverlayElement.addEventListener(
  "wheel",
  (event) => {
    const cam = camera();
    cam.scalePos -= event.deltaY / 1000;
    camera.set(cam);
  },
  { passive: true }
);

cameraOverlayElement.addEventListener("pointerdown", (event) => {
  let startX = event.clientX;
  let startY = event.clientY;
  let { x, y } = camera();

  /**
   * @param {PointerEvent} event
   */
  function onpointermove(event) {
    const scalePos = camera().scalePos;
    const scale = Math.pow(2, scalePos);
    const movementX = startX - event.clientX;
    const movementY = startY - event.clientY;
    x += movementX / scale;
    y += movementY / scale;
    camera.set({ x, y, scalePos });
    startX = event.clientX;
    startY = event.clientY;
  }

  document.addEventListener("pointermove", onpointermove, { passive: true });
  document.addEventListener(
    "pointerup",
    () => {
      document.removeEventListener("pointermove", onpointermove);
    },
    { once: true }
  );
});

const onionTickSpacingElement = qs("#onion-tick-spacing", "input");
const onionTickSpacing = persistant("onionTickSpacing", () => 0);
const onionTickSubElement = qs("#onion-tick-sub", "button");
const onionTickAddElement = qs("#onion-tick-add", "button");

onionTickSubElement.addEventListener("click", () => {
  onionTickSpacing.set(Math.max(onionTickSpacing() - 1, 0));
});

onionTickAddElement.addEventListener("click", () => {
  onionTickSpacing.set(onionTickSpacing() + 1);
});

const windBackwardElement = qs("#wind-backward", "button");
const windForwardElement = qs("#wind-forward", "button");

windForwardElement.addEventListener("mousedown", () => {
  tick.set(tick() + 1);
  const interval = setInterval(() => {
    tick.set(tick() + 1);
    scrollTimeline();
  }, (1000 / 60) * slowdown);

  document.addEventListener("mouseup", () => clearInterval(interval));
});

windBackwardElement.addEventListener("mousedown", () => {
  tick.set(Math.max(tick() - 1, 0));
  const interval = setInterval(() => {
    tick.set(Math.max(tick() - 1, 0));
    scrollTimeline();
  }, (1000 / 60) * slowdown);

  document.addEventListener("mouseup", () => clearInterval(interval));
});

bindNumber(onionTickSpacingElement, onionTickSpacing);

const slowdownString = persistant("slowdownString", () => "1");
const slowdownStringSelect = qs("#slowdown", "select");

bindSelect(slowdownStringSelect, slowdownString, {
  "1x": "1",
  "2x": "2",
  "4x": "4",
  "8x": "8",
  "16x": "16",
});

let slowdown = 1;

slowdownString.subscribe((value) => (slowdown = parseFloat(value)));

const updateTimelineHistory = debounce(() => {
  timelineHistory.set([
    timeline.history[0] ?? fail(),
    ...timeline.history.slice(1).map((x) => ({ ...x, state: null, mergedInputs: null })),
  ]);
}, 50);

await sleep(10);

let mousedown = false;

renderElement.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape") {
      event.stopImmediatePropagation();
      renderElement.blur();
    }
  },
  { capture: true }
);

window.addEventListener("mousedown", () => (mousedown = true));
window.addEventListener("mouseup", () => (mousedown = false));

/**
 * @param {boolean} smooth
 */
function scrollTimeline(smooth = false) {
  const currentButton = /** @type {HTMLButtonElement} */ (timelineElement.childNodes.item(tick()));
  currentButton.scrollIntoView({ inline: "center", block: "center" });
}

/**
 *
 * @param {KeyboardEvent} event
 */
function cameraOverlayKeydown(event) {
  if (event.key === " ") {
    cameraOverlayElement.style.display = "initial";

    document.addEventListener("keyup", () => {
      cameraOverlayElement.style.display = "none";
    });
  }
}

document.addEventListener("keydown", cameraOverlayKeydown);

renderElement.addEventListener("focusin", async () => {
  let hasFocus = true;

  /** @type {(() => any)[]} */
  const cleanups = [
    () => {
      document.addEventListener("keydown", cameraOverlayKeydown);
    },
  ];
  const cleanup = () => {
    hasFocus = false;
    for (const fn of cleanups) fn();
  };

  let play = false;
  const ondblclick = () => (play = true);

  renderElement.addEventListener("dblclick", ondblclick, { once: true });
  cleanups.push(() => renderElement.removeEventListener("dblclick", ondblclick));

  renderElement.addEventListener("focusout", cleanup, { once: true });
  document.removeEventListener("keydown", cameraOverlayKeydown);

  await sleep(500);

  if (!hasFocus) return;

  if (play) {
    for (const item of timeline.history) {
      if (item.tick > tick()) {
        const existingInputs = item.inputs[peerID()];

        if (existingInputs) {
          existingInputs.gamepadInputs = [];
          existingInputs.keyboard = {};
          existingInputs.mouse = {};
          item.inputs[peerID()] = existingInputs;
        }
      }
    }

    const interval = setInterval(() => {
      const inputs = io.flush();
      inputs.canvasWidth = io.ctx.canvas.width;
      inputs.canvasHeight = io.ctx.canvas.height;
      timeline.addInputs(tick(), peerID(), inputs);
      tick.set(tick() + 1);
      scrollTimeline();
    }, (1000 / 60) * slowdown);

    cleanups.push(() => clearInterval(interval));
  } else {
    const interval = setInterval(() => {
      const existingInputs = timeline.getState(tick())?.inputs?.[peerID()];
      let inputs = io.flush();
      if (existingInputs !== undefined) {
        applyInputs(inputs, existingInputs);
        timeline.addInputs(tick(), peerID(), existingInputs);
      } else {
        timeline.addInputs(tick(), peerID(), inputs);
      }
      updateInputPreview();
      updateRenderPreview();
    }, 1000 / 20);

    cleanups.push(() => clearInterval(interval));
  }
});

function updateTimelineButtons() {
  const lastItem = timeline.history.at(-1) ?? fail();

  for (let i = timelineElement.childNodes.length; i <= lastItem.tick + 15; i++) {
    const button = document.createElement("button");
    button.textContent = i.toString();
    button.addEventListener("mousedown", () => tick.set(i));
    button.addEventListener("mouseup", () =>
      button.scrollIntoView({ behavior: "smooth", inline: "center", block: "center" })
    );
    button.addEventListener("mouseover", () => mousedown && tick.set(i));
    timelineElement.appendChild(button);
  }

  for (const item of timeline.history) {
    const button = /** @type {HTMLButtonElement} */ (timelineElement.childNodes.item(item.tick));

    const tickDiff = item.tick - tick();

    if (tickDiff === 0) {
      button.classList.add("is-current");
      button.classList.remove("onion-before");
    } else {
      button.classList.remove("is-current");

      if (tickDiff > 0 && onionTickSpacing() === tickDiff) {
        button.classList.add("onion-after");
      } else {
        button.classList.remove("onion-after");
      }

      if (tickDiff < 0 && onionTickSpacing() === -tickDiff) {
        button.classList.add("onion-before");
      } else {
        button.classList.remove("onion-before");
      }
    }

    if (item.inputs) {
      button.classList.add("has-inputs");
    } else {
      button.classList.remove("has-inputs");
    }

    if (item.state) {
      button.classList.add("has-state");
    } else {
      button.classList.remove("has-state");
    }
  }
}

function updateInputPreview() {
  const history = timeline.getState(tick());
  inputsElement.innerHTML = syntaxHighlight(history?.inputs);
  stateElement.innerHTML = syntaxHighlight(history?.state);
}

function updateRenderPreview() {
  timeline.getState(tick() + onionTickSpacing());

  io.ctx.clearRect(0, 0, io.ctx.canvas.width, io.ctx.canvas.height);

  const { x, y, scalePos } = camera();
  const scale = Math.pow(2, scalePos);

  io.ctx.save();
  io.ctx.imageSmoothingEnabled = false;
  io.ctx.translate(io.ctx.canvas.width / 2, io.ctx.canvas.height / 2);
  io.ctx.scale(scale, scale);
  io.ctx.translate(-x - io.ctx.canvas.width / 2, -y - io.ctx.canvas.height / 2);

  if (onionTickSpacing() > 0) {
    const firstItem = timeline.history[0] ?? fail();
    const beforeTick = tick() - onionTickSpacing();

    if (firstItem.tick <= beforeTick) {
      io.ctx.globalAlpha = 0.5;
      const historyBefore = timeline.getState(beforeTick);
      assert(historyBefore?.state);

      // io.ctx.filter = "sepia(100%) saturate(2000%) hue-rotate(0deg)";
      render(io.ctx, historyBefore.state, historyBefore.state, peerID(), 1);
      io.ctx.globalAlpha = 1;
      io.ctx.filter = "none";
    }
  }

  {
    const history = timeline.getState(tick());
    assert(history?.state);
    updateTimelineButtons();

    render(io.ctx, history.state, history.state, peerID(), 1);
  }

  if (onionTickSpacing() > 0) {
    io.ctx.globalAlpha = 0.5;
    const historyAfter = timeline.getState(tick() + onionTickSpacing());
    assert(historyAfter?.state);

    // io.ctx.filter = "sepia(100%) saturate(2000%) hue-rotate(90deg)";
    render(io.ctx, historyAfter.state, historyAfter.state, peerID(), 1);
    io.ctx.globalAlpha = 1;
    io.ctx.filter = "none";
  }

  io.ctx.restore();

  updateTimelineHistory();
}

tick.subscribe(() => {
  updateInputPreview();
  updateRenderPreview();
});

onionTickSpacing.subscribe(() => {
  updateInputPreview();
  updateRenderPreview();
});

camera.subscribe((value) => {
  if (value.x === 0 && value.y === 0 && value.scalePos === 0) {
    resetCamera.disabled = true;
  } else {
    resetCamera.disabled = false;
  }
  updateRenderPreview();
});

scrollTimeline();
