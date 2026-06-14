import { init, render, tick } from "../game/game.js";
import { IOController } from "../lib/inputs.js";
import { Timeline } from "../lib/timeline.js";
import { fail } from "../shared/utils.js";

const PLAYER_COLORS = ["#cc2222", "#2288cc", "#22aa22", "#cccc22"];

const TICK_RATE = 1000 / 60;

/**
 * @param  {number} mapIndex
 */
function getDefaultState(mapIndex) {
  /** @type {Array<Array<{startTick: number, endTick: number | null}>>} */
  const peerInputRanges = [[], [], [], []];

  return {
    viewStart: -30,
    viewEnd: 30,
    viewChange: 0,
    selectedTrack: 0,
    playSpeed: 1,
    onion: 0,
    cameraX: 0,
    cameraY: 0,
    peerInputRanges,
    cameraZoomPosition: 0,
    cameraZoomPositionChange: 0,
    cameraZoom: 1,
    mapIndex: mapIndex,
    history: /** @type {HistoryEntry<Game>[]} */ ([
      {
        tick: 0,
        state: init(mapIndex, false),
        inputs: {},
        mergedInputs: {},
      },
    ]),
  };
}

let playing = 0;

/** @type {ReturnType<typeof getDefaultState>} */
let state = JSON.parse(localStorage.getItem("debugger_state") ?? JSON.stringify(getDefaultState(0)));
for (const historyEntry of state.history) {
  if (historyEntry.tick > 0) {
    historyEntry.mergedInputs = null;
    historyEntry.state = null;
  }
}

const timeline = new Timeline(state.history, tick);

setInterval(() => {
  localStorage.setItem("debugger_state", JSON.stringify(state));
}, 2000);

const inputsViewer = /** @type {HTMLElement} */ (document.getElementById("inputs-viewer") ?? fail());
function updateInputsViewer() {
  const viewCenter = Math.max(0, (state.viewEnd + state.viewStart) / 2);
  const tickLeft = Math.floor(viewCenter);
  const peer = state.selectedTrack.toString();
  let stateLeft = timeline.getState(tickLeft);

  if (stateLeft?.state) {
    inputsViewer.textContent = JSON.stringify(stateLeft.mergedInputs?.[peer] ?? null, undefined, 2);
  }
}

{
  const speedDropdown = document.getElementById("speed") ?? fail();
  const speedOptions = /** @type {HTMLElement[]} */ ([...speedDropdown.querySelectorAll(".dropdown-option")]);
  const speedSelected = /** @type {HTMLElement} */ (speedDropdown.querySelector(".dropdown-selected") ?? fail());

  for (const option of speedOptions) {
    option.addEventListener("click", () => {
      state.playSpeed = parseFloat(option.dataset["value"] ?? fail());
      refreshSelectedSpeed();
    });
  }

  function refreshSelectedSpeed() {
    for (const option of speedOptions) {
      if (option.dataset["value"] === state.playSpeed.toString()) {
        option.classList.add("selected");
        speedSelected.textContent = option.textContent;
      } else {
        option.classList.remove("selected");
      }
    }
  }

  refreshSelectedSpeed();

  const resetDropdown = document.getElementById("reset") ?? fail();
  const resetOptions = /** @type {HTMLElement[]} */ ([...resetDropdown.querySelectorAll(".dropdown-option")]);
  const resetSelected = /** @type {HTMLElement} */ (resetDropdown.querySelector(".dropdown-selected") ?? fail());

  resetSelected.addEventListener("click", () => {
    const newState = getDefaultState(state.mapIndex);
    state.history.splice(0, state.history.length, ...newState.history);
    newState.history = state.history;
    state = newState;

    refreshSelectedMap();
    refreshSelectedTrack();
    refreshSelectedSpeed();
    updateInputsViewer();
  });

  for (const option of resetOptions) {
    option.addEventListener("click", () => {
      const index = parseInt(option.dataset["value"] ?? fail());
      const newState = getDefaultState(index);
      state.history.splice(0, state.history.length, ...newState.history);
      newState.history = state.history;
      state = newState;
      refreshSelectedMap();
      refreshSelectedTrack();
      refreshSelectedSpeed();
      updateInputsViewer();
    });
  }

  function refreshSelectedMap() {
    for (const option of resetOptions) {
      if (option.dataset["value"] === state.history[0]?.state?.level.toString()) {
        option.classList.add("selected");
      } else {
        option.classList.remove("selected");
      }
    }
  }

  refreshSelectedMap();

  // Interaction state
  /** @type {{ x: number; prevX: number, viewStart: number; viewEnd: number } | null} */
  let drag = null;

  const tracksContainer = /** @type {HTMLCanvasElement} */ (
    document.getElementById("tracks-canvas-container") ?? fail()
  );
  const tracks = /** @type {HTMLCanvasElement} */ (document.getElementById("tracks-canvas") ?? fail());
  const tracksRect = tracksContainer.getBoundingClientRect();
  const tracksCtx = tracks.getContext("2d") ?? fail();
  const trackLabels = /** @type {HTMLElement[]} */ ([...document.querySelectorAll(".track-label")]);

  function refreshSelectedTrack() {
    document.querySelector(".track-label.selected")?.classList.remove("selected");
    for (const label of trackLabels) {
      if (label.dataset.track === state.selectedTrack.toString()) {
        label.classList.add("selected");
      }
    }
  }

  // Track label selection
  for (const label of trackLabels) {
    label.addEventListener("click", () => {
      state.selectedTrack = Number(label.dataset.track);
      refreshSelectedTrack();
      updateInputsViewer();
    });
  }
  refreshSelectedTrack();

  // Resize handling
  const tracksObserver = new ResizeObserver((entries) => {
    const { blockSize, inlineSize } = entries[0]?.contentBoxSize[0] ?? fail();
    tracks.width = Math.round(inlineSize * devicePixelRatio);
    tracks.height = Math.round(blockSize * devicePixelRatio);
    tracks.style.width = inlineSize + "px";
    tracks.style.height = blockSize + "px";
    tracksRect.width = inlineSize;
    tracksRect.height = blockSize;
    renderTracks(performance.now(), false);
  });
  tracksObserver.observe(tracksContainer);

  // Zoom with scroll wheel
  tracks.addEventListener(
    "wheel",
    (e) => {
      const range = state.viewEnd - state.viewStart;
      if (e.shiftKey) {
        state.viewChange += (range * e.deltaY) / -60000;
      } else {
        const tickUnderMouse = state.viewStart + 0.5 * range;

        const zoomFactor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
        const newRange = Math.max(4, Math.min(10000, range * zoomFactor));

        state.viewStart = tickUnderMouse - 0.5 * newRange;
        state.viewEnd = tickUnderMouse + 0.5 * newRange;
      }
    },
    { passive: true },
  );

  // Pan with mouse drag
  tracks.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      // Middle click or shift+left click to pan
      drag = {
        x: e.clientX,
        prevX: e.clientX,
        viewStart: state.viewStart,
        viewEnd: state.viewEnd,
      };
      e.preventDefault();
      tracks.classList.add("panning");
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (drag) {
      const dx = e.clientX - drag.x;
      const tickDelta = (dx / tracksRect.width) * (drag.viewEnd - drag.viewStart);
      state.viewStart = drag.viewStart - tickDelta;
      state.viewEnd = drag.viewEnd - tickDelta;

      state.viewChange = -((e.clientX - drag.prevX) / tracksRect.width) * (drag.viewEnd - drag.viewStart);
      drag.prevX = e.clientX;
    }
  });

  window.addEventListener("mouseup", (e) => {
    drag = null;
    tracks.classList.remove("panning");
  });

  /**
   * @param {number} x
   * @param {number} y
   * @returns
   */
  function getBaseLog(x, y) {
    return Math.log(y) / Math.log(x);
  }

  let prevTime = performance.now();
  /**
   * @param {number} time
   */
  function renderTracks(time, loop = true) {
    const dt = time - prevTime;
    prevTime = time;

    if (playing !== 0) {
      state.viewChange = (dt / TICK_RATE) * playing * state.playSpeed;
    }

    if (!drag) {
      state.viewStart += state.viewChange;
      state.viewEnd += state.viewChange;
      state.viewChange *= Math.pow(0.5, dt / 150);
    }

    if (drag && playing === 0) {
      state.viewChange *= Math.pow(0.5, dt / 50);
    }

    const viewUnderflow = -Math.min(0, (state.viewEnd + state.viewStart) / 2);
    state.viewEnd += viewUnderflow;
    state.viewStart += viewUnderflow;
    if (viewUnderflow !== 0) {
      state.viewChange = 0;
    }

    const w = tracks.width;
    const h = tracks.height;
    const dpr = devicePixelRatio;

    tracksCtx.clearRect(0, 0, w, h);

    const range = state.viewEnd - state.viewStart;
    const trackH = h / 4;

    // Draw track backgrounds
    for (let i = 0; i < 4; i++) {
      const y = i * trackH;
      const color = PLAYER_COLORS[i] ?? fail();
      // tracksCtx.fillStyle = i === state.selectedTrack ? color + "20" : "transparent";
      // tracksCtx.fillRect(0, y, w, trackH);

      const inputRanges = state.peerInputRanges[i] ?? fail();

      tracksCtx.fillStyle = color + (i === state.selectedTrack ? "90" : "40");

      for (const { startTick, endTick } of inputRanges) {
        const start = startTick;
        const end = endTick ?? state.viewStart + range / 2;
        if (end > state.viewStart || start < state.viewEnd) {
          const x = ((start - state.viewStart) / range) * w;
          const tickSpan = end - start;
          tracksCtx.fillRect(x, y, (tickSpan / range) * w, trackH);
        }
      }
      // Track divider
      if (i > 0) {
        tracksCtx.strokeStyle = "#333";
        tracksCtx.lineWidth = dpr;
        tracksCtx.beginPath();
        tracksCtx.moveTo(0, y);
        tracksCtx.lineTo(w, y);
        tracksCtx.stroke();
      }
    }

    // Tick marks
    const logStep = 5;
    const step = Math.max(1, Math.pow(logStep, Math.round(getBaseLog(logStep, range / 20))));
    const subStep = Math.max(1, step / logStep);
    const firstTick = Math.floor(state.viewStart / subStep) * subStep;

    tracksCtx.textAlign = "center";
    tracksCtx.textBaseline = "top";
    tracksCtx.font = `900 ${10 * dpr}px monospace`;

    {
      // Playhead line
      tracksCtx.strokeStyle = "#ffff";
      tracksCtx.lineWidth = dpr;
      tracksCtx.beginPath();
      tracksCtx.moveTo(w / 2, 0);
      tracksCtx.lineTo(w / 2, h);
      tracksCtx.stroke();
    }

    if (state.onion) {
      tracksCtx.setLineDash([3]);
      tracksCtx.strokeStyle = "#fff5";
      tracksCtx.lineWidth = dpr;

      {
        const x = w / 2 - (state.onion / range) * w;
        // Playhead line
        tracksCtx.beginPath();
        tracksCtx.moveTo(x, 0);
        tracksCtx.lineTo(x, h);
        tracksCtx.stroke();
      }
      {
        const x = w / 2 + (state.onion / range) * w;
        // Playhead line
        tracksCtx.beginPath();
        tracksCtx.moveTo(x, 0);
        tracksCtx.lineTo(x, h);
        tracksCtx.stroke();
      }
      tracksCtx.setLineDash([]);
    }

    for (let tick = firstTick; tick <= state.viewEnd; tick += subStep) {
      if (tick < -0.000001) {
        continue;
      }
      const x = ((tick - state.viewStart) / range) * w;
      const isMajor = Math.abs(tick - Math.round(tick / step) * step) < subStep * 0.1;

      if (isMajor) {
        // Major tick line
        tracksCtx.strokeStyle = "#fff4";
        tracksCtx.lineWidth = dpr;
        tracksCtx.beginPath();
        tracksCtx.moveTo(x, 0);
        tracksCtx.lineTo(x, h);
        tracksCtx.stroke();

        // Label
        tracksCtx.fillStyle = "#aaa";
        tracksCtx.fillText(String(Math.round(tick)), x, 2 * dpr);
      } else {
        // Minor tick line
        tracksCtx.strokeStyle = "#fff2";
        tracksCtx.lineWidth = dpr;
        tracksCtx.beginPath();
        tracksCtx.moveTo(x, 0);
        tracksCtx.lineTo(x, h);
        tracksCtx.stroke();
      }
    }

    {
      // Playhead chevron
      const chevH = 6 * dpr;
      const chevW = 6 * dpr;
      tracksCtx.fillStyle = "#fff";
      tracksCtx.beginPath();
      tracksCtx.moveTo(w / 2 + chevW, h);
      tracksCtx.lineTo(w / 2 - chevW, h);
      tracksCtx.lineTo(w / 2, h - chevH);
      tracksCtx.closePath();
      tracksCtx.fill();
    }

    if (loop) requestAnimationFrame(renderTracks);
  }

  renderTracks(performance.now());
}

{
  const playButtons = [document.getElementById("play-reverse") ?? fail(), document.getElementById("play") ?? fail()];

  for (let i = 0; i < playButtons.length; i++) {
    const direction = i === 0 ? -1 : 1;
    const button = playButtons[i] ?? fail();

    button.addEventListener("mousedown", () => {
      playing = direction;

      document.addEventListener(
        "mouseup",
        () => {
          playing = 0;
        },
        { once: true },
      );
    });
  }
}

{
  const canvasContainer = /** @type {HTMLElement} */ (document.getElementById("canvas-container") ?? fail());
  const canvasOverlay = /** @type {HTMLElement} */ (document.getElementById("canvas-overlay") ?? fail());

  let recording = false;

  let canvasWidth = -1;
  let canvasHeight = -1;

  let io = new IOController(canvasContainer, (w, h) => {
    canvasWidth = w;
    canvasHeight = h;
    rendercanvas(performance.now(), false);
  });
  canvasWidth = io.canvasWidth ?? fail();
  canvasHeight = io.canvasHeight ?? fail();

  let prevTime = performance.now();
  let lastSeenTick = -1;

  /**
   * @param {number} time
   */
  function rendercanvas(time, loop = true) {
    const dt = time - prevTime;
    prevTime = time;

    state.cameraZoomPosition += state.cameraZoomPositionChange / 2000;
    state.cameraZoomPositionChange *= Math.pow(0.5, dt / 50);
    state.cameraZoom = Math.pow(0.5, state.cameraZoomPosition / 5);

    const viewCenter = Math.max(0, (state.viewEnd + state.viewStart) / 2);
    const tickLeft = Math.floor(viewCenter);
    const tickRight = tickLeft + 1;
    const alpha = viewCenter - tickLeft;

    const peer = state.selectedTrack.toString();

    io.ctx.save();
    io.ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    let tickUpdate = false;
    const currentTick = Math.floor(viewCenter);
    if (currentTick !== lastSeenTick) {
      tickUpdate = true;
      lastSeenTick = currentTick;
    }

    if (!recording) {
      io.ctx.translate(canvasWidth / 2, canvasHeight / 2);
      io.ctx.scale(state.cameraZoom, state.cameraZoom);
      io.ctx.translate(-canvasWidth / 2 + state.cameraX, -canvasHeight / 2 + state.cameraY);
    } else {
      if (tickUpdate) {
        const inputs = io.flush();
        timeline.addInputs(currentTick, peer, inputs);
      }
    }

    if (!recording && state.onion > 0) {
      const beforeTick = viewCenter - state.onion;
      const tickLeft = Math.floor(beforeTick);
      const tickRight = tickLeft + 1;
      const alpha = beforeTick - tickLeft;

      if (tickLeft >= 0) {
        io.ctx.globalAlpha = 0.5;
        const historyBefore = timeline.getState(tickLeft);
        const historyBeforeNext = timeline.getState(tickRight);

        if (historyBefore?.state && historyBeforeNext?.state) {
          render(io.ctx, historyBefore.state, historyBeforeNext.state, peer, alpha);
          io.ctx.globalAlpha = 1;
          io.ctx.filter = "none";
        }
      }
    }

    let stateLeft = timeline.getState(tickLeft);
    let stateRight = timeline.getState(tickRight);

    if (stateLeft?.state && stateRight?.state) {
      render(io.ctx, stateLeft.state, stateRight.state, peer, alpha);

      if (tickUpdate) {
        updateInputsViewer();
      }
    } else {
      console.warn("not found", tickLeft, stateLeft, tickRight, stateRight);
    }

    if (!recording && state.onion > 0) {
      const afterTick = viewCenter + state.onion;
      const tickLeft = Math.floor(afterTick);
      const tickRight = tickLeft + 1;
      const alpha = afterTick - tickLeft;

      if (tickLeft > 0) {
        io.ctx.globalAlpha = 0.5;
        const historyAfter = timeline.getState(tickLeft);
        const historyAfterNext = timeline.getState(tickRight);

        if (historyAfter?.state && historyAfterNext?.state) {
          render(io.ctx, historyAfter.state, historyAfterNext.state, peer, alpha);
          io.ctx.globalAlpha = 1;
          io.ctx.filter = "none";
        }
      }
    }

    io.ctx.restore();

    if (loop) requestAnimationFrame(rendercanvas);
  }
  rendercanvas(performance.now());

  canvasOverlay.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      state.cameraZoomPositionChange += e.deltaY;
    },
    { passive: false },
  );

  canvasOverlay.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      canvasOverlay.classList.add("panning");
      state.cameraZoomPositionChange = 0;

      let lastX = e.clientX;
      let lastY = e.clientY;
      /**
       * @param {MouseEvent} e
       */
      function onmove({ clientX, clientY }) {
        const dx = clientX - lastX;
        const dy = clientY - lastY;

        state.cameraX += dx / state.cameraZoom;
        state.cameraY += dy / state.cameraZoom;
        lastX = clientX;
        lastY = clientY;
      }

      window.addEventListener("mousemove", onmove);
      window.addEventListener(
        "mouseup",
        (e) => {
          window.removeEventListener("mousemove", onmove);

          canvasOverlay.classList.remove("panning");
        },
        { once: true },
      );
    }
  });

  const record = document.getElementById("record") ?? fail();

  record.addEventListener("click", () => {
    recording = true;
    const startTick = Math.floor(Math.max(0, (state.viewEnd + state.viewStart) / 2));
    const peer = state.selectedTrack.toString();

    playing = 1;

    io.flush();
    io.canvasWidth = canvasWidth;
    io.canvasHeight = canvasHeight;
    for (const historyEntry of timeline.history) {
      if (historyEntry.tick >= startTick) {
        delete historyEntry.inputs[peer];
      }
    }

    canvasContainer.classList.add("recording");
    record.classList.add("recording");
    record.blur();
    canvasContainer.focus();

    const inputRange = {
      startTick: startTick,
      endTick: /** @type {number | null} */ (null),
    };

    const ranges = state.peerInputRanges[state.selectedTrack] ?? fail();
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i] ?? fail();
      if (range.startTick >= startTick) {
        ranges.splice(i, 1);
        i--;
      } else if (range.endTick ?? fail() > startTick) {
        range.endTick = startTick;
      }
    }

    ranges.push(inputRange);
    const abort = new AbortController();

    function stop() {
      recording = false;
      canvasContainer.classList.remove("recording");
      record.classList.remove("recording");
      inputRange.endTick = Math.floor(Math.max(0, (state.viewEnd + state.viewStart) / 2));

      playing = 0;
      state.viewChange = 0;
      abort.abort();
    }

    record.addEventListener("click", (e) => (e.stopImmediatePropagation(), stop()), {
      capture: true,
      signal: abort.signal,
    });
    window.addEventListener("keydown", (e) => e.key === "Escape" && stop(), { signal: abort.signal });
  });

  const onionInput = /** @type {HTMLInputElement} */ (document.getElementById("onion") ?? fail());

  onionInput.addEventListener("input", () => {
    state.onion = onionInput.valueAsNumber;
  });
}
