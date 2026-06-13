import { init, render, tick } from "../game/game.js";
import { IOController } from "../lib/inputs.js";
import { Timeline } from "../lib/timeline.js";
import { fail } from "../shared/utils.js";

const PLAYER_COLORS = ["#cc2222", "#2288cc", "#22aa22", "#cccc22"];

const TICK_RATE = 1000 / 60;

let viewStart = -30;
let viewEnd = 30;
let viewChange = 0;
let selectedTrack = 0;
let playSpeed = 1;
let playing = 0;

let onion = 0;

let cameraX = 0;
let cameraY = 0;
let cameraZoomPosition = 0;
let cameraZoomPositionChange = 0;
let cameraZoom = 1;

const timeline = new Timeline(
  [
    {
      tick: 0,
      state: init(0, false),
      inputs: {},
      mergedInputs: {},
    },
  ],
  tick,
);

{
  // Interaction state
  /** @type {{ x: number; prevX: number, viewStart: number; viewEnd: number } | null} */
  let drag = null;

  const tracksContainer = /** @type {HTMLCanvasElement} */ (
    document.getElementById("tracks-canvas-container") ?? fail()
  );
  const tracks = /** @type {HTMLCanvasElement} */ (document.getElementById("tracks-canvas") ?? fail());
  const tracksRect = tracksContainer.getBoundingClientRect();
  const tracksCtx = tracks.getContext("2d") ?? fail();

  // Track label selection
  for (const label of document.querySelectorAll(".track-label")) {
    label.addEventListener("click", () => {
      document.querySelector(".track-label.selected")?.classList.remove("selected");
      label.classList.add("selected");
      selectedTrack = Number(/** @type {HTMLElement} */ (label).dataset.track);
    });
  }

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
      const range = viewEnd - viewStart;
      if (e.shiftKey) {
        viewChange += (range * e.deltaY) / -60000;
      } else {
        const tickUnderMouse = viewStart + 0.5 * range;

        const zoomFactor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
        const newRange = Math.max(4, Math.min(10000, range * zoomFactor));

        viewStart = tickUnderMouse - 0.5 * newRange;
        viewEnd = tickUnderMouse + 0.5 * newRange;
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
        viewStart,
        viewEnd,
      };
      e.preventDefault();
      tracks.classList.add("panning");
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (drag) {
      const dx = e.clientX - drag.x;
      const tickDelta = (dx / tracksRect.width) * (drag.viewEnd - drag.viewStart);
      viewStart = drag.viewStart - tickDelta;
      viewEnd = drag.viewEnd - tickDelta;

      viewChange = -((e.clientX - drag.prevX) / tracksRect.width) * (drag.viewEnd - drag.viewStart);
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
      viewChange = (dt / TICK_RATE) * playing * playSpeed;
    }

    if (!drag) {
      viewStart += viewChange;
      viewEnd += viewChange;
      viewChange *= Math.pow(0.5, dt / 150);
    }

    if (drag && playing === 0) {
      viewChange *= Math.pow(0.5, dt / 50);
    }

    const viewUnderflow = -Math.min(0, (viewEnd + viewStart) / 2);
    viewEnd += viewUnderflow;
    viewStart += viewUnderflow;
    if (viewUnderflow !== 0) {
      viewChange = 0;
    }

    const w = tracks.width;
    const h = tracks.height;
    const dpr = devicePixelRatio;

    tracksCtx.clearRect(0, 0, w, h);

    const range = viewEnd - viewStart;
    const trackH = h / 4;

    // Draw track backgrounds
    for (let i = 0; i < 4; i++) {
      const y = i * trackH;
      tracksCtx.fillStyle = i === selectedTrack ? (PLAYER_COLORS[i] ?? fail()) + "20" : "transparent";
      tracksCtx.fillRect(0, y, w, trackH);

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
    const firstTick = Math.floor(viewStart / subStep) * subStep;

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

    if (onion) {
      tracksCtx.setLineDash([3]);
      tracksCtx.strokeStyle = "#fff5";
      tracksCtx.lineWidth = dpr;

      {
        const x = w / 2 - (onion / range) * w;
        // Playhead line
        tracksCtx.beginPath();
        tracksCtx.moveTo(x, 0);
        tracksCtx.lineTo(x, h);
        tracksCtx.stroke();
      }
      {
        const x = w / 2 + (onion / range) * w;
        // Playhead line
        tracksCtx.beginPath();
        tracksCtx.moveTo(x, 0);
        tracksCtx.lineTo(x, h);
        tracksCtx.stroke();
      }
      tracksCtx.setLineDash([]);
    }

    for (let tick = firstTick; tick <= viewEnd; tick += subStep) {
      if (tick < -0.000001) {
        continue;
      }
      const x = ((tick - viewStart) / range) * w;
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
  const speedSelect = /** @type {HTMLSelectElement} */ (document.getElementById("speed") ?? fail());

  speedSelect.addEventListener("input", () => {
    playSpeed = parseFloat(speedSelect.value);
  });
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
  let lastFlushedTick = -1;

  /**
   * @param {number} time
   */
  function rendercanvas(time, loop = true) {
    const dt = time - prevTime;
    prevTime = time;

    cameraZoomPosition += cameraZoomPositionChange / 2000;
    cameraZoomPositionChange *= Math.pow(0.5, dt / 50);
    cameraZoom = Math.pow(0.5, cameraZoomPosition / 10);

    const viewCenter = Math.max(0, (viewEnd + viewStart) / 2);
    const tickLeft = Math.floor(viewCenter);
    const tickRight = tickLeft + 1;
    const alpha = viewCenter - tickLeft;

    io.ctx.save();
    io.ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (!recording) {
      io.ctx.translate(canvasWidth / 2, canvasHeight / 2);
      io.ctx.scale(cameraZoom, cameraZoom);
      io.ctx.translate(-canvasWidth / 2 + cameraX, -canvasHeight / 2 + cameraY);
    } else {
      const flushTick = Math.floor(viewCenter);
      if (flushTick > lastFlushedTick) {
        const inputs = io.flush();
        lastFlushedTick = flushTick;
        timeline.addInputs(flushTick, selectedTrack.toString(), inputs);
      }
    }

    if (!recording && onion > 0) {
      const beforeTick = viewCenter - onion;
      const tickLeft = Math.floor(beforeTick);
      const tickRight = tickLeft + 1;
      const alpha = beforeTick - tickLeft;

      if (tickLeft >= 0) {
        io.ctx.globalAlpha = 0.5;
        const historyBefore = timeline.getState(tickLeft);
        const historyBeforeNext = timeline.getState(tickRight);

        if (historyBefore?.state && historyBeforeNext?.state) {
          render(io.ctx, historyBefore.state, historyBeforeNext.state, selectedTrack.toString(), alpha);
          io.ctx.globalAlpha = 1;
          io.ctx.filter = "none";
        }
      }
    }

    let stateLeft = timeline.getState(tickLeft);
    let stateRight = timeline.getState(tickRight);

    if (stateLeft?.state && stateRight?.state) {
      render(io.ctx, stateLeft.state, stateRight.state, selectedTrack.toString(), alpha);
    } else {
      console.warn("not found", tickLeft, stateLeft, tickRight, stateRight);
    }

    if (!recording && onion > 0) {
      const afterTick = viewCenter + onion;
      const tickLeft = Math.floor(afterTick);
      const tickRight = tickLeft + 1;
      const alpha = afterTick - tickLeft;

      if (tickLeft > 0) {
        io.ctx.globalAlpha = 0.5;
        const historyAfter = timeline.getState(tickLeft);
        const historyAfterNext = timeline.getState(tickRight);

        if (historyAfter?.state && historyAfterNext?.state) {
          render(io.ctx, historyAfter.state, historyAfterNext.state, selectedTrack.toString(), alpha);
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
      cameraZoomPositionChange += e.deltaY;
    },
    { passive: false },
  );

  canvasOverlay.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      canvasOverlay.classList.add("panning");
      cameraZoomPositionChange = 0;

      let lastX = e.clientX;
      let lastY = e.clientY;
      /**
       * @param {MouseEvent} e
       */
      function onmove({ clientX, clientY }) {
        const dx = clientX - lastX;
        const dy = clientY - lastY;

        cameraX += dx / cameraZoom;
        cameraY += dy / cameraZoom;
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
    recording = !recording;

    if (recording) {
      canvasContainer.classList.add("recording");
      record.classList.add("recording");
      record.blur();
      canvasContainer.focus();
      playing = 1;
      io.flush();
      lastFlushedTick = Math.floor(Math.max(0, (viewEnd + viewStart) / 2));
      io.canvasWidth = canvasWidth;
      io.canvasHeight = canvasHeight;
      const peer = selectedTrack.toString();
      for (const historyEntry of timeline.history) {
        if (historyEntry.tick >= lastFlushedTick) {
          delete historyEntry.inputs[peer];
        }
      }
    } else {
      canvasContainer.classList.remove("recording");
      record.classList.remove("recording");

      playing = 0;
      viewChange = 0;
    }
  });

  const onionInput = /** @type {HTMLInputElement} */ (document.getElementById("onion") ?? fail());

  onionInput.addEventListener("input", () => {
    onion = onionInput.valueAsNumber;
  });
}
