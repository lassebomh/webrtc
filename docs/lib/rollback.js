import { fail, now, defaultDeviceID, setupCanvas, sleep } from "./utils.js";
import { setupConnection } from "./conn.js";

export const TICK_RATE = 1000 / 60;

/**
 * @template {IGame} TGame
 * @param {{ tick: GameFunc<TGame>, render: RenderFunc<TGame>, init: () => TGame }} tick
 */
export async function run({ tick, render, init }) {
  const roomID = (window.location.search ||= "?" + crypto.randomUUID().slice(0, 5).toUpperCase()).slice(1);

  const DELAY_TICKS = 2;
  const TICKS_PER_SNAPSHOT = 10;
  const MAX_SNAPSHOTS = 20;

  const ctx = setupCanvas(document.getElementById("canvas"));

  const statusElement = document.getElementById("fps") ?? fail();
  const fpsLogs = new Array(64).fill(0);
  let fpsCounter = 0;
  const pingLogs = new Array(64).fill(0);
  let pingCounter = 0;

  /** @type {InputEntry[]} */
  let inputEntries = [];

  /** @type {TickInputMap} */
  let baseTickInputMap = {};

  /** @type {Array<TGame>} */
  let snapshots = [];

  /** @type {TGame} */
  let game = init();

  /** @type {TGame | undefined} */
  let prevGame;

  /**
   * @param {InputEntry[]} addInputEntries
   */
  function addInputEntry(...addInputEntries) {
    inputEntries.push(...addInputEntries);
    inputEntries.sort((a, b) => a.time - b.time);

    for (const inputEntry of addInputEntries) {
      if (inputEntry.time < game.originTime + game.tick * TICK_RATE) {
        console.warn("trying to recover. behind:", now() - inputEntry.time);

        if (prevGame !== undefined) {
          snapshots.push(prevGame);
        }
        prevGame = undefined;

        /** @type {TGame} */
        let snapshot;

        while (true) {
          snapshot = snapshots.pop() ?? fail("cannot recover");

          if (inputEntry.time > snapshot.originTime + snapshot.tick * TICK_RATE) {
            break;
          }
        }

        game = snapshot;
      }
    }
  }

  /** @type {(message: Message<TGame>) => void} */
  const send = setupConnection(
    roomID,
    (/** @type {Message<TGame>} */ message) => {
      switch (message.type) {
        case "input":
          const firstEntry = message.data.at(0);
          if (firstEntry) {
            pingLogs[pingCounter++ & 63] = now() - firstEntry.time;
          }
          addInputEntry(...message.data);
          break;

        case "syncResponse":
          if (game.originTime > message.data.game.originTime) {
            snapshots = [];
            game = message.data.game;
            prevGame = undefined;
            inputEntries = message.data.inputEntries;
            baseTickInputMap = message.data.baseTickInputMap;
          }
          break;

        case "syncRequest":
          send({
            type: "syncResponse",
            data: { game, inputEntries, baseTickInputMap },
          });
          break;
      }
    },
    0
  );

  await sleep(1000); // wait for connection to open

  send({ type: "syncRequest", data: true });

  /**
   * @param {KeyboardEvent} event
   */
  function onkey(event) {
    event.preventDefault();
    if (event.repeat) return;
    /** @type {InputKey} */
    let key;
    switch (event.key) {
      case " ":
        key = "space";
        break;

      default:
        key = /** @type {InputKey} */ (event.key.toLowerCase());
        break;
    }
    /** @type {InputEntry} */
    const inputEntry = {
      time: now(),
      key,
      deviceID: defaultDeviceID,
      value: Number(event.type === "keydown"),
    };
    addInputEntry(inputEntry);
    send({ type: "input", data: [inputEntry] });
  }

  ctx.canvas.addEventListener("keydown", onkey);
  ctx.canvas.addEventListener("keyup", onkey);

  let mouseX = 0;
  let mouseY = 0;

  ctx.canvas.addEventListener("pointermove", (event) => {
    mouseX = event.clientX - window.innerWidth / 2;
    mouseY = event.clientY - window.innerHeight / 2;
  });
  ctx.canvas.addEventListener("pointerdown", (event) => {
    /** @type {InputEntry} */
    const inputEntry = {
      time: now(),
      key: event.button === 0 ? "mouseleftbutton" : "mouserightbutton",
      deviceID: defaultDeviceID,
      value: 1,
    };
    addInputEntry(inputEntry);
    send({ type: "input", data: [inputEntry] });
  });
  ctx.canvas.addEventListener("pointerup", (event) => {
    /** @type {InputEntry} */
    const inputEntry = {
      time: now(),
      key: event.button === 0 ? "mouseleftbutton" : "mouserightbutton",
      deviceID: defaultDeviceID,
      value: 0,
    };
    addInputEntry(inputEntry);
    send({ type: "input", data: [inputEntry] });
  });

  window.addEventListener("gamepadconnected", (ev) => {
    const deviceID = defaultDeviceID + "-gp-" + ev.gamepad.index.toString();
    /** @type {InputEntry} */
    const inputEntry = {
      time: now(),
      deviceID,
      key: "is_gamepad",
      value: 1,
    };
    addInputEntry(inputEntry);
    send({ type: "input", data: [inputEntry] });
  });

  setInterval(() => {
    const time = now();
    /** @type {InputEntry[]} */
    const inputEntries = [
      {
        time,
        key: "mousex",
        deviceID: defaultDeviceID,
        value: mouseX,
      },

      {
        time,
        key: "mousey",
        deviceID: defaultDeviceID,
        value: mouseY,
      },
    ];

    for (const gamepad of navigator.getGamepads()) {
      if (gamepad) {
        const deviceID = defaultDeviceID + "-gp-" + gamepad.index.toString();
        if (gamepad.axes.length >= 4) {
          const [lstickx, lsticky, rstickx, rsticky] = /** @type {[number,number,number,number]} */ (gamepad.axes);

          inputEntries.push(
            {
              time,
              deviceID,
              key: "lstickx",
              value: lstickx,
            },
            {
              time,
              deviceID,
              key: "lsticky",
              value: lsticky,
            },
            {
              time,
              deviceID,
              key: "rstickx",
              value: rstickx,
            },
            {
              time,
              deviceID,
              key: "rsticky",
              value: rsticky,
            }
          );
        }

        if (gamepad.buttons.length >= 6) {
          const [buttona, buttonb, buttony, buttonx, lt, rt] =
            /** @type {[number,number,number,number,number,number]} */ (gamepad.buttons.map((x) => x.value));
          inputEntries.push(
            {
              time,
              deviceID,
              key: "buttona",
              value: buttona,
            },
            {
              time,
              deviceID,
              key: "buttonb",
              value: buttonb,
            },
            {
              time,
              deviceID,
              key: "buttony",
              value: buttony,
            },
            {
              time,
              deviceID,
              key: "buttonx",
              value: buttonx,
            },
            {
              time,
              deviceID,
              key: "lt",
              value: lt,
            },
            {
              time,
              deviceID,
              key: "rt",
              value: rt,
            }
          );
        }
      }
    }

    addInputEntry(...inputEntries);
    send({ type: "input", data: inputEntries });
  }, TICK_RATE);

  let lastTime = 0;

  function mainloop() {
    const currentTime = now();

    while (game.tick < (currentTime - game.originTime) / TICK_RATE - DELAY_TICKS) {
      prevGame = game;

      const tickStartTime = game.originTime + (game.tick - 1) * TICK_RATE;
      const tickEndTime = tickStartTime + TICK_RATE;

      const inputEntriesInTimeWindow = inputEntries.filter((x) => x.time < tickEndTime);

      /** @type {TickInputMap} */
      const combinedInputs = structuredClone(baseTickInputMap);

      for (const inputEntry of inputEntriesInTimeWindow) {
        const combinedInput = (combinedInputs[inputEntry.deviceID] ??= {});

        combinedInput[inputEntry.key] = inputEntry.value;
      }

      game = structuredClone(game);
      game.tick++;
      tick(game, combinedInputs);

      if (game.tick % TICKS_PER_SNAPSHOT === 0) {
        snapshots.push(game);
        if (snapshots.length > MAX_SNAPSHOTS) {
          const discardedSnapshot = snapshots.shift() ?? fail();
          const time = discardedSnapshot.originTime + discardedSnapshot.tick * TICK_RATE;

          while (inputEntries[0] && inputEntries[0].time < time) {
            const input = inputEntries.shift() ?? fail();

            const deviceInputs = (baseTickInputMap[input.deviceID] ??= {});
            deviceInputs[input.key] = input.value;
          }
        }
      }
    }

    fpsLogs[fpsCounter++ & 63] = currentTime - lastTime;

    if ((fpsCounter & 15) === 0) {
      const fps = 1000 / (fpsLogs.reduce((acc, x) => acc + x, 0) / fpsLogs.length);
      const ping = pingLogs.reduce((acc, x) => acc + x, 0) / pingLogs.length;

      statusElement.textContent = `${fps.toFixed(2)} FPS ${ping.toFixed(2)} PING`;
    }

    const currentTimeTick = (now() - game.originTime) / TICK_RATE - DELAY_TICKS;

    if (prevGame !== undefined) {
      const alpha = (currentTimeTick - prevGame.tick) / (game.tick - prevGame.tick);
      render(ctx, prevGame, game, alpha);
    } else {
      render(ctx, game, game, 1);
    }

    lastTime = currentTime;

    requestAnimationFrame(mainloop);
  }

  mainloop();
}
