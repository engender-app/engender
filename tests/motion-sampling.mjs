/* Per-frame measurement beside a screencast, shared by the motion
   recorders (tests/noticed-axis-motion.mjs, tests/restore-gallery.mjs,
   tests/return-motion-gallery.mjs).

   A recording shows that something moved; a rAF loop in the page reading
   the properties the movement animates says by how much and when. Both
   run in the same scene, and the manifest carries the samples next to the
   frames so a review page can put the numbers under the flipbook.

   `read` is a function body as a string, evaluated in the page, returning a
   plain object; each sample is that object plus `t`, milliseconds since
   sampling started. Sampling runs on the document that is there when it
   starts - a scene that navigates keeps the old document's loop only until
   it goes, which is why `stopSampling` may find nothing and the caller
   treats that as an empty list. */

export const startSampling = (page, read) =>
  page.evaluate((body) => {
    const fn = new Function(body);
    const t0 = performance.now();
    window.__samples = [];
    window.__sampling = true;
    const step = (now) => {
      if (!window.__sampling) return;
      try {
        window.__samples.push({ t: Math.round(now - t0), ...fn() });
      } catch (e) {
        window.__samples.push({ t: Math.round(now - t0), error: String(e) });
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, read);

export const stopSampling = (page) =>
  page.evaluate(() => {
    window.__sampling = false;
    return window.__samples ?? [];
  });
