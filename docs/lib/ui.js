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
    },
  );
}

/**
 * CLANKER WARNING
 *
 * @param {unknown} obj
 * @param {number} [roundTo=3] - decimal places to round floats to
 * @returns {string} HTML string
 */
export function jsonToYaml(obj, roundTo = 3) {
  /** @type {string[]} */
  const out = [];

  /**
   * @param {unknown} val
   * @param {number} indent
   * @param {boolean} inlineKey
   */
  function write(val, indent, inlineKey) {
    const pad = indent <= 0 ? "" : "   ".repeat(indent - 1) + " - ";

    if (val === null || val === undefined) {
      out.push(`<span class="y-null">null</span>\n`);
      return;
    }

    if (typeof val === "boolean") {
      out.push(`<span class="y-bool">${val}</span>\n`);
      return;
    }

    if (typeof val === "string") {
      out.push(`<span class="y-str">"${val}"</span>\n`);
      return;
    }

    if (typeof val === "number") {
      const v = Number.isInteger(val) ? String(val) : val.toFixed(roundTo);
      out.push(`<span class="y-num">${v}</span>\n`);
      return;
    }

    if (Array.isArray(val)) {
      if (val.length === 0) {
        out.push(`<span class="y-bracket">[]</span>\n`);
        return;
      }
      if (inlineKey) out.push("\n");
      for (let i = 0; i < val.length; i++) {
        const item = val[i];
        if (item === undefined) fail();
        const isScalar = item === null || typeof item !== "object";
        out.push(`${pad}<span class="y-dash">-</span> `);
        if (isScalar) {
          write(item, indent + 1, false);
        } else {
          out.push("\n");
          write(item, indent + 1, false);
        }
      }
      return;
    }

    const keys = Object.keys(/** @type {object} */ (val));
    if (keys.length === 0) {
      out.push(`<span class="y-bracket">{}</span>\n`);
      return;
    }
    if (inlineKey) out.push("\n");

    const o = /** @type {Record<string, unknown>} */ (val);

    let maxKey = 0;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i] ?? fail();
      if (k.length > maxKey) maxKey = k.length;
    }

    let maxBefore = 2;
    let maxAfter = 0;
    for (let i = 0; i < keys.length; i++) {
      const v = o[keys[i] ?? fail()] ?? undefined;
      if (typeof v === "number") {
        const s = Number.isInteger(v) ? String(v) : v.toFixed(roundTo);
        const dot = s.indexOf(".");
        if (dot === -1) {
          if (s.length > maxBefore) maxBefore = s.length;
        } else {
          if (dot > maxBefore) maxBefore = dot;
          const after = s.length - dot;
          if (after > maxAfter) maxAfter = after;
        }
      }
    }

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k === undefined) fail();
      const v = o[k] ?? undefined;
      const isScalar =
        v === null ||
        v === undefined ||
        typeof v !== "object" ||
        (Array.isArray(v) && v.length === 0) ||
        (typeof v === "object" && !Array.isArray(v) && Object.keys(/** @type {object} */ (v)).length === 0);

      const keyPad = " ".repeat(maxKey - k.length + 1);

      if (typeof v === "number") {
        const s = Number.isInteger(v) ? String(v) + "." : v.toFixed(roundTo);
        const dot = s.indexOf(".");
        const before = dot === -1 ? s.length : dot;
        const numPad = " ".repeat(maxBefore - before);
        out.push(
          `${pad}<span class="y-key">${k}</span><span class="y-colon">:</span>${keyPad}${numPad}<span class="y-num">${s}</span>\n`,
        );
      } else if (isScalar) {
        out.push(`${pad}<span class="y-key">${k}</span><span class="y-colon">:</span>${keyPad}`);
        write(v, indent + 1, false);
      } else {
        out.push(`${pad}<span class="y-key">${k}</span><span class="y-colon">:</span> `);
        write(v, indent + 1, true);
      }
    }
  }

  write(obj, 0, false);
  return out.join("");
}
