import { init, render, tick as tickFunc } from "../game/game.js";
import { IOController } from "../lib/inputs.js";
import { applyInputs, Timeline } from "../lib/timeline.js";
import { bindNumber, bindSelect, persistant, qs, writable } from "../lib/ui.js";
import { autoreload } from "../lib/utils.js";
import { assert, fail, sleep } from "../shared/utils.js";

autoreload();

const inputsElement = qs("#inputs", "div");
const stateElement = qs("#state", "div");
const renderElement = qs("#render", "div");

const timelineElement = qs("#timeline", "div");
const timeline = new Timeline([{ inputs: {}, tick: 0, mergedInputs: {}, state: init() }], tickFunc);

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

const playing = writable(false);

const onionBeforeElement = qs("#onion-before", "div");
const onionBeforeCountElement = qs("#onion-before-count", "input");
const onionBeforeCount = persistant("onionBeforeCount", () => 0);
bindNumber(onionBeforeCountElement, onionBeforeCount);

const onionAfterElement = qs("#onion-after", "div");
const onionAfterCountElement = qs("#onion-after-count", "input");
const onionAfterCount = persistant("onionAfterCount", () => 0);
bindNumber(onionAfterCountElement, onionAfterCount);

const playbackSpeedElement = qs("#playback-speed", "select");

await sleep(100);

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

renderElement.addEventListener("focusin", () => {
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

  const unsubPlaying = playing.subscribe((playing) => {
    if (playing) {
      clearInterval(interval);
      unsubPlaying();
    }
  });

  renderElement.addEventListener(
    "keydown",
    (event) => {
      event.key === "Escape";
    },
    {
      capture: true,
    }
  );

  renderElement.addEventListener(
    "focusout",
    () => {
      clearInterval(interval);
      unsubPlaying();
    },
    { once: true }
  );
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

      if (tickDiff > 0 && onionAfterCount() >= tickDiff) {
        button.classList.add("onion-after");
      } else {
        button.classList.remove("onion-after");
      }

      if (tickDiff < 0 && onionBeforeCount() >= -tickDiff) {
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
  inputsElement.textContent = JSON.stringify(history?.inputs, undefined, 2);
}

function updateRenderPreview() {
  timeline.getState(tick() + onionAfterCount());
  const history = timeline.getState(tick());
  assert(history?.state);
  updateTimelineButtons();
  render(io.ctx, history.state, history.state, peerID(), 1);

  const firstItem = timeline.history[0] ?? fail();

  for (let i = 0; i < onionBeforeCount(); i++) {
    /** @type {HTMLCanvasElement} */
    let canvas;
    if (onionBeforeElement.childNodes.length < i + 1) {
      canvas = document.createElement("canvas");
      onionBeforeElement.appendChild(canvas);
    } else {
      canvas = /** @type {HTMLCanvasElement} */ (onionBeforeElement.childNodes.item(i));
    }
    const beforeTick = tick() - i - 1;

    if (firstItem.tick <= beforeTick) {
      const ctx = canvas.getContext("2d") ?? fail();
      canvas.width = io.ctx.canvas.width;
      canvas.height = io.ctx.canvas.height;
      const historyBefore = timeline.getState(beforeTick);
      assert(historyBefore?.state);
      render(ctx, historyBefore.state, historyBefore.state, peerID(), 1);
    }
  }

  for (let i = 0; i < onionAfterCount(); i++) {
    /** @type {HTMLCanvasElement} */
    let canvas;
    if (onionAfterElement.childNodes.length < i + 1) {
      canvas = document.createElement("canvas");
      onionAfterElement.appendChild(canvas);
    } else {
      canvas = /** @type {HTMLCanvasElement} */ (onionAfterElement.childNodes.item(i));
    }
    const afterTick = tick() + i + 1;

    const ctx = canvas.getContext("2d") ?? fail();
    canvas.width = io.ctx.canvas.width;
    canvas.height = io.ctx.canvas.height;
    const historyAfter = timeline.getState(afterTick);
    assert(historyAfter?.state);
    render(ctx, historyAfter.state, historyAfter.state, peerID(), 1);
  }
}

tick.subscribe(() => {
  updateInputPreview();
  updateRenderPreview();
});

onionBeforeCount.subscribe(() => {
  updateInputPreview();
  updateRenderPreview();
});
onionAfterCount.subscribe(() => {
  updateInputPreview();
  updateRenderPreview();
});

tick.set(5);
