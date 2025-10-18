import { assert, fail } from "../lib/utils.js";

/**
 * @param {string} text
 * @returns {Level}
 */
function createLevelFromText(text) {
  const lines = text.trim().split("\n");
  const height = lines.length;
  const lineLengths = [...new Set(lines.map((x) => x.length))];
  const width = lineLengths.pop();
  assert(width && lineLengths.length === 0);

  /** @type {Level['spawnPoints']} */
  const spawnPoints = [];

  /** @type {Level['gunLocations']} */
  const gunLocations = [];

  /** @type {Level['tiles']} */
  const tiles = [];

  for (let y = 0; y < lines.length; y++) {
    const line = lines[y] ?? fail();

    /** @type {number[]} */
    const lineTiles = [];

    const tileStrings = line.split("");

    for (let x = 0; x < tileStrings.length; x++) {
      const tileString = tileStrings[x];

      if (tileString === "#") {
        lineTiles.push(1);
      } else if (tileString === "s") {
        spawnPoints.push({ x, y });
        lineTiles.push(0);
      } else if (tileString === "g") {
        gunLocations.push({ x, y });
        lineTiles.push(0);
      } else if (tileString === " ") {
        lineTiles.push(0);
      } else {
        fail(`Tile "${tileString}" not supported`);
      }
    }

    tiles.push(lineTiles);
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d") ?? fail();
  ctx.imageSmoothingEnabled = false;

  const image = new ImageData(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = tiles[y]?.[x] ?? fail();
      const offset = (y * width + x) * 4;

      if (value === 1) {
        const v = 80; // ((x + y) & 1) === 0 ? 90 : 70;
        image.data[offset + 0] = v;
        image.data[offset + 1] = v;
        image.data[offset + 2] = v;
        image.data[offset + 3] = 255;
      } else {
        image.data[offset + 0] = 0;
        image.data[offset + 1] = 0;
        image.data[offset + 2] = 0;
        image.data[offset + 3] = 255;
      }
    }
  }

  ctx.putImageData(image, 0, 0);

  /** @type {Level} */
  let level = {
    box: {
      x: 0,
      y: 0,
      bounce: 0,
      dx: 0,
      dy: 0,
      wallBottom: false,
      wallTop: false,
      wallLeft: false,
      wallRight: false,
      height,
      width,
    },
    tiles,
    canvas,
    spawnPoints,
    gunLocations,
  };

  return level;
}

export const levels = [
  `\
####################
#                  #
#                  #
#                  #
#                  #
#                  #
#        g         #
#        #         #
#                  #
#                  #
#                  #
#      s   s       #
#                  #
#                  #
####################`,
  `\
#########################################
#                                       #
#                                       #
#                                       #
#                                       #
#                                       #
#                                       #
#                                       #
#                                       #
#                                       #
#      s                         s      #
#                                       #
#    ###########         ###########    #
#    #                             #    #
#    #                             #    #
#    #                             #    #
#    #                             #    #
#                   #                   #
#                   #                   #
#      s            #            s      #
#                   #                   #
#    ###########    #    ###########    #
#                   #                   #
#      g            #            g      #
#                   #                   #
#########################################`,
].map(createLevelFromText);

/**
 * @param {Level} level
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function getTile(level, x, y) {
  return level.tiles[Math.floor(y)]?.[Math.floor(x)] ?? 0;
}
