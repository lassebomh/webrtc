export const Inputs = /** @type {const} */ ([
  "ID",
  "KeyA",
  "KeyB",
  "KeyC",
  "KeyD",
  "KeyE",
  "KeyF",
  "KeyG",
  "KeyH",
  "KeyI",
  "KeyJ",
  "KeyK",
  "KeyL",
  "KeyM",
  "KeyN",
  "KeyO",
  "KeyP",
  "KeyQ",
  "KeyR",
  "KeyS",
  "KeyT",
  "KeyU",
  "KeyV",
  "KeyW",
  "KeyX",
  "KeyY",
  "KeyZ",
  "ShiftLeft",
  "ControlLeft",
  "MouseX",
  "MouseY",
  "MouseLeftButton",
  "MouseMiddleButton",
  "MouseRightButton",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

/** @type {Record<(typeof Inputs)[number], number>} */
export const Input = /** @type {*} */ ({});

for (let i = 0; i < Inputs.length; i++) {
  Input[Inputs[i]] = i;
}

/**
 * @param {number} id
 * @returns {InputEntry}
 */
export function createInputEntry(id) {
  const inputEntry = new Array(Inputs.length).fill(0);
  inputEntry[Input.ID] = id;

  return inputEntry;
}
