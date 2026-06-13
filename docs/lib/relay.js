/** @typedef {{ type: string; topic: string; payload?: unknown }} Message */

export class DisconnectedError extends Error {}

/**
 * @param {() => WebSocket} open
 */
export function createRelay(open) {
  /** @type {WebSocket | null} */
  let ws = null;
  let destroyed = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let reconnectTimer = null;
  let reconnectAttempts = 0;

  function isConnected() {
    return ws !== null && ws.readyState === WebSocket.OPEN;
  }

  /** @type {Array<{ msg: Message; resolve: () => void; reject: (e: Error) => void }>} */
  const pendingSends = [];

  /** @type {Array<{ resolve: () => void; reject: (e: Error) => void }>} */
  const connWaiters = [];

  /** @type {Map<string, (payload: unknown) => void>} */
  const topicHandlers = new Map();

  /** @type {Map<string, Array<{ resolve: (v: unknown) => void; reject: (e: Error) => void }>>} */
  const topicWaiters = new Map();

  /** @type {Set<string>} */
  const activeListens = new Set();

  /**
   * @param {Message} msg
   */
  function rawSend(msg) {
    ws?.send(JSON.stringify(msg));
  }

  function connect() {
    if (destroyed) return;

    const _ws = open();

    _ws.addEventListener("open", () => {
      ws = _ws;
      reconnectAttempts = 0;

      for (const topic of topicHandlers.keys()) {
        rawSend({ type: "subscribe", topic });
      }

      const pending = [...pendingSends];
      pendingSends.length = 0;
      for (const p of pending) {
        try {
          rawSend(p.msg);
          p.resolve();
        } catch (e) {
          p.reject(e instanceof Error ? e : new Error(String(e)));
        }
      }

      const waiters = [...connWaiters];
      connWaiters.length = 0;
      for (const w of waiters) w.resolve();
    });

    _ws.addEventListener("message", (event) => {
      try {
        /** @type {Message} */
        const msg = JSON.parse(event.data);
        topicHandlers.get(msg.topic)?.(msg.payload);
      } catch (e) {
        console.warn("failed to parse", event.data);
        console.warn(e);
      }
    });

    _ws.addEventListener("close", () => {
      if (ws === _ws) {
        ws = null;
      }
      if (!destroyed && ws === null) {
        reconnectTimer = setTimeout(
          () => {
            connect();
          },
          Math.pow(reconnectAttempts++, 2) * 1000,
        );
      }
    });

    _ws.addEventListener("error", () => _ws.close());
  }

  function disconnect() {
    destroyed = true;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    const err = new DisconnectedError();

    for (const p of pendingSends) p.reject(err);
    pendingSends.length = 0;

    for (const w of connWaiters) w.reject(err);
    connWaiters.length = 0;

    for (const [, waiters] of topicWaiters) {
      for (const w of waiters) w.reject(err);
      waiters.length = 0;
    }
    topicWaiters.clear();
    topicHandlers.clear();
    activeListens.clear();

    ws?.close();
    ws = null;
  }

  connect();

  /**
   * @param {string} name
   */
  function topic(name) {
    return {
      /** @type {((payload: unknown) => void) | null} */
      get send() {
        if (!isConnected() || destroyed) return null;
        return (/** @type {unknown} */ payload) => rawSend({ type: "publish", topic: name, payload });
      },

      /**
       * @param {unknown} payload
       * @param {number} [timeout]
       * @returns {Promise<void>}
       */
      queue(payload, timeout) {
        if (destroyed) return Promise.reject(new DisconnectedError());
        /** @type {Message} */
        const msg = { type: "publish", topic: name, payload };

        if (isConnected()) {
          try {
            rawSend(msg);
            return Promise.resolve();
          } catch (e) {
            return Promise.reject(e);
          }
        }

        /** @type {(value: void) => void} */
        let resolve;
        /** @type {(reason: any) => void} */
        let reject;
        /** @type {Promise<void>} */
        const promise = new Promise((res, rej) => {
          resolve = res;
          reject = rej;
        });

        // @ts-ignore - resolve/reject are assigned in the Promise constructor
        pendingSends.push({ msg, resolve, reject });

        if (timeout !== undefined) {
          setTimeout(() => {
            // @ts-ignore
            reject(new Error("Queued message timed out"));
          }, timeout);
        }

        return promise;
      },

      /**
       * @template T
       * @param {(next: <U = unknown>(timeout?: number) => Promise<U>) => Promise<T>} fn
       * @returns {Promise<T>}
       */
      async listen(fn) {
        if (activeListens.has(name)) {
          throw new Error(`Topic "${name}" already has an active listener`);
        }

        activeListens.add(name);

        /** @type {unknown[]} */
        const buffer = [];
        /** @type {Array<{ resolve: (v: unknown) => void; reject: (e: Error) => void }>} */
        const waiters = [];
        let terminated = false;

        topicWaiters.set(name, waiters);

        /**
         * @param {unknown} payload
         */
        function onMessage(payload) {
          if (waiters.length > 0) {
            waiters.shift()?.resolve(payload);
          } else {
            buffer.push(payload);
          }
        }

        topicHandlers.set(name, onMessage);

        if (isConnected()) {
          rawSend({ type: "subscribe", topic: name });
        }

        /**
         * @template {unknown} [U=unknown]
         * @param {number} [timeout]
         * @returns {Promise<U>}
         */
        function next(timeout) {
          if (buffer.length > 0) return Promise.resolve(/** @type {U} */ (buffer.shift()));
          if (terminated) return Promise.reject(new Error("Listener terminated"));
          if (destroyed) return Promise.reject(new DisconnectedError());
          return new Promise((resolve, reject) => {
            waiters.push({ resolve: /** @type {(value: unknown) => void} */ (resolve), reject });
            if (timeout !== undefined) {
              setTimeout(() => {
                reject(new Error("Reading of message timed out"));
              }, timeout);
            }
          });
        }

        try {
          return await fn(next);
        } finally {
          terminated = true;
          activeListens.delete(name);
          topicHandlers.delete(name);
          topicWaiters.delete(name);

          const err = new Error("Listener terminated");
          for (const w of waiters) w.reject(err);
          waiters.length = 0;

          if (isConnected() && !destroyed) {
            rawSend({ type: "unsubscribe", topic: name });
          }
        }
      },
    };
  }

  return { topic, disconnect };
}
