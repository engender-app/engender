/* UI ticket 47 (audit U32): two toasts up at once each keep their action.
   Every toast used to be drawn at the same place, so deleting a second
   entry inside the first one's four seconds laid "Moved to trash" over
   the first Restore. Toasts now stack away from the edge they rise from:
   the newest goes above at the bottom and below at the top, so the one
   already up never moves while somebody reaches for it.

   Deletes two entries through the real editor and its confirm sheet,
   hit-tests both Restore buttons, restores the earlier entry and then the
   later one, and samples every toast on every animation frame while the
   second arrives and the first leaves. Then desktop centring, the raised
   stack over an open sheet, reduced motion, and a lock clearing both. */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium, untilSplashLets } from './browser-harness.mjs';
import { clientRoute } from './browser-tier/built-flow.mjs';

const server = await createServer({
  cacheDir: '.svelte-kit/toast-stack-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } },
  plugins: [{ name: 'toast-stack-no-watch', configResolved(config) { config.server.watch = null; } }]
});
await server.listen();
const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB' });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; console.log(`PASS ${message}`); }

const settled = () => page.waitForFunction(() => !document.documentElement.dataset.nav);
const trashed = page.locator('[data-toast-kind="trashed"]');

/* Each toast's box, opacity and whether its action answers at its own
   centre and half a 48px target away on both axes. */
const boxes = (selector) => page.evaluate((selector) => [...document.querySelectorAll(selector)].map((toast) => {
  const box = toast.getBoundingClientRect();
  const action = toast.querySelector('[data-toast-action]');
  let reachable = null;
  if (action) {
    const a = action.getBoundingClientRect();
    const cx = a.left + a.width / 2;
    const cy = a.top + a.height / 2;
    reachable = [[0, 0], [0, -23], [0, 23], [-23, 0], [23, 0]].every(([dx, dy]) => {
      const hit = document.elementFromPoint(cx + dx, cy + dy);
      return hit === action || action.contains(hit);
    });
  }
  return { probe: toast.dataset.probe ?? null, top: box.top, bottom: box.bottom, left: box.left, right: box.right, reachable };
}), selector);
const apart = (a, b) => a.bottom <= b.top || b.bottom <= a.top;

/* Samples every [data-toast] on every animation frame until stopped. A
   trashed toast that arrives meanwhile is named `next` on its first frame. */
const startSampling = (next = null) => page.evaluate((next) => {
  window.toastFrames = [];
  window.toastSampling = true;
  const tick = (now) => {
    if (next) for (const toast of document.querySelectorAll('[data-toast-kind="trashed"]:not([data-probe])')) toast.dataset.probe = next;
    window.toastFrames.push({ now, toasts: [...document.querySelectorAll('[data-toast]')].map((toast) => {
      const box = toast.getBoundingClientRect();
      return { probe: toast.dataset.probe ?? null, top: box.top, opacity: Number(getComputedStyle(toast).opacity) };
    }) });
    if (window.toastSampling) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, next);
const stopSampling = () => page.evaluate(() => { window.toastSampling = false; return window.toastFrames; });
const track = (frames, probe) => frames.map((frame) => frame.toasts.find((t) => t.probe === probe) ?? null);

async function deleteEntry(id) {
  await clientRoute(page, `/entry/${id}`);
  await page.getByRole('button', { name: 'Delete entry', exact: true }).click();
  await page.locator('[data-sheet]').getByRole('button', { name: 'Delete entry', exact: true }).click();
  await page.locator('#ed-note').waitFor({ state: 'detached' });
}
const isTrashed = (id) => page.evaluate(async (id) => {
  const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
  return (await journal.entries.trashedEntries()).some((entry) => entry.id === id);
}, id);
const say = (message, opts) => page.evaluate(async ({ message, opts }) => {
  const { toast } = await import('/src/lib/stores/toasts.svelte.ts');
  toast(message, { duration: 60000, ...opts, onAction: () => {} });
}, { message, opts });
const clear = () => page.evaluate(async () => (await import('/src/lib/stores/toasts.svelte.ts')).clearToasts());

try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 90000 });
  await untilSplashLets(page);
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  const hide = page.getByRole('button', { name: 'Hide this bar', exact: true });
  if (await hide.isVisible()) await hide.click();
  const [first, second] = await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const { todayEpochDay } = await import('/src/lib/data/epochDay.ts');
    const day = todayEpochDay();
    return [await journal.entries.upsertEntry({ epochDay: day, mood: 3, note: 'Toast stack first' }),
      await journal.entries.upsertEntry({ epochDay: day, mood: 4, note: 'Toast stack second' })];
  });
  // Warm the editor route so the two deletes fit inside one toast's four seconds.
  await clientRoute(page, `/entry/${first}`);
  await clientRoute(page, '/');

  // Phone, full motion: delete A, then B inside A's toast window.
  await deleteEntry(first);
  await trashed.first().waitFor();
  const firstAt = Date.now();
  await trashed.first().evaluate((toast) => { toast.dataset.probe = 'A'; });
  await settled();
  await startSampling('B');
  await deleteEntry(second);
  await page.waitForFunction(() => document.querySelectorAll('[data-toast-kind="trashed"]').length === 2);
  ok(Date.now() - firstAt < 4000, `the second delete landed inside the first toast's window (${Date.now() - firstAt}ms)`);
  await page.waitForTimeout(400); // The 240ms arrival plus a margin, sampled throughout.
  let frames = await stopSampling();
  await settled();
  let [a, b] = ['A', 'B'].map((probe) => track(frames, probe));
  const aTops = a.filter(Boolean).map((t) => t.top);
  ok(aTops.length > 10 && Math.max(...aTops) - Math.min(...aTops) < 0.5, `the earlier toast never moves while the second arrives (${aTops.length} frames, spread ${(Math.max(...aTops) - Math.min(...aTops)).toFixed(2)}px)`);
  const arrival = b.filter(Boolean);
  ok(arrival.length > 3 && arrival[0].opacity < 0.5 && arrival.filter((t) => t.opacity > 0.05 && t.opacity < 0.95).length >= 3,
    `the second toast fades in over several frames (first opacity ${arrival[0]?.opacity.toFixed(3)})`);

  let shown = await boxes('[data-toast-kind="trashed"]');
  ok(shown.length === 2 && apart(shown[0], shown[1]), 'two Restore toasts do not overlap');
  ok(shown.every((t) => t.reachable), 'both Restore actions answer at their centre and across a 48px target');
  ok(shown[0].probe === 'B' && shown[1].probe === 'A' && shown[0].bottom <= shown[1].top,
    'the newer toast sits above the earlier one, and reading order follows what is drawn');
  await page.keyboard.press('Tab');
  const aRestore = page.locator('[data-probe="A"] [data-toast-action]');
  const bRestore = page.locator('[data-probe="B"] [data-toast-action]');
  ok(await aRestore.evaluate((el) => el.tabIndex === 0) && await bRestore.evaluate((el) => el.tabIndex === 0), 'both actions stay in the tab order');

  // Restore the earlier entry with a real tap; B stays, then travels down over several frames.
  await startSampling();
  await aRestore.click();
  await page.waitForFunction(() => !document.querySelector('[data-probe="A"]'));
  await page.waitForTimeout(150);
  frames = await stopSampling();
  ok(!(await isTrashed(first)) && await isTrashed(second), 'the earlier Restore brought back the earlier entry only');
  [a, b] = ['A', 'B'].map((probe) => track(frames, probe));
  const leaving = a.filter(Boolean);
  ok(leaving.length >= 3 && leaving.some((t) => t.opacity > 0.05 && t.opacity < 0.95), `the earlier toast fades out over ${leaving.length} frames rather than vanishing`);
  const bTops = b.filter(Boolean).map((t) => t.top);
  const travel = bTops.at(-1) - bTops[0];
  const steps = bTops.slice(1).map((top, i) => top - bTops[i]);
  ok(travel > 20 && Math.max(...steps) < travel * 0.6 && steps.filter((s) => s > 0.5).length >= 4,
    `the later toast travels ${travel.toFixed(1)}px down into the gap over ${steps.filter((s) => s > 0.5).length} frames, largest step ${Math.max(...steps).toFixed(1)}px`);
  ok(b.every(Boolean), 'the later toast is on screen on every frame of the hand-over');
  shown = await boxes('[data-probe="B"]');
  ok(shown.length === 1 && shown[0].reachable, 'the later Restore is still reachable once the earlier one is gone');
  await bRestore.click();
  await page.waitForFunction(() => !document.querySelector('[data-probe="B"]'));
  ok(!(await isTrashed(second)), 'the later Restore brought back the later entry');
  await clear();

  // Desktop: the stack centres on the content column, beside the rail.
  await page.setViewportSize({ width: 1280, height: 800 });
  await settled();
  await say('Toast stack one', { actionLabel: 'Restore', kind: 'trashed' });
  await say('Toast stack two', { actionLabel: 'Restore', kind: 'trashed' });
  await page.waitForTimeout(400);
  shown = await boxes('[data-toast-kind="trashed"]');
  const column = await page.locator('[data-app-scroll-region]').evaluate((el) => {
    const box = el.getBoundingClientRect();
    return box.left + el.clientWidth / 2;
  });
  ok(shown.length === 2 && apart(shown[0], shown[1]) && shown.every((t) => t.reachable), 'desktop: both toasts apart and reachable');
  ok(shown.every((t) => Math.abs((t.left + t.right) / 2 - column) <= 1),
    `desktop: both centre on the content column at ${column.toFixed(1)}px (${shown.map((t) => ((t.left + t.right) / 2).toFixed(1)).join(', ')})`);
  await clear();

  // A failure raised over an open sheet goes to the top, and two raised ones stack too.
  await page.setViewportSize({ width: 390, height: 844 });
  await settled();
  await say('Toast stack below', { actionLabel: 'Restore', kind: 'trashed' });
  await clientRoute(page, `/entry/${first}`);
  await page.getByRole('button', { name: 'Delete entry', exact: true }).click();
  await page.locator('[data-sheet-scrim]').waitFor();
  await say('Toast stack failed once', { kind: 'failed' });
  await say('Toast stack failed twice', { kind: 'failed' });
  await page.waitForTimeout(400);
  const raised = await boxes('[data-toast-kind="failed"]');
  ok(raised.length === 2 && raised.every((t) => t.top < 200) && apart(raised[0], raised[1]) && raised[0].top < raised[1].top,
    'failures over a sheet stack at the top, the newer below the earlier');
  /* Painted, not stacked in theory: the pixel inside the failure's padding
     is the toast's own ground, undimmed by the scrim. */
  const ground = await page.locator('[data-toast-kind="failed"]').first().evaluate((toast) => {
    const box = toast.getBoundingClientRect();
    return { x: Math.round(box.left + 4), y: Math.round(box.top + box.height / 2), colour: getComputedStyle(toast).backgroundColor };
  });
  const shot = (await page.screenshot({ clip: { x: ground.x, y: ground.y, width: 1, height: 1 } })).toString('base64');
  const scrimZ = await page.evaluate(async ({ shot, colour }) => {
    const bytes = Uint8Array.from(atob(shot), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(1, 1);
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    const want = colour.match(/\d+/g).map(Number);
    return Math.max(Math.abs(r - want[0]), Math.abs(g - want[1]), Math.abs(b - want[2])) <= 3;
  }, { shot, colour: ground.colour });
  ok(scrimZ, 'a raised failure is drawn over the dimmed sheet');
  ok(await page.evaluate(() => [...document.querySelectorAll('[data-toast]')].every((toast) => toast.closest('[inert]'))),
    'while the sheet is open every toast is inert with the rest of the background');
  await page.keyboard.press('Escape');
  await page.locator('[data-sheet-scrim]').waitFor({ state: 'detached' });
  ok(await page.evaluate(() => [...document.querySelectorAll('[data-toast]')].every((toast) => !toast.closest('[inert]'))), 'closing the sheet hands the toasts back');
  ok(await page.evaluate(() => {
    const toasts = [...document.querySelectorAll('[data-toast]')].map((toast) => toast.dataset.toastKind);
    return toasts.join() === 'failed,failed,trashed';
  }), 'the document reads the top failures before the bottom toast, as they are drawn');
  await clear();
  await clientRoute(page, '/');

  // Reduced motion keeps the stack (and its existing cut).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => document.documentElement.dataset.a11yMotion === 'reduce');
  await say('Toast stack reduced one', { actionLabel: 'Restore', kind: 'trashed' });
  await say('Toast stack reduced two', { actionLabel: 'Restore', kind: 'trashed' });
  await settled();
  shown = await boxes('[data-toast-kind="trashed"]');
  ok(shown.length === 2 && apart(shown[0], shown[1]) && shown.every((t) => t.reachable), 'reduced motion: both toasts apart and reachable');

  // A lock removes every toast in the stack and their actions.
  await page.evaluate(async () => {
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    prefs.lockAfter = 'immediately';
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
  });
  await page.locator('[data-applock]').waitFor();
  ok(await page.locator('[data-toast]').count() === 0 && await page.locator('[data-toast-action]').count() === 0, 'a lock clears the whole stack');

  ok(errors.length === 0, `no uncaught page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
  assert.equal(checks, 23, 'all toast stack checks ran');
  console.log(`Toast stack passed: ${checks} checks`);
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
