import { fail } from "../shared/utils.js";

export class IOController {
  /** @type {KeyboardInput} */
  keyboard = {};
  /** @type {MouseInput} */
  mouse = {};

  /** @type {(GamepadInput | null)[]} */
  gamepadInputs = [];

  /** @type {number | undefined} */
  canvasWidth;
  /** @type {number | undefined} */
  canvasHeight;

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
    this.canvasWidth = width;
    this.canvasHeight = height;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;

        canvas.width = width;
        canvas.height = height;
        this.canvasWidth = width;
        this.canvasHeight = height;
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
      /** @type {keyof KeyboardInput} */
      const key = event.key === " " ? "space" : /** @type {keyof KeyboardInput} */ (event.key.toLocaleLowerCase());
      this.keyboard[key] = Number(event.type === "keydown");
    };

    element.addEventListener("keydown", onkey);
    element.addEventListener("keyup", onkey);

    element.addEventListener(
      "pointermove",
      (event) => {
        this.mouse.x = event.offsetX;
        this.mouse.y = event.offsetY;
      },
      { passive: true }
    );
    element.addEventListener("mousedown", (event) => {
      switch (event.button) {
        case 0:
          this.mouse.left = 1;
          break;

        case 2:
          this.mouse.right = 1;
          break;

        default:
          break;
      }
    });
    element.addEventListener("mouseup", (event) => {
      switch (event.button) {
        case 0:
          this.mouse.left = 0;
          break;

        case 2:
          this.mouse.right = 0;
          break;

        default:
          break;
      }
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

      if (gamepad.axes.length >= 6) {
        let [lstickx, lsticky, rstickx, rsticky, ltrigger, rtrigger] =
          /** @type {[number,number,number,number,number,number]} */ (gamepad.axes);
        ltrigger = (ltrigger + 1) / 2;
        rtrigger = (rtrigger + 1) / 2;

        if (Math.abs(lstickx) > 0.08) input.leftStickX = lstickx;
        if (Math.abs(lsticky) > 0.08) input.leftStickY = lsticky;
        if (Math.abs(rstickx) > 0.08) input.rightStickX = rstickx;
        if (Math.abs(rsticky) > 0.08) input.rightStickY = rsticky;
        if (ltrigger !== 0.5 && Math.abs(ltrigger) > 0.05) input.leftTrigger = ltrigger;
        if (rtrigger !== 0.5 && Math.abs(rtrigger) > 0.05) input.rightTrigger = rtrigger;
      }

      if (gamepad.buttons.length >= 6) {
        const [buttona, buttonb, buttony, buttonx, lshoulder, rshoulder] =
          /** @type {[number,number,number,number,number,number]} */ (gamepad.buttons.map((x) => x.value));
        if (buttona) input.a = buttona;
        if (buttonb) input.b = buttonb;
        if (buttony) input.y = buttony;
        if (buttonx) input.x = buttonx;
        if (lshoulder) input.leftShoulder = lshoulder;
        if (rshoulder) input.rightShoulder = rshoulder;
      }
    }

    const keyboard = this.keyboard;
    const mouse = this.mouse;
    const gamepadInputs = this.gamepadInputs;
    const canvasWidth = this.canvasWidth;
    const canvasHeight = this.canvasHeight;

    this.keyboard = {};
    this.mouse = {};
    this.gamepadInputs = [];
    this.canvasWidth = undefined;
    this.canvasHeight = undefined;

    /** @type {PeerInputs} */
    const peerInputs = { keyboard, mouse, gamepadInputs, canvasWidth: canvasWidth, canvasHeight: canvasHeight };

    return peerInputs;
  }
}
