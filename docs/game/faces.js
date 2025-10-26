import { fail } from "../lib/shared/utils.js";

/** @type {Array<Record<FaceType, [number ,number]>>} */
const FACE_DATA = [
  {
    passive: [0, 0],
    hurt: [0, 1],
    angry: [0, 2],
  },
  {
    passive: [1, 2],
    hurt: [1, 1],
    angry: [1, 0],
  },
  {
    hurt: [2, 0],
    passive: [2, 1],
    angry: [2, 2],
  },
];

export const FACE_OUTER_SIZE = 242;
export const FACE_INNER_SIZE = 182;

const image = new Image();
image.src = "./assets/faces.png";
await new Promise((res) => (image.onload = res));

export const FACES = FACE_DATA.map((faceData) => {
  /** @type {Partial<Record<FaceType, OffscreenCanvas>>} */
  const faceCanvases = {};

  for (const [key, [x, y]] of Object.entries(faceData)) {
    const canvas = new OffscreenCanvas(FACE_OUTER_SIZE, FACE_OUTER_SIZE);
    const ctx = canvas.getContext("2d") ?? fail();
    ctx.drawImage(image, FACE_OUTER_SIZE * -x, FACE_OUTER_SIZE * -y);
    faceCanvases[/** @type {FaceType} */ (key)] = canvas;
  }

  return /** @type {Required<typeof faceCanvases>} */ (faceCanvases);
});
