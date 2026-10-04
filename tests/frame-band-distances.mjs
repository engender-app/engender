/** Each frame's mean channel distance from the last one, per band.
 * @param {{ data: string }[]} list
 */
export async function frameBandDistances(list) {
  if (list.length === 0) return { notice: [], body: [] };
  /** @param {string} b64 */
  const pixels = async (b64) => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + b64;
    await image.decode();
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d'));
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, image.width, image.height);
  };
  const last = await pixels(list[list.length - 1].data);
  /** @param {ImageData} a @param {number} y0 @param {number} y1 */
  const band = (a, y0, y1) => {
    let sum = 0;
    let n = 0;
    for (let y = y0; y < Math.min(y1, a.height); y++)
      for (let x = 0; x < a.width; x += 2) {
        const i = (y * a.width + x) * 4;
        for (let c = 0; c < 3; c++) sum += Math.abs(a.data[i + c] - last.data[i + c]);
        n += 3;
      }
    return sum / n;
  };
  /** @type {{ notice: number[], body: number[] }} */
  const result = { notice: [], body: [] };
  for (let i = 0; i < list.length; i++) {
    const image = i === list.length - 1 ? last : await pixels(list[i].data);
    result.notice.push(band(image, 0, 200));
    result.body.push(band(image, 200, 700));
  }
  return result;
}
