import { init, tick, render } from "./game/game.js";
import { run } from "./lib/rollback.js";

run({ tick, render, init });
