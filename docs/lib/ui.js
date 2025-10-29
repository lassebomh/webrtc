import { fail } from "../shared/utils.js";

/**
 * @template {Element} TElement
 * @param {TElement} element
 * @param {Parameters<TElement['addEventListener']>} args
 */
export function listen(element, ...args) {
  element.addEventListener(args[0], args[1], args[2]);
  return () => {
    element.removeEventListener(args[0], args[1]);
  };
}

/**
 * @template T
 * @param {T} init
 * @returns {Store<T>}
 */
export function writable(init) {
  let current = init;

  /** @type {Set<((value: T) => void)>} */
  const listeners = new Set();

  const notify = () => {
    for (const listener of listeners) {
      listener(current);
    }
  };

  /**
   * @param {T | undefined} value
   */
  function getset(value) {
    if (value !== undefined) {
      current = value;
      notify();
    } else {
      return current;
    }
  }

  const store = /** @type {Store<T>} */ (
    Object.assign(getset, {
      notify,
      /**
       * @param {(value: T) => void} listener
       */
      subscribe(listener) {
        listeners.add(listener);
        listener(current);
        return () => {
          listeners.delete(listener);
        };
      },

      /**
       * @param {T} value
       */
      set(value) {
        current = value;
        notify();
      },
    })
  );

  return store;
}

/**
 * @template T
 * @param {string} key
 * @param {() => T} fallback
 * @param {Storage} storage
 * @returns {Store<T>}
 */
export function persistant(key, fallback, storage = localStorage) {
  const raw = storage.getItem(key);
  /** @type {T} */
  let init;

  if (raw === null) {
    init = fallback();
  } else {
    init = JSON.parse(raw);
  }

  const store = writable(init);

  store.subscribe((value) => {
    storage.setItem(key, JSON.stringify(value));
  });

  return store;
}

/**
 * @param {HTMLInputElement} element
 * @param {Store<number>} store
 */
export function bindNumber(element, store) {
  store.subscribe((value) => {
    if (element.valueAsNumber !== value) {
      element.valueAsNumber = value;
    }
  });

  element.addEventListener("input", () => {
    store.set(element.valueAsNumber);
  });
}

/**
 * @template {string} T
 * @param {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement} element
 * @param {Store<T>} store
 */
export function bindText(element, store) {
  store.subscribe((value) => {
    if (element.value !== value) {
      element.value = value;
    }
  });

  element.addEventListener("input", () => {
    store.set(/** @type {T} */ (element.value));
  });
}

/**
 * @template {string} T
 * @param {HTMLSelectElement} element
 * @param {Store<T>} store
 * @param {Record<string, T>} options
 */
export function bindSelect(element, store, options) {
  bindText(element, store);

  for (const [label, value] of Object.entries(options)) {
    const option = document.createElement("option");
    option.textContent = label;
    option.value = value;
    if (store() === value) {
      option.selected = true;
    }
    element.appendChild(option);
  }
}

/**
 * @template {keyof HTMLElementTagNameMap} TTag
 * @param {string} query
 * @param {TTag} tag
 * @returns {HTMLElementTagNameMap[TTag]}
 */
export function qs(query, tag) {
  return document.querySelector(query) ?? fail();
}

/**
 *
 * @param {string | object | null | undefined} json
 * @returns
 */
export function syntaxHighlight(json) {
  if (typeof json != "string") {
    json = JSON.stringify(json, undefined, 2);
  }
  json = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = "number";
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "key" : "string";
      } else if (/true|false/.test(match)) {
        cls = "boolean";
      } else if (/null/.test(match)) {
        cls = "null";
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}
