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

  /** @type {number[][]} */
  const tiles = [];

  for (const line of lines) {
    /** @type {number[]} */
    const lineTiles = [];

    for (const tileString of line.split("")) {
      if (tileString === "#") {
        lineTiles.push(1);
      } else {
        lineTiles.push(0);
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
        image.data[offset + 0] = 0;
        image.data[offset + 1] = 0;
        image.data[offset + 2] = 0;
        image.data[offset + 3] = 255;
      } else {
        image.data[offset + 0] = 255;
        image.data[offset + 1] = 255;
        image.data[offset + 2] = 255;
        image.data[offset + 3] = 255;
      }
    }
  }

  ctx.putImageData(image, 0, 0);

  /** @type {Level} */
  let level = {
    height,
    width,
    tiles,
    canvas,
  };

  return level;
}

export const levels = [
  `\
#########################################
#                                       #
#                                       #
#                                       #
#                                       #
#                                       #
#                                       #
#           #####       #####           #
#                                       #
#                                       #
#                                       #
#                                       #
#    #####          #          #####    #
#                   #                   #
#                   #                   #
#                   #                   #
#    ############   #   ############    #
#                                       #
#                                       #
#                                       #
#########################################`,
].map(createLevelFromText);
