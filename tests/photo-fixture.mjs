/* A tiny real photo, drawn rather than checked in as a binary (redesign
   ticket 17), for the suites that just need a file the app's own photo
   picker will accept - normalize() only cares that it decodes as an image,
   not what it shows.

   Shared by the walkthrough and the photo-day sheet gallery: both pick a
   photo through the same filechooser flow and only care about the colour
   well enough to tell shots apart. */

/**
 * @param {import('playwright-core').Page} page
 * @param {string} fill a CSS color
 * @returns {Promise<Buffer>} PNG bytes, 40x30, solid-filled
 */
export async function tinyPhoto(page, fill) {
  const dataUrl = await page.evaluate((fill) => {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 30;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }, fill);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}
