import { fail } from "./shared/utils.js";

export class CanvasController {
  /** @type {Input} */
  standardInput = {};

  /** @type {(Input | null)[]} */
  gamepadInputs = [];

  /** @type {number} */
  width;
  /** @type {number} */
  height;

  /**
   * @param {HTMLElement} element
   */
  constructor(element) {
    element.tabIndex = 0;
    element.style.position = "relative";
    element.style.background = "black";
    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.pointerEvents = "none";
    element.appendChild(canvas);
    this.ctx = canvas.getContext("2d") ?? fail();

    const { width, height } = element.getBoundingClientRect();
    this.width = width;
    this.height = height;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;

        canvas.width = width;
        canvas.height = height;
        // add input
      }
    });

    resizeObserver.observe(element);

    element.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });

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

      this.standardInput[key] = Number(event.type === "keydown");
    };

    element.addEventListener("keydown", onkey);
    element.addEventListener("keyup", onkey);

    element.addEventListener(
      "pointermove",
      (event) => {
        this.standardInput.mousex = event.offsetX;
        this.standardInput.mousey = event.offsetY;
      },
      { passive: true }
    );
    element.addEventListener("mousedown", (event) => {
      const key = event.button === 0 ? "mouseleftbutton" : "mouserightbutton";
      this.standardInput[key] = 1;
    });
    element.addEventListener("mouseup", (event) => {
      const key = event.button === 0 ? "mouseleftbutton" : "mouserightbutton";
      this.standardInput[key] = 0;
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

      const input = (this.gamepadInputs[i] ??= {});
      input.is_gamepad = 1;

      if (gamepad.axes.length >= 6) {
        let [lstickx, lsticky, rstickx, rsticky, ltrigger, rtrigger] =
          /** @type {[number,number,number,number,number,number]} */ (gamepad.axes);
        ltrigger = (ltrigger + 1) / 2;
        rtrigger = (rtrigger + 1) / 2;

        if (Math.abs(lstickx) > 0.08) input.lstickx = lstickx;
        if (Math.abs(lsticky) > 0.08) input.lsticky = lsticky;
        if (Math.abs(rstickx) > 0.08) input.rstickx = rstickx;
        if (Math.abs(rsticky) > 0.08) input.rsticky = rsticky;
        if (ltrigger !== 0.5 && Math.abs(ltrigger) > 0.05) input.ltrigger = ltrigger;
        if (rtrigger !== 0.5 && Math.abs(rtrigger) > 0.05) input.rtrigger = rtrigger;
      }

      if (gamepad.buttons.length >= 6) {
        const [buttona, buttonb, buttony, buttonx, lshoulder, rshoulder] =
          /** @type {[number,number,number,number,number,number]} */ (gamepad.buttons.map((x) => x.value));
        if (buttona) input.buttona = buttona;
        if (buttonb) input.buttonb = buttonb;
        if (buttony) input.buttony = buttony;
        if (buttonx) input.buttonx = buttonx;
        if (lshoulder) input.lshoulder = lshoulder;
        if (rshoulder) input.rshoulder = rshoulder;
      }
    }

    const standardInput = this.standardInput;
    const gamepadInputs = this.gamepadInputs;

    this.standardInput = {};
    this.gamepadInputs = [];

    /** @type {PeerInputs} */
    const peerInputs = { standardInput, gamepadInputs, canvasWidth: this.width, canvasHeight: this.height };

    return peerInputs;
  }
}
