import { fail } from "../shared/utils.js";

/**
 * @template {string} TLayer
 */
class Tilemap {
  /**
   * @param {Record<TLayer, HTMLImageElement>} layers
   * @param {number} width
   * @param {number} height
   * @param {number} innerWidth
   * @param {number} innerHeight
   * @param {number} offsetX
   * @param {number} offsetY
   */
  constructor(layers, width, height, innerWidth, innerHeight, offsetX, offsetY) {
    this.layers = layers;
    this.width = width;
    this.height = height;
    this.innerWidth = innerWidth;
    this.innerHeight = innerHeight;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
  }

  /**
   * @template {string} TLayer
   * @param {Record<TLayer, string>} layerUrls
   * @param {number} width
   * @param {number} height
   * @param {number} innerWidth
   * @param {number} innerHeight
   * @param {number} offsetX
   * @param {number} offsetY
   * @returns {Promise<Tilemap<TLayer>>}
   */
  static async fromUrls(layerUrls, width, height, innerWidth, innerHeight, offsetX, offsetY) {
    const layers = Object.fromEntries(
      await Promise.all(
        Object.entries(layerUrls).map(async ([layer, url]) => {
          const image = new Image();
          image.src = url;
          await new Promise((res) => (image.onload = res));

          return /** @type {const} */ ([layer, image]);
        }),
      ),
    );

    return new Tilemap(layers, width, height, innerWidth, innerHeight, offsetX, offsetY);
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} scale
   */
  getTile(x, y, scale = 0.25) {
    const w = Math.round(this.width * scale);
    const h = Math.round(this.height * scale);

    const out = /** @type {const} */ ({
      width: w,
      height: h,
      innerWidth: this.innerWidth * scale,
      innerHeight: this.innerHeight * scale,
      offsetX: this.offsetX * scale,
      offsetY: this.offsetY * scale,
      layer: /** @type {Record<TLayer, OffscreenCanvas>} */ (
        Object.fromEntries(
          Object.entries(this.layers).map(([layer, image]) => {
            const canvas = new OffscreenCanvas(w, h);
            const ctx = canvas.getContext("2d") ?? fail();
            ctx.imageSmoothingEnabled = false;
            // ctx.imageSmoothingQuality = "low";
            ctx.drawImage(image, w * -x, h * -y, image.width * scale, image.height * scale);
            // ctx.drawImage(image, w * -x, h * -y, image.width * scale, image.height * scale);
            // ctx.drawImage(image, w * -x, h * -y, image.width * scale, image.height * scale);

            return [layer, canvas];
          }),
        )
      ),
    });

    return out;
  }
}

const __dir = import.meta.url.split("/").slice(0, -1).join("/");

const faceTilemap = await Tilemap.fromUrls(
  {
    hat: __dir + "/assets/faces/hat.PNG",
    face: __dir + "/assets/faces/face.PNG",
    body: __dir + "/assets/faces/body.PNG",
  },
  300,
  320,
  185,
  185,
  57,
  97,
);

export const FACES = [
  {
    passive: faceTilemap.getTile(1, 2),
    hurt: faceTilemap.getTile(1, 1),
    angry: faceTilemap.getTile(1, 0),
  },
  {
    passive: faceTilemap.getTile(0, 0),
    hurt: faceTilemap.getTile(0, 1),
    angry: faceTilemap.getTile(0, 2),
  },
  {
    hurt: faceTilemap.getTile(2, 3),
    passive: faceTilemap.getTile(2, 3),
    angry: faceTilemap.getTile(2, 3),
  },
  {
    hurt: faceTilemap.getTile(2, 0),
    passive: faceTilemap.getTile(2, 1),
    angry: faceTilemap.getTile(2, 2),
  },
  {
    hurt: faceTilemap.getTile(3, 0),
    passive: faceTilemap.getTile(3, 0),
    angry: faceTilemap.getTile(3, 0),
  },
];

export const FACE_OUTER_SIZE = 242;
export const FACE_INNER_SIZE = 182;

/**
 * @template {string} TLayer
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<Tilemap<TLayer>['getTile']>} tile
 * @param {TLayer} layer
 * @param {number} targetWidth
 * @param {number} targetHeight
 */
export function renderTile(ctx, targetWidth, targetHeight, tile, layer) {
  const scaleX = targetWidth / tile.innerWidth;
  const scaleY = targetHeight / tile.innerHeight;

  ctx.drawImage(
    tile.layer[layer],
    -tile.offsetX * scaleX,
    -tile.offsetY * scaleY,
    tile.width * scaleX,
    tile.height * scaleY,
  );

  // ctx.lineWidth = 0.02;
  // ctx.strokeStyle = "red";
  // ctx.strokeRect(-innerCenterX * scaleX, -innerCenterY * scaleY, tile.width * scaleX, tile.height * scaleY);
}
