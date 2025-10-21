import { assert, fail } from "./utils.js";

/**
 * @template TState
 */
class RollbackEngine {
  /**
   * @param {{ tick: number, state: TState, inputs: InputRecord}} init
   * @param {(prev: TState, inputs: InputRecord) => void} tickFunc
   */
  constructor(init, tickFunc) {
    /** @type {{tick: number, inputs: InputRecord, mergedInputs: InputRecord | null, state: TState | null}[]} */
    this.history = [
      {
        tick: 0,
        inputs: init.inputs, // inputs used for the NEXT tick
        mergedInputs: init.inputs,
        state: init.state,
      },
    ];
    this.tickFunc = tickFunc;
  }

  /**
   * Inserts input data into the history,
   *
   * @param {number} tick
   * @param {InputRecord} inputs These inputs will we used for tick+1
   */
  addInputs(tick, inputs) {
    const firstItem = this.history.at(0) ?? fail();
    if (firstItem.tick > tick) fail("Input is older than first item");

    let index = this.history.findLastIndex((x) => x.tick <= tick && x.state !== null);
    let item = this.history[index] ?? fail();

    const lastItem = this.history.at(-1) ?? fail();

    const itemsToCreate = Math.max(tick - lastItem.tick, 0);
    for (let i = 0; i < itemsToCreate; i++) {
      this.history.push({
        tick: lastItem.tick + i + 1,
        inputs: {},
        mergedInputs: null,
        state: null,
      });
    }

    let expectedTick = item.tick;

    for (let i = index; i < this.history.length; i++) {
      let item = this.history[i] ?? fail();
      if (item.tick !== expectedTick) {
        item = {
          tick: expectedTick,
          inputs: {},
          mergedInputs: null,
          state: null,
        };
        this.history.splice(i, 0, item);
      }
      if (item.tick > tick) {
        item.state = null;
        item.mergedInputs = null;
      } else if (item.tick === tick) {
        item.mergedInputs = structuredClone(this.history[i - 1]?.mergedInputs ?? {});

        for (const device in inputs) {
          // assert(item.inputs[device] === undefined, "cannot override existing device inputs");
          item.inputs[device] = inputs[device] ?? fail();
          item.mergedInputs[device] = inputs[device] ?? fail();
        }
      }
      expectedTick++;
      // assert(expectedTick < 100, "OVERFLOW");
    }
  }

  /**
   * @param {number} tick
   */
  getState(tick) {
    const lastItemBeforeIndex = this.history.findLastIndex((x) => x.tick <= tick && x.state !== null);
    const lastItemBefore = this.history[lastItemBeforeIndex] ?? fail();
    const lastItem = this.history.at(-1) ?? fail();

    const itemsToCreate = Math.max(tick - lastItem.tick, 0);
    for (let i = 0; i < itemsToCreate; i++) {
      this.history.push({
        tick: lastItem.tick + i + 1,
        inputs: {},
        mergedInputs: null,
        state: null,
      });
    }

    const ticksToProcess = tick - lastItemBefore.tick;

    for (let x = 0; x < ticksToProcess; x++) {
      const index = lastItemBeforeIndex + x;

      const item = this.history[index] ?? fail();
      assert(item.state !== null && item.mergedInputs !== null);

      const nextItem = this.history[index + 1] ?? fail();
      assert(nextItem.state === null && nextItem.tick === item.tick + 1);

      nextItem.mergedInputs = structuredClone(item.mergedInputs);
      nextItem.state = structuredClone(item.state);

      for (const device in nextItem.inputs) {
        nextItem.mergedInputs[device] ??= nextItem.inputs[device] ?? {};
        for (const k in nextItem.inputs[device]) {
          const key = /** @type {InputKey} */ (k);
          nextItem.mergedInputs[device][key] = nextItem.inputs[device][key];
        }
      }
      this.tickFunc(nextItem.state, item.mergedInputs);
    }

    const outputItem = this.history[lastItemBeforeIndex + ticksToProcess] ?? fail();
    assert(outputItem.tick === tick);

    return outputItem.state ?? fail();
  }
}

class InputController {
  /** @type {DeviceInputs} */
  defaultInputs = {};

  /** @type {(DeviceInputs | null)[]} */
  gamepadInputs = [];

  /** @type {number | undefined} */
  width;
  /** @type {number | undefined} */
  height;

  /**
   * @param {HTMLElement} element
   */
  constructor(element) {
    // this.fullscreenOnFocus = fullscreenOnFocus;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.width = entry.contentRect.width;
        this.height = entry.contentRect.height;
      }
    });

    resizeObserver.observe(element);

    // element.addEventListener("click", async () => {
    //   // await element.requestFullscreen();
    //   await element.requestPointerLock();
    // });

    /**
     * @type {(event: KeyboardEvent) => void}
     */
    const onkey = (event) => {
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

      this.defaultInputs[key] = Number(event.type === "keydown");
    };

    window.addEventListener("keydown", onkey);
    window.addEventListener("keyup", onkey);

    window.addEventListener("pointermove", (event) => {
      // todo fix
      if (this.width !== undefined && this.height !== undefined) {
        this.defaultInputs.mousex = event.clientX - this.width / 2;
        this.defaultInputs.mousey = event.clientY - this.height / 2;
      }
    });
    window.addEventListener("mousedown", (event) => {
      const key = event.button === 0 ? "mouseleftbutton" : "mouserightbutton";
      this.defaultInputs[key] = 1;
    });
    window.addEventListener("mouseup", (event) => {
      const key = event.button === 0 ? "mouseleftbutton" : "mouserightbutton";
      this.defaultInputs[key] = 0;
    });

    setInterval(() => {
      const gamepads = navigator.getGamepads();

      for (let i = 0; i < gamepads.length; i++) {
        const gamepad = gamepads[i];

        if (!gamepad) {
          this.gamepadInputs[i] ??= null;
          continue;
        }

        const inputs = (this.gamepadInputs[i] ??= {});
        inputs.is_gamepad = 1;

        if (gamepad.axes.length >= 6) {
          let [lstickx, lsticky, rstickx, rsticky, ltrigger, rtrigger] =
            /** @type {[number,number,number,number,number,number]} */ (gamepad.axes);
          ltrigger = (ltrigger + 1) / 2;
          rtrigger = (rtrigger + 1) / 2;

          if (Math.abs(lstickx) > 0.08) inputs.lstickx = lstickx;
          if (Math.abs(lsticky) > 0.08) inputs.lsticky = lsticky;
          if (Math.abs(rstickx) > 0.08) inputs.rstickx = rstickx;
          if (Math.abs(rsticky) > 0.08) inputs.rsticky = rsticky;
          if (ltrigger !== 0.5 && Math.abs(ltrigger) > 0.05) inputs.ltrigger = ltrigger;
          if (rtrigger !== 0.5 && Math.abs(rtrigger) > 0.05) inputs.rtrigger = rtrigger;
        }

        if (gamepad.buttons.length >= 6) {
          const [buttona, buttonb, buttony, buttonx, lshoulder, rshoulder] =
            /** @type {[number,number,number,number,number,number]} */ (gamepad.buttons.map((x) => x.value));
          if (buttona) inputs.buttona = buttona;
          if (buttonb) inputs.buttonb = buttonb;
          if (buttony) inputs.buttony = buttony;
          if (buttonx) inputs.buttonx = buttonx;
          if (lshoulder) inputs.lshoulder = lshoulder;
          if (rshoulder) inputs.rshoulder = rshoulder;
        }
      }
    }, 1000 / 60);
  }

  flush() {
    const defaultInputs = this.defaultInputs;
    const gamepadInputs = this.gamepadInputs;

    this.defaultInputs = {};
    this.gamepadInputs = [];

    return { defaultInputs, gamepadInputs };
  }
}

// const inputController = new InputController(document.getElementById("test") ?? fail());

// setInterval(() => {
//   console.log(JSON.stringify(inputController.flush()));
// }, 1000);

/** @typedef {{tick: number, value: number}} TestGame */

/**
 * @param {TestGame} state
 * @param {InputRecord} inputs
 */
function testGameTick(state, inputs) {
  state.tick++;

  for (const deviceID in inputs) {
    if (inputs[deviceID]?.d) {
      state.value += 1;
    }
    if (inputs[deviceID]?.a) {
      state.value -= 1;
    }
  }
}

// once we reach the target tick, see if any values are wrong (compared to the flat record)
(async () => {
  const rollback = new RollbackEngine({ inputs: {}, state: { tick: 0, value: 0 }, tick: 0 }, testGameTick);

  function print() {
    const ticks = rollback.history.map((x) => ({
      tick: x.tick,
      a_held: x?.inputs?.["x"]?.a,
      a_merged_held: x?.mergedInputs?.["x"]?.a,
      d_held: x?.inputs?.["x"]?.d,
      d_merged_held: x?.mergedInputs?.["x"]?.d,
      value: x.state?.value,
    }));

    console.table(ticks);
  }

  rollback.addInputs(0, { x: { d: 0 } });
  rollback.getState(7);
  print();
  rollback.addInputs(1, { x: { d: 1 } });
  rollback.getState(7);
  print();
  rollback.addInputs(3, { x: { d: 0 } });
  rollback.getState(7);
  print();
  rollback.addInputs(5, { x: { a: 1, d: 1 } });
  rollback.getState(7);
  print();
})();
