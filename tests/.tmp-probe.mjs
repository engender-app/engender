import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';
const root = '/home/alice/_projekty/priv/gender-diary/.claude/worktrees/ticket-carpet-28';
const app = await preview({ root, preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
if (await page.locator('[data-leave-setup]').count()) {
  await page.locator('[data-leave-setup]').click();
  await page.waitForSelector('[data-home-hello]');
}
await page.waitForTimeout(1200);
console.log(JSON.stringify(await page.evaluate(() => {
  const x = document.querySelector('.kit-notice-x');
  if (!x) return { none: true };
  const r = x.getBoundingClientRect();
  const out = { rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], hits: [], ancestors: [] };
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const px = r.left + ((i + 0.5) / 5) * r.width, py = r.top + ((j + 0.5) / 5) * r.height;
    const h = document.elementFromPoint(px, py);
    if (h === x || x.contains(h)) continue;
    out.hits.push({ x: Math.round(px), y: Math.round(py), hit: h ? `${h.tagName}.${[...h.classList].join('.')}` : null });
  }
  for (let up = x.parentElement, n = 0; up && n < 5; up = up.parentElement, n++) {
    const c = getComputedStyle(up); const b = up.getBoundingClientRect();
    out.ancestors.push({ cls: [...up.classList].join('.'), overflow: `${c.overflowX}/${c.overflowY}`, pe: c.pointerEvents, rect: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] });
  }
  return out;
}), null, 2));
await browser.close(); await app.close();
