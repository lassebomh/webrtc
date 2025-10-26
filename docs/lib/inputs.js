import { assert, fail } from "./shared/utils.js";

export class DesyncError extends Error {}

/**
 * @template TState
 */
export class RollbackEngine {
  /**
   * @param {HistoryEntry<TState>[]} history
   * @param {(prev: TState, inputs: NewInputEntryRecord) => void} tickFunc
   */
  constructor(history, tickFunc) {
    /** @type {HistoryEntry<TState>[]} */
    this.history = history;
    this.tickFunc = tickFunc;
  }

  /**
   * @param {number} tick
   * @param {NewInputEntryRecord} inputs These inputs will we used for tick+1
   */
  addInputs(tick, inputs) {
    const firstItem = this.history.at(0) ?? fail();
    if (firstItem.tick > tick) fail(`Input tick ${tick} is older than first item tick ${firstItem.tick}`);

    let index = this.history.findLastIndex((x) => x.tick <= tick && x.state !== null);
    if (index === -1) {
      console.warn("input happened before first valid history entry", tick, inputs);
      return;
    }
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
        if (!item.mergedInputs) {
          const prevMergedInputs = this.history[i - 1]?.mergedInputs;
          if (prevMergedInputs) {
            item.mergedInputs = structuredClone(prevMergedInputs);
          } else {
            item.mergedInputs = {};
          }
        }

        for (const peerID in inputs) {
          item.inputs[peerID] = inputs[peerID] ?? fail();
        }

        for (const peerID in item.inputs) {
          const inputs = item.inputs[peerID] ?? fail();
          item.mergedInputs[peerID] ??= {
            defaultInputs: {},
            gamepadInputs: [],
          };
          for (const k in inputs.defaultInputs) {
            const key = /** @type {InputKey} */ (k);
            item.mergedInputs[peerID].defaultInputs[key] = inputs.defaultInputs[key];
          }
        }
      }
      expectedTick++;
    }
  }

  /**
   * @param {number} tick
   */
  getState(tick) {
    const lastItemBeforeIndex = this.history.findLastIndex((x) => x.tick <= tick && x.state !== null);
    const lastItemBefore = this.history[lastItemBeforeIndex] ?? fail(new DesyncError());
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

      for (const peerID in nextItem.inputs) {
        nextItem.mergedInputs[peerID] ??= nextItem.inputs[peerID] ?? { defaultInputs: {}, gamepadInputs: [] };

        for (const k in nextItem.inputs[peerID]?.defaultInputs) {
          const key = /** @type {InputKey} */ (k);
          nextItem.mergedInputs[peerID].defaultInputs[key] = nextItem.inputs[peerID].defaultInputs[key];
        }
      }
      this.tickFunc(nextItem.state, item.mergedInputs);
    }

    const outputItem = this.history[lastItemBeforeIndex + ticksToProcess];
    if (outputItem) {
      assert(outputItem.tick === tick);
    }

    return outputItem;
  }
}

export class InputController {
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

    window.addEventListener(
      "pointermove",
      (event) => {
        // MARK: TODO transform position with mat
        if (this.width !== undefined && this.height !== undefined) {
          this.defaultInputs.mousex = event.clientX - this.width / 2;
          this.defaultInputs.mousey = event.clientY - this.height / 2;
        }
      },
      { passive: true }
    );
    window.addEventListener("mousedown", (event) => {
      const key = event.button === 0 ? "mouseleftbutton" : "mouserightbutton";
      this.defaultInputs[key] = 1;
    });
    window.addEventListener("mouseup", (event) => {
      const key = event.button === 0 ? "mouseleftbutton" : "mouserightbutton";
      this.defaultInputs[key] = 0;
    });
  }

  flush() {
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

    const defaultInputs = this.defaultInputs;
    const gamepadInputs = this.gamepadInputs;

    this.defaultInputs = {};
    this.gamepadInputs = [];

    /** @type {NewInputEntry} */
    const inputEntry = { defaultInputs, gamepadInputs };

    return inputEntry;
  }
}

/** @typedef {{tick: number, value: number}} TestGame */

/**
 * @param {TestGame} state
 * @param {NewInputEntryRecord} inputs
 */
function testGameTick(state, inputs) {
  state.tick++;

  for (const p in inputs) {
    const peerID = /** @type {PeerID} */ (p);
    if (inputs[peerID]?.defaultInputs.d) {
      state.value += 1;
    }
    if (inputs[peerID]?.defaultInputs?.a) {
      state.value -= 1;
    }
  }
}

// // once we reach the target tick, see if any values are wrong (compared to the flat record)
// (async () => {
//   const rollback = new RollbackEngine({ inputs: {}, state: { tick: 0, value: 0 }, tick: 0 }, testGameTick);

//   function print() {
//     const ticks = rollback.history.map((x) => ({
//       tick: x.tick,
//       a_held: x?.inputs?.[/** @type {PeerID} */ ("x")]?.defaultInputs.a,
//       a_merged_held: x?.mergedInputs?.[/** @type {PeerID} */ ("x")]?.defaultInputs.a,
//       d_held: x?.inputs?.[/** @type {PeerID} */ ("x")]?.defaultInputs.d,
//       d_merged_held: x?.mergedInputs?.[/** @type {PeerID} */ ("x")]?.defaultInputs.d,
//       value: x.state?.value,
//     }));

//     console.table(ticks);
//   }

//   rollback.addInputs(0, { x: { defaultInputs: { d: 0 }, gamepadInputs: [] } });
//   rollback.getState(7);
//   print();
//   rollback.addInputs(1, { x: { defaultInputs: { d: 1 }, gamepadInputs: [] } });
//   rollback.getState(7);
//   print();
//   rollback.addInputs(3, { x: { defaultInputs: { d: 0 }, gamepadInputs: [] } });
//   rollback.getState(7);
//   print();
//   rollback.addInputs(5, { x: { defaultInputs: { a: 1 }, gamepadInputs: [] } });
//   rollback.getState(7);
//   print();
// })();
