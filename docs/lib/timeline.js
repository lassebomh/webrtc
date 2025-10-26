import { assert, fail } from "./shared/utils.js";

export class DesyncError extends Error {}

/**
 * @param {PeerInputs} from
 * @param {PeerInputs} to
 */
function applyInputs(from, to) {
  Object.assign(to.keyboard, from.keyboard);
  Object.assign(to.mouse, from.mouse);
  if (from.canvasWidth) to.canvasWidth = from.canvasWidth;
  if (from.canvasHeight) to.canvasHeight = from.canvasHeight;
  //MARK: Todo controller
}

/**
 * @template TState
 */
export class Timeline {
  /**
   * @param {HistoryEntry<TState>[]} history
   * @param {(prev: TState, inputs: Record<PeerID, PeerInputs>) => void} tickFunc
   */
  constructor(history, tickFunc) {
    /** @type {HistoryEntry<TState>[]} */
    this.history = history;
    this.tickFunc = tickFunc;
  }

  /**
   * @param {number} tick
   * @param {PeerID} peerID
   * @param {PeerInputs} inputs These inputs will we used for tick+1
   */
  addInputs(tick, peerID, inputs) {
    const firstItem = this.history.at(0) ?? fail();
    if (firstItem.tick > tick) fail(`Input tick ${tick} is older than first item tick ${firstItem.tick}`);

    let index = this.history.findLastIndex((x) => x.tick <= tick && x.state !== null && x.mergedInputs !== null);
    if (index === -1) {
      console.warn("input happened before first valid history entry", tick, inputs);
      return [undefined, undefined];
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

        item.inputs[peerID] = inputs ?? fail();

        item.mergedInputs[peerID] ??= {
          keyboard: {},
          mouse: {},
          gamepadInputs: [],
        };

        applyInputs(inputs, item.mergedInputs[peerID]);
      }
      expectedTick++;
    }
  }

  /**
   * @param {number} tick
   */
  getState(tick) {
    const lastItemBeforeIndex = this.history.findLastIndex(
      (x) => x.tick <= tick && x.state !== null && x.mergedInputs !== null
    );
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
        nextItem.mergedInputs[peerID] ??= structuredClone(nextItem.inputs[peerID]) ?? {
          keyboard: {},
          mouse: {},
          gamepadInputs: [],
        };
        applyInputs(nextItem.inputs[peerID] ?? fail(), nextItem.mergedInputs[peerID]);
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
