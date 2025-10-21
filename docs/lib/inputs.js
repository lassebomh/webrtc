import { assert, fail } from "./utils.js";

/**
 * @template TGame
 */
class RollbackEngine {
  /**
   * @param {{ tick: number, state: TGame, inputs: InputRecord}} init
   * @param {(prev: TGame, inputs: InputRecord) => void} tickFunc
   */
  constructor(init, tickFunc) {
    /** @type {{tick: number, inputs: InputRecord, mergedInputs: InputRecord | null, state: TGame | null}[]} */
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

  /** @type {DeviceInputs[]} */
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

    window.addEventListener("gamepadconnected", (ev) => {
      if (ev.gamepad.index < this.gamepadInputs.length - 1) {
        this.gamepadInputs.push({ is_gamepad: 1 });
      }
    });

    setInterval(() => {
      for (const gamepad of navigator.getGamepads()) {
        if (gamepad) {
          const inputs = this.gamepadInputs[gamepad.index] ?? fail();

          if (gamepad.axes.length >= 6) {
            const [lstickx, lsticky, rstickx, rsticky, ltrigger, rtrigger] =
              /** @type {[number,number,number,number,number,number]} */ (gamepad.axes);

            inputs.lstickx = lstickx;
            inputs.lsticky = lsticky;
            inputs.rstickx = rstickx;
            inputs.rsticky = rsticky;
            inputs.ltrigger = (ltrigger + 1) / 2;
            inputs.rtrigger = (rtrigger + 1) / 2;
          }

          if (gamepad.buttons.length >= 6) {
            const [buttona, buttonb, buttony, buttonx, lshoulder, rshoulder] =
              /** @type {[number,number,number,number,number,number]} */ (gamepad.buttons.map((x) => x.value));
            inputs.buttona = buttona;
            inputs.buttonb = buttonb;
            inputs.buttony = buttony;
            inputs.buttonx = buttonx;
            inputs.lshoulder = lshoulder;
            inputs.rshoulder = rshoulder;
          }
        }
      }
    }, 1000 / 60);
  }

  flush() {}
}

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
