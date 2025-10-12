import { init, render, tick } from "../game/game.js";
import { fail, setupCanvas } from "../lib/utils.js";

import { setupConnection } from "../lib/conn.js";
import { TICK_RATE } from "../lib/rollback.js";

setupConnection("debug", () => {});

/** @template T */
class PersistedValue {
  /** @type {T} */
  #current;
  /** @type {string} */
  #key;

  /** @type {((value: T) => void)[]} */
  #listeners = [];

  /**
   * @param {string} key
   * @param {() => T} fallback
   */
  constructor(key, fallback) {
    this.#key = key;
    const stored = localStorage.getItem(this.#key);
    this.#current = stored ? JSON.parse(stored) : fallback();
  }

  get value() {
    return this.#current;
  }

  set value(newValue) {
    this.#current = newValue;
    this.update();
  }

  update() {
    localStorage.setItem(this.#key, JSON.stringify(this.#current));
    for (const fn of this.#listeners) {
      fn(this.value);
    }
  }

  /**
   *
   * @param {(value: T) => void} fn
   */
  addListener(fn) {
    this.#listeners.push(fn);
    fn(this.value);
  }
}

let snapshots = [init()];

let inputs = new PersistedValue("inputs", () => [{}]);

let currentTick = new PersistedValue("currentTick", () => 0);

let tickRateMult = new PersistedValue("tickRateMult", () => 1);

let deviceID = new PersistedValue("deviceID", () => "a");

let loop = new PersistedValue("loop", () => false);
let loopFrom = new PersistedValue("loopFrom", () => 1);
let loopTicks = new PersistedValue("loopTicks", () => 1);

const loopElement = /** @type {HTMLInputElement} */ (document.getElementById("loop") ?? fail());
const loopFromElement = /** @type {HTMLInputElement} */ (document.getElementById("loop-from") ?? fail());
const loopTicksElement = /** @type {HTMLInputElement} */ (document.getElementById("loop-ticks") ?? fail());
const tickInputElement = /** @type {HTMLInputElement} */ (document.getElementById("tick-input") ?? fail());
const playElement = /** @type {HTMLInputElement} */ (document.getElementById("tick-play") ?? fail());
const deviceSelectElement = /** @type {HTMLSelectElement} */ (document.getElementById("device-select") ?? fail());
const tickRateMultElement = /** @type {HTMLSelectElement} */ (document.getElementById("tick-rate-select") ?? fail());
const sidebarElement = /** @type {HTMLElement} */ (document.getElementById("sidebar") ?? fail());
const timelineElement = /** @type {HTMLElement} */ (document.getElementById("timeline") ?? fail());
const clearElement = /** @type {HTMLElement} */ (document.getElementById("clear") ?? fail());

function renderCurrentGame() {
  const game = snapshots[currentTick.value];
  sidebarElement.textContent =
    JSON.stringify(game, undefined, 2) + "\n" + JSON.stringify(inputs.value[currentTick.value], undefined, 2);
  if (game) {
    render(ctx, game, game, 1);
  }
}

const ctx = setupCanvas(document.getElementById("canvas"), () => {
  renderCurrentGame();
});

inputs.addListener((inputs) => {
  for (let t = 0; t < inputs.length; t++) {
    if (!timelineElement.children.item(t)) {
      const button = document.createElement("button");
      button.textContent = `${t}`;
      button.dataset.current = "false";
      button.addEventListener("click", () => {
        currentTick.value = t;
      });
      button.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        loopFrom.value = t;
        loopFromElement.valueAsNumber = t;
      });
      timelineElement.appendChild(button);
    }

    const snapshot = snapshots[t];
    if (snapshot === undefined) {
      const game = structuredClone(snapshots[t - 1] ?? fail());

      game.tick++;

      tick(game, inputs[game.tick] ?? fail());
      snapshots[t] = game;
    }
  }
});

currentTick.addListener((value) => {
  tickInputElement.valueAsNumber = currentTick.value;

  const prevButton = /** @type {HTMLButtonElement | null} */ (
    timelineElement.querySelector("button[data-current='true']")
  );

  if (prevButton) {
    prevButton.dataset.current = "false";
  }

  const currentButton = /** @type {HTMLButtonElement} */ (timelineElement.children.item(value));

  currentButton.dataset.current = "true";
  currentButton.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });

  renderCurrentGame();
});

/** @type {Function | undefined} */
let stopPlayer;

/**
 * @param {DeviceID} deviceID
 */
function play(deviceID) {
  /** @type {TickInput} */
  let combinedInputs = {};

  /**
   * @param {KeyboardEvent} event
   */
  function onkey(event) {
    event.preventDefault();
    if (event.repeat) return;

    combinedInputs[event.key.toLocaleLowerCase()] = Number(event.type === "keydown");

    if (event.key === "Escape") {
      stopPlayer?.();
    }
  }

  ctx.canvas.addEventListener("keydown", onkey);
  ctx.canvas.addEventListener("keyup", onkey);
  ctx.canvas.focus();

  const interval = setInterval(() => {
    const newTick = currentTick.value + 1;

    while (snapshots.at(-1)?.tick ?? -1 >= newTick) {
      snapshots.pop();
    }

    inputs.value[newTick] = structuredClone({ ...(inputs.value[newTick] ?? {}), [deviceID]: combinedInputs });
    inputs.update();

    currentTick.value = newTick;
  }, TICK_RATE / tickRateMult.value);

  stopPlayer = () => {
    ctx.canvas.removeEventListener("keydown", onkey);
    ctx.canvas.removeEventListener("keyup", onkey);
    clearInterval(interval);
  };
}

function loopFunc() {
  if (loop.value) {
    currentTick.value = loopFrom.value + ((currentTick.value - loopFrom.value + 1) % loopTicks.value);
  }

  setTimeout(loopFunc, TICK_RATE / tickRateMult.value);
}
loopFunc();

playElement.addEventListener("click", () => {
  play(deviceID.value);
});

deviceSelectElement.value = deviceID.value;
deviceSelectElement.addEventListener("change", () => {
  deviceID.value = deviceSelectElement.value;
});

tickRateMultElement.value = tickRateMult.value.toString();
tickRateMultElement.addEventListener("change", () => {
  tickRateMult.value = parseFloat(tickRateMultElement.value);
});

tickInputElement.addEventListener("input", () => {
  currentTick.value = tickInputElement.valueAsNumber;
});

loopElement.checked = loop.value;
loopElement.addEventListener("input", () => {
  loop.value = loopElement.checked;
});

loopFromElement.valueAsNumber = loopFrom.value;
loopFromElement.addEventListener("input", () => {
  loopFrom.value = loopFromElement.valueAsNumber;
});

loopTicksElement.valueAsNumber = loopTicks.value;
loopTicksElement.addEventListener("input", () => {
  loopTicks.value = loopTicksElement.valueAsNumber;
});

clearElement.addEventListener("click", () => {
  localStorage.clear();
  window.location.reload();
});
