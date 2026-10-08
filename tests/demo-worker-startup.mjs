import { launchChromium, previewBuild, createReporter } from './browser-harness.mjs';

const reporter = createReporter();
const app = await previewBuild(process.cwd());
const browser = await launchChromium();
const page = await browser.newPage({ serviceWorkers: 'block' });
const base = `http://localhost:${app.httpServer.address().port}`;

try {
  await page.addInitScript(() => {
    window.__demoPhotoDraws = 0;
    window.Worker = new Proxy(Worker, {
      construct(Target, args) {
        const worker = new Target(...args);
        worker.addEventListener('message', (event) => {
          if (event.data?.type === 'demo-photo-draw') window.__demoPhotoDraws++;
        });
        return worker;
      }
    });
  });
  // Count real photo encodes in the built worker without replacing them.
  await page.route('**/mc-worker-*.js', async (route) => {
    const response = await route.fetch();
    const counter = `const encodePhoto = OffscreenCanvas.prototype.convertToBlob;
OffscreenCanvas.prototype.convertToBlob = function(...args) {
  postMessage({ type: 'demo-photo-draw' });
  return encodePhoto.apply(this, args);
};\n`;
    await route.fulfill({ response, body: counter + await response.text() });
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  const initial = await page.evaluate(() => window.__demoPhotoDraws);
  if (!initial) throw new Error('fresh demo boot did not draw its seed photos');
  reporter.ok(`fresh demo seed draws its photos (${initial} encodes)`);
  await page.goto(`${base}/settings`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  const returning = await page.evaluate(() => window.__demoPhotoDraws);
  if (returning) throw new Error(`returning demo boot drew ${returning} unused photo encodes`);
  reporter.ok('returning demo boot opens its existing journal without drawing unused photos');
} catch (error) {
  reporter.fail('demo worker startup', error);
} finally {
  await browser.close();
  await app.close();
}
reporter.finish('Demo worker startup passed');
